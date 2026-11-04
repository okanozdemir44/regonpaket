"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Map,
  Maximize2,
  Minimize2,
  Radio,
  X,
} from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import type { Courier, Order, Restaurant } from "@/types";

export type LiveLocationPayload = {
  courier_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  updated_at?: string;
  status?: Courier["status"];
  full_name?: string;
};

export type LiveCourierDestination = {
  orderNumber: string;
  customerName: string;
  address: string;
  status: Order["status"];
};

export type LiveCourierPosition = {
  courierId: string;
  fullName: string;
  status: Courier["status"];
  isActive: boolean;
  latitude: number;
  longitude: number;
  updatedAt: string | null;
  activePackageCount: number;
  /** Üzerindeki aktif paket güzergâhları */
  destinations: LiveCourierDestination[];
};

type LiveCourierMapProps = {
  restaurantId: string;
  restaurant: Restaurant | null;
  couriers: Courier[];
  orders: Order[];
  className?: string;
};

export type MapCanvasProps = {
  restaurant: Restaurant | null;
  positions: LiveCourierPosition[];
  /** Tam ekran / panel açılınca Leaflet boyutunu yenilemek için */
  sizeKey: string;
  brandPrimary?: string;
};

const MapCanvas = dynamic(() => import("./LiveCourierMapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#0e1319] text-sm text-[var(--panel-muted)]">
      Harita yükleniyor…
    </div>
  ),
});

function activePackagesForCourier(orders: Order[], courierId: string): Order[] {
  return orders.filter(
    (o) =>
      o.courier_id === courierId &&
      ["assigned", "picking_up", "on_the_way"].includes(o.status)
  );
}

function buildPositionsFromCouriers(
  couriers: Courier[],
  orders: Order[],
  liveOverrides: Record<string, LiveLocationPayload>
): LiveCourierPosition[] {
  return couriers
    .map((c) => {
      const live = liveOverrides[c.id];
      const lat = live?.latitude ?? c.last_location?.latitude;
      const lng = live?.longitude ?? c.last_location?.longitude;
      if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
        return null;
      }

      const active = activePackagesForCourier(orders, c.id);

      return {
        courierId: c.id,
        fullName: live?.full_name ?? c.full_name,
        status: live?.status ?? c.status,
        isActive: c.is_active,
        latitude: lat,
        longitude: lng,
        updatedAt:
          live?.updated_at ?? c.last_location?.updated_at ?? null,
        activePackageCount: active.length,
        destinations: active.map((o) => ({
          orderNumber: o.order_number || String(o.id),
          customerName: o.customer_name || "Müşteri",
          address: o.delivery_address || "",
          status: o.status,
        })),
      } satisfies LiveCourierPosition;
    })
    .filter((p): p is LiveCourierPosition => p != null);
}

