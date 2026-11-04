"use client";

import { useMemo, useState } from "react";
import { Package, Plus } from "lucide-react";
import {
  assignCourier,
  updateOrderStatus,
} from "@/services/orderService";
import { getBusinessDayRange } from "@/utils/calculations";
import { useRestoran } from "./RestoranProvider";
import { LiveCourierMap } from "./components/LiveCourierMap";
import { NewOrderModal } from "./components/NewOrderModal";
import { OrderCard } from "./components/OrderCard";

export default function CanliOperasyonPage() {
  const { orders, couriers, restaurant, session, error } = useRestoran();
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const waitingOrders = useMemo(
    () => orders.filter((o) => o.status === "waiting"),
    [orders]
  );

  const activeOrders = useMemo(
    () =>
      orders.filter((o) =>
        ["assigned", "picking_up", "on_the_way"].includes(o.status)
      ),
    [orders]
  );

  const deliveredToday = useMemo(() => {
    const { start, end } = getBusinessDayRange(new Date());
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    return orders.filter((o) => {
      if (o.status !== "delivered" || !o.delivered_at) return false;
      const t = new Date(o.delivered_at).getTime();
      return t >= startMs && t <= endMs;
    });
  }, [orders]);

  const activeCourierCount = couriers.filter((c) => c.is_active).length;

  async function handleAssign(orderId: number, courierId: string) {
    setActionError(null);
    setBusyId(orderId);
    try {
      await assignCourier(orderId, courierId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Atama başarısız");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(orderId: number) {
    if (!window.confirm("Bu paketi iptal etmek istiyor musunuz?")) return;
    setActionError(null);
    setBusyId(orderId);
    try {
      await updateOrderStatus(orderId, "cancelled");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "İptal başarısız");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-2xl tracking-tight sm:text-3xl">
            <Package className="size-7 shrink-0 text-[var(--brand-primary)]" />
            Canlı Operasyon
          </h1>
          <p className="mt-1 text-sm text-[var(--panel-muted)]">
            Paket girişi, kurye atama ve anlık takip
            {restaurant ? ` — ${restaurant.name}` : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--brand-primary)] px-5 py-3.5 text-sm font-semibold text-[#1a1208] shadow-lg shadow-[var(--brand-primary)]/25 transition hover:brightness-110"
        >
          <Plus className="size-5" />
          Yeni Paket Girişi
        </button>
      </header>

      {(error || actionError) && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {actionError || error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Bekleyen Paketler" value={waitingOrders.length} />
        <SummaryCard label="Yoldaki Paketler" value={activeOrders.length} />
        <SummaryCard
          label="Bugün Teslim Edilen"
          value={deliveredToday.length}
        />
        <SummaryCard label="Aktif Kuryeler" value={activeCourierCount} />
      </div>

      <LiveCourierMap
        restaurantId={session.id}
        restaurant={restaurant}
        couriers={couriers}
        orders={orders}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <BoardColumn
          title="Kurye Bekleyenler"
          count={waitingOrders.length}
          accent="amber"
        >
          {waitingOrders.length === 0 ? (
            <EmptyState text="Bekleyen paket yok" />
          ) : (
            waitingOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                couriers={couriers}
                restaurant={restaurant}
                variant="waiting"
                busy={busyId === order.id}
                onAssign={(courierId) => handleAssign(order.id, courierId)}
              />
            ))
          )}
        </BoardColumn>

        <BoardColumn
          title="Kuryede / Yolda"
          count={activeOrders.length}
          accent="sky"
        >
          {activeOrders.length === 0 ? (
            <EmptyState text="Yolda paket yok" />
          ) : (
            activeOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                couriers={couriers}
                restaurant={restaurant}
                variant="active"
                busy={busyId === order.id}
                onCancel={() => handleCancel(order.id)}
                onTransfer={(courierId) => handleAssign(order.id, courierId)}
              />
            ))
          )}
        </BoardColumn>

        <BoardColumn
          title="Son Teslim Edilenler"
          count={deliveredToday.length}
          accent="emerald"
        >
          {deliveredToday.length === 0 ? (
            <EmptyState text="Bugün henüz teslim yok" />
          ) : (
            deliveredToday.slice(0, 30).map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                couriers={couriers}
                restaurant={restaurant}
                variant="delivered"
              />
            ))
          )}
        </BoardColumn>
      </div>

      <NewOrderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        restaurantId={session.id}
        couriers={couriers}
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
      <p className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
        {label}
      </p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-3xl tabular-nums">
        {value}
      </p>
    </div>
  );
}

function BoardColumn({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent: "amber" | "sky" | "emerald";
  children: React.ReactNode;
}) {
  const accentClass =
    accent === "amber"
      ? "text-[var(--panel-accent)]"
      : accent === "sky"
        ? "text-sky-300"
        : "text-emerald-300";

  return (
    <section className="flex min-h-[320px] flex-col rounded-3xl border border-white/8 bg-[#10151c]/80">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className={`text-sm font-bold tabular-nums ${accentClass}`}>
          {count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {children}
      </div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-[var(--panel-muted)]">
      {text}
    </div>
  );
}
