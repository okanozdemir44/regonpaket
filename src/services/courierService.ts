import { supabase } from "@/lib/supabase";
import type { Courier, CourierLocation, CourierSettlement } from "@/types";

export type CloseCourierDaySettlementInput = {
  restaurantId: string;
  courierId: string;
  packageIds: Array<number | string>;
  totalCash: number;
  totalCard: number;
  totalIban: number;
  onlineCount: number;
  packageCount: number;
  totalEarned: number;
  receivedAmount: number;
  notes?: string | null;
};

function assertNoError<T>(
  data: T | null,
  error: { message: string } | null,
  fallback: string
): T {
  if (error) throw new Error(error.message || fallback);
  if (data == null) throw new Error(fallback);
  return data;
}

export async function getCourierById(courierId: string): Promise<Courier> {
  const { data, error } = await supabase
    .from("couriers")
    .select("*")
    .eq("id", courierId)
    .single();

  return assertNoError(data, error, "Kurye bulunamadı") as Courier;
}

export async function getRestaurantCouriers(
  restaurantId: string
): Promise<Courier[]> {
  const { data, error } = await supabase
    .from("couriers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message || "Kuryeler alınamadı");
  return (data ?? []) as Courier[];
}

/** Vardiya aç/kapa (is_active). */
export async function setCourierActive(
  courierId: string,
  isActive: boolean
): Promise<Courier> {
  const { data, error } = await supabase
    .from("couriers")
    .update({
      is_active: isActive,
      ...(isActive ? { status: "idle" as const } : {}),
    })
    .eq("id", courierId)
    .select("*")
    .single();

  return assertNoError(data, error, "Kurye vardiya durumu güncellenemedi") as Courier;
}

export async function updateCourierLocation(
  courierId: string,
  location: Omit<CourierLocation, "updated_at"> & { updated_at?: string }
): Promise<Courier> {
  const last_location: CourierLocation = {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy ?? null,
    heading: location.heading ?? null,
    speed: location.speed ?? null,
    updated_at: location.updated_at ?? new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("couriers")
    .update({ last_location })
    .eq("id", courierId)
    .select("*")
    .single();

  return assertNoError(data, error, "Kurye konumu güncellenemedi") as Courier;
}

/**
 * Atomik gün sonu kasa kapatma — `close_courier_day_settlement` RPC.
 * Fiş kaydı + paketlerin is_courier_settled mühürlenmesi tek transaction'da yapılır.
 */
export async function closeCourierDaySettlement(
  input: CloseCourierDaySettlementInput
): Promise<string> {
  const packageIds = input.packageIds.map((id) => Number(id));

  const { data, error } = await supabase.rpc("close_courier_day_settlement", {
    p_restaurant_id: input.restaurantId,
    p_courier_id: input.courierId,
    p_package_ids: packageIds,
    p_total_cash: input.totalCash,
    p_total_card: input.totalCard,
    p_total_iban: input.totalIban,
    p_online_count: input.onlineCount,
    p_package_count: input.packageCount,
    p_total_earned: input.totalEarned,
    p_received_amount: input.receivedAmount,
    p_notes: input.notes ?? null,
  });

  if (error) {
    throw new Error(error.message || "Gün sonu kasa kapatılamadı");
  }

  if (data == null || data === "") {
    throw new Error("Gün sonu kasa kapatılamadı: fiş id dönmedi");
  }

  return String(data);
}

export async function getCourierSettlements(
  restaurantId: string,
  courierId?: string
): Promise<CourierSettlement[]> {
  let query = supabase
    .from("courier_settlements")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  if (courierId) {
    query = query.eq("courier_id", courierId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || "Kasa fişleri alınamadı");
  return (data ?? []) as CourierSettlement[];
}
