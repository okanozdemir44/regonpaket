"use client";

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type PermissionStatus,
} from "@capacitor/push-notifications";
import { supabase } from "@/lib/supabase";
import { playNewPackageAlert } from "@/utils/notifySound";

const CHANNEL_ID = "new_package";

export type PushStatus =
  | "idle"
  | "web"
  | "requesting"
  | "denied"
  | "registering"
  | "token_saved"
  | "token_error"
  | "error";

function isNative(): boolean {
  try {
    const p = Capacitor.getPlatform();
    return p === "android" || p === "ios" || Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Kurye girişinde FCM izni + token kaydı.
 * `enablePush()` butonla da tekrar tetiklenebilir.
 */
export function useCourierPushNotifications(
  courierId: string | null | undefined
) {
  const [status, setStatus] = useState<PushStatus>("idle");
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const enablePush = useCallback(async () => {
    if (!courierId) {
      setStatus("error");
      setLastError("Kurye oturumu yok");
      return;
    }

    if (!isNative()) {
      setStatus("web");
      setLastError(
        "Push yalnızca Android APK içinde çalışır (tarayıcıda değil)."
      );
      return;
    }

    setStatus("requesting");
    setLastError(null);

    try {
      try {
        await PushNotifications.createChannel({
          id: CHANNEL_ID,
          name: "Yeni Paket",
          description: "Restorandan gelen yeni paket atamaları",
          importance: 5,
          visibility: 1,
          sound: "default",
          vibration: true,
          lights: true,
        });
      } catch {
        // kanal zaten var
      }

      // Önce dinleyiciler (register'dan önce şart)
      await PushNotifications.removeAllListeners();

      await PushNotifications.addListener("registration", async (token) => {
        console.log("FCM Token alındı:", token.value);
        setLastToken(token.value);
        try {
          const { error } = await supabase
            .from("couriers")
            .update({ fcm_token: token.value })
            .eq("id", courierId);
          if (error) {
            console.warn("[push] fcm_token kaydı:", error.message);
            setStatus("token_error");
            setLastError(
              error.message.includes("fcm_token")
                ? "DB'de fcm_token sütunu yok — SQL alter çalıştırın"
                : error.message
            );
            return;
          }
          setStatus("token_saved");
          setLastError(null);
          console.log("[push] fcm_token kaydedildi");
        } catch (err) {
          setStatus("token_error");
          setLastError(err instanceof Error ? err.message : "Kayıt hatası");
        }
      });

      await PushNotifications.addListener("registrationError", (err) => {
        console.warn("[push] registrationError:", err.error);
        setStatus("error");
        setLastError(String(err.error || "FCM kayıt hatası"));
      });

      await PushNotifications.addListener(
        "pushNotificationReceived",
        async (notification) => {
          console.log(
            "[push] pushNotificationReceived:",
            JSON.stringify(notification)
          );
          try {
            playNewPackageAlert();
          } catch {
            /* ignore */
          }
          // Uygulama açıkken yerel banner da göster
          try {
            const { LocalNotifications } = await import(
              "@capacitor/local-notifications"
            );
            await LocalNotifications.schedule({
              notifications: [
                {
                  id: Date.now() % 100000,
                  title: notification.title || "Yeni Sipariş Atandı!",
                  body: notification.body || "Yeni paket",
                  schedule: { at: new Date(Date.now() + 200) },
                },
              ],
            });
          } catch {
            /* local-notifications yoksa geç */
          }
        }
      );

      await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          console.log(
            "[push] action:",
            JSON.stringify(action.notification)
          );
        }
      );

      let perm: PermissionStatus = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") {
        perm = await PushNotifications.requestPermissions();
      }

      if (perm.receive !== "granted") {
        setStatus("denied");
        setLastError("Bildirim izni verilmedi — ayarlardan açın");
        console.log("Bildirim izni verilmedi");
        return;
      }

      setStatus("registering");
      await PushNotifications.register();
    } catch (err) {
      console.warn("[push] kurulum hatası:", err);
      setStatus("error");
      setLastError(err instanceof Error ? err.message : String(err));
    }
  }, [courierId]);

  useEffect(() => {
    if (!courierId) return;
    // Bridge hazır olsun diye kısa gecikme; Strict Mode iptalini token/register bozmasın
    const t = window.setTimeout(() => {
      void enablePush();
    }, 400);
    return () => window.clearTimeout(t);
  }, [courierId, enablePush]);

  return { status, lastToken, lastError, enablePush, isNative: isNative() };
}
