const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        ok: false,
        message: 'Usuario y contraseña son obligatorios'
      });
    }

    const result = await pool.query(
      `
      SELECT 
        u.id,
        u.username,
        u.nombre,
        u.password_hash,
        u.activo,
        r.nombre AS rol
      FROM usuarios u
      INNER JOIN roles r ON r.id = u.id_rol
      WHERE u.username = $1
      LIMIT 1
      `,
      [username]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario o contraseña incorrectos'
      });
    }

    const user = result.rows[0];

    if (!user.activo) {
      return res.status(403).json({
        ok: false,
        message: 'El usuario está inactivo'
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario o contraseña incorrectos'
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        rol: user.rol
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || '8h'
      }
    );

    return res.json({
      ok: true,
      message: 'Login correcto',
      token,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        rol: user.rol
      }
    });
  } catch (error) {
    console.error('Error login:', error);

    return res.status(500).json({
      ok: false,
      message: 'Error interno al iniciar sesión'
    });
  }
});

module.exports = router;
