import { supabase } from "@/lib/supabase";
import { notifyCourierNewPackage } from "@/services/pushNotifyService";
import type {
  Order,
  OrderPlatform,
  OrderStatus,
  PaymentMethod,
} from "@/types";

export type CreateOrderInput = {
  restaurant_id: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  latitude?: number | null;
  longitude?: number | null;
  content?: string | null;
  amount: number;
  payment_method: PaymentMethod;
  platform?: OrderPlatform;
  address_note?: string | null;
  /** Verilirse paket doğrudan assigned başlar */
  courier_id?: string | null;
};

export type OrderStatusUpdate =
  | "picking_up"
  | "on_the_way"
  | "delivered"
  | "cancelled";

function assertNoError<T>(
  data: T | null,
  error: { message: string } | null,
  fallback: string
): T {
  if (error) throw new Error(error.message || fallback);
  if (data == null) throw new Error(fallback);
  return data;
}

/**
 * Müşteri yoksa oluşturur / varsa günceller (restaurant_id + phone).
 * Ardından packages kaydı ekler.
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const phone = input.customer_phone.trim();
  const now = new Date().toISOString();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .upsert(
      {
        restaurant_id: input.restaurant_id,
        name: input.customer_name.trim(),
        phone,
        address: input.delivery_address,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        address_note: input.address_note ?? null,
        last_order_date: now,
      },
      { onConflict: "restaurant_id,phone" }
    )
    .select("*")
    .single();

  const savedCustomer = assertNoError(
    customer,
    customerError,
    "Müşteri kaydı oluşturulamadı"
  );

  const assigned = Boolean(input.courier_id);
  const stamp = new Date().toISOString();

  const { data: order, error: orderError } = await supabase
    .from("packages")
    .insert({
      restaurant_id: input.restaurant_id,
      customer_id: savedCustomer.id,
      customer_name: input.customer_name.trim(),
      customer_phone: phone,
      delivery_address: input.delivery_address,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      content: input.content ?? null,
      amount: input.amount,
      payment_method: input.payment_method,
      platform: input.platform ?? "telefon",
      status: assigned ? "assigned" : "waiting",
      courier_id: input.courier_id ?? null,
      assigned_at: assigned ? stamp : null,
    })
    .select("*")
    .single();

  const created = assertNoError(
    order,
    orderError,
    "Sipariş oluşturulamadı"
  ) as Order;

  if (assigned && input.courier_id) {
    const { data: courierRow } = await supabase
      .from("couriers")
      .select("status, fcm_token")
      .eq("id", input.courier_id)
      .maybeSingle();

    const currentStatus = courierRow?.status as string | undefined;
    const nextStatus =
      currentStatus === "on_the_way" || currentStatus === "picking_up"
        ? currentStatus
        : "assigned";

    await supabase
      .from("couriers")
      .update({ status: nextStatus })
      .eq("id", input.courier_id);

    void notifyCourierNewPackage({
      courier_id: input.courier_id,
      fcm_token: (courierRow?.fcm_token as string | null) ?? null,
      title: "Yeni Sipariş Atandı!",
      order_number: created.order_number,
      customer_name: created.customer_name,
      delivery_address: created.delivery_address,
    });
  }

  return created;
}

/** Siparişe kurye atar; status = assigned, assigned_at mühürlenir.
 * Devretmede eski kuryeye de push gider.
 */
