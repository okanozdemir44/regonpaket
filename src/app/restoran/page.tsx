"use client";

import { useMemo, useState } from "react";
import { Package, Plus } from "lucide-react";
import {
  assignCourier,
  updateOrderStatus,
} from "@/services/orderService";
import { getBusinessDayRange } from "@/utils/calculations";
import { cn } from "@/lib/utils";
import { useRestoran } from "./RestoranProvider";
import { LiveCourierMap } from "./components/LiveCourierMap";
import { NewOrderModal } from "./components/NewOrderModal";
import { OrderCard } from "./components/OrderCard";

type BoardTab = "waiting" | "active" | "delivered";

export default function CanliOperasyonPage() {
  const { orders, couriers, restaurant, session, error } = useRestoran();
  const [modalOpen, setModalOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [boardTab, setBoardTab] = useState<BoardTab>("waiting");

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

  const tabs: { id: BoardTab; title: string; count: number }[] = [
    { id: "waiting", title: "Bekleyen", count: waitingOrders.length },
    { id: "active", title: "Yolda", count: activeOrders.length },
    { id: "delivered", title: "Teslim", count: deliveredToday.length },
  ];

  return (
    <div className="space-y-4 p-3 pb-24 sm:space-y-5 sm:p-6 lg:p-8 lg:pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 font-[family-name:var(--font-display)] text-xl tracking-tight sm:gap-3 sm:text-2xl lg:text-3xl">
            <Package className="size-6 shrink-0 text-[var(--brand-primary)] sm:size-7" />
            <span className="truncate">Canlı Operasyon</span>
          </h1>
          <p className="mt-1 text-xs text-[var(--panel-muted)] sm:text-sm">
            Paket girişi, kurye atama ve anlık takip
            {restaurant ? ` — ${restaurant.name}` : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="hidden items-center justify-center gap-2 rounded-2xl bg-[var(--brand-primary)] px-5 py-3.5 text-sm font-semibold text-[#1a1208] shadow-lg shadow-[var(--brand-primary)]/25 transition hover:brightness-110 sm:inline-flex"
        >
          <Plus className="size-5" />
          Yeni Paket Girişi
        </button>
      </header>

      {(error || actionError) && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200 sm:px-4 sm:py-3">
          {actionError || error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <SummaryCard label="Bekleyen" value={waitingOrders.length} />
        <SummaryCard label="Yolda" value={activeOrders.length} />
        <SummaryCard label="Bugün teslim" value={deliveredToday.length} />
        <SummaryCard label="Aktif kurye" value={activeCourierCount} />
      </div>

      <LiveCourierMap
        restaurantId={session.id}
        restaurant={restaurant}
        couriers={couriers}
        orders={orders}
      />

      {/* Mobil: tek kolon sekmeli pano */}
      <div className="xl:hidden">
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl border border-white/8 bg-[#10151c] p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setBoardTab(t.id)}
              className={cn(
                "rounded-xl px-2 py-2.5 text-center text-xs font-semibold transition sm:text-sm",
                boardTab === t.id
                  ? "bg-[var(--brand-primary)] text-[#1a1208]"
                  : "text-[var(--panel-muted)]"
              )}
            >
              {t.title}
              <span className="ml-1 tabular-nums opacity-80">({t.count})</span>
            </button>
          ))}
        </div>

        <section className="flex min-h-[280px] flex-col rounded-3xl border border-white/8 bg-[#10151c]/80">
          <div className="flex flex-1 flex-col gap-3 p-3">
            {boardTab === "waiting" ? (
              waitingOrders.length === 0 ? (
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
              )
            ) : null}

            {boardTab === "active" ? (
              activeOrders.length === 0 ? (
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
                    onTransfer={(courierId) =>
                      handleAssign(order.id, courierId)
                    }
                  />
                ))
              )
            ) : null}

            {boardTab === "delivered" ? (
              deliveredToday.length === 0 ? (
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
              )
            ) : null}
          </div>
        </section>
      </div>

      {/* Masaüstü: 3 kolon */}
      <div className="hidden gap-4 xl:grid xl:grid-cols-3">
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

      {/* Mobil FAB */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-[25] flex size-14 items-center justify-center rounded-full bg-[var(--brand-primary)] text-[#1a1208] shadow-xl shadow-black/40 transition hover:brightness-110 active:scale-95 sm:hidden"
        aria-label="Yeni Paket Girişi"
      >
        <Plus className="size-7" strokeWidth={2.5} />
      </button>

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
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 sm:px-4 sm:py-4">
      <p className="text-[10px] uppercase tracking-wider text-[var(--panel-muted)] sm:text-xs">
        {label}
      </p>
      <p className="mt-0.5 font-[family-name:var(--font-display)] text-2xl tabular-nums sm:mt-1 sm:text-3xl">
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
