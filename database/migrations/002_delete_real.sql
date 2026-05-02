BEGIN;

-- Si un producto se elimina, las ventas antiguas conservan nombre/precio,
-- pero id_producto queda NULL para no romper historial.
ALTER TABLE venta_detalles
DROP CONSTRAINT IF EXISTS venta_detalles_id_producto_fkey;

ALTER TABLE venta_detalles
ADD CONSTRAINT venta_detalles_id_producto_fkey
FOREIGN KEY (id_producto)
REFERENCES productos(id)
ON DELETE SET NULL;

-- Si una categoría se elimina, también se eliminan sus productos.
ALTER TABLE productos
DROP CONSTRAINT IF EXISTS productos_id_categoria_fkey;

ALTER TABLE productos
ADD CONSTRAINT productos_id_categoria_fkey
FOREIGN KEY (id_categoria)
REFERENCES categorias(id)
ON DELETE CASCADE;

COMMIT;
