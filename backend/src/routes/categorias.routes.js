const express = require('express');
const pool = require('../config/db');
const { authRequired, adminRequired } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', authRequired, adminRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, nombre, descripcion, orden, activo
      FROM categorias
      WHERE activo = TRUE
      ORDER BY orden ASC, nombre ASC
      `
    );

    res.json({
      ok: true,
      categorias: result.rows
    });
  } catch (error) {
    console.error('Error obtener categorías:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al obtener categorías'
    });
  }
});

router.get('/admin/todas', authRequired, adminRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, nombre, descripcion, orden, activo, creado_en, actualizado_en
      FROM categorias
      ORDER BY orden ASC, nombre ASC
      `
    );

    res.json({
      ok: true,
      categorias: result.rows
    });
  } catch (error) {
    console.error('Error obtener categorías admin:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al obtener categorías'
    });
  }
});

router.post('/', authRequired, adminRequired, async (req, res) => {
  try {
    const { nombre, descripcion, orden } = req.body;

    if (!nombre) {
      return res.status(400).json({
        ok: false,
        message: 'El nombre de la categoría es obligatorio'
      });
    }

    const result = await pool.query(
      `
      INSERT INTO categorias (nombre, descripcion, orden)
      VALUES ($1, $2, $3)
      RETURNING id, nombre, descripcion, orden, activo
      `,
      [nombre.trim(), descripcion || null, orden || 0]
    );

    res.status(201).json({
      ok: true,
      message: 'Categoría creada correctamente',
      categoria: result.rows[0]
    });
  } catch (error) {
    console.error('Error crear categoría:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        ok: false,
        message: 'Ya existe una categoría con ese nombre'
      });
    }

    res.status(500).json({
      ok: false,
      message: 'Error al crear categoría'
    });
  }
});

router.put('/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, orden, activo } = req.body;

    const result = await pool.query(
      `
      UPDATE categorias
      SET
        nombre = COALESCE($1, nombre),
        descripcion = $2,
        orden = COALESCE($3, orden),
        activo = COALESCE($4, activo)
      WHERE id = $5
      RETURNING id, nombre, descripcion, orden, activo
      `,
      [
        nombre ? nombre.trim() : null,
        descripcion || null,
        orden ?? null,
        activo ?? null,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Categoría no encontrada'
      });
    }

    res.json({
      ok: true,
      message: 'Categoría actualizada correctamente',
      categoria: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizar categoría:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        ok: false,
        message: 'Ya existe una categoría con ese nombre'
      });
    }

    res.status(500).json({
      ok: false,
      message: 'Error al actualizar categoría'
    });
  }
});

router.delete('/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM categorias
      WHERE id = $1
      RETURNING id, nombre
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Categoría no encontrada'
      });
    }

    res.json({
      ok: true,
      message: 'Categoría eliminada definitivamente',
      categoria: result.rows[0]
    });
  } catch (error) {
    console.error('Error eliminar categoría:', error);

    res.status(500).json({
      ok: false,
      message: 'Error al eliminar categoría'
    });
  }
});

module.exports = router;
