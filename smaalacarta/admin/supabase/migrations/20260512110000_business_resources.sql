-- Migration: create business-scoped tables and RLS policies for admin resources.

-- Categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  slug text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS categories_business_id_idx ON public.categories(business_id);

-- Products table
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  category_id uuid references public.categories(id) on delete set null,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS products_business_id_idx ON public.products(business_id);

-- Promotions table
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  slug text,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS promotions_business_id_idx ON public.promotions(business_id);

-- Orders table
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS orders_business_id_idx ON public.orders(business_id);

-- Enable Row Level Security on each resource table.
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Policies for categories
DROP POLICY IF EXISTS categories_select ON public.categories;
CREATE POLICY categories_select
ON public.categories
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = public.categories.business_id
  )
);

DROP POLICY IF EXISTS categories_insert ON public.categories;
CREATE POLICY categories_insert
ON public.categories
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = business_id
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
      AND bu.business_id = public.categories.business_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = business_id
  )
);

DROP POLICY IF EXISTS categories_delete ON public.categories;
CREATE POLICY categories_delete
ON public.categories
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = public.categories.business_id
  )
);

-- Products policies

DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select
ON public.products
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = public.products.business_id
  )
);

DROP POLICY IF EXISTS products_insert ON public.products;
CREATE POLICY products_insert
ON public.products
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = business_id
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
      AND bu.business_id = public.products.business_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = business_id
  )
);

DROP POLICY IF EXISTS products_delete ON public.products;
CREATE POLICY products_delete
ON public.products
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = public.products.business_id
  )
);

-- Promotions policies

DROP POLICY IF EXISTS promotions_select ON public.promotions;
CREATE POLICY promotions_select
ON public.promotions
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = public.promotions.business_id
  )
);

DROP POLICY IF EXISTS promotions_insert ON public.promotions;
CREATE POLICY promotions_insert
ON public.promotions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = business_id
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
      AND bu.business_id = public.promotions.business_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = business_id
  )
);

DROP POLICY IF EXISTS promotions_delete ON public.promotions;
CREATE POLICY promotions_delete
ON public.promotions
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = public.promotions.business_id
  )
);

-- Orders policies

DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select
ON public.orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = public.orders.business_id
  )
);

DROP POLICY IF EXISTS orders_insert ON public.orders;
CREATE POLICY orders_insert
ON public.orders
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = business_id
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
      AND bu.business_id = public.orders.business_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = business_id
  )
);

DROP POLICY IF EXISTS orders_delete ON public.orders;
CREATE POLICY orders_delete
ON public.orders
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.user_id = auth.uid()
      AND bu.business_id = public.orders.business_id
  )
);