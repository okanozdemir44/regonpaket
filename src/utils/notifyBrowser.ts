/** Tarayıcı / mobil sistem bildirimi (izin + Notification API) */
export async function ensureNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showNewPackageBrowserNotification(
  title = "🚀 Yeni Sipariş Atandı!",
  body = "Regon Paket — yeni bir paket üzerinize atandı."
): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const n = new Notification(title, {
      body,
      tag: "regon-new-package",
      silent: false,
    });
    window.setTimeout(() => n.close(), 8000);
  } catch {
    // Bazı mobil tarayıcılarda constructor kısıtlı olabilir
  }
}
