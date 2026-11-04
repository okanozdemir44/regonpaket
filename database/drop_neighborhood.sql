-- Mevcut projelerde mahalle kolonlarını kaldırır
ALTER TABLE public.customers DROP COLUMN IF EXISTS neighborhood;
ALTER TABLE public.packages DROP COLUMN IF EXISTS delivery_neighborhood;
