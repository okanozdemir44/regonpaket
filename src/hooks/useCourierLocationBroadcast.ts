"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Courier } from "@/types";

/** En az 20 m yer değişimi veya 5 sn → yayın / DB */
const DISTANCE_FILTER_M = 20;
const TIME_INTERVAL_MS = 5_000;
const BROADCAST_MIN_INTERVAL_MS = 1_000;

type Coords = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: string;
};

type UseCourierLocationBroadcastOptions = {
  courier: Pick<
    Courier,
    "id" | "restaurant_id" | "full_name" | "status" | "is_active"
  > | null;
  /** false ise izleme durur (mola) */
  enabled?: boolean;
};

function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Vardiyadayken GPS izler:
 * - Native: Foreground Service + distanceFilter 20 m
 * - Web: watchPosition (enableHighAccuracy)
 * - 20 m veya 5 sn → broadcast + couriers.last_location
 */
export function useCourierLocationBroadcast({
  courier,
  enabled = true,
}: UseCourierLocationBroadcastOptions) {
  const lastBroadcastAt = useRef(0);
  const lastDbAt = useRef(0);
  const lastEmitted = useRef<{ latitude: number; longitude: number } | null>(
    null
  );
  const latestCoords = useRef<Coords | null>(null);

  useEffect(() => {
    if (!courier || !enabled || !courier.is_active) return;
    if (typeof window === "undefined") return;

    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let webWatchId: number | null = null;
    let bgWatcherId: string | null = null;
    let timeTimer: number | null = null;

    channel = supabase.channel(`courier-locations-${courier.restaurant_id}`);
    channel.subscribe();

    const flushDb = async () => {
      const coords = latestCoords.current;
      if (!coords || cancelled) return;

      const { error } = await supabase
        .from("couriers")
        .update({
          last_location: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            heading: coords.heading,
            speed: coords.speed,
            updated_at: coords.timestamp,
          },
        })
        .eq("id", courier.id);

      if (error) {
        console.warn("[gps] last_location yazılamadı:", error.message);
        return;
      }
      lastDbAt.current = Date.now();
    };

    const publish = (forceTime = false) => {
      const coords = latestCoords.current;
      if (!coords || cancelled) return;

      const now = Date.now();
      const prev = lastEmitted.current;
      const movedM = prev
        ? haversineMeters(prev, coords)
        : Number.POSITIVE_INFINITY;
      const timeOk = now - lastDbAt.current >= TIME_INTERVAL_MS;
      const distOk = movedM >= DISTANCE_FILTER_M;

      if (!forceTime && !distOk && !timeOk && prev) return;

      lastEmitted.current = {
        latitude: coords.latitude,
        longitude: coords.longitude,
      };

      if (now - lastBroadcastAt.current >= BROADCAST_MIN_INTERVAL_MS) {
        lastBroadcastAt.current = now;
        void channel?.send({
          type: "broadcast",
          event: "location",
          payload: {
            courier_id: courier.id,
            courierId: courier.id,
            latitude: coords.latitude,
            longitude: coords.longitude,
            speed: coords.speed,
            heading: coords.heading,
            accuracy: coords.accuracy,
            timestamp: coords.timestamp,
            updated_at: coords.timestamp,
            status: courier.status,
            full_name: courier.full_name,
          },
        });
      }

      void flushDb();
    };

    const onCoords = (raw: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      heading?: number | null;
      speed?: number | null;
      time?: number | null;
    }) => {
      if (cancelled) return;
      if (
        !Number.isFinite(raw.latitude) ||
        !Number.isFinite(raw.longitude)
      ) {
        return;
      }

      latestCoords.current = {
        latitude: raw.latitude,
        longitude: raw.longitude,
        accuracy:
          raw.accuracy != null && Number.isFinite(raw.accuracy)
            ? raw.accuracy
            : null,
        heading:
          raw.heading != null && Number.isFinite(raw.heading)
            ? raw.heading
            : null,
        speed:
          raw.speed != null && Number.isFinite(raw.speed) ? raw.speed : null,
        timestamp: new Date(raw.time ?? Date.now()).toISOString(),
      };

      publish(false);
    };

    async function startNativeBackground() {
      const { BackgroundGeolocation } = await import(
        "@/lib/backgroundGeolocation"
      );

      bgWatcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage:
            "Konumunuz restoran paneline iletiliyor. Kurye takibi aktif.",
          backgroundTitle: "Regon Paket · Canlı konum",
          requestPermissions: true,
          stale: false,
          distanceFilter: DISTANCE_FILTER_M,
        },
        (location, error) => {
          if (error) {
            if (error.code === "NOT_AUTHORIZED") {
              console.warn("[gps] konum izni yok");
            } else {
              console.warn("[gps] background error:", error);
            }
            return;
          }
          if (!location) return;
          onCoords({
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            heading: location.bearing ?? null,
            speed: location.speed ?? null,
            time: location.time ?? Date.now(),
          });
        }
      );
    }

    function startWebWatch() {
      if (!("geolocation" in navigator)) return;
      webWatchId = navigator.geolocation.watchPosition(
        (position) => {
          onCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            time: position.timestamp,
          });
        },
        (err) => {
          console.warn("[gps] watchPosition:", err.message);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 2_000,
          timeout: 20_000,
        }
      );
    }

    void (async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          // Önce Capacitor Geolocation ile açık izin (Android 12+)
          try {
            const { Geolocation } = await import("@capacitor/geolocation");
            const perm = await Geolocation.requestPermissions();
            if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
              console.warn("[gps] Geolocation izni verilmedi");
            }
          } catch (e) {
            console.warn("[gps] Geolocation izin isteği:", e);
          }
          await startNativeBackground();
        } else {
          startWebWatch();
        }
      } catch (err) {
        console.warn("[gps] native başlatılamadı, web fallback:", err);
        startWebWatch();
      }
    })();

    // 5 sn zaman eşiği (hareket az olsa bile)
    timeTimer = window.setInterval(() => {
      publish(true);
    }, TIME_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timeTimer != null) window.clearInterval(timeTimer);
      if (webWatchId != null) {
        navigator.geolocation.clearWatch(webWatchId);
      }
      if (bgWatcherId) {
        const id = bgWatcherId;
        void import("@/lib/backgroundGeolocation").then(
          ({ BackgroundGeolocation }) =>
            BackgroundGeolocation.removeWatcher({ id })
        );
      }
      if (channel) {
        void supabase.removeChannel(channel);
      }
      void flushDb();
    };
  }, [
    courier?.id,
    courier?.restaurant_id,
    courier?.full_name,
    courier?.status,
    courier?.is_active,
    enabled,
  ]);
}