export function LiveCourierMap({
  restaurantId,
  restaurant,
  couriers,
  orders,
  className,
}: LiveCourierMapProps) {
  const [open, setOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [liveOverrides, setLiveOverrides] = useState<
    Record<string, LiveLocationPayload>
  >({});
  const [broadcastOk, setBroadcastOk] = useState(false);
  const broadcastOkRef = useRef(false);

  useEffect(() => {
    broadcastOkRef.current = broadcastOk;
  }, [broadcastOk]);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let supabaseClient: Awaited<
      typeof import("@/lib/supabase")
    >["supabase"] | null = null;

    function applyBroadcastPayload(payload: unknown) {
      const data = payload as LiveLocationPayload;
      if (!data?.courier_id) return;
      if (
        typeof data.latitude !== "number" ||
        typeof data.longitude !== "number"
      ) {
        return;
      }

      setLiveOverrides((prev) => ({
        ...prev,
        [data.courier_id]: {
          ...data,
          updated_at: data.updated_at ?? new Date().toISOString(),
        },
      }));
    }

    async function getSupabase() {
      if (!supabaseClient) {
        const mod = await import("@/lib/supabase");
        supabaseClient = mod.supabase;
      }
      return supabaseClient;
    }

    async function connect() {
      const supabase = await getSupabase();
      if (cancelled) return;

      if (channel) {
        await supabase.removeChannel(channel);
        channel = null;
      }
      if (cancelled) return;

      setBroadcastOk(false);
      channel = supabase.channel(`courier-locations-${restaurantId}`);
      channel
        .on("broadcast", { event: "location" }, ({ payload }) => {
          applyBroadcastPayload(payload);
        })
        .subscribe((status) => {
          if (!cancelled) {
            setBroadcastOk(status === "SUBSCRIBED");
          }
        });
    }

    async function refreshCourierLocations() {
      const supabase = await getSupabase();
      if (cancelled) return;

      const { data, error } = await supabase
        .from("couriers")
        .select("id, full_name, status, last_location")
        .eq("restaurant_id", restaurantId);

      if (error || !data || cancelled) return;

      setLiveOverrides((prev) => {
        const next = { ...prev };
        for (const row of data as Array<{
          id: string;
          full_name: string;
          status: Courier["status"];
          last_location: Courier["last_location"];
        }>) {
          const loc = row.last_location;
          if (
            loc?.latitude == null ||
            loc?.longitude == null ||
            Number.isNaN(loc.latitude) ||
            Number.isNaN(loc.longitude)
          ) {
            continue;
          }
          next[row.id] = {
            courier_id: row.id,
            latitude: loc.latitude,
            longitude: loc.longitude,
            full_name: row.full_name,
            status: row.status,
            updated_at: loc.updated_at ?? new Date().toISOString(),
          };
        }
        return next;
      });
    }

    let waking = false;
    async function wakeRealtime() {
      if (document.visibilityState !== "visible") return;
      if (waking) return;
      waking = true;
      try {
        if (!broadcastOkRef.current) {
          await connect();
        }
        await refreshCourierLocations();
      } finally {
        waking = false;
      }
    }

    void connect();

    const onVisibility = () => {
      void wakeRealtime();
    };
    const onFocus = () => {
      void wakeRealtime();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      if (channel && supabaseClient) {
        void supabaseClient.removeChannel(channel);
      }
    };
  }, [restaurantId]);

  // Esc ile tam ekrandan çık
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const positions = useMemo(
    () => buildPositionsFromCouriers(couriers, orders, liveOverrides),
    [couriers, orders, liveOverrides]
  );

  const onShiftWithLoc = positions.filter((p) => p.isActive).length;

  const panel = (
    <section
      className={cn(
        "overflow-hidden rounded-3xl border border-white/8 bg-[#10151c]",
        fullscreen &&
          "fixed inset-0 z-[60] flex h-dvh max-h-none flex-col rounded-none border-0",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={() => {
            if (fullscreen) {
              setFullscreen(false);
              return;
            }
            setOpen((v) => !v);
          }}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Map className="size-5 shrink-0 text-[var(--brand-primary)]" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Canlı Kurye Haritası</p>
            <p className="truncate text-[11px] text-[var(--panel-muted)]">
              {onShiftWithLoc} konum · {couriers.filter((c) => c.is_active).length}{" "}
              aktif kurye
            </p>
          </div>
          {!fullscreen ? (
            open ? (
              <ChevronUp className="ml-auto size-4 shrink-0 text-[var(--panel-muted)]" />
            ) : (
              <ChevronDown className="ml-auto size-4 shrink-0 text-[var(--panel-muted)]" />
            )
          ) : null}
        </button>

        <span
          className={cn(
            "hidden items-center gap-1 rounded-lg px-2 py-1 text-[10px] uppercase tracking-wider sm:inline-flex",
            broadcastOk
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-white/5 text-[var(--panel-muted)]"
          )}
          title="WebSocket konum yayını"
        >
          <Radio className="size-3" />
          {broadcastOk ? "Canlı" : "Bekleniyor"}
        </span>

        <button
          type="button"
          onClick={() => {
            setFullscreen((v) => !v);
            setOpen(true);
          }}
          className="rounded-lg border border-white/10 p-2 text-[var(--panel-muted)] transition hover:bg-white/5 hover:text-[var(--panel-ink)]"
          aria-label={fullscreen ? "Küçült" : "Tam ekran"}
        >
          {fullscreen ? (
            <Minimize2 className="size-4" />
          ) : (
            <Maximize2 className="size-4" />
          )}
        </button>

        {fullscreen ? (
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="rounded-lg border border-white/10 p-2 text-[var(--panel-muted)] transition hover:bg-white/5 hover:text-[var(--panel-ink)]"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {(open || fullscreen) && (
        <div
          className={cn(
            "relative z-0 isolate",
            fullscreen ? "min-h-0 flex-1" : "h-[280px] sm:h-[340px] lg:h-[380px]"
          )}
        >
          <MapCanvas
            restaurant={restaurant}
            positions={positions}
            sizeKey={`${fullscreen ? "full" : "panel"}-${open ? "open" : "closed"}`}
            brandPrimary={restaurant?.primary_color || "#f59e0b"}
          />

          {!fullscreen && positions.length === 0 ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#10151c] to-transparent p-3 text-center text-xs text-[var(--panel-muted)]">
              Henüz konum yok — kurye uygulamaları yayınladıkça ikonlar kayacak
            </div>
          ) : null}
        </div>
      )}
    </section>
  );

  return panel;
}
