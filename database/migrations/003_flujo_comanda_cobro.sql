BEGIN;

ALTER TABLE ventas
ALTER COLUMN id_metodo_pago DROP NOT NULL;

ALTER TABLE ventas
ALTER COLUMN estado SET DEFAULT 'pendiente_pago';

UPDATE ventas
SET estado = 'pagada'
WHERE estado IN ('completada', 'pagada');

COMMIT;
