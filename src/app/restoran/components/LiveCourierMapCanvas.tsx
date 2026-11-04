"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LiveCourierPosition, MapCanvasProps } from "./LiveCourierMap";

const DEFAULT_CENTER: [number, number] = [41.2867, 36.33];

function statusLabel(status: LiveCourierPosition["status"]): string {
  if (status === "idle") return "Boşta";
  if (status === "assigned") return "Atandı";
  if (status === "picking_up") return "Alıyor";
  return "Yolda";
}

function isBusy(status: LiveCourierPosition["status"]): boolean {
  return status !== "idle";
}

function createRestaurantIcon(brandPrimary = "#f59e0b") {
  return L.divIcon({
    className: "regon-map-icon",
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    popupAnchor: [0, -40],
    html: `
      <div style="
        width:44px;height:44px;border-radius:14px;
        background:${brandPrimary};
        color:#1a1208;display:flex;align-items:center;justify-content:center;
        font-size:22px;box-shadow:0 8px 20px rgba(0,0,0,.35);
        border:2px solid rgba(255,255,255,.35);
      ">🏪</div>
    `,
  });
}

function createCourierIcon(pos: LiveCourierPosition) {
  const busy = isBusy(pos.status);
  const accent = busy ? "#38bdf8" : "#34d399";
  const badgeBg = busy ? "#0ea5e9" : "#10b981";
  const shortName =
    pos.fullName.length > 14
      ? `${pos.fullName.slice(0, 13)}…`
      : pos.fullName;
  const destHint = pos.destinations[0]
    ? pos.destinations[0].customerName.length > 16
      ? `${pos.destinations[0].customerName.slice(0, 15)}…`
      : pos.destinations[0].customerName
    : "";

  return L.divIcon({
    className: "regon-map-icon",
    iconSize: [160, destHint ? 78 : 64],
    iconAnchor: [80, destHint ? 68 : 54],
    popupAnchor: [0, -48],
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;">
        <div style="
          position:relative;
          min-width:118px;max-width:156px;
          padding:6px 10px 8px;
          border-radius:14px;
          background:rgba(16,21,28,.94);
          border:1px solid rgba(255,255,255,.14);
          box-shadow:0 10px 24px rgba(0,0,0,.4);
          color:#f4f1ea;text-align:center;
          font-family:system-ui,-apple-system,sans-serif;
        ">
          <div style="font-size:11px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(shortName)}
          </div>
          <div style="margin-top:3px;display:flex;justify-content:center;gap:4px;align-items:center;">
            <span style="
              font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
              padding:2px 6px;border-radius:999px;background:${accent}22;color:${accent};
            ">${escapeHtml(statusLabel(pos.status))}</span>
            <span style="
              min-width:18px;height:18px;border-radius:999px;
              display:inline-flex;align-items:center;justify-content:center;
              font-size:10px;font-weight:800;color:#081018;background:${badgeBg};
            ">${pos.activePackageCount}</span>
          </div>
          ${
            destHint
              ? `<div style="margin-top:4px;font-size:9px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">→ ${escapeHtml(destHint)}</div>`
              : ""
          }
          <div style="
            position:absolute;left:50%;bottom:-7px;transform:translateX(-50%);
            width:12px;height:12px;background:rgba(16,21,28,.94);
            border-right:1px solid rgba(255,255,255,.14);
            border-bottom:1px solid rgba(255,255,255,.14);
            rotate:45deg;
          "></div>
        </div>
        <div style="
          width:14px;height:14px;border-radius:999px;margin-top:2px;
          background:${accent};border:2px solid #fff;
          box-shadow:0 0 0 3px ${accent}55;
        "></div>
      </div>
    `,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function FitBounds({
  restaurant,
  positions,
}: {
  restaurant: MapCanvasProps["restaurant"];
  positions: LiveCourierPosition[];
}) {
  const map = useMap();
  const fittedKey = useRef<string | null>(null);

  useEffect(() => {
    // Canlı kaydırmada sürekli fitBounds yapma; sadece dükkan / ilk konum seti
    const key = `${restaurant?.id ?? "x"}:${positions.length > 0 ? "has" : "empty"}`;
    if (fittedKey.current === key) return;

    const points: L.LatLngExpression[] = [];

    if (restaurant?.latitude != null && restaurant?.longitude != null) {
      points.push([restaurant.latitude, restaurant.longitude]);
    }
    for (const p of positions) {
      points.push([p.latitude, p.longitude]);
    }

    if (points.length === 0) return;

    fittedKey.current = key;

    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
  }, [map, restaurant, positions]);

  return null;
}

/** Container boyutu + sekme geri dönüşünde silinen karoları yeniler */
function MapResizer({ sizeKey }: { sizeKey: string }) {
  const map = useMap();

  useEffect(() => {
    const fix = () => {
      map.invalidateSize({ animate: false, pan: false });
      map.eachLayer((layer) => {
        const redrawable = layer as L.Layer & { redraw?: () => void };
        if (typeof redrawable.redraw === "function") {
          redrawable.redraw();
        }
      });
    };

    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      fix();
      window.setTimeout(fix, 200);
    };

    const t1 = window.setTimeout(fix, 150);
    const t2 = window.setTimeout(fix, 400);

    const container = map.getContainer();
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            fix();
          })
        : null;

    observer?.observe(container);
    fix();

    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [map, sizeKey]);

  return null;
}

export default function LiveCourierMapCanvas({
  restaurant,
  positions,
  sizeKey,
  brandPrimary = "#f59e0b",
}: MapCanvasProps) {
  const center = useMemo<[number, number]>(() => {
    if (restaurant?.latitude != null && restaurant?.longitude != null) {
      return [restaurant.latitude, restaurant.longitude];
    }
    return DEFAULT_CENTER;
  }, [restaurant]);

  const restaurantIcon = useMemo(
    () => createRestaurantIcon(brandPrimary),
    [brandPrimary]
  );
  const markers = positions;

  return (
    <MapContainer
      center={center}
      zoom={14}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={false}
      style={{ background: "#0e1319", height: "100%", width: "100%" }}
    >
      <TileLayer
        url="https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
        subdomains={["0", "1", "2", "3"]}
        maxZoom={20}
        attribution="&copy; Google"
        keepBuffer={6}
        updateWhenIdle={false}
        updateWhenZooming={false}
      />
      <MapResizer sizeKey={sizeKey} />
      <FitBounds restaurant={restaurant} positions={markers} />

      {restaurant?.latitude != null && restaurant?.longitude != null ? (
        <Marker
          position={[restaurant.latitude, restaurant.longitude]}
          icon={restaurantIcon}
          zIndexOffset={200}
        >
          <Popup>
            <strong>{restaurant.name}</strong>
            <br />
            Dükkan konumu
          </Popup>
        </Marker>
      ) : null}

      {markers.map((pos) => (
        <Marker
          key={pos.courierId}
          position={[pos.latitude, pos.longitude]}
          icon={createCourierIcon(pos)}
          zIndexOffset={isBusy(pos.status) ? 400 : 300}
        >
          <Popup>
            <strong>{pos.fullName}</strong>
            <br />
            {statusLabel(pos.status)} · {pos.activePackageCount} aktif paket
            {pos.destinations.length > 0 ? (
              <>
                <br />
                <br />
                <strong>Güzergâh</strong>
                {pos.destinations.map((d) => (
                  <div key={d.orderNumber} style={{ marginTop: 4 }}>
                    #{d.orderNumber} · {d.customerName}
                    <br />
                    <small>{d.address || "Adres yok"}</small>
                  </div>
                ))}
              </>
            ) : null}
            {pos.updatedAt ? (
              <>
                <br />
                <small>
                  {new Intl.DateTimeFormat("tr-TR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }).format(new Date(pos.updatedAt))}
                </small>
              </>
            ) : null}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
