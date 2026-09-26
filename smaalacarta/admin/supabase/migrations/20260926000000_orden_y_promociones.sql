-- Orden de productos y promociones armadas con productos del menú.
-- (ADMIN-MENU-3 a 5 y ADMIN-PROMOS-1 a 6.)

-- Orden de los productos dentro de su categoría. `categories.sort_order` ya existe.
-- Nulo hasta que el negocio los ordene: los que no tienen orden van al final.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sort_order integer;

-- Destinos de las claves foráneas compuestas: la promoción y el producto de un
-- ítem tienen que ser del mismo negocio (mismo criterio que products → categories).
ALTER TABLE public.products
  ADD CONSTRAINT products_id_business_id_key UNIQUE (id, business_id);

ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_id_business_id_key UNIQUE (id, business_id);

-- Tipo de promoción:
--   percent: `discount_percent` % de descuento sobre cada producto.
--   combo:   `price` fijo por todo el conjunto.
ALTER TABLE public.promotions
  ADD COLUMN type text NOT NULL DEFAULT 'percent',
  ADD COLUMN price numeric(10,2);

-- NOT VALID: se exige en toda promoción nueva o modificada sin revisar las que ya
-- existían, para que la migración no falle sobre datos cargados antes.
ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_type_check CHECK (type IN ('percent', 'combo')) NOT VALID,
  ADD CONSTRAINT promotions_pricing_check CHECK (
    (type = 'percent' AND price IS NULL AND discount_percent > 0 AND discount_percent <= 100)
    OR
    (type = 'combo' AND price IS NOT NULL AND price > 0 AND discount_percent = 0)
  ) NOT VALID;

-- Qué productos lleva cada promoción, y en qué orden.
CREATE TABLE IF NOT EXISTS public.promotion_items (
  promotion_id uuid NOT NULL,
  product_id uuid NOT NULL,
  business_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (promotion_id, product_id),
  -- Al borrar la promoción o el producto, desaparece el ítem; nunca al revés.
  FOREIGN KEY (promotion_id, business_id)
    REFERENCES public.promotions(id, business_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id, business_id)
    REFERENCES public.products(id, business_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS promotion_items_business_id_idx
  ON public.promotion_items(business_id);
CREATE INDEX IF NOT EXISTS promotion_items_product_id_idx
  ON public.promotion_items(product_id);

ALTER TABLE public.promotion_items ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que el resto de las tablas del negocio: solo los miembros.
DROP POLICY IF EXISTS promotion_items_select ON public.promotion_items;
CREATE POLICY promotion_items_select
ON public.promotion_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = promotion_items.business_id
  )
);

DROP POLICY IF EXISTS promotion_items_insert ON public.promotion_items;
CREATE POLICY promotion_items_insert
ON public.promotion_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = promotion_items.business_id
  )
);

DROP POLICY IF EXISTS promotion_items_update ON public.promotion_items;
CREATE POLICY promotion_items_update
ON public.promotion_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = promotion_items.business_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = promotion_items.business_id
  )
);

DROP POLICY IF EXISTS promotion_items_delete ON public.promotion_items;
CREATE POLICY promotion_items_delete
ON public.promotion_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = (select auth.uid())
      AND bu.business_id = promotion_items.business_id
  )
);

-- Guarda una promoción con sus productos en un solo paso (ADMIN-PROMOS-3): o se
-- guarda todo o no se guarda nada. `p_id` nulo crea; con valor, edita y reemplaza
-- los productos. Corre con los permisos de quien la llama (SECURITY INVOKER, el
-- valor por defecto), así que el RLS de cada tabla decide qué puede tocar: no hace
-- falta comprobar el negocio a mano.
CREATE OR REPLACE FUNCTION public.save_promotion(
  p_id uuid,
  p_business_id uuid,
  p_name text,
  p_description text,
  p_type text,
  p_discount_percent numeric,
  p_price numeric,
  p_active boolean,
  p_product_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF coalesce(array_length(p_product_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Una promoción necesita al menos un producto'
      USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions
      (business_id, name, description, type, discount_percent, price, active)
    VALUES
      (p_business_id, p_name, p_description, p_type, p_discount_percent, p_price, p_active)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.promotions
    SET name = p_name,
        description = p_description,
        type = p_type,
        discount_percent = p_discount_percent,
        price = p_price,
        active = p_active,
        updated_at = now()
    WHERE id = p_id AND business_id = p_business_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'La promoción no existe' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.promotion_items WHERE promotion_id = v_id;
  END IF;

  INSERT INTO public.promotion_items (promotion_id, product_id, business_id, sort_order)
  SELECT v_id, t.product_id, p_business_id, t.position - 1
  FROM unnest(p_product_ids) WITH ORDINALITY AS t(product_id, position);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_promotion(uuid, uuid, text, text, text, numeric, numeric, boolean, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_promotion(uuid, uuid, text, text, text, numeric, numeric, boolean, uuid[])
  TO authenticated;
