"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { printOrderSlip } from "@/utils/printSlip";
import type { Courier, Order, Restaurant } from "@/types";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "POS Slip",
  iban: "IBAN",
  online: "Online",
};

const STATUS_LABEL: Record<string, string> = {
  waiting: "Bekliyor",
  assigned: "Atandı",
  picking_up: "Alınıyor",
  on_the_way: "Yolda",
  delivered: "Teslim",
  cancelled: "İptal",
};

type OrderCardProps = {
  order: Order;
  couriers: Courier[];
  restaurant: Restaurant | null;
  variant: "waiting" | "active" | "delivered";
  busy?: boolean;
  onAssign?: (courierId: string) => void;
  onCancel?: () => void;
  onTransfer?: (courierId: string) => void;
};

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function minutesSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function OrderCard({
  order,
  couriers,
  restaurant,
  variant,
  busy = false,
  onAssign,
  onCancel,
  onTransfer,
}: OrderCardProps) {
  const [nowTick, setNowTick] = useState(0);
  const [showTransfer, setShowTransfer] = useState(false);

  useEffect(() => {
    if (variant !== "active") return;
    const id = window.setInterval(() => setNowTick((n) => n + 1), 30000);
    return () => window.clearInterval(id);
  }, [variant]);

  const courier = useMemo(
    () =>
      couriers.find(
        (c) =>
          c.id === order.courier_id || c.id === order.delivered_by_courier_id
      ) ?? null,
    [couriers, order.courier_id, order.delivered_by_courier_id]
  );

  const elapsed = useMemo(() => {
    void nowTick;
    const base =
      order.picked_up_at || order.assigned_at || order.created_at || null;
    return minutesSince(base);
  }, [order.picked_up_at, order.assigned_at, order.created_at, nowTick]);

  const activeCouriers = couriers.filter((c) => c.is_active);
  const transferTargets = activeCouriers.filter((c) => c.id !== order.courier_id);

  return (
    <article className="rounded-2xl border border-white/8 bg-[#161c24] p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-[family-name:var(--font-display)] text-lg leading-none">
            #{order.order_number || order.id}
          </p>
          <p className="mt-1 text-sm font-medium">{order.customer_name}</p>
          <p className="text-xs text-[var(--panel-muted)]">
            {order.customer_phone}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-[var(--panel-accent)]">
            {formatMoney(order.amount)}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--panel-muted)]">
            {PAYMENT_LABEL[order.payment_method] ?? order.payment_method}
          </p>
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-xs text-[var(--panel-muted)]">
        {order.delivery_address || "Adres yok"}
      </p>
      {order.content ? (
        <p className="mt-1 line-clamp-2 text-xs text-[var(--panel-ink)]/80">
          {order.content}
        </p>
      ) : null}

      {variant === "active" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-lg bg-white/5 px-2 py-1 text-[var(--panel-ink)]">
            {courier?.full_name ?? "Kurye yok"} · {STATUS_LABEL[order.status]}
          </span>
          <span className="rounded-lg bg-[var(--panel-accent)]/15 px-2 py-1 text-[var(--panel-accent)]">
            {elapsed} dk
          </span>
        </div>
      ) : null}

      {variant === "delivered" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--panel-muted)]">
          <span>{courier?.full_name ?? "—"}</span>
          <span>·</span>
          <span>
            {PAYMENT_LABEL[order.payment_method] ?? order.payment_method}
          </span>
          <span>·</span>
          <span>{formatClock(order.delivered_at)}</span>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() =>
            printOrderSlip(order, restaurant, courier?.full_name ?? null)
          }
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-[var(--panel-muted)] transition hover:bg-white/5 hover:text-[var(--panel-ink)]"
        >
          <Printer className="size-3.5" />
          Fiş Yazdır
        </button>

        {variant === "active" && onCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
          >
            <XCircle className="size-3.5" />
            İptal
          </button>
        ) : null}

        {variant === "active" && onTransfer ? (
          <button
            type="button"
            disabled={busy || transferTargets.length === 0}
            onClick={() => setShowTransfer((v) => !v)}
            className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-[var(--panel-muted)] transition hover:bg-white/5 disabled:opacity-40"
          >
            Devret
          </button>
        ) : null}
      </div>

      {variant === "waiting" && onAssign ? (
        <div className="mt-3 space-y-1.5 border-t border-white/8 pt-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--panel-muted)]">
            Tek tıkla ata
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activeCouriers.length === 0 ? (
              <span className="text-xs text-[var(--panel-muted)]">
                Aktif kurye yok
              </span>
            ) : (
              activeCouriers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onAssign(c.id)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs transition disabled:opacity-50",
                    c.status === "idle"
                      ? "bg-[var(--panel-accent)] text-[#1a1208]"
                      : "border border-white/10 bg-white/[0.03] text-[var(--panel-ink)] hover:bg-white/5"
                  )}
                >
                  {c.status === "idle" ? "⚡" : "🛵"} {c.full_name}
                  {c.status !== "idle" ? " (+)" : ""}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      {variant === "active" && showTransfer && onTransfer ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {transferTargets.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busy}
              onClick={() => {
                onTransfer(c.id);
                setShowTransfer(false);
              }}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
            >
              → {c.full_name}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
