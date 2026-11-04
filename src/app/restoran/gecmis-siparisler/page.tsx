"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { History, Printer, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRestoran } from "../RestoranProvider";
import { getReportRange, type ReportPeriod } from "@/utils/calculations";
import { printOrderSlip } from "@/utils/printSlip";
import { cn } from "@/lib/utils";
import type {
  Order,
  OrderPlatform,
  OrderStatus,
  PaymentMethod,
} from "@/types";

type DatePreset = ReportPeriod | "all" | "custom";
type PaymentFilter = "all" | PaymentMethod;
type StatusFilter = "all" | "delivered" | "cancelled" | "active";
type PlatformFilter = "all" | OrderPlatform;

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "today", label: "Bugün" },
  { id: "yesterday", label: "Dün" },
  { id: "7d", label: "Son 7 Gün" },
  { id: "month", label: "Bu Ay" },
  { id: "all", label: "Tüm Zamanlar" },
];

const PAYMENT_OPTIONS: { id: PaymentFilter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "cash", label: "Nakit" },
  { id: "card", label: "POS / Kart" },
  { id: "iban", label: "IBAN" },
  { id: "online", label: "Online Ödendi" },
];

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "delivered", label: "Teslim Edildi" },
  { id: "cancelled", label: "İptal Edildi" },
  { id: "active", label: "Yolda / Bekleyen" },
];

const PLATFORM_OPTIONS: { id: PlatformFilter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "telefon", label: "Telefon" },
  { id: "yemeksepeti", label: "Yemeksepeti" },
  { id: "getir", label: "Getir" },
  { id: "trendyol", label: "Trendyol" },
];

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "POS / Kart",
  iban: "IBAN",
  online: "Online Ödendi",
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  waiting: "Bekliyor",
  assigned: "Atandı",
  picking_up: "Alınıyor",
  on_the_way: "Yolda",
  delivered: "Teslim",
  cancelled: "İptal",
};

const ACTIVE_STATUSES: OrderStatus[] = [
  "waiting",
  "assigned",
  "picking_up",
  "on_the_way",
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

function todayInputValue(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** YYYY-MM-DD → TR günü 00:00:00 / 23:59:59.999 ISO aralığı */
function calendarDayRange(
  startDate: string,
  endDate: string
): { start: string; end: string } {
  const start = new Date(`${startDate}T00:00:00+03:00`);
  const end = new Date(`${endDate}T23:59:59.999+03:00`);
  return { start: start.toISOString(), end: end.toISOString() };
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR");
}

function matchesSearch(order: Order, rawQuery: string): boolean {
  const q = normalizeSearch(rawQuery);
  if (!q) return true;

  const qDigits = digitsOnly(q);
  const phoneDigits = digitsOnly(order.customer_phone || "");

  if (qDigits.length >= 3 && phoneDigits.includes(qDigits)) return true;

  const orderNo = normalizeSearch(order.order_number || String(order.id));
  const name = normalizeSearch(order.customer_name || "");
  const address = normalizeSearch(order.delivery_address || "");
  const content = normalizeSearch(order.content || "");
  const phone = normalizeSearch(order.customer_phone || "");

  return (
    name.includes(q) ||
    phone.includes(q) ||
    orderNo.includes(q) ||
    address.includes(q) ||
    content.includes(q) ||
    `#${orderNo}`.includes(q)
  );
}

function statusBadgeClass(status: OrderStatus): string {
  if (status === "delivered") return "bg-[var(--brand-secondary)]/20 text-[var(--brand-secondary)]";
  if (status === "cancelled") return "bg-rose-500/15 text-rose-300";
  if (status === "on_the_way") return "bg-sky-500/15 text-sky-300";
  if (status === "waiting") return "bg-white/10 text-[var(--panel-muted)]";
  return "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]";
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl px-3 py-1.5 text-sm font-medium transition",
        active
          ? "bg-[var(--panel-accent)] text-[#1a1208]"
          : "border border-white/10 text-[var(--panel-muted)] hover:bg-white/5"
      )}
    >
      {children}
    </button>
  );
}

