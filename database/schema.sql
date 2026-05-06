-- =========================================================
-- BASE DE DATOS - GESTOR DE VENTAS SUSHI
-- PostgreSQL / Render
-- =========================================================

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL,
    password_hash TEXT NOT NULL,
    id_rol INT NOT NULL REFERENCES roles(id),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    orden INT NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    id_categoria INT NOT NULL REFERENCES categorias(id),
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT,
    precio NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
    imagen_url TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metodos_pago (
    id SERIAL PRIMARY KEY,
    clave VARCHAR(40) NOT NULL UNIQUE,
    nombre VARCHAR(80) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE SEQUENCE IF NOT EXISTS ventas_folio_seq START 1;

CREATE TABLE IF NOT EXISTS ventas (
    id BIGSERIAL PRIMARY KEY,
    folio VARCHAR(30) NOT NULL UNIQUE DEFAULT ('S-' || LPAD(nextval('ventas_folio_seq')::TEXT, 6, '0')),
    id_usuario INT REFERENCES usuarios(id),
    id_metodo_pago INT REFERENCES metodos_pago(id),
    total NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    monto_recibido NUMERIC(10,2),
    cambio NUMERIC(10,2) NOT NULL DEFAULT 0,
    estado VARCHAR(30) NOT NULL DEFAULT 'pendiente_pago',
    notas TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS venta_detalles (
    id BIGSERIAL PRIMARY KEY,
    id_venta BIGINT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    id_producto INT REFERENCES productos(id),
    producto_nombre VARCHAR(120) NOT NULL,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0)
);

-- =========================================================
-- ÍNDICES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(id_categoria);
CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo);
CREATE INDEX IF NOT EXISTS idx_categorias_activo ON categorias(activo);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(creado_en);
CREATE INDEX IF NOT EXISTS idx_ventas_folio ON ventas(folio);
CREATE INDEX IF NOT EXISTS idx_venta_detalles_venta ON venta_detalles(id_venta);

-- =========================================================
-- TRIGGER PARA actualizado_en
-- =========================================================

CREATE OR REPLACE FUNCTION set_actualizado_en()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roles_actualizado_en ON roles;
CREATE TRIGGER trg_roles_actualizado_en
BEFORE UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION set_actualizado_en();

DROP TRIGGER IF EXISTS trg_usuarios_actualizado_en ON usuarios;
CREATE TRIGGER trg_usuarios_actualizado_en
BEFORE UPDATE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION set_actualizado_en();

DROP TRIGGER IF EXISTS trg_categorias_actualizado_en ON categorias;
CREATE TRIGGER trg_categorias_actualizado_en
BEFORE UPDATE ON categorias
FOR EACH ROW
EXECUTE FUNCTION set_actualizado_en();

DROP TRIGGER IF EXISTS trg_productos_actualizado_en ON productos;
CREATE TRIGGER trg_productos_actualizado_en
BEFORE UPDATE ON productos
FOR EACH ROW
EXECUTE FUNCTION set_actualizado_en();

-- =========================================================
-- DATOS BASE
-- =========================================================

INSERT INTO roles (nombre, descripcion)
VALUES
('admin', 'Administrador del sistema'),
('cajero', 'Usuario para ventas y caja')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO metodos_pago (clave, nombre)
VALUES
('efectivo', 'Efectivo'),
('transferencia', 'Transferencia'),
('tarjeta', 'Tarjeta')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO categorias (nombre, descripcion, orden)
VALUES
('Rollos', 'Rollos de sushi', 1),
('Bebidas', 'Bebidas del restaurante', 2),
('Entradas', 'Entradas y complementos', 3),
('Especiales', 'Productos especiales', 4)
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO productos (id_categoria, nombre, descripcion, precio, imagen_url)
SELECT c.id, 'Ejemplo de rollo', 'Descripción del rollo de sushi.', 95.00, '/assets/productos/rollo-demo.webp'
FROM categorias c
WHERE c.nombre = 'Rollos'
ON CONFLICT DO NOTHING;
