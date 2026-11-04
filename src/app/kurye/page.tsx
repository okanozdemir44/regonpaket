"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import {
  LogOut,
  MapPinned,
  Navigation,
  Phone,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  getCourierSession,
  logoutCourier,
  type CourierSession,
} from "@/services/authService";
import {
  deliverOrder,
  updateOrderStatus,
} from "@/services/orderService";
import { useCourierLocationBroadcast } from "@/hooks/useCourierLocationBroadcast";
import { useCourierPushNotifications } from "@/hooks/useCourierPushNotifications";
import { calculateCourierCollectionTotals } from "@/utils/calculations";
import { playNewPackageAlert } from "@/utils/notifySound";
import {
  ensureNotificationPermission,
  showNewPackageBrowserNotification,
} from "@/utils/notifyBrowser";
import { cn } from "@/lib/utils";
import type { Courier, Order, PaymentMethod } from "@/types";

const ACTIVE_STATUSES = new Set(["assigned", "picking_up", "on_the_way"]);

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function sortActive(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    const ta = new Date(a.assigned_at || a.created_at).getTime();
    const tb = new Date(b.assigned_at || b.created_at).getTime();
    return ta - tb;
  });
}

export default function KuryePage() {
  const router = useRouter();
  const [session, setSession] = useState<CourierSession | null>(null);
  const [courier, setCourier] = useState<Courier | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [doorMessage, setDoorMessage] = useState<string | null>(null);
  const knownIds = useRef<Set<number>>(new Set());
  const alertTimer = useRef<number | null>(null);

  useEffect(() => {
    const current = getCourierSession();
    if (!current) {
      router.replace("/login");
      return;
    }
    setSession(current);
  }, [router]);

  const loadData = useCallback(async (courierId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [courierRes, ordersRes] = await Promise.all([
        supabase.from("couriers").select("*").eq("id", courierId).single(),
        supabase
          .from("packages")
          .select("*")
          .eq("courier_id", courierId)
          .order("created_at", { ascending: false }),
      ]);

      if (courierRes.error) throw new Error(courierRes.error.message);
      if (ordersRes.error) throw new Error(ordersRes.error.message);

      const courierRow = courierRes.data as Courier;
      const orderRows = (ordersRes.data ?? []) as Order[];

      setCourier(courierRow);
      setOrders(orderRows);
      knownIds.current = new Set(orderRows.map((o) => o.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadData(session.id);
  }, [session, loadData]);

  useCourierLocationBroadcast({
    courier,
    enabled: Boolean(courier?.is_active),
  });

  const {
    status: pushStatus,
    lastToken: pushToken,
    lastError: pushError,
    enablePush,
    isNative: pushNative,
  } = useCourierPushNotifications(session?.id);

  useEffect(() => {
    void ensureNotificationPermission();
  }, []);

  const triggerNewPackageAlert = useCallback(() => {
    playNewPackageAlert();
    showNewPackageBrowserNotification();
    setAlertVisible(true);
    if (alertTimer.current) window.clearTimeout(alertTimer.current);
    alertTimer.current = window.setTimeout(() => {
      setAlertVisible(false);
    }, 4500);

    // Uygulama açıkken yerel bildirim (FCM arka plan yedeği)
    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { LocalNotifications } = await import(
          "@capacitor/local-notifications"
        );
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display !== "granted") return;
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Date.now() % 100000,
              title: "Yeni Sipariş Atandı!",
              body: "Yeni bir paket üzerinize tanımlandı",
              schedule: { at: new Date(Date.now() + 250) },
            },
          ],
        });
      } catch {
        /* native değil / plugin yok */
      }
    })();
  }, []);

  // Realtime: bu kuryeye atanan paketler
  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel(`kurye-packages-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "packages",
          filter: `courier_id=eq.${session.id}`,
        },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          const event = payload.eventType;

          if (event === "INSERT") {
            const row = payload.new as Order;
            if (row?.id == null) return;
            const isNew = !knownIds.current.has(row.id);
            knownIds.current.add(row.id);
            setOrders((prev) => {
              if (prev.some((o) => o.id === row.id)) {
                return prev.map((o) => (o.id === row.id ? row : o));
              }
              return [row, ...prev];
            });
            if (isNew && ACTIVE_STATUSES.has(row.status)) {
              triggerNewPackageAlert();
            }
            return;
          }

          if (event === "UPDATE") {
            const row = payload.new as Order;
            if (row?.id == null) return;
            const wasKnown = knownIds.current.has(row.id);
            knownIds.current.add(row.id);
            setOrders((prev) => {
              const exists = prev.some((o) => o.id === row.id);
              if (!exists) return [row, ...prev];
              return prev.map((o) => (o.id === row.id ? row : o));
            });
            if (
              !wasKnown &&
              ACTIVE_STATUSES.has(row.status) &&
              row.courier_id === session.id
            ) {
              triggerNewPackageAlert();
            }
            return;
          }

          if (event === "DELETE") {
            const row = payload.old as Partial<Order>;
            if (row?.id == null) return;
            knownIds.current.delete(row.id);
            setOrders((prev) => prev.filter((o) => o.id !== row.id));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      if (alertTimer.current) window.clearTimeout(alertTimer.current);
    };
  }, [session, triggerNewPackageAlert]);

  const activeOrders = useMemo(
    () => sortActive(orders.filter((o) => ACTIVE_STATUSES.has(o.status))),
    [orders]
  );

  const unsettledDelivered = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === "delivered" &&
          !o.is_courier_settled &&
          (o.delivered_by_courier_id === session?.id ||
            o.courier_id === session?.id)
      ),
    [orders, session?.id]
  );

  const pocketTotals = useMemo(
    () =>
      calculateCourierCollectionTotals(
        unsettledDelivered,
        courier?.package_rate ?? 0
      ),
    [unsettledDelivered, courier?.package_rate]
  );

  async function toggleShift(nextActive: boolean) {
    if (!courier) return;
    setError(null);
    const { data, error: updateError } = await supabase
      .from("couriers")
      .update({
        is_active: nextActive,
        ...(nextActive ? { status: "idle" as const } : {}),
      })
      .eq("id", courier.id)
      .select("*")
      .single();

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCourier(data as Courier);
  }

  async function handleOnTheWay(orderId: number) {
    if (!courier) return;
    setBusyId(orderId);
    setError(null);
    try {
      await updateOrderStatus(orderId, "on_the_way");
      await supabase
        .from("couriers")
        .update({ status: "on_the_way" })
        .eq("id", courier.id);
      setCourier((c) => (c ? { ...c, status: "on_the_way" } : c));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Durum güncellenemedi");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeliver(
    orderId: number,
    paymentMethod: PaymentMethod
  ) {
    if (!courier) return;
    setBusyId(orderId);
    setError(null);
    try {
      await deliverOrder(orderId, courier.id, paymentMethod);
      const remaining = activeOrders.filter((o) => o.id !== orderId).length;
      setCourier((c) =>
        c ? { ...c, status: remaining > 0 ? c.status : "idle" } : c
      );
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: "delivered",
                delivered_at: new Date().toISOString(),
                delivered_by_courier_id: courier.id,
              }
            : o
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Teslimat kaydedilemedi");
    } finally {
      setBusyId(null);
    }
  }

  async function saveDoorLocation(order: Order) {
    setDoorMessage(null);
    setError(null);

    if (!navigator.geolocation) {
      setError("Bu cihazda GPS yok");
      return;
    }

    setBusyId(order.id);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const latitude = pos.coords.latitude;
          const longitude = pos.coords.longitude;

          if (order.customer_id) {
            const { error: customerError } = await supabase
              .from("customers")
              .update({ latitude, longitude })
              .eq("id", order.customer_id);
            if (customerError) throw new Error(customerError.message);
          }

          const { error: packageError } = await supabase
            .from("packages")
            .update({ latitude, longitude })
            .eq("id", order.id);
          if (packageError) throw new Error(packageError.message);

          setDoorMessage(
            `Konum kaydedildi (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`
          );
          window.setTimeout(() => setDoorMessage(null), 3500);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Konum kaydedilemedi"
          );
        } finally {
          setBusyId(null);
        }
      },
      () => {
        setError("GPS alınamadı — konum iznini kontrol edin");
        setBusyId(null);
      },
      { enableHighAccuracy: true, timeout: 12_000 }
    );
  }

  async function handleLogout() {
    await logoutCourier();
    router.replace("/login");
  }

  if (!session || loading) {
    return (
      <main className="flex min-h-dvh flex-1 items-center justify-center bg-[#0c0f12] p-8 text-[var(--panel-muted)]">
        Kurye paneli yükleniyor…
      </main>
    );
  }

  const onShift = Boolean(courier?.is_active);

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-1 flex-col bg-[#0c0f12] text-[var(--panel-ink)]">
      {alertVisible ? (
        <div className="animate-login-in fixed inset-x-0 top-0 z-50 mx-auto max-w-lg px-3 pt-3">
          <div className="rounded-2xl border border-[var(--panel-accent)]/40 bg-[var(--panel-accent)] px-4 py-3 text-center text-sm font-extrabold tracking-wide text-[#1a1208] shadow-xl shadow-[var(--panel-accent)]/30">
            🚀 YENİ PAKET ATANDI!
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-20 border-b border-white/8 bg-[#12171e]/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-[var(--panel-muted)]">
              Regon Paket · Kurye
            </p>
            <h1 className="truncate font-[family-name:var(--font-display)] text-xl">
              {courier?.full_name ?? session.full_name}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-white/10 p-2.5 text-[var(--panel-muted)] hover:bg-white/5"
            aria-label="Çıkış"
          >
            <LogOut className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5">
          <div>
            <p className="text-xs text-[var(--panel-muted)]">Durum</p>
            <p
              className={cn(
                "text-sm font-semibold",
                onShift ? "text-emerald-300" : "text-amber-200"
              )}
            >
              {onShift ? "Vardiyada" : "Mola"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={onShift}
            onClick={() => void toggleShift(!onShift)}
            className={cn(
              "relative h-9 w-16 rounded-full transition",
              onShift ? "bg-emerald-500" : "bg-zinc-600"
            )}
          >
            <span
              className={cn(
                "absolute top-1 size-7 rounded-full bg-white shadow transition",
                onShift ? "left-8" : "left-1"
              )}
            />
          </button>
        </div>

        <div className="mt-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-[var(--panel-muted)]">Push bildirim</p>
              <p className="text-sm font-semibold">
                {pushStatus === "token_saved"
                  ? "Hazır — token kayıtlı"
                  : pushStatus === "denied"
                    ? "İzin reddedildi"
                    : pushStatus === "web"
                      ? "Sadece APK'da çalışır"
                      : pushStatus === "requesting" ||
                          pushStatus === "registering"
                        ? "İzin / kayıt…"
                        : pushStatus === "token_error" || pushStatus === "error"
                          ? "Hata"
                          : pushNative
                            ? "Bekleniyor"
                            : "Native değil"}
              </p>
              {pushError ? (
                <p className="mt-1 text-[11px] text-amber-200/90">{pushError}</p>
              ) : null}
              {pushToken ? (
                <p className="mt-1 truncate text-[10px] text-[var(--panel-muted)]">
                  {pushToken.slice(0, 18)}…
                </p>
              ) : null}
              {courier?.fcm_token && pushStatus === "idle" ? (
                <p className="mt-1 text-[11px] text-emerald-300/80">
                  DB’de kayıtlı token var
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void enablePush()}
              className="shrink-0 rounded-xl bg-[var(--panel-accent)] px-3 py-2 text-xs font-bold text-[#1a1208]"
            >
              İzin İste
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--panel-muted)]">
            <Wallet className="size-3.5" /> Dijital cüzdan (açık kasa)
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-[var(--panel-muted)]">Nakit</p>
              <p className="font-[family-name:var(--font-display)] text-lg text-[var(--panel-accent)]">
                {formatMoney(pocketTotals.cashTotal)}
              </p>
              <p className="text-[10px] text-[var(--panel-muted)]">
                {pocketTotals.cashCount} paket
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--panel-muted)]">POS slip</p>
              <p className="font-[family-name:var(--font-display)] text-lg text-sky-300">
                {formatMoney(pocketTotals.cardTotal)}
              </p>
              <p className="text-[10px] text-[var(--panel-muted)]">
                {pocketTotals.cardCount} slip
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--panel-muted)]">IBAN</p>
              <p className="font-[family-name:var(--font-display)] text-base">
                {formatMoney(pocketTotals.ibanTotal)}
              </p>
              <p className="text-[10px] text-[var(--panel-muted)]">
                {pocketTotals.ibanCount} paket
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--panel-muted)]">
                Teslim edilip açık
              </p>
              <p className="font-[family-name:var(--font-display)] text-base">
                {pocketTotals.deliveredCount} paket
              </p>
              <p className="text-[10px] text-[var(--panel-muted)]">
                Kasaya: {formatMoney(pocketTotals.expectedTotal)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-3 px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        {doorMessage ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {doorMessage}
          </p>
        ) : null}

        {!onShift ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-[var(--panel-muted)]">
            Moladasınız. Konum yayını ve yeni paketler için vardiyayı açın.
          </div>
        ) : activeOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-[var(--panel-muted)]">
            Aktif paket yok. Yeni atama gelince bildirim çalacak.
          </div>
        ) : (
          activeOrders.map((order) => (
            <ActivePackageCard
              key={order.id}
              order={order}
              busy={busyId === order.id}
              onStartRoute={() => void handleOnTheWay(order.id)}
              onDeliver={(method) => void handleDeliver(order.id, method)}
              onCall={() => {
                if (order.customer_phone) {
                  window.location.href = `tel:${order.customer_phone}`;
                }
              }}
              onNavigate={() => {
                const q =
                  order.latitude != null && order.longitude != null
                    ? `${order.latitude},${order.longitude}`
                    : encodeURIComponent(order.delivery_address || "");
                window.open(
                  `https://www.google.com/maps/dir/?api=1&destination=${q}`,
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
              onSaveDoor={() => void saveDoorLocation(order)}
            />
          ))
        )}
      </div>
    </main>
  );
}

