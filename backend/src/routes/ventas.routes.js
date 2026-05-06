const express = require('express');
const pool = require('../config/db');
const { authRequired, adminRequired } = require('../middlewares/auth.middleware');

const router = express.Router();

function toMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function buildDateFilters(query) {
  const params = [];
  const where = [];

  if (query.fecha_desde) {
    params.push(`${query.fecha_desde} 00:00:00`);
    where.push(`v.creado_en >= $${params.length}`);
  }

  if (query.fecha_hasta) {
    params.push(`${query.fecha_hasta} 23:59:59`);
    where.push(`v.creado_en <= $${params.length}`);
  }

  return { params, where };
}

async function getVentaConDetalles(folio) {
  const ventaResult = await pool.query(
    `
    SELECT
      v.id,
      v.folio,
      mp.nombre AS metodo_pago,
      v.total,
      v.monto_recibido,
      v.cambio,
      v.estado,
      v.notas,
      v.creado_en
    FROM ventas v
    LEFT JOIN metodos_pago mp ON mp.id = v.id_metodo_pago
    WHERE v.folio = $1
    LIMIT 1
    `,
    [folio]
  );

  if (ventaResult.rowCount === 0) {
    return null;
  }

  const venta = ventaResult.rows[0];

  const detallesResult = await pool.query(
    `
    SELECT
      id,
      id_producto,
      producto_nombre,
      cantidad,
      precio_unitario,
      subtotal
    FROM venta_detalles
    WHERE id_venta = $1
    ORDER BY id ASC
    `,
    [venta.id]
  );

  return {
    ...venta,
    detalles: detallesResult.rows
  };
}

function buildComanda(venta, detalles, notas) {
  return {
    folio: venta.folio,
    fecha: venta.creado_en,
    estado: 'pendiente_pago',
    notas: notas || null,
    total: Number(venta.total),
    productos: detalles.map((item) => ({
      nombre: item.producto_nombre,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal
    }))
  };
}

function buildTicket(venta, detalles) {
  return {
    folio: venta.folio,
    fecha: venta.creado_en,
    metodo_pago: venta.metodo_pago,
    total: Number(venta.total),
    monto_recibido: venta.monto_recibido !== null ? Number(venta.monto_recibido) : null,
    cambio: Number(venta.cambio || 0),
    notas: venta.notas || null,
    productos: detalles.map((item) => ({
      nombre: item.producto_nombre,
      cantidad: item.cantidad,
      precio_unitario: Number(item.precio_unitario),
      subtotal: Number(item.subtotal)
    }))
  };
}

/**
 * Crear orden para cocina.
 * No cobra todavía.
 */
