-- Kurye cihazlarına push bildirim için FCM token sütunu
ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS fcm_token text;
