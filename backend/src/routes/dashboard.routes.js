const express = require('express');
const pool = require('../config/db');
const { authRequired, adminRequired } = require('../middlewares/auth.middleware');

const router = express.Router();

function buildFilters(query) {
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

  if (query.id_producto) {
    params.push(Number(query.id_producto));
    where.push(`vd.id_producto = $${params.length}`);
  }

  return {
    params,
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : ''
  };
}

router.get('/ventas', authRequired, adminRequired, async (req, res) => {
  try {
    const { params, whereSql } = buildFilters(req.query);
    const hasProductFilter = Boolean(req.query.id_producto);

    const resumenSql = hasProductFilter
      ? `
        SELECT
          COALESCE(SUM(vd.subtotal), 0)::numeric AS total_vendido,
          COUNT(DISTINCT v.id)::int AS total_ordenes,
          COALESCE(SUM(vd.cantidad), 0)::int AS productos_vendidos,
          CASE
            WHEN COUNT(DISTINCT v.id) = 0 THEN 0
            ELSE COALESCE(SUM(vd.subtotal), 0) / COUNT(DISTINCT v.id)
          END::numeric AS ticket_promedio
        FROM ventas v
        INNER JOIN venta_detalles vd ON vd.id_venta = v.id
        ${whereSql}
      `
      : `
        SELECT
          COALESCE(SUM(v.total), 0)::numeric AS total_vendido,
          COUNT(v.id)::int AS total_ordenes,
          COALESCE((
            SELECT SUM(vd2.cantidad)
            FROM venta_detalles vd2
            INNER JOIN ventas v2 ON v2.id = vd2.id_venta
            ${whereSql.replaceAll('v.', 'v2.').replaceAll('vd.', 'vd2.')}
          ), 0)::int AS productos_vendidos,
          CASE
            WHEN COUNT(v.id) = 0 THEN 0
            ELSE COALESCE(SUM(v.total), 0) / COUNT(v.id)
          END::numeric AS ticket_promedio
        FROM ventas v
        ${whereSql}
      `;

    const resumenResult = await pool.query(resumenSql, params);

    const ventasDiaResult = await pool.query(
      `
      SELECT
        TO_CHAR(v.creado_en::date, 'YYYY-MM-DD') AS fecha,
        ${hasProductFilter ? 'COALESCE(SUM(vd.subtotal), 0)' : 'COALESCE(SUM(v.total), 0)'}::numeric AS total,
        COUNT(DISTINCT v.id)::int AS ordenes
      FROM ventas v
      ${hasProductFilter ? 'INNER JOIN venta_detalles vd ON vd.id_venta = v.id' : ''}
      ${whereSql}
      GROUP BY v.creado_en::date
      ORDER BY v.creado_en::date ASC
      `,
      params
    );

    const topProductosResult = await pool.query(
      `
      SELECT
        vd.producto_nombre AS nombre,
        COALESCE(SUM(vd.cantidad), 0)::int AS cantidad,
        COALESCE(SUM(vd.subtotal), 0)::numeric AS total
      FROM ventas v
      INNER JOIN venta_detalles vd ON vd.id_venta = v.id
      ${whereSql}
      GROUP BY vd.producto_nombre
      ORDER BY total DESC
      LIMIT 10
      `,
      params
    );

    const metodoPagoResult = await pool.query(
      `
      SELECT
        mp.nombre AS metodo,
        ${hasProductFilter ? 'COALESCE(SUM(vd.subtotal), 0)' : 'COALESCE(SUM(v.total), 0)'}::numeric AS total,
        COUNT(DISTINCT v.id)::int AS ordenes
      FROM ventas v
      INNER JOIN metodos_pago mp ON mp.id = v.id_metodo_pago
      ${hasProductFilter ? 'INNER JOIN venta_detalles vd ON vd.id_venta = v.id' : ''}
      ${whereSql}
      GROUP BY mp.nombre
      ORDER BY total DESC
      `,
      params
    );

    res.json({
      ok: true,
      resumen: {
        total_vendido: Number(resumenResult.rows[0].total_vendido || 0),
        total_ordenes: Number(resumenResult.rows[0].total_ordenes || 0),
        productos_vendidos: Number(resumenResult.rows[0].productos_vendidos || 0),
        ticket_promedio: Number(resumenResult.rows[0].ticket_promedio || 0)
      },
      ventas_por_dia: ventasDiaResult.rows.map((row) => ({
        ...row,
        total: Number(row.total)
      })),
      top_productos: topProductosResult.rows.map((row) => ({
        ...row,
        total: Number(row.total),
        cantidad: Number(row.cantidad)
      })),
      metodos_pago: metodoPagoResult.rows.map((row) => ({
        ...row,
        total: Number(row.total),
        ordenes: Number(row.ordenes)
      }))
    });
  } catch (error) {
    console.error('Error dashboard ventas:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al obtener métricas'
    });
  }
});

module.exports = router;
