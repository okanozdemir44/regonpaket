"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { closeCourierDaySettlement } from "@/services/courierService";
import type { CourierCollectionTotals } from "@/utils/calculations";
import type { Courier, Order } from "@/types";

type EndOfDaySettlementModalProps = {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  courier: Courier;
  packages: Order[];
  totals: CourierCollectionTotals;
  onSettled: () => void;
};

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

export function EndOfDaySettlementModal({
  open,
  onClose,
  restaurantId,
  courier,
  packages,
  totals,
  onSettled,
}: EndOfDaySettlementModalProps) {
  const [received, setReceived] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReceived(String(totals.expectedTotal));
    setNotes("");
    setError(null);
  }, [open, totals.expectedTotal, courier.id]);

  const receivedAmount = useMemo(() => {
    const n = Number(String(received).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }, [received]);

  const remainingDebt = totals.expectedTotal - receivedAmount;

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (packages.length === 0) {
        throw new Error("Kapatılacak açık paket yok");
      }

      await closeCourierDaySettlement({
        restaurantId,
        courierId: courier.id,
        packageIds: packages.map((p) => p.id),
        totalCash: totals.cashTotal,
        totalCard: totals.cardTotal,
        totalIban: totals.ibanTotal,
        onlineCount: totals.onlineCount,
        packageCount: totals.deliveredCount,
        totalEarned: totals.courierEarnedTotal,
        receivedAmount,
        notes: notes.trim() || null,
      });

      onSettled();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kasa kapatılamadı");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Kapat"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-3xl border border-white/10 bg-[#141a22] shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl">
              Gün Sonu Hesap Kesimi
            </h2>
            <p className="text-xs text-[var(--panel-muted)]">
              {courier.full_name} · {totals.deliveredCount} açık paket
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 p-2 text-[var(--panel-muted)] hover:bg-white/5"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[var(--panel-muted)]">
                Alınacak nakit
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-xl text-[var(--panel-accent)]">
                {formatMoney(totals.cashTotal)}
              </p>
              <p className="text-[11px] text-[var(--panel-muted)]">
                {totals.cashCount} paket
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
              <p className="text-[10px] uppercase tracking-wider text-[var(--panel-muted)]">
                Alınacak POS slip
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-xl text-sky-300">
                {formatMoney(totals.cardTotal)}
              </p>
              <p className="text-[11px] text-[var(--panel-muted)]">
                {totals.cardCount} slip
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--panel-accent)]/30 bg-[var(--panel-accent)]/10 px-4 py-3">
            <p className="text-xs text-[var(--panel-muted)]">
              Beklenen toplam (nakit + POS + IBAN)
            </p>
            <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--panel-accent)]">
              {formatMoney(totals.expectedTotal)}
            </p>
            {totals.ibanTotal > 0 ? (
              <p className="mt-1 text-xs text-[var(--panel-muted)]">
                IBAN dahil: {formatMoney(totals.ibanTotal)}
              </p>
            ) : null}
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
              Kuryeden teslim alınan tutar
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              className="field-input"
            />
            <span
              className={
                remainingDebt > 0.009
                  ? "text-xs text-amber-300"
                  : remainingDebt < -0.009
                    ? "text-xs text-sky-300"
                    : "text-xs text-emerald-300"
              }
            >
              {remainingDebt > 0.009
                ? `Eksik / kalan borç: ${formatMoney(remainingDebt)}`
                : remainingDebt < -0.009
                  ? `Fazla alındı: ${formatMoney(Math.abs(remainingDebt))}`
                  : "Beklenen tutarla eşleşiyor"}
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
              Not
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder='Örn: "150 TL motor yakıtı düşüldü"'
              className="field-input resize-none"
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[var(--panel-accent)] px-4 py-3.5 text-sm font-bold text-[#1a1208] transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Kapatılıyor…" : "Onayla ve Kasayı Sıfırla"}
          </button>
        </form>
      </div>
    </div>
  );
}