export async function assignCourier(
  orderId: number | string,
  courierId: string
): Promise<Order> {
  const now = new Date().toISOString();

  const { data: before, error: beforeError } = await supabase
    .from("packages")
    .select("id, courier_id, order_number, customer_name, delivery_address")
    .eq("id", orderId)
    .maybeSingle();

  if (beforeError) throw new Error(beforeError.message || "Paket okunamadı");

  const previousCourierId =
    before?.courier_id && before.courier_id !== courierId
      ? (before.courier_id as string)
      : null;

  const { data, error } = await supabase
    .from("packages")
    .update({
      courier_id: courierId,
      status: "assigned" satisfies OrderStatus,
      assigned_at: now,
    })
    .eq("id", orderId)
    .select("*")
    .single();

  const order = assertNoError(data, error, "Kurye atanamadı") as Order;

  // Çoklu paket: kurye zaten yoldaysa status'u düşürme + FCM token
  const { data: courierRow } = await supabase
    .from("couriers")
    .select("status, fcm_token")
    .eq("id", courierId)
    .maybeSingle();

  const currentStatus = courierRow?.status as string | undefined;
  const nextStatus =
    currentStatus === "on_the_way" || currentStatus === "picking_up"
      ? currentStatus
      : "assigned";

  await supabase
    .from("couriers")
    .update({ status: nextStatus })
    .eq("id", courierId);

  const orderNo = order.order_number || String(order.id);
  const customer = order.customer_name || "Müşteri";

  // Devretme: önceki kuryeye bildir
  if (previousCourierId) {
    void notifyCourierNewPackage({
      courier_id: previousCourierId,
      title: "Paket Üzerinizden Alındı",
      body: `#${orderNo} · ${customer} — paket başka bir kuryeye devredildi`,
      order_number: order.order_number,
      customer_name: order.customer_name,
      delivery_address: order.delivery_address,
    });

    void notifyCourierNewPackage({
      courier_id: courierId,
      fcm_token: (courierRow?.fcm_token as string | null) ?? null,
      title: "Paket Size Devredildi!",
      body: `#${orderNo} · ${customer} — üzerinize yeni paket aktarıldı`,
      order_number: order.order_number,
      customer_name: order.customer_name,
      delivery_address: order.delivery_address,
    });
  } else {
    void notifyCourierNewPackage({
      courier_id: courierId,
      fcm_token: (courierRow?.fcm_token as string | null) ?? null,
      title: "Yeni Sipariş Atandı!",
      order_number: order.order_number,
      customer_name: order.customer_name,
      delivery_address: order.delivery_address,
    });
  }

  return order;
}

/** Sipariş durumunu günceller ve ilgili zaman damgasını yazar. */
export async function updateOrderStatus(
  orderId: number | string,
  status: OrderStatusUpdate
): Promise<Order> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };

  switch (status) {
    case "picking_up":
      patch.picked_up_at = now;
      break;
    case "on_the_way":
      break;
    case "delivered":
      patch.delivered_at = now;
      break;
    case "cancelled":
      patch.cancelled_at = now;
      break;
  }

  const { data, error } = await supabase
    .from("packages")
    .update(patch)
    .eq("id", orderId)
    .select("*")
    .single();

  return assertNoError(data, error, "Sipariş durumu güncellenemedi") as Order;
}

/**
 * Kurye teslimatı.
 * - Sipariş online ise ödeme yöntemi değiştirilmez.
 * - Değilse kapıda seçilen yöntem (cash/card/iban) yazılır.
 */
export async function deliverOrder(
  orderId: number | string,
  courierId: string,
  actualPaymentMethod: PaymentMethod
): Promise<Order> {
  const { data: existing, error: fetchError } = await supabase
    .from("packages")
    .select("*")
    .eq("id", orderId)
    .single();

  const current = assertNoError(
    existing,
    fetchError,
    "Sipariş bulunamadı"
  ) as Order;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: "delivered" satisfies OrderStatus,
    delivered_at: now,
    delivered_by_courier_id: courierId,
  };

  if (current.payment_method !== "online") {
    if (actualPaymentMethod === "online") {
      throw new Error(
        "Kapıda teslimatta ödeme yöntemi online olarak değiştirilemez"
      );
    }
    patch.payment_method = actualPaymentMethod;
  }

  const { data, error } = await supabase
    .from("packages")
    .update(patch)
    .eq("id", orderId)
    .select("*")
    .single();

  const order = assertNoError(data, error, "Teslimat kaydedilemedi") as Order;

  // Üzerinde başka aktif paket varsa idle yapma (çoklu teslimat)
  const { count } = await supabase
    .from("packages")
    .select("id", { count: "exact", head: true })
    .eq("courier_id", courierId)
    .in("status", ["assigned", "picking_up", "on_the_way"]);

  if (!count || count === 0) {
    await supabase
      .from("couriers")
      .update({ status: "idle" })
      .eq("id", courierId);
  }

  return order;
}
