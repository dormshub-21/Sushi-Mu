const express = require('express');
const pool = require('../config/db');
const { authRequired, adminRequired } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authRequired, adminRequired, async (req, res) => {
  try {
    const { categoria } = req.query;

    const params = [];
    let where = 'WHERE p.activo = TRUE AND c.activo = TRUE';

    if (categoria) {
      params.push(categoria);
      where += ` AND p.id_categoria = $${params.length}`;
    }

    const result = await pool.query(
      `
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.imagen_url,
        p.id_categoria,
        c.nombre AS categoria
      FROM productos p
      INNER JOIN categorias c ON c.id = p.id_categoria
      ${where}
      ORDER BY c.orden ASC, p.nombre ASC
      `,
      params
    );

    res.json({
      ok: true,
      productos: result.rows
    });
  } catch (error) {
    console.error('Error obtener productos:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al obtener productos'
    });
  }
});

router.get('/admin/todos', authRequired, adminRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.imagen_url,
        p.id_categoria,
        c.nombre AS categoria,
        p.activo,
        p.creado_en,
        p.actualizado_en
      FROM productos p
      INNER JOIN categorias c ON c.id = p.id_categoria
      ORDER BY c.orden ASC, p.nombre ASC
      `
    );

    res.json({
      ok: true,
      productos: result.rows
    });
  } catch (error) {
    console.error('Error obtener productos admin:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al obtener productos'
    });
  }
});

router.post('/', authRequired, adminRequired, async (req, res) => {
  try {
    const { id_categoria, nombre, descripcion, precio, imagen_url } = req.body;

    if (!id_categoria || !nombre || precio === undefined) {
      return res.status(400).json({
        ok: false,
        message: 'Categoría, nombre y precio son obligatorios'
      });
    }

    const result = await pool.query(
      `
      INSERT INTO productos (id_categoria, nombre, descripcion, precio, imagen_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, id_categoria, nombre, descripcion, precio, imagen_url, activo
      `,
      [
        id_categoria,
        nombre.trim(),
        descripcion || null,
        Number(precio),
        imagen_url || null
      ]
    );

    res.status(201).json({
      ok: true,
      message: 'Producto creado correctamente',
      producto: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear producto:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al crear producto'
    });
  }
});

router.put('/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { id_categoria, nombre, descripcion, precio, imagen_url, activo } = req.body;

    const result = await pool.query(
      `
      UPDATE productos
      SET
        id_categoria = COALESCE($1, id_categoria),
        nombre = COALESCE($2, nombre),
        descripcion = $3,
        precio = COALESCE($4, precio),
        imagen_url = $5,
        activo = COALESCE($6, activo)
      WHERE id = $7
      RETURNING id, id_categoria, nombre, descripcion, precio, imagen_url, activo
      `,
      [
        id_categoria ?? null,
        nombre ? nombre.trim() : null,
        descripcion || null,
        precio !== undefined ? Number(precio) : null,
        imagen_url || null,
        activo ?? null,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Producto no encontrado'
      });
    }

    res.json({
      ok: true,
      message: 'Producto actualizado correctamente',
      producto: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar producto:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al actualizar producto'
    });
  }
});

router.delete('/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM productos
      WHERE id = $1
      RETURNING id, nombre
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Producto no encontrado'
      });
    }

    res.json({
      ok: true,
      message: 'Producto eliminado definitivamente',
      producto: result.rows[0]
    });
  } catch (error) {
    console.error('Error eliminar producto:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al eliminar producto'
    });
  }
});

module.exports = router;
