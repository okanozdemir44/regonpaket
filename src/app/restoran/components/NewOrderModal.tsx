"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createOrder } from "@/services/orderService";
import { cn } from "@/lib/utils";
import type { Courier, Customer, OrderPlatform, PaymentMethod } from "@/types";

type NewOrderModalProps = {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  couriers: Courier[];
};

const PLATFORMS: { value: OrderPlatform; label: string }[] = [
  { value: "telefon", label: "Telefon" },
  { value: "yemeksepeti", label: "Yemeksepeti" },
  { value: "getir", label: "Getir" },
  { value: "trendyol", label: "Trendyol" },
];

const PAYMENTS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Nakit" },
  { value: "card", label: "POS/Kart" },
  { value: "iban", label: "IBAN" },
  { value: "online", label: "Online Ödendi" },
];

function courierBusyLabel(status: Courier["status"]): string {
  if (status === "idle") return "Boşta";
  if (status === "assigned") return "Atandı";
  if (status === "picking_up") return "Alıyor";
  return "Yolda";
}

function courierPrefix(status: Courier["status"]): string {
  return status === "idle" ? "⚡" : "🛵";
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function NewOrderModal({
  open,
  onClose,
  restaurantId,
  couriers,
}: NewOrderModalProps) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [addressNote, setAddressNote] = useState("");
  const [content, setContent] = useState("");
  const [amount, setAmount] = useState("0");
  const [platform, setPlatform] = useState<OrderPlatform>("telefon");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [selectedCourierId, setSelectedCourierId] = useState<string | null>(
    null
  );
  const [customerHint, setCustomerHint] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipSuggestRef = useRef(false);
  const phoneWrapRef = useRef<HTMLDivElement | null>(null);

  const activeCouriers = useMemo(
    () => couriers.filter((c) => c.is_active),
    [couriers]
  );

  const amountLocked = paymentMethod === "online";

  function applyCustomer(customer: Customer) {
    skipSuggestRef.current = true;
    setPhone(customer.phone ?? "");
    setName(customer.name ?? "");
    setAddress(customer.address ?? "");
    setLatitude(customer.latitude ?? null);
    setLongitude(customer.longitude ?? null);
    setAddressNote(customer.address_note ?? "");
    setSuggestions([]);
    setSuggestOpen(false);
    setCustomerHint("Kayıtlı müşteri seçildi — bilgiler dolduruldu");
  }

  useEffect(() => {
    if (!open) return;
    setPhone("");
    setName("");
    setAddress("");
    setLatitude(null);
    setLongitude(null);
    setAddressNote("");
    setContent("");
    setAmount("0");
    setPlatform("telefon");
    setPaymentMethod("cash");
    setSelectedCourierId(null);
    setCustomerHint(null);
    setSuggestions([]);
    setSuggestOpen(false);
    setError(null);
    skipSuggestRef.current = false;
  }, [open]);

  useEffect(() => {
    if (paymentMethod === "online") {
      setAmount("0");
    }
  }, [paymentMethod]);

  // Telefon autocomplete (4+ rakam)
  useEffect(() => {
    if (!open) return;

    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      return;
    }

    const q = phone.trim();
    const qDigits = digitsOnly(q);
    if (qDigits.length < 4) {
      setSuggestions([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      setCustomerHint(null);
      return;
    }

    let cancelled = false;
    setSuggestLoading(true);
    const timer = window.setTimeout(async () => {
      // Hem rakam hem ham metin ile ara; boşluklu numaralar istemci filtrede yakalanır
      const safeDigits = qDigits.replace(/[%_]/g, "");
      const { data, error: lookupError } = await supabase
        .from("customers")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .ilike("phone", `%${safeDigits}%`)
        .order("name", { ascending: true })
        .limit(20);

      if (cancelled) return;

      let rows = (data ?? []) as Customer[];

      // ilike boşluk yüzünden kaçırdıysa son kayıtları çekip rakamla filtrele
      if (rows.length === 0 && safeDigits.length >= 4) {
        const { data: fallback } = await supabase
          .from("customers")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("last_order_date", { ascending: false })
          .limit(80);
        rows = (fallback ?? []) as Customer[];
      }

      if (cancelled) return;
      setSuggestLoading(false);

      if (lookupError && rows.length === 0) {
        setSuggestions([]);
        setSuggestOpen(false);
        return;
      }

      const filtered = rows
        .filter((c) => digitsOnly(c.phone || "").includes(safeDigits))
        .slice(0, 8);

      setSuggestions(filtered);
      setSuggestOpen(filtered.length > 0);

      if (filtered.length === 0 && qDigits.length >= 10) {
        setCustomerHint("Yeni müşteri — bilgileri girin");
      } else if (filtered.length > 0) {
        setCustomerHint(`${filtered.length} kayıtlı müşteri önerisi`);
      } else {
        setCustomerHint(null);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phone, restaurantId, open]);

  // Dışarı tıklanınca öneriyi kapat
  useEffect(() => {
    if (!suggestOpen) return;
    function onDoc(e: MouseEvent) {
      if (!phoneWrapRef.current?.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [suggestOpen]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const parsedAmount =
        paymentMethod === "online" ? 0 : Number(amount.replace(",", "."));

      if (!name.trim() || !phone.trim() || !address.trim()) {
        throw new Error("Telefon, ad ve adres zorunludur");
      }
      if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
        throw new Error("Geçerli bir tutar girin");
      }

      await createOrder({
        restaurant_id: restaurantId,
        customer_name: name,
        customer_phone: phone,
        delivery_address: address,
        latitude,
        longitude,
        content: content || null,
        amount: parsedAmount,
        payment_method: paymentMethod,
        platform,
        address_note: addressNote || null,
        courier_id: selectedCourierId,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sipariş oluşturulamadı");
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

      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#141a22] shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl">
              + Yeni Paket Girişi
            </h2>
            <p className="text-xs text-[var(--panel-muted)]">
              Müşteri, tutar ve isteğe bağlı tek adımda kurye atama
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 p-2 text-[var(--panel-muted)] hover:bg-white/5 hover:text-[var(--panel-ink)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            <div ref={phoneWrapRef} className="relative block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
                Müşteri telefonu
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onFocus={() => {
                  if (suggestions.length > 0) setSuggestOpen(true);
                }}
                required
                inputMode="tel"
                autoComplete="off"
                placeholder="05xx xxx xx xx — yazdıkça kayıtlı müşteri önerilir"
                className="field-input"
                aria-autocomplete="list"
                aria-expanded={suggestOpen}
              />
              {suggestOpen && suggestions.length > 0 ? (
                <ul
                  className="absolute left-0 right-0 top-[calc(100%-0.15rem)] z-20 max-h-56 overflow-y-auto rounded-2xl border border-white/12 bg-[#1a212b] py-1 shadow-2xl shadow-black/50"
                  role="listbox"
                >
                  {suggestions.map((c) => (
                    <li key={c.id} role="option">
                      <button
                        type="button"
                        className="flex w-full flex-col gap-0.5 px-3.5 py-2.5 text-left transition hover:bg-[var(--brand-primary)]/15"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyCustomer(c)}
                      >
                        <span className="text-sm font-semibold text-[var(--panel-ink)]">
                          {c.name || "İsimsiz"}
                          <span className="font-normal text-[var(--panel-muted)]">
                            {" "}
                            — {c.phone}
                          </span>
                        </span>
                        {c.address ? (
                          <span className="line-clamp-1 text-[11px] text-[var(--panel-muted)]">
                            {c.address}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {suggestLoading ? (
                <span className="text-xs text-[var(--panel-muted)]">
                  Müşteriler aranıyor…
                </span>
              ) : customerHint ? (
                <span className="text-xs text-[var(--panel-accent)]">
                  {customerHint}
                </span>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
                  Müşteri adı
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="field-input"
                />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
                  GPS
                </span>
                <input
                  readOnly
                  value={
                    latitude != null && longitude != null
                      ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                      : "Kayıtlı konum yok"
                  }
                  className="field-input opacity-80"
                />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
                  Adres
                </span>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                  rows={2}
                  className="field-input resize-none"
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
                Sipariş içeriği / notu
              </span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={2}
                className="field-input resize-none"
                placeholder="2 menü, ekstra sos..."
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
                  Tutar (₺)
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={amountLocked}
                  className={cn("field-input", amountLocked && "opacity-60")}
                />
                {amountLocked ? (
                  <span className="text-xs text-[var(--panel-muted)]">
                    Online ödendi — tahsilat 0 ₺ kilitli
                  </span>
                ) : null}
              </label>

              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
                  Platform
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPlatform(p.value)}
                      className={cn(
                        "rounded-xl border px-2 py-2 text-xs transition",
                        platform === p.value
                          ? "border-[var(--panel-accent)] bg-[var(--panel-accent)]/15 text-[var(--panel-accent)]"
                          : "border-white/10 text-[var(--panel-muted)] hover:bg-white/5"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
                Ödeme yöntemi
              </span>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {PAYMENTS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPaymentMethod(p.value)}
                    className={cn(
                      "rounded-xl border px-2 py-2.5 text-xs transition",
                      paymentMethod === p.value
                        ? "border-[var(--panel-accent)] bg-[var(--panel-accent)] text-[#1a1208]"
                        : "border-white/10 text-[var(--panel-muted)] hover:bg-white/5"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-white/8 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--panel-muted)]">
                  Tek adımda kurye atama
                </p>
                {selectedCourierId ? (
                  <button
                    type="button"
                    onClick={() => setSelectedCourierId(null)}
                    className="text-xs text-[var(--panel-accent)] hover:underline"
                  >
                    Seçimi kaldır (beklemeye düş)
                  </button>
                ) : (
                  <span className="text-xs text-[var(--panel-muted)]">
                    Seçilmezse waiting
                  </span>
                )}
              </div>

              {activeCouriers.length === 0 ? (
                <p className="text-sm text-[var(--panel-muted)]">
                  Vardiyada aktif kurye yok. Paket bekleyenlere düşecek.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {activeCouriers.map((c) => {
                    const selected = selectedCourierId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setSelectedCourierId(selected ? null : c.id)
                        }
                        className={cn(
                          "rounded-xl border px-3 py-2 text-left text-sm transition",
                          selected
                            ? "border-[var(--panel-accent)] bg-[var(--panel-accent)] text-[#1a1208]"
                            : "border-white/10 bg-white/[0.03] text-[var(--panel-ink)] hover:bg-white/5"
                        )}
                      >
                        {courierPrefix(c.status)} {c.full_name} (
                        {courierBusyLabel(c.status)}
                        {c.status !== "idle" ? " · yine atanabilir" : ""})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {error ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            ) : null}
          </div>

          <div className="border-t border-white/8 p-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[var(--panel-accent)] px-4 py-3.5 text-sm font-semibold text-[#1a1208] transition hover:brightness-110 disabled:opacity-60"
            >
              {loading
                ? "Kaydediliyor…"
                : selectedCourierId
                  ? "Paketi Oluştur ve Kuryeye Ata"
                  : "Paketi Beklemeye Al"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
