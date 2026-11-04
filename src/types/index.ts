export interface Restaurant {
  id: string;
  name: string;
  username: string;
  password: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  /** Logo URL veya Base64 data URL */
  logo_url: string | null;
  /** Vurgu / aktif menü / ana butonlar */
  primary_color: string;
  /** İkincil butonlar, rozetler, yan vurgular */
  secondary_color: string;
  created_at: string;
}

export interface CourierLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  updated_at: string;
}

export type CourierStatus = "idle" | "assigned" | "picking_up" | "on_the_way";

export interface Courier {
  id: string;
  restaurant_id: string;
  username: string;
  password: string;
  full_name: string;
  phone: string;
  /** Vardiyada mı */
  is_active: boolean;
  status: CourierStatus;
  package_rate: number;
  last_location: CourierLocation | null;
  /** Capacitor Push / FCM cihaz tokeni */
  fcm_token: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  address_note: string | null;
  last_order_date: string | null;
}

export type PaymentMethod = "cash" | "card" | "iban" | "online";

export type OrderPlatform =
  | "telefon"
  | "yemeksepeti"
  | "getir"
  | "trendyol"
  | "migros";

export type OrderStatus =
  | "waiting"
  | "assigned"
  | "picking_up"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export interface Order {
  /** packages.id — bigint identity */
  id: number;
  order_number: string;
  restaurant_id: string;
  courier_id: string | null;
  delivered_by_courier_id: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  latitude: number | null;
  longitude: number | null;
  content: string | null;
  /** Tahsil edilecek tutar */
  amount: number;
  payment_method: PaymentMethod;
  platform: OrderPlatform;
  status: OrderStatus;
  is_courier_settled: boolean;
  courier_settled_at: string | null;
  courier_settlement_id: string | null;
  created_at: string;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
}

export interface CourierSettlement {
  id: string;
  restaurant_id: string;
  courier_id: string;
  start_date: string;
  end_date: string;
  total_cash: number;
  total_card: number;
  total_iban: number;
  online_count: number;
  package_count: number;
  total_earned: number;
  expected_total: number;
  received_amount: number;
  remaining_debt: number;
  notes: string | null;
  created_at: string;
}
