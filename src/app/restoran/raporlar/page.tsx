"use client";

import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { useRestoran } from "../RestoranProvider";
import {
  calculateCourierPerformance,
  getReportRange,
  type ReportPeriod,
} from "@/utils/calculations";
import { cn } from "@/lib/utils";

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: "today", label: "Bugün" },
  { id: "yesterday", label: "Dün" },
  { id: "7d", label: "Son 7 Gün" },
  { id: "month", label: "Bu Ay" },
];

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

export default function RaporlarPage() {
  const { couriers, orders, restaurant } = useRestoran();
  const [period, setPeriod] = useState<ReportPeriod>("today");

  const range = useMemo(() => getReportRange(period), [period]);
  const rows = useMemo(
    () => calculateCourierPerformance(orders, couriers, range),
    [orders, couriers, range]
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.packages += r.packageCount;
        acc.revenue += r.revenueTotal;
        if (r.avgDeliveryMinutes != null) {
          acc.avgSum += r.avgDeliveryMinutes * r.packageCount;
          acc.avgWeight += r.packageCount;
        }
        return acc;
      },
      { packages: 0, revenue: 0, avgSum: 0, avgWeight: 0 }
    );
  }, [rows]);

  const overallAvg =
    totals.avgWeight > 0
      ? Math.round(totals.avgSum / totals.avgWeight)
      : null;

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-2xl tracking-tight sm:text-3xl">
          <BarChart3 className="size-7 shrink-0 text-[var(--brand-primary)]" />
          Performans & Raporlar
        </h1>
        <p className="mt-1 text-sm text-[var(--panel-muted)]">
          Paket sayısı, ortalama teslimat süresi ve ciro
          {restaurant ? ` — ${restaurant.name}` : ""}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium transition",
              period === p.id
                ? "bg-[var(--panel-accent)] text-[#1a1208]"
                : "border border-white/10 text-[var(--panel-muted)] hover:bg-white/5"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
          <p className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
            Toplam paket
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-3xl">
            {totals.packages}
          </p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
          <p className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
            Ort. teslimat
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-3xl">
            {overallAvg != null ? `${overallAvg} dk` : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
          <p className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
            Toplam ciro
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-3xl text-[var(--panel-accent)]">
            {formatMoney(totals.revenue)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-white/8">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-[var(--panel-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Kurye</th>
              <th className="px-4 py-3 font-medium">Paket</th>
              <th className="px-4 py-3 font-medium">Ort. süre</th>
              <th className="px-4 py-3 font-medium">Ciro katkısı</th>
            </tr>
          </thead>
          <tbody>
            {rows.every((r) => r.packageCount === 0) ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-[var(--panel-muted)]"
                >
                  Bu dönemde teslimat yok
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.courierId} className="border-t border-white/8">
                  <td className="px-4 py-3 font-medium">{r.fullName}</td>
                  <td className="px-4 py-3 tabular-nums">{r.packageCount}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.avgDeliveryMinutes != null
                      ? `${r.avgDeliveryMinutes} dk`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[var(--panel-accent)]">
                    {formatMoney(r.revenueTotal)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