export default function GecmisSiparislerPage() {
  const { session, restaurant, couriers } = useRestoran();

  const [query, setQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("7d");
  const [customStart, setCustomStart] = useState(() => todayInputValue());
  const [customEnd, setCustomEnd] = useState(() => todayInputValue());
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [courierFilter, setCourierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dateRange = useMemo(() => {
    if (datePreset === "all") return null;
    if (datePreset === "custom") {
      const start = customStart <= customEnd ? customStart : customEnd;
      const end = customStart <= customEnd ? customEnd : customStart;
      return calendarDayRange(start, end);
    }
    return getReportRange(datePreset);
  }, [datePreset, customStart, customEnd]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    let req = supabase
      .from("packages")
      .select("*")
      .eq("restaurant_id", session.id)
      .order("created_at", { ascending: false });

    if (dateRange) {
      req = req
        .gte("created_at", dateRange.start)
        .lte("created_at", dateRange.end);
    }

    const { data, error: fetchError } = await req;

    if (fetchError) {
      setError(fetchError.message);
      setOrders([]);
    } else {
      setOrders((data ?? []) as Order[]);
    }
    setLoading(false);
  }, [session.id, dateRange]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const courierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of couriers) map.set(c.id, c.full_name);
    return map;
  }, [couriers]);

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      if (!matchesSearch(order, query)) return false;

      if (paymentFilter !== "all" && order.payment_method !== paymentFilter) {
        return false;
      }

      if (platformFilter !== "all" && order.platform !== platformFilter) {
        return false;
      }

      if (statusFilter === "delivered" && order.status !== "delivered") {
        return false;
      }
      if (statusFilter === "cancelled" && order.status !== "cancelled") {
        return false;
      }
      if (
        statusFilter === "active" &&
        !ACTIVE_STATUSES.includes(order.status)
      ) {
        return false;
      }

      if (courierFilter !== "all") {
        const owner =
          order.delivered_by_courier_id || order.courier_id || "";
        if (owner !== courierFilter) return false;
      }

      return true;
    });
  }, [
    orders,
    query,
    paymentFilter,
    platformFilter,
    statusFilter,
    courierFilter,
  ]);

  const summary = useMemo(() => {
    let totalAmount = 0;
    let cashTotal = 0;
    let cardTotal = 0;

    for (const o of filtered) {
      if (o.status === "cancelled") continue;
      const amount = Number(o.amount) || 0;
      totalAmount += amount;
      if (o.payment_method === "cash") cashTotal += amount;
      if (o.payment_method === "card") cardTotal += amount;
    }

    return {
      count: filtered.length,
      totalAmount,
      cashTotal,
      cardTotal,
    };
  }, [filtered]);

  function applyCustomDates(start: string, end: string) {
    setCustomStart(start);
    setCustomEnd(end);
    setDatePreset("custom");
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-2xl tracking-tight sm:text-3xl">
          <History className="size-7 shrink-0 text-[var(--brand-primary)]" />
          Geçmiş Siparişlerim
        </h1>
        <p className="mt-1 text-sm text-[var(--panel-muted)]">
          Tüm siparişleri ara, filtrele ve fiş yazdır
          {restaurant ? ` — ${restaurant.name}` : ""}
        </p>
      </header>

      <section className="space-y-4 rounded-3xl border border-white/8 bg-[#10151c] p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-[var(--panel-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Müşteri adı, telefon (05xx...), sipariş no veya adres ara..."
            className="w-full rounded-2xl border border-white/10 bg-[#0e1319] py-3.5 pl-12 pr-4 text-base outline-none ring-[var(--brand-primary)]/40 placeholder:text-[var(--panel-muted)] focus:border-[var(--brand-primary)]/50 focus:ring-2"
            autoComplete="off"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
            Tarih
          </p>
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((p) => (
              <FilterChip
                key={p.id}
                active={datePreset === p.id}
                onClick={() => setDatePreset(p.id)}
              >
                {p.label}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label className="flex items-center gap-2 text-sm text-[var(--panel-muted)]">
              <span>Başlangıç</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) =>
                  applyCustomDates(e.target.value, customEnd)
                }
                className="rounded-xl border border-white/10 bg-[#0e1319] px-3 py-2 text-[var(--panel-ink)] outline-none focus:border-[var(--brand-primary)]/50"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--panel-muted)]">
              <span>Bitiş</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) =>
                  applyCustomDates(customStart, e.target.value)
                }
                className="rounded-xl border border-white/10 bg-[#0e1319] px-3 py-2 text-[var(--panel-ink)] outline-none focus:border-[var(--brand-primary)]/50"
              />
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
              Ödeme
            </p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_OPTIONS.map((p) => (
                <FilterChip
                  key={p.id}
                  active={paymentFilter === p.id}
                  onClick={() => setPaymentFilter(p.id)}
                >
                  {p.label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
              Durum
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((p) => (
                <FilterChip
                  key={p.id}
                  active={statusFilter === p.id}
                  onClick={() => setStatusFilter(p.id)}
                >
                  {p.label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
              Platform
            </p>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((p) => (
                <FilterChip
                  key={p.id}
                  active={platformFilter === p.id}
                  onClick={() => setPlatformFilter(p.id)}
                >
                  {p.label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
              Kurye
            </p>
            <select
              value={courierFilter}
              onChange={(e) => setCourierFilter(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0e1319] px-3 py-2.5 text-sm outline-none focus:border-[var(--brand-primary)]/50"
            >
              <option value="all">Tüm Kuryeler</option>
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Toplam Paket", value: String(summary.count) },
          { label: "Toplam Tutar (Ciro)", value: formatMoney(summary.totalAmount) },
          { label: "Nakit Toplamı", value: formatMoney(summary.cashTotal) },
          { label: "POS / Kart Toplamı", value: formatMoney(summary.cardTotal) },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-white/8 bg-[#10151c] px-4 py-3"
          >
            <p className="text-[11px] uppercase tracking-wider text-[var(--panel-muted)]">
              {card.label}
            </p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-xl tracking-tight">
              {card.value}
            </p>
          </div>
        ))}
      </section>

      {error ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-white/8 bg-[#10151c]">
        <div className="border-b border-white/8 px-4 py-3 text-sm text-[var(--panel-muted)]">
          {loading
            ? "Siparişler yükleniyor…"
            : `${filtered.length} sipariş listeleniyor`}
        </div>

        {/* Mobil kartlar */}
        <div className="divide-y divide-white/6 lg:hidden">
          {!loading && filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--panel-muted)]">
              Bu filtrelere uygun sipariş bulunamadı.
            </p>
          ) : null}
          {filtered.map((order) => {
            const courierId =
              order.delivered_by_courier_id || order.courier_id;
            const courierName = courierId
              ? courierNameById.get(courierId) ?? "—"
              : "—";
            return (
              <article key={order.id} className="space-y-2 px-4 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      #{order.order_number || order.id}
                    </p>
                    <p className="text-xs text-[var(--panel-muted)]">
                      {formatDateTime(order.created_at)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
                      statusBadgeClass(order.status)
                    )}
                  >
                    {STATUS_LABEL[order.status]}
                  </span>
                </div>
                <p className="text-sm font-medium">{order.customer_name}</p>
                <p className="text-xs text-[var(--panel-muted)]">
                  {order.customer_phone || "—"}
                </p>
                <p className="text-xs text-[var(--panel-muted)]">
                  {order.delivery_address || "Adres yok"}
                </p>
                {order.content ? (
                  <p className="text-xs text-[var(--panel-ink)]/80">
                    {order.content}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--panel-muted)]">
                  <span>{courierName}</span>
                  <span>·</span>
                  <span>
                    {PAYMENT_LABEL[order.payment_method] ??
                      order.payment_method}
                  </span>
                  <span className="ml-auto font-semibold text-[var(--panel-ink)]">
                    {formatMoney(order.amount)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    printOrderSlip(order, restaurant, courierName)
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-[var(--panel-muted)] transition hover:bg-white/5 hover:text-[var(--panel-ink)]"
                >
                  <Printer className="size-3.5" />
                  Fiş Yazdır
                </button>
              </article>
            );
          })}
        </div>

        {/* Masaüstü tablo */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-[var(--panel-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Sipariş</th>
                <th className="px-4 py-3 font-medium">Tarih</th>
                <th className="px-4 py-3 font-medium">Müşteri</th>
                <th className="px-4 py-3 font-medium">Adres</th>
                <th className="px-4 py-3 font-medium">İçerik</th>
                <th className="px-4 py-3 font-medium">Kurye</th>
                <th className="px-4 py-3 font-medium">Ödeme</th>
                <th className="px-4 py-3 font-medium">Tutar</th>
                <th className="px-4 py-3 font-medium">Durum</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-12 text-center text-[var(--panel-muted)]"
                  >
                    Bu filtrelere uygun sipariş bulunamadı.
                  </td>
                </tr>
              ) : null}
              {filtered.map((order) => {
                const courierId =
                  order.delivered_by_courier_id || order.courier_id;
                const courierName = courierId
                  ? courierNameById.get(courierId) ?? "—"
                  : "—";
                return (
                  <tr
                    key={order.id}
                    className="align-top transition hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">
                      #{order.order_number || order.id}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--panel-muted)]">
                      {formatDateTime(order.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{order.customer_name}</div>
                      <div className="text-xs text-[var(--panel-muted)]">
                        {order.customer_phone || "—"}
                      </div>
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-xs text-[var(--panel-muted)]">
                      {order.delivery_address || "—"}
                    </td>
                    <td className="max-w-[180px] px-4 py-3 text-xs text-[var(--panel-muted)]">
                      {order.content || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{courierName}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {PAYMENT_LABEL[order.payment_method] ??
                        order.payment_method}
                    </td>
                    <td className="px-4 py-3 font-semibold whitespace-nowrap">
                      {formatMoney(order.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
                          statusBadgeClass(order.status)
                        )}
                      >
                        {STATUS_LABEL[order.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          printOrderSlip(order, restaurant, courierName)
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-2.5 py-1.5 text-xs font-medium text-[var(--panel-muted)] transition hover:bg-white/5 hover:text-[var(--panel-ink)]"
                        title="Fiş Yazdır"
                      >
                        <Printer className="size-3.5" />
                        Fiş
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
