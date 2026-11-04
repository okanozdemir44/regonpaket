"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Wallet } from "lucide-react";
import { useRestoran } from "../RestoranProvider";
import { EndOfDaySettlementModal } from "../components/EndOfDaySettlementModal";
import { getCourierSettlements } from "@/services/courierService";
import {
  calculateCourierCollectionTotals,
  getReportRange,
  type CourierCollectionTotals,
  type ReportPeriod,
} from "@/utils/calculations";
import { cn } from "@/lib/utils";
import type { Courier, CourierSettlement, Order } from "@/types";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "POS Slip",
  iban: "IBAN",
  online: "Online",
};

const HISTORY_PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: "today", label: "Bugün" },
  { id: "yesterday", label: "Dün" },
  { id: "7d", label: "Son 7 Gün" },
  { id: "month", label: "Bu Ay" },
];

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function unsettledForCourier(orders: Order[], courierId: string): Order[] {
  return orders
    .filter((o) => {
      if (o.status !== "delivered" || o.is_courier_settled) return false;
      const owner = o.delivered_by_courier_id || o.courier_id;
      return owner === courierId;
    })
    .sort(
      (a, b) =>
        new Date(b.delivered_at || b.created_at).getTime() -
        new Date(a.delivered_at || a.created_at).getTime()
    );
}