function ActivePackageCard({
  order,
  busy,
  onStartRoute,
  onDeliver,
  onCall,
  onNavigate,
  onSaveDoor,
}: {
  order: Order;
  busy: boolean;
  onStartRoute: () => void;
  onDeliver: (method: PaymentMethod) => void;
  onCall: () => void;
  onNavigate: () => void;
  onSaveDoor: () => void;
}) {
  const isOnline = order.payment_method === "online";
  const canDeliver =
    order.status === "on_the_way" || order.status === "picking_up";
  const showStart =
    order.status === "assigned" || order.status === "picking_up";

  return (
    <article className="rounded-3xl border border-white/10 bg-[#141a22] p-4 shadow-lg shadow-black/20">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-[var(--panel-muted)]">
            #{order.order_number || order.id}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold">{order.customer_name}</h2>
        </div>
        <span
          className={cn(
            "rounded-lg px-2 py-1 text-[10px] font-bold uppercase",
            order.status === "on_the_way"
              ? "bg-sky-500/20 text-sky-300"
              : "bg-[var(--panel-accent)]/15 text-[var(--panel-accent)]"
          )}
        >
          {order.status === "on_the_way"
            ? "Yolda"
            : order.status === "picking_up"
              ? "Alınıyor"
              : "Atandı"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-[var(--panel-ink)]/90">
        {order.delivery_address || "Adres yok"}
      </p>
      {order.content ? (
        <p className="mt-2 rounded-xl bg-black/25 px-3 py-2 text-sm text-[var(--panel-muted)]">
          {order.content}
        </p>
      ) : null}

      <div className="mt-3">
        {isOnline ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
            ÖDENDİ - ONLINE (0 ₺ Tahsilat)
          </p>
        ) : (
          <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--panel-accent)]">
            {formatMoney(order.amount)}
            <span className="ml-2 text-xs font-sans font-normal uppercase tracking-wide text-[var(--panel-muted)]">
              tahsilat
            </span>
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onCall}
          className="flex flex-col items-center gap-1 rounded-xl border border-white/10 px-2 py-2.5 text-[11px] hover:bg-white/5"
        >
          <Phone className="size-4" />
          Ara
        </button>
        <button
          type="button"
          onClick={onNavigate}
          className="flex flex-col items-center gap-1 rounded-xl border border-white/10 px-2 py-2.5 text-[11px] hover:bg-white/5"
        >
          <Navigation className="size-4" />
          Yol Tarifi
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onSaveDoor}
          className="flex flex-col items-center gap-1 rounded-xl border border-white/10 px-2 py-2.5 text-[11px] hover:bg-white/5 disabled:opacity-50"
        >
          <MapPinned className="size-4" />
          Kapıdayım
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {showStart && order.status === "assigned" ? (
          <button
            type="button"
            disabled={busy}
            onClick={onStartRoute}
            className="w-full rounded-2xl bg-sky-500 px-4 py-3.5 text-sm font-bold text-[#041018] transition hover:brightness-110 disabled:opacity-60"
          >
            Yola Çıktım
          </button>
        ) : null}

        {canDeliver || order.status === "assigned" ? (
          isOnline ? (
            <button
              type="button"
              disabled={busy || order.status === "assigned"}
              onClick={() => onDeliver("online")}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-sm font-extrabold text-[#04140c] transition hover:brightness-110 disabled:opacity-50"
            >
              ✅ TESLİM ET (Online Ödendi)
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-center text-[11px] uppercase tracking-wider text-[var(--panel-muted)]">
                Kapıda nasıl ödeme aldın?
              </p>
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={busy || order.status === "assigned"}
                  onClick={() => onDeliver("cash")}
                  className="rounded-2xl bg-[var(--panel-accent)] px-4 py-3.5 text-sm font-bold text-[#1a1208] disabled:opacity-50"
                >
                  💵 Nakit Aldım
                </button>
                <button
                  type="button"
                  disabled={busy || order.status === "assigned"}
                  onClick={() => onDeliver("card")}
                  className="rounded-2xl bg-sky-500 px-4 py-3.5 text-sm font-bold text-[#041018] disabled:opacity-50"
                >
                  💳 POS Çektim (Slip)
                </button>
                <button
                  type="button"
                  disabled={busy || order.status === "assigned"}
                  onClick={() => onDeliver("iban")}
                  className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 text-sm font-bold disabled:opacity-50"
                >
                  🏦 IBAN
                </button>
              </div>
              {order.status === "assigned" ? (
                <p className="text-center text-[11px] text-[var(--panel-muted)]">
                  Önce “Yola Çıktım” de, sonra kapıda teslim et
                </p>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </article>
  );
}
