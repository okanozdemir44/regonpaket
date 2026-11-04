import { supabase } from "@/lib/supabase";

export const RESTAURANT_SESSION_KEY = "regon_restaurant_session";
export const COURIER_SESSION_KEY = "regon_courier_session";

export type RestaurantSession = {
  id: string;
  name: string;
  username: string;
};

export type CourierSession = {
  id: string;
  restaurant_id: string;
  full_name: string;
  username: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readSession<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: unknown): void {
  if (!canUseStorage()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function clearSession(key: string): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(key);
}

export function getRestaurantSession(): RestaurantSession | null {
  return readSession<RestaurantSession>(RESTAURANT_SESSION_KEY);
}

export function getCourierSession(): CourierSession | null {
  return readSession<CourierSession>(COURIER_SESSION_KEY);
}

/** Restoran (kasa) girişi — restaurants tablosu */
export async function loginRestaurant(
  username: string,
  password: string
): Promise<RestaurantSession> {
  const normalized = username.trim();

  let data;
  let error;
  try {
    ({ data, error } = await supabase
      .from("restaurants")
      .select("id, name, username, password")
      .eq("username", normalized)
      .maybeSingle());
  } catch (err) {
    throw new Error(
      err instanceof TypeError
        ? "Supabase'e ulaşılamadı. .env.local URL/anon key ve tabloları kontrol edin."
        : err instanceof Error
          ? err.message
          : "Giriş yapılamadı"
    );
  }

  if (error) {
    throw new Error(
      error.message.includes("Could not find the table")
        ? "restaurants tablosu yok. database/schema.sql dosyasını SQL Editor'de çalıştırın."
        : error.message || "Giriş yapılamadı"
    );
  }
  if (!data || data.password !== password) {
    throw new Error("Kullanıcı adı veya şifre hatalı");
  }

  // Aynı cihazda kurye oturumu kalmasın
  clearSession(COURIER_SESSION_KEY);

  const session: RestaurantSession = {
    id: data.id,
    name: data.name,
    username: data.username,
  };

  writeSession(RESTAURANT_SESSION_KEY, session);
  return session;
}

/** Kurye girişi — couriers tablosu; vardiyayı açar (is_active = true) */
export async function loginCourier(
  username: string,
  password: string
): Promise<CourierSession> {
  const normalized = username.trim();

  const { data, error } = await supabase
    .from("couriers")
    .select("id, restaurant_id, full_name, username, password")
    .eq("username", normalized)
    .maybeSingle();

  if (error) throw new Error(error.message || "Giriş yapılamadı");
  if (!data || data.password !== password) {
    throw new Error("Kullanıcı adı veya şifre hatalı");
  }

  const { error: activeError } = await supabase
    .from("couriers")
    .update({ is_active: true, status: "idle" })
    .eq("id", data.id);

  if (activeError) {
    throw new Error(activeError.message || "Vardiya açılamadı");
  }

  clearSession(RESTAURANT_SESSION_KEY);

  const session: CourierSession = {
    id: data.id,
    restaurant_id: data.restaurant_id,
    full_name: data.full_name,
    username: data.username,
  };

  writeSession(COURIER_SESSION_KEY, session);
  return session;
}

export function logoutRestaurant(): void {
  clearSession(RESTAURANT_SESSION_KEY);
}

/** Kurye çıkışı — oturumu siler ve vardiyayı kapatır */
export async function logoutCourier(): Promise<void> {
  const session = getCourierSession();
  clearSession(COURIER_SESSION_KEY);

  if (session?.id) {
    await supabase
      .from("couriers")
      .update({ is_active: false, status: "idle" })
      .eq("id", session.id);
  }
}
