-- Regon Paket — kurumsal kimlik sütunları (SQL Editor'de çalıştırın)
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#f59e0b',
  ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '#10b981';

UPDATE public.restaurants
SET
  primary_color = COALESCE(primary_color, '#f59e0b'),
  secondary_color = COALESCE(secondary_color, '#10b981')
WHERE primary_color IS NULL OR secondary_color IS NULL;
