-- Índice para la zona propia de los pedidos (ENVIO-247).
--
-- `guard_business_zone_delete` busca los pedidos en curso de la zona que se quiere borrar (`orders.own_zone_id`), y la
-- clave foránea (ON DELETE SET NULL) hace la misma búsqueda al borrarla: sin índice recorren `orders` entera. Parcial,
-- porque casi todos los pedidos no tienen zona propia.

CREATE INDEX IF NOT EXISTS orders_own_zone_idx
  ON public.orders (own_zone_id)
  WHERE own_zone_id IS NOT NULL;