router.post('/', authRequired, adminRequired, async (req, res) => {
  const client = await pool.connect();

  try {
    const { items, notas } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'La orden debe tener al menos un producto'
      });
    }

    const cleanItems = items
      .map((item) => ({
        producto_id: Number(item.producto_id),
        cantidad: Number(item.cantidad)
      }))
      .filter((item) => item.producto_id > 0 && item.cantidad > 0);

    if (cleanItems.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'Los productos enviados no son válidos'
      });
    }

    await client.query('BEGIN');

    const ids = cleanItems.map((item) => item.producto_id);

    const productosResult = await client.query(
      `
      SELECT id, nombre, precio, activo
      FROM productos
      WHERE id = ANY($1::int[]) AND activo = TRUE
      `,
      [ids]
    );

    if (productosResult.rowCount !== ids.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        message: 'Uno o más productos no existen o están inactivos'
      });
    }

    const productosMap = new Map();

    productosResult.rows.forEach((producto) => {
      productosMap.set(Number(producto.id), producto);
    });

    const detalles = cleanItems.map((item) => {
      const producto = productosMap.get(item.producto_id);
      const precioUnitario = toMoney(producto.precio);
      const subtotal = toMoney(precioUnitario * item.cantidad);

      return {
        id_producto: item.producto_id,
        producto_nombre: producto.nombre,
        cantidad: item.cantidad,
        precio_unitario: precioUnitario,
        subtotal
      };
    });

    const total = toMoney(detalles.reduce((acc, item) => acc + item.subtotal, 0));

    const ventaResult = await client.query(
      `
      INSERT INTO ventas (
        id_usuario,
        id_metodo_pago,
        total,
        monto_recibido,
        cambio,
        estado,
        notas
      )
      VALUES ($1, NULL, $2, NULL, 0, 'pendiente_pago', $3)
      RETURNING id, folio, total, monto_recibido, cambio, estado, notas, creado_en
      `,
      [
        req.user.id,
        total,
        notas || null
      ]
    );

    const venta = ventaResult.rows[0];

    for (const detalle of detalles) {
      await client.query(
        `
        INSERT INTO venta_detalles (
          id_venta,
          id_producto,
          producto_nombre,
          cantidad,
          precio_unitario,
          subtotal
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          venta.id,
          detalle.id_producto,
          detalle.producto_nombre,
          detalle.cantidad,
          detalle.precio_unitario,
          detalle.subtotal
        ]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      ok: true,
      message: 'Orden enviada a cocina correctamente',
      comanda: buildComanda(venta, detalles, notas)
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Error generar orden:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al generar la orden'
    });
  } finally {
    client.release();
  }
});

/**
 * Cobrar una orden pendiente.
 */
router.put('/:folio/cobrar', authRequired, adminRequired, async (req, res) => {
  const client = await pool.connect();

  try {
    const { folio } = req.params;
    const { metodo_pago, monto_recibido } = req.body;

    if (!metodo_pago) {
      return res.status(400).json({
        ok: false,
        message: 'El método de pago es obligatorio'
      });
    }

    await client.query('BEGIN');

    const ventaResult = await client.query(
      `
      SELECT id, folio, total, estado
      FROM ventas
      WHERE folio = $1
      LIMIT 1
      `,
      [folio]
    );

    if (ventaResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        ok: false,
        message: 'Orden no encontrada'
      });
    }

    const venta = ventaResult.rows[0];

    if (venta.estado === 'pagada') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        ok: false,
        message: 'Esta orden ya fue pagada'
      });
    }

    if (venta.estado === 'cancelada') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        ok: false,
        message: 'No se puede cobrar una orden cancelada'
      });
    }

    const metodoResult = await client.query(
      `
      SELECT id, clave, nombre
      FROM metodos_pago
      WHERE clave = $1 AND activo = TRUE
      LIMIT 1
      `,
      [metodo_pago]
    );

    if (metodoResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        message: 'Método de pago no válido'
      });
    }

    const total = toMoney(venta.total);
    let recibidoFinal = null;
    let cambio = 0;

    if (metodo_pago === 'efectivo') {
      if (monto_recibido === undefined || monto_recibido === null || monto_recibido === '') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          message: 'En efectivo debes ingresar con cuánto pagó el cliente'
        });
      }

      recibidoFinal = toMoney(monto_recibido);

      if (recibidoFinal < total) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          message: 'El monto recibido no cubre el total de la orden'
        });
      }

      cambio = toMoney(recibidoFinal - total);
    }

    await client.query(
      `
      UPDATE ventas
      SET
        id_metodo_pago = $1,
        monto_recibido = $2,
        cambio = $3,
        estado = 'pagada'
      WHERE id = $4
      `,
      [
        metodoResult.rows[0].id,
        recibidoFinal,
        cambio,
        venta.id
      ]
    );

    await client.query('COMMIT');

    const ventaFinal = await getVentaConDetalles(folio);

    return res.json({
      ok: true,
      message: 'Orden cobrada correctamente',
      ticket: buildTicket(ventaFinal, ventaFinal.detalles)
    });
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Error cobrar orden:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error al cobrar la orden'
    });
  } finally {
    client.release();
  }
});

router.patch('/:folio/cancelar', authRequired, adminRequired, async (req, res) => {
  try {
    const { folio } = req.params;

    const result = await pool.query(
      `
      UPDATE ventas
      SET estado = 'cancelada'
      WHERE folio = $1 AND estado <> 'pagada'
      RETURNING folio, estado
      `,
      [folio]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Orden no encontrada o ya fue pagada'
      });
    }

    res.json({
      ok: true,
      message: 'Orden cancelada correctamente',
      venta: result.rows[0]
    });
  } catch (error) {
    console.error('Error cancelar orden:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al cancelar orden'
    });
  }
});

router.get('/', authRequired, adminRequired, async (req, res) => {
  try {
    const pagina = Math.max(Number(req.query.pagina || 1), 1);
    const limite = Math.min(Math.max(Number(req.query.limite || 20), 1), 20);
    const offset = (pagina - 1) * limite;

    const { params, where } = buildDateFilters(req.query);

    if (req.query.folio) {
      params.push(`%${req.query.folio.trim()}%`);
      where.push(`v.folio ILIKE $${params.length}`);
    }

    if (req.query.estado) {
      params.push(req.query.estado);
      where.push(`v.estado = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM ventas v
      ${whereSql}
      `,
      params
    );

    const totalRegistros = countResult.rows[0].total;
    const totalPaginas = Math.max(Math.ceil(totalRegistros / limite), 1);

    const dataParams = [...params, limite, offset];

    const result = await pool.query(
      `
      SELECT
        v.id,
        v.folio,
        COALESCE(mp.nombre, 'Pendiente') AS metodo_pago,
        v.total,
        v.monto_recibido,
        v.cambio,
        v.estado,
        v.notas,
        v.creado_en,
        COALESCE(SUM(vd.cantidad), 0)::int AS total_productos
      FROM ventas v
      LEFT JOIN metodos_pago mp ON mp.id = v.id_metodo_pago
      LEFT JOIN venta_detalles vd ON vd.id_venta = v.id
      ${whereSql}
      GROUP BY v.id, mp.nombre
      ORDER BY v.creado_en DESC
      LIMIT $${dataParams.length - 1}
      OFFSET $${dataParams.length}
      `,
      dataParams
    );

    res.json({
      ok: true,
      pagina,
      limite,
      total_registros: totalRegistros,
      total_paginas: totalPaginas,
      ventas: result.rows
    });
  } catch (error) {
    console.error('Error obtener ventas:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al obtener ventas'
    });
  }
});

router.get('/:folio', authRequired, adminRequired, async (req, res) => {
  try {
    const venta = await getVentaConDetalles(req.params.folio);

    if (!venta) {
      return res.status(404).json({
        ok: false,
        message: 'Venta no encontrada'
      });
    }

    res.json({
      ok: true,
      venta
    });
  } catch (error) {
    console.error('Error obtener detalle venta:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al obtener detalle de venta'
    });
  }
});

module.exports = router;