export default function KasaPage() {
  const { session, couriers, orders, refreshOrders } = useRestoran();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [settling, setSettling] = useState<{
    courier: Courier;
    packages: Order[];
    totals: CourierCollectionTotals;
  } | null>(null);
  const [settlements, setSettlements] = useState<CourierSettlement[]>([]);
  const [settlementsError, setSettlementsError] = useState<string | null>(null);
  const [historyPeriod, setHistoryPeriod] = useState<ReportPeriod>("7d");
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(
    null
  );

  const loadSettlements = useCallback(async () => {
    try {
      setSettlementsError(null);
      const rows = await getCourierSettlements(session.id);
      setSettlements(rows);
    } catch (err) {
      setSettlementsError(
        err instanceof Error ? err.message : "Fişler yüklenemedi"
      );
    }
  }, [session.id]);

  useEffect(() => {
    void loadSettlements();
  }, [loadSettlements]);

  const courierCards = useMemo(() => {
    return couriers.map((courier) => {
      const openPackages = unsettledForCourier(orders, courier.id);
      const totals = calculateCourierCollectionTotals(
        openPackages,
        courier.package_rate
      );
      return { courier, openPackages, totals };
    });
  }, [couriers, orders]);

  const openCashCount = courierCards.filter(
    (c) => c.totals.deliveredCount > 0
  ).length;

  const historyRange = useMemo(
    () => getReportRange(historyPeriod),
    [historyPeriod]
  );

  const filteredSettlements = useMemo(() => {
    const startMs = new Date(historyRange.start).getTime();
    const endMs = new Date(historyRange.end).getTime();
    return settlements.filter((s) => {
      const t = new Date(s.created_at).getTime();
      return t >= startMs && t <= endMs;
    });
  }, [settlements, historyRange]);

  const filteredDelivered = useMemo(() => {
    const startMs = new Date(historyRange.start).getTime();
    const endMs = new Date(historyRange.end).getTime();
    return orders
      .filter((o) => {
        if (o.status !== "delivered" || !o.delivered_at) return false;
        const t = new Date(o.delivered_at).getTime();
        return t >= startMs && t <= endMs;
      })
      .sort(
        (a, b) =>
          new Date(b.delivered_at || 0).getTime() -
          new Date(a.delivered_at || 0).getTime()
      );
  }, [orders, historyRange]);

  const settlementPackages = useMemo(() => {
    if (!selectedSettlementId) return [];
    return orders.filter((o) => o.courier_settlement_id === selectedSettlementId);
  }, [orders, selectedSettlementId]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-2xl tracking-tight sm:text-3xl">
          <Wallet className="size-7 shrink-0 text-[var(--brand-primary)]" />
          Gün Sonu Kasa
        </h1>
        <p className="mt-1 text-sm text-[var(--panel-muted)]">
          Kurye nakit & POS slip toplama · {openCashCount} açık kasa
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        {courierCards.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-[var(--panel-muted)] xl:col-span-2">
            Henüz kurye yok
          </p>
        ) : (
          courierCards.map(({ courier, openPackages, totals }) => {
            const expanded = expandedId === courier.id;
            const hasOpen = totals.deliveredCount > 0;

            return (
              <article
                key={courier.id}
                className="rounded-3xl border border-white/8 bg-[#12171e] p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-[family-name:var(--font-display)] text-xl">
                      {courier.full_name}
                    </h2>
                    <p className="text-xs text-[var(--panel-muted)]">
                      @{courier.username}
                      {courier.is_active ? " · Vardiyada" : " · Mola"}
                      {courier.package_rate > 0
                        ? ` · Prim ${formatMoney(courier.package_rate)}/paket`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-lg px-2 py-1 text-[10px] font-bold uppercase",
                      hasOpen
                        ? "bg-amber-500/15 text-amber-200"
                        : "bg-emerald-500/15 text-emerald-300"
                    )}
                  >
                    {hasOpen ? "Açık kasa" : "Sıfır"}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <Row
                    label={`💵 Kuryeden alınacak nakit (${totals.cashCount} paket)`}
                    value={formatMoney(totals.cashTotal)}
                    strong
                  />
                  <Row
                    label={`💳 Kuryeden alınacak POS slipleri (${totals.cardCount} paket)`}
                    value={formatMoney(totals.cardTotal)}
                  />
                  <Row
                    label={`🏦 IBAN / havale (${totals.ibanCount} paket)`}
                    value={formatMoney(totals.ibanTotal)}
                  />
                  <Row
                    label={`🌐 Online ödenmiş paketler`}
                    value={`${totals.onlineCount} adet (0 ₺ tahsilat)`}
                  />
                  <div className="rounded-2xl border border-[var(--panel-accent)]/25 bg-[var(--panel-accent)]/10 px-3 py-3">
                    <p className="text-xs text-[var(--panel-muted)]">
                      ∑ Kasaya teslim edilecek (nakit + POS + IBAN)
                    </p>
                    <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--panel-accent)]">
                      {formatMoney(totals.expectedTotal)}
                    </p>
                  </div>
                  <Row
                    label="Toplam paket / hakediş"
                    value={
                      courier.package_rate > 0
                        ? `${totals.deliveredCount} paket · ${formatMoney(totals.courierEarnedTotal)}`
                        : `${totals.deliveredCount} paket`
                    }
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(expanded ? null : courier.id)
                    }
                    className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs text-[var(--panel-muted)] hover:bg-white/5 hover:text-[var(--panel-ink)]"
                  >
                    {expanded ? (
                      <ChevronUp className="size-3.5" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                    Açık paket detayı ({openPackages.length})
                  </button>

                  <button
                    type="button"
                    disabled={!hasOpen}
                    onClick={() =>
                      setSettling({ courier, packages: openPackages, totals })
                    }
                    className="rounded-xl bg-[var(--panel-accent)] px-3 py-2 text-xs font-bold text-[#1a1208] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Gün Sonu Hesabını Al / Kasayı Kapat
                  </button>
                </div>

                {expanded ? (
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-white/8 bg-black/20 p-2">
                    {openPackages.length === 0 ? (
                      <p className="px-2 py-4 text-center text-xs text-[var(--panel-muted)]">
                        Açık paket yok
                      </p>
                    ) : (
                      openPackages.map((pkg) => (
                        <div
                          key={pkg.id}
                          className="flex items-start justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">
                              #{pkg.order_number || pkg.id} · {pkg.customer_name}
                            </p>
                            <p className="text-[var(--panel-muted)]">
                              {PAYMENT_LABEL[pkg.payment_method] ??
                                pkg.payment_method}
                              {pkg.delivered_at
                                ? ` · ${formatDateTime(pkg.delivered_at)}`
                                : ""}
                            </p>
                          </div>
                          <p
                            className={cn(
                              "shrink-0 font-semibold",
                              pkg.payment_method === "online"
                                ? "text-emerald-300"
                                : "text-[var(--panel-accent)]"
                            )}
                          >
                            {pkg.payment_method === "online"
                              ? "0 ₺"
                              : formatMoney(pkg.amount)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            Geçmiş hesap & sipariş dökümü
          </h2>
          <div className="flex flex-wrap gap-2">
            {HISTORY_PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setHistoryPeriod(p.id);
                  setSelectedSettlementId(null);
                }}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-medium transition",
                  historyPeriod === p.id
                    ? "bg-[var(--panel-accent)] text-[#1a1208]"
                    : "border border-white/10 text-[var(--panel-muted)] hover:bg-white/5"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {settlementsError ? (
          <p className="text-sm text-red-300">{settlementsError}</p>
        ) : null}

        <h3 className="text-sm font-semibold text-[var(--panel-muted)]">
          Kasa fişleri ({filteredSettlements.length})
        </h3>
        {filteredSettlements.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-[var(--panel-muted)]">
            Bu dönemde kasa fişi yok
          </p>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-white/8">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-[var(--panel-muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Tarih</th>
                  <th className="px-4 py-3 font-medium">Kurye</th>
                  <th className="px-4 py-3 font-medium">Nakit</th>
                  <th className="px-4 py-3 font-medium">POS</th>
                  <th className="px-4 py-3 font-medium">Alınan</th>
                  <th className="px-4 py-3 font-medium">Eksik</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filteredSettlements.map((s) => {
                  const courierName =
                    couriers.find((c) => c.id === s.courier_id)?.full_name ??
                    "—";
                  const selected = selectedSettlementId === s.id;
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        "border-t border-white/8 text-[var(--panel-ink)]",
                        selected && "bg-[var(--panel-accent)]/10"
                      )}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--panel-muted)]">
                        {formatDateTime(s.created_at)}
                      </td>
                      <td className="px-4 py-3">{courierName}</td>
                      <td className="px-4 py-3">{formatMoney(s.total_cash)}</td>
                      <td className="px-4 py-3">{formatMoney(s.total_card)}</td>
                      <td className="px-4 py-3">
                        {formatMoney(s.received_amount)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 font-medium",
                          Number(s.remaining_debt) > 0
                            ? "text-amber-300"
                            : "text-emerald-300"
                        )}
                      >
                        {formatMoney(s.remaining_debt)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedSettlementId(selected ? null : s.id)
                          }
                          className="text-xs text-[var(--panel-accent)] hover:underline"
                        >
                          {selected ? "Gizle" : "Detay"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedSettlementId ? (
          <div className="space-y-2 rounded-2xl border border-white/8 bg-black/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--panel-muted)]">
              Fiş paketleri ({settlementPackages.length})
            </p>
            {settlementPackages.length === 0 ? (
              <p className="text-sm text-[var(--panel-muted)]">
                Bu fişe bağlı paket satırı bulunamadı
              </p>
            ) : (
              settlementPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-xs"
                >
                  <span>
                    #{pkg.order_number || pkg.id} · {pkg.customer_name} ·{" "}
                    {PAYMENT_LABEL[pkg.payment_method] ?? pkg.payment_method}
                  </span>
                  <span className="font-semibold">
                    {formatMoney(pkg.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : null}

        <h3 className="text-sm font-semibold text-[var(--panel-muted)]">
          Teslim edilen paketler ({filteredDelivered.length})
        </h3>
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-3xl border border-white/8 p-3">
          {filteredDelivered.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--panel-muted)]">
              Bu dönemde teslim yok
            </p>
          ) : (
            filteredDelivered.slice(0, 100).map((pkg) => {
              const courierName =
                couriers.find(
                  (c) =>
                    c.id === pkg.delivered_by_courier_id ||
                    c.id === pkg.courier_id
                )?.full_name ?? "—";
              return (
                <div
                  key={pkg.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-xs"
                >
                  <div>
                    <p className="font-medium">
                      #{pkg.order_number || pkg.id} · {pkg.customer_name}
                    </p>
                    <p className="text-[var(--panel-muted)]">
                      {courierName} ·{" "}
                      {PAYMENT_LABEL[pkg.payment_method] ?? pkg.payment_method}
                      {pkg.delivered_at
                        ? ` · ${formatDateTime(pkg.delivered_at)}`
                        : ""}
                      {pkg.is_courier_settled ? " · Kapatıldı" : " · Açık"}
                    </p>
                  </div>
                  <p className="font-semibold text-[var(--panel-accent)]">
                    {formatMoney(pkg.amount)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>

      {settling ? (
        <EndOfDaySettlementModal
          open
          onClose={() => setSettling(null)}
          restaurantId={session.id}
          courier={settling.courier}
          packages={settling.packages}
          totals={settling.totals}
          onSettled={() => {
            void refreshOrders();
            void loadSettlements();
          }}
        />
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[var(--panel-muted)]">{label}</span>
      <span
        className={cn(
          "text-right",
          strong ? "font-semibold text-[var(--panel-ink)]" : "text-[var(--panel-ink)]"
        )}
      >
        {value}
      </span>
    </div>
  );
}
