-- Corrige las políticas de INSERT y UPDATE de categories, products,
-- promotions y orders (ADMIN-AUTH-2).
--
-- Las originales comparaban `bu.business_id = business_id` sin calificar. Dentro
-- de la subconsulta ese `business_id` se resuelve contra `bu`, así que la
-- condición era siempre verdadera: cualquier usuario miembro de *algún* negocio
-- podía crear filas en *cualquier* negocio, o mover filas propias a otro.
-- Ahora la fila nueva se nombra por su tabla.

-- Categories
DROP POLICY IF EXISTS categories_insert ON public.categories;
CREATE POLICY categories_insert
ON public.categories
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = categories.business_id
  )
);

DROP POLICY IF EXISTS categories_update ON public.categories;
CREATE POLICY categories_update
ON public.categories
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = categories.business_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = categories.business_id
  )
);

-- Products
DROP POLICY IF EXISTS products_insert ON public.products;
CREATE POLICY products_insert
ON public.products
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = products.business_id
  )
);

DROP POLICY IF EXISTS products_update ON public.products;
CREATE POLICY products_update
ON public.products
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = products.business_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = products.business_id
  )
);

-- Promotions
DROP POLICY IF EXISTS promotions_insert ON public.promotions;
CREATE POLICY promotions_insert
ON public.promotions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = promotions.business_id
  )
);

DROP POLICY IF EXISTS promotions_update ON public.promotions;
CREATE POLICY promotions_update
ON public.promotions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = promotions.business_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = promotions.business_id
  )
);

-- Orders
DROP POLICY IF EXISTS orders_insert ON public.orders;
CREATE POLICY orders_insert
ON public.orders
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = orders.business_id
  )
);

DROP POLICY IF EXISTS orders_update ON public.orders;
CREATE POLICY orders_update
ON public.orders
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = orders.business_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = orders.business_id
  )
);
