-- =============================================================================
-- Regon Paket — Supabase şema (Restoran + Kurye, 2 taraflı)
-- SQL Editor'de tek seferde çalıştırın.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Tablolar
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  phone text,
  address text,
  latitude float8 DEFAULT 41.2867,
  longitude float8 DEFAULT 36.33,
  logo_url text,
  primary_color text DEFAULT '#f59e0b',
  secondary_color text DEFAULT '#10b981',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.couriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  full_name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'idle',
  package_rate numeric NOT NULL DEFAULT 0,
  last_location jsonb,
  /** Capacitor / FCM cihaz tokeni — push bildirim için */
  fcm_token text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  address text,
  latitude float8,
  longitude float8,
  address_note text,
  last_order_date timestamptz DEFAULT now(),
  UNIQUE (restaurant_id, phone)
);

CREATE TABLE IF NOT EXISTS public.packages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number text,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  courier_id uuid REFERENCES public.couriers (id) ON DELETE SET NULL,
  delivered_by_courier_id uuid REFERENCES public.couriers (id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  delivery_address text,
  latitude float8,
  longitude float8,
  content text,
  amount numeric(10, 2) NOT NULL DEFAULT 0,
  payment_method text CHECK (payment_method IN ('cash', 'card', 'iban', 'online')),
  platform text NOT NULL DEFAULT 'telefon',
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'assigned', 'picking_up', 'on_the_way', 'delivered', 'cancelled')),
  is_courier_settled boolean NOT NULL DEFAULT false,
  courier_settled_at timestamptz,
  courier_settlement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.courier_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES public.couriers (id) ON DELETE CASCADE,
  start_date timestamptz,
  end_date timestamptz,
  total_cash numeric NOT NULL DEFAULT 0,
  total_card numeric NOT NULL DEFAULT 0,
  total_iban numeric NOT NULL DEFAULT 0,
  online_count integer NOT NULL DEFAULT 0,
  package_count integer NOT NULL DEFAULT 0,
  total_earned numeric NOT NULL DEFAULT 0,
  expected_total numeric NOT NULL DEFAULT 0,
  received_amount numeric NOT NULL DEFAULT 0,
  remaining_debt numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_couriers_restaurant_id ON public.couriers (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customers_restaurant_id ON public.customers (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_packages_restaurant_id ON public.packages (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_packages_courier_id ON public.packages (courier_id);
CREATE INDEX IF NOT EXISTS idx_packages_status ON public.packages (status);
CREATE INDEX IF NOT EXISTS idx_courier_settlements_restaurant_id ON public.courier_settlements (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_courier_settlements_courier_id ON public.courier_settlements (courier_id);

-- -----------------------------------------------------------------------------
-- 2. Sequence + Trigger: otomatik 6 haneli order_number
-- -----------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.packages_order_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.set_package_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL OR btrim(NEW.order_number) = '' THEN
    NEW.order_number := lpad(nextval('public.packages_order_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_package_order_number ON public.packages;
CREATE TRIGGER trg_set_package_order_number
  BEFORE INSERT ON public.packages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_package_order_number();

-- -----------------------------------------------------------------------------
-- 2b. Trigger: delivered olduğunda delivered_by_courier_id = courier_id
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_delivered_by_courier()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'delivered'
     AND NEW.delivered_by_courier_id IS NULL
     AND NEW.courier_id IS NOT NULL THEN
    NEW.delivered_by_courier_id := NEW.courier_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_delivered_by_courier ON public.packages;
CREATE TRIGGER trg_set_delivered_by_courier
  BEFORE INSERT OR UPDATE ON public.packages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_delivered_by_courier();

-- -----------------------------------------------------------------------------
-- 3. Atomik gün sonu kasa kapatma RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_courier_day_settlement(
  p_restaurant_id uuid,
  p_courier_id uuid,
  p_package_ids bigint[],
  p_total_cash numeric,
  p_total_card numeric,
  p_total_iban numeric,
  p_online_count integer,
  p_package_count integer,
  p_total_earned numeric,
  p_received_amount numeric,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_settlement_id uuid;
  v_expected_total numeric;
  v_remaining_debt numeric;
  v_start_date timestamptz;
BEGIN
  v_expected_total :=
    COALESCE(p_total_cash, 0)
    + COALESCE(p_total_card, 0)
    + COALESCE(p_total_iban, 0);

  v_remaining_debt := v_expected_total - COALESCE(p_received_amount, 0);

  SELECT COALESCE(MIN(created_at), now())
  INTO v_start_date
  FROM public.packages
  WHERE id = ANY (p_package_ids);

  INSERT INTO public.courier_settlements (
    restaurant_id,
    courier_id,
    start_date,
    end_date,
    total_cash,
    total_card,
    total_iban,
    online_count,
    package_count,
    total_earned,
    expected_total,
    received_amount,
    remaining_debt,
    notes
  )
  VALUES (
    p_restaurant_id,
    p_courier_id,
    v_start_date,
    now(),
    COALESCE(p_total_cash, 0),
    COALESCE(p_total_card, 0),
    COALESCE(p_total_iban, 0),
    COALESCE(p_online_count, 0),
    COALESCE(p_package_count, 0),
    COALESCE(p_total_earned, 0),
    v_expected_total,
    COALESCE(p_received_amount, 0),
    v_remaining_debt,
    p_notes
  )
  RETURNING id INTO v_settlement_id;

  UPDATE public.packages
  SET
    is_courier_settled = true,
    courier_settled_at = now(),
    courier_settlement_id = v_settlement_id
  WHERE id = ANY (p_package_ids);

  RETURN v_settlement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_courier_day_settlement(
  uuid, uuid, bigint[], numeric, numeric, numeric, integer, integer, numeric, numeric, text
) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurants_anon_all" ON public.restaurants;
CREATE POLICY "restaurants_anon_all"
  ON public.restaurants FOR ALL TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "restaurants_authenticated_all" ON public.restaurants;
CREATE POLICY "restaurants_authenticated_all"
  ON public.restaurants FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "couriers_anon_all" ON public.couriers;
CREATE POLICY "couriers_anon_all"
  ON public.couriers FOR ALL TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "couriers_authenticated_all" ON public.couriers;
CREATE POLICY "couriers_authenticated_all"
  ON public.couriers FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "customers_anon_all" ON public.customers;
CREATE POLICY "customers_anon_all"
  ON public.customers FOR ALL TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "customers_authenticated_all" ON public.customers;
CREATE POLICY "customers_authenticated_all"
  ON public.customers FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "packages_anon_all" ON public.packages;
CREATE POLICY "packages_anon_all"
  ON public.packages FOR ALL TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "packages_authenticated_all" ON public.packages;
CREATE POLICY "packages_authenticated_all"
  ON public.packages FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "courier_settlements_anon_all" ON public.courier_settlements;
CREATE POLICY "courier_settlements_anon_all"
  ON public.courier_settlements FOR ALL TO anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "courier_settlements_authenticated_all" ON public.courier_settlements;
CREATE POLICY "courier_settlements_authenticated_all"
  ON public.courier_settlements FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4b. Realtime
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.packages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.couriers;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4c. Seed — DoyDoy Restoran + 2 kurye
-- -----------------------------------------------------------------------------

INSERT INTO public.restaurants (name, username, password, phone, address)
VALUES (
  'DoyDoy Restoran',
  'doydoy',
  '123456',
  '05550000000',
  'Samsun'
)
ON CONFLICT (username) DO NOTHING;

INSERT INTO public.couriers (restaurant_id, username, password, full_name, phone, is_active, package_rate)
SELECT r.id, 'kurye1', '123456', 'Kurye Bir', '05551111111', false, 0
FROM public.restaurants r
WHERE r.username = 'doydoy'
  AND NOT EXISTS (SELECT 1 FROM public.couriers c WHERE c.username = 'kurye1');

INSERT INTO public.couriers (restaurant_id, username, password, full_name, phone, is_active, package_rate)
SELECT r.id, 'kurye2', '123456', 'Kurye İki', '05552222222', false, 0
FROM public.restaurants r
WHERE r.username = 'doydoy'
  AND NOT EXISTS (SELECT 1 FROM public.couriers c WHERE c.username = 'kurye2');
