"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRestoran } from "../RestoranProvider";
import { cn } from "@/lib/utils";
import type { Customer } from "@/types";

type CustomerForm = {
  name: string;
  phone: string;
  address: string;
  address_note: string;
  latitude: string;
  longitude: string;
};

const EMPTY_FORM: CustomerForm = {
  name: "",
  phone: "",
  address: "",
  address_note: "",
  latitude: "",
  longitude: "",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export default function MusterilerimPage() {
  const { session } = useRestoran();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("customers")
      .select("*")
      .eq("restaurant_id", session.id)
      .order("name", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      setCustomers([]);
    } else {
      setCustomers((data ?? []) as Customer[]);
    }
    setLoading(false);
  }, [session.id]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return customers;
    return customers.filter((c) => {
      const hay = [c.name, c.phone, c.address]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr");
      return hay.includes(q);
    });
  }, [customers, query]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setForm({
      name: customer.name,
      phone: customer.phone,
      address: customer.address ?? "",
      address_note: customer.address_note ?? "",
      latitude: customer.latitude != null ? String(customer.latitude) : "",
      longitude: customer.longitude != null ? String(customer.longitude) : "",
    });
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const lat =
        form.latitude.trim() === ""
          ? null
          : Number(form.latitude.replace(",", "."));
      const lng =
        form.longitude.trim() === ""
          ? null
          : Number(form.longitude.replace(",", "."));

      if (lat != null && Number.isNaN(lat)) throw new Error("Geçersiz enlem");
      if (lng != null && Number.isNaN(lng)) throw new Error("Geçersiz boylam");

      const payload = {
        restaurant_id: session.id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        address_note: form.address_note.trim() || null,
        latitude: lat,
        longitude: lng,
      };

      if (!payload.name || !payload.phone) {
        throw new Error("Ad ve telefon zorunludur");
      }

      if (editing) {
        const { error: updateError } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", editing.id)
          .eq("restaurant_id", session.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: insertError } = await supabase
          .from("customers")
          .insert(payload);
        if (insertError) throw new Error(insertError.message);
      }

      await loadCustomers();
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(customer: Customer) {
    if (!window.confirm(`${customer.name} rehberden silinsin mi?`)) return;
    const { error: deleteError } = await supabase
      .from("customers")
      .delete()
      .eq("id", customer.id)
      .eq("restaurant_id", session.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await loadCustomers();
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-2xl tracking-tight sm:text-3xl">
            <Users className="size-7 shrink-0 text-[var(--brand-primary)]" />
            Müşterilerim
          </h1>
          <p className="mt-1 text-sm text-[var(--panel-muted)]">
            Rehber, arama ve kayıtlı GPS konumları
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-2xl bg-[var(--panel-accent)] px-4 py-3 text-sm font-semibold text-[#1a1208]"
        >
          <Plus className="size-4" />
          Müşteri Ekle
        </button>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--panel-muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="İsim, telefon veya adres ara…"
          className="field-input pl-10"
        />
      </div>

      {error && !modalOpen ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--panel-muted)]">Yükleniyor…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-[var(--panel-muted)] sm:col-span-2 xl:col-span-3">
              Müşteri bulunamadı
            </p>
          ) : (
            filtered.map((c) => {
              const hasGps = c.latitude != null && c.longitude != null;
              return (
                <article
                  key={c.id}
                  className="rounded-3xl border border-white/8 bg-[#12171e] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{c.name}</h2>
                      <p className="text-sm text-[var(--panel-muted)]">
                        {c.phone}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase",
                        hasGps
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-white/5 text-[var(--panel-muted)]"
                      )}
                    >
                      <MapPin className="size-3" />
                      {hasGps ? "GPS" : "GPS yok"}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm">
                    {c.address || "Adres yok"}
                  </p>
                  <p className="mt-2 text-[11px] text-[var(--panel-muted)]">
                    Son sipariş: {formatDate(c.last_order_date)}
                  </p>
                  <div className="mt-3 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs hover:bg-white/5"
                    >
                      <Pencil className="size-3.5" />
                      Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="size-3.5" />
                      Sil
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Kapat"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#141a22] sm:rounded-3xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-white/8 bg-[#141a22] px-5 py-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl">
                {editing ? "Müşteri Düzenle" : "Yeni Müşteri"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-white/10 p-2 text-[var(--panel-muted)]"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3 p-5">
              {(
                [
                  ["name", "Ad Soyad"],
                  ["phone", "Telefon"],
                  ["address", "Adres"],
                  ["address_note", "Adres notu"],
                  ["latitude", "Enlem (latitude)"],
                  ["longitude", "Boylam (longitude)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block space-y-1.5">
                  <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
                    {label}
                  </span>
                  {key === "address" || key === "address_note" ? (
                    <textarea
                      className="field-input resize-none"
                      rows={2}
                      value={form[key]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                      required={key === "address" ? false : false}
                    />
                  ) : (
                    <input
                      className="field-input"
                      value={form[key]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, [key]: e.target.value }))
                      }
                      required={key === "name" || key === "phone"}
                    />
                  )}
                </label>
              ))}
              {error ? (
                <p className="text-sm text-red-300">{error}</p>
              ) : null}
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-2xl bg-[var(--panel-accent)] py-3 text-sm font-bold text-[#1a1208] disabled:opacity-60"
              >
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
