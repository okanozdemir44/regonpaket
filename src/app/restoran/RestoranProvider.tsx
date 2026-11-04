"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  getRestaurantSession,
  logoutRestaurant,
  type RestaurantSession,
} from "@/services/authService";
import type { Courier, Order, Restaurant } from "@/types";

type RestoranContextValue = {
  session: RestaurantSession;
  restaurant: Restaurant | null;
  orders: Order[];
  couriers: Courier[];
  loading: boolean;
  error: string | null;
  refreshOrders: () => Promise<void>;
  refreshCouriers: () => Promise<void>;
  refreshRestaurant: () => Promise<void>;
  setRestaurant: (restaurant: Restaurant) => void;
  logout: () => void;
};

const RestoranContext = createContext<RestoranContextValue | null>(null);

function sortOrders(list: Order[]): Order[] {
  return [...list].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function sortCouriers(list: Courier[]): Courier[] {
  return [...list].sort((a, b) => a.full_name.localeCompare(b.full_name, "tr"));
}

function applyChange<T extends { id: string | number }>(
  list: T[],
  payload: RealtimePostgresChangesPayload<T>,
  sortFn: (items: T[]) => T[]
): T[] {
  const event = payload.eventType;

  if (event === "INSERT") {
    const row = payload.new as T;
    if (row == null || row.id == null) return list;
    if (list.some((item) => item.id === row.id)) {
      return sortFn(list.map((item) => (item.id === row.id ? row : item)));
    }
    return sortFn([row, ...list]);
  }

  if (event === "UPDATE") {
    const row = payload.new as T;
    if (row == null || row.id == null) return list;
    const exists = list.some((item) => item.id === row.id);
    if (!exists) return sortFn([row, ...list]);
    return sortFn(list.map((item) => (item.id === row.id ? row : item)));
  }

  if (event === "DELETE") {
    const row = payload.old as Partial<T>;
    if (row?.id == null) return list;
    return list.filter((item) => item.id !== row.id);
  }

  return list;
}

export function RestoranProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<RestaurantSession | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshRestaurant = useCallback(async (restaurantId: string) => {
    const { data, error: fetchError } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", restaurantId)
      .single();

    if (fetchError) throw new Error(fetchError.message);
    setRestaurant(data as Restaurant);
  }, []);

  const refreshOrders = useCallback(async (restaurantId: string) => {
    const { data, error: fetchError } = await supabase
      .from("packages")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });

    if (fetchError) throw new Error(fetchError.message);
    setOrders(sortOrders((data ?? []) as Order[]));
  }, []);

  const refreshCouriers = useCallback(async (restaurantId: string) => {
    const { data, error: fetchError } = await supabase
      .from("couriers")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("full_name", { ascending: true });

    if (fetchError) throw new Error(fetchError.message);
    setCouriers(sortCouriers((data ?? []) as Courier[]));
  }, []);

  useEffect(() => {
    const current = getRestaurantSession();
    if (!current) {
      router.replace("/login");
      return;
    }
    setSession(current);

    let cancelled = false;

    async function bootstrap(restaurantId: string) {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          refreshRestaurant(restaurantId),
          refreshOrders(restaurantId),
          refreshCouriers(restaurantId),
        ]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Veriler yüklenemedi");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap(current.id);

    const channel = supabase
      .channel(`restoran-live-${current.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "packages",
          filter: `restaurant_id=eq.${current.id}`,
        },
        (payload) => {
          setOrders((prev) =>
            applyChange(
              prev,
              payload as RealtimePostgresChangesPayload<Order>,
              sortOrders
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "couriers",
          filter: `restaurant_id=eq.${current.id}`,
        },
        (payload) => {
          setCouriers((prev) =>
            applyChange(
              prev,
              payload as RealtimePostgresChangesPayload<Courier>,
              sortCouriers
            )
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [router, refreshRestaurant, refreshOrders, refreshCouriers]);

  const logout = useCallback(() => {
    logoutRestaurant();
    router.replace("/login");
  }, [router]);

  const value = useMemo<RestoranContextValue | null>(() => {
    if (!session) return null;
    const restaurantId = session.id;

    return {
      session,
      restaurant,
      orders,
      couriers,
      loading,
      error,
      refreshOrders: () => refreshOrders(restaurantId),
      refreshCouriers: () => refreshCouriers(restaurantId),
      refreshRestaurant: () => refreshRestaurant(restaurantId),
      setRestaurant,
      logout,
    };
  }, [
    session,
    restaurant,
    orders,
    couriers,
    loading,
    error,
    refreshOrders,
    refreshCouriers,
    refreshRestaurant,
    logout,
  ]);

  if (!session || !value) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-[var(--panel-bg)] text-[var(--panel-muted)]">
        Oturum kontrol ediliyor…
      </div>
    );
  }

  return (
    <RestoranContext.Provider value={value}>{children}</RestoranContext.Provider>
  );
}

export function useRestoran(): RestoranContextValue {
  const ctx = useContext(RestoranContext);
  if (!ctx) {
    throw new Error("useRestoran yalnızca RestoranProvider içinde kullanılabilir");
  }
  return ctx;
}
