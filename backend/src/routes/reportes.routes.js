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

    const sql = hasProductFilter
      ? `
        SELECT
          v.folio,
          v.creado_en,
          vd.producto_nombre,
          vd.cantidad,
          vd.subtotal::numeric AS total
        FROM ventas v
        INNER JOIN venta_detalles vd ON vd.id_venta = v.id
        ${whereSql}
        ORDER BY v.creado_en DESC
        LIMIT 500
      `
      : `
        SELECT
          v.folio,
          v.creado_en,
          NULL AS producto_nombre,
          NULL AS cantidad,
          v.total::numeric AS total
        FROM ventas v
        ${whereSql}
        ORDER BY v.creado_en DESC
        LIMIT 500
      `;

    const result = await pool.query(sql, params);

    const filas = result.rows.map((row) => ({
      ...row,
      total: Number(row.total || 0)
    }));

    const total = filas.reduce((acc, item) => acc + item.total, 0);

    res.json({
      ok: true,
      filtros: {
        fecha_desde: req.query.fecha_desde || null,
        fecha_hasta: req.query.fecha_hasta || null,
        id_producto: req.query.id_producto || null
      },
      total,
      total_registros: filas.length,
      filas
    });
  } catch (error) {
    console.error('Error reporte ventas:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al generar reporte de ventas'
    });
  }
});

module.exports = router;
