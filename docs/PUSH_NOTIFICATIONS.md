# Kurye Push Bildirimleri (Capacitor + FCM)

## 1. Veritabanı

Supabase SQL Editor’de çalıştırın:

```sql
-- database/fcm_token_alter.sql
ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS fcm_token text;
```

## 2. Android — Firebase

1. [Firebase Console](https://console.firebase.google.com/) → proje oluştur / seç  
2. Android uygulaması ekle — paket adı: `com.regon.paket`  
3. `google-services.json` indir → `android/app/google-services.json`  
4. Yeniden derle: `npm run build` → `npx cap sync` → Android Studio

## 3. Edge Function secret

Firebase → Project settings → Service accounts → **Generate new private key**.

Supabase Dashboard → Edge Functions → Secrets:

| Secret | Değer |
|--------|--------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | İndirdiğiniz service account JSON’unun tamamı (tek satır da olabilir) |

Deploy (CLI veya Dashboard):

```bash
supabase functions deploy notify-courier --project-ref vrogtcspqpebefbjtfgi
```

## 4. Akış

1. Kurye APK’da giriş yapar → izin ister → FCM token `couriers.fcm_token`  
2. Restoran paket atar → `notify-courier` Edge Function → FCM HTTP v1 → telefon ziller
