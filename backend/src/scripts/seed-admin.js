const bcrypt = require('bcryptjs');
const pool = require('../config/db');
require('dotenv').config();

async function seedAdmin() {
  try {
    const username = process.env.ADMIN_USERNAME || 'sushi-admin';
    const password = process.env.ADMIN_PASSWORD || 'Bolita26_01';
    const nombre = process.env.ADMIN_NAME || 'Administrador Sushi';

    const roleResult = await pool.query(
      `
      SELECT id
      FROM roles
      WHERE nombre = 'admin'
      LIMIT 1
      `
    );

    if (roleResult.rowCount === 0) {
      throw new Error('No existe el rol admin. Ejecuta primero database/schema.sql');
    }

    const idRol = roleResult.rows[0].id;
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `
      INSERT INTO usuarios (username, nombre, password_hash, id_rol, activo)
      VALUES ($1, $2, $3, $4, TRUE)
      ON CONFLICT (username)
      DO UPDATE SET
        nombre = EXCLUDED.nombre,
        password_hash = EXCLUDED.password_hash,
        id_rol = EXCLUDED.id_rol,
        activo = TRUE
      `,
      [username, nombre, passwordHash, idRol]
    );

    console.log('✅ Usuario administrador creado/actualizado');
    console.log(`👤 Usuario: ${username}`);
    console.log(`🔑 Contraseña temporal: ${password}`);
  } catch (error) {
    console.error('❌ Error creando usuario admin:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedAdmin();
