import { supabase } from "@/lib/supabase";

export type NotifyCourierPayload = {
  courier_id: string;
  /** Biliniyorsa tekrar SELECT atlamamak için */
  fcm_token?: string | null;
  title?: string;
  body?: string;
  order_number?: string | null;
  customer_name?: string | null;
  delivery_address?: string | null;
};

/**
 * Kuryenin fcm_token'ını alır (gerekirse DB'den) ve
 * `notify-courier` Edge Function ile FCM HTTP v1 push gönderir.
 */
export async function notifyCourierNewPackage(
  payload: NotifyCourierPayload
): Promise<void> {
  if (!payload.courier_id) return;

  let fcmToken = payload.fcm_token?.trim() || null;

  if (!fcmToken) {
    const { data, error } = await supabase
      .from("couriers")
      .select("fcm_token")
      .eq("id", payload.courier_id)
      .maybeSingle();

    if (error) {
      console.warn("[push] fcm_token okunamadı:", error.message);
      return;
    }
    fcmToken = (data?.fcm_token as string | null)?.trim() || null;
  }

  if (!fcmToken) {
    console.warn(
      "[push] Kuryede FCM token yok — push atlandı:",
      payload.courier_id
    );
    return;
  }

  const title = payload.title ?? "Yeni Sipariş Atandı!";
  const parts = [
    payload.order_number ? `#${payload.order_number}` : null,
    payload.customer_name,
    payload.delivery_address,
  ].filter(Boolean);
  const body =
    payload.body ??
    (parts.length > 0 ? parts.join(" · ") : "Yeni bir paket size atandı");

  console.log("[push] FCM gönderiliyor →", payload.courier_id, title);

  try {
    const { data, error } = await supabase.functions.invoke("notify-courier", {
      body: {
        courier_id: payload.courier_id,
        fcm_token: fcmToken,
        title,
        body,
        data: {
          type: "new_package",
          order_number: payload.order_number ?? "",
          priority: "high",
        },
      },
    });

    if (error) {
      console.warn(
        "[push] notify-courier yok veya hata — Edge Function deploy + FIREBASE_SERVICE_ACCOUNT_JSON secret gerekli:",
        error.message
      );
      return;
    }
    console.log("[push] notify-courier yanıt:", data);
  } catch (err) {
    console.warn(
      "[push] notify-courier çağrılamadı (fonksiyon deploy edilmemiş olabilir):",
      err instanceof Error ? err.message : err
    );
  }
}
