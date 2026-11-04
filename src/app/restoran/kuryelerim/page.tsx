"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bike, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRestoran } from "../RestoranProvider";
import { getBusinessDayRange } from "@/utils/calculations";
import { cn } from "@/lib/utils";
import type { Courier } from "@/types";

type CourierForm = {
  full_name: string;
  username: string;
  password: string;
  phone: string;
  package_rate: string;
};

const EMPTY_FORM: CourierForm = {
  full_name: "",
  username: "",
  password: "",
  phone: "",
  package_rate: "0",
};

function statusLabel(c: Courier): { text: string; className: string } {
  if (!c.is_active) {
    return { text: "Çevrimdışı", className: "bg-zinc-500/20 text-zinc-300" };
  }
  if (c.status === "idle") {
    return { text: "Boşta", className: "bg-emerald-500/15 text-emerald-300" };
  }
  return { text: "Yolda", className: "bg-sky-500/15 text-sky-300" };
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

export default function KuryelerimPage() {
  const { session, couriers, orders, refreshCouriers } = useRestoran();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Courier | null>(null);
  const [form, setForm] = useState<CourierForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayCounts = useMemo(() => {
    const { start, end } = getBusinessDayRange(new Date());
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const map = new Map<string, number>();

    for (const o of orders) {
      if (o.status !== "delivered" || !o.delivered_at) continue;
      const t = new Date(o.delivered_at).getTime();
      if (t < startMs || t > endMs) continue;
      const owner = o.delivered_by_courier_id || o.courier_id;
      if (!owner) continue;
      map.set(owner, (map.get(owner) ?? 0) + 1);
    }
    return map;
  }, [orders]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(courier: Courier) {
    setEditing(courier);
    setForm({
      full_name: courier.full_name,
      username: courier.username,
      password: courier.password,
      phone: courier.phone ?? "",
      package_rate: String(courier.package_rate ?? 0),
    });
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        restaurant_id: session.id,
        full_name: form.full_name.trim(),
        username: form.username.trim(),
        password: form.password,
        phone: form.phone.trim(),
        package_rate: Number(form.package_rate.replace(",", ".")) || 0,
      };

      if (!payload.full_name || !payload.username || !payload.password) {
        throw new Error("Ad, kullanıcı adı ve şifre zorunludur");
      }

      if (editing) {
        const { error: updateError } = await supabase
          .from("couriers")
          .update(payload)
          .eq("id", editing.id)
          .eq("restaurant_id", session.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: insertError } = await supabase.from("couriers").insert({
          ...payload,
          is_active: false,
          status: "idle",
        });
        if (insertError) throw new Error(insertError.message);
      }

      await refreshCouriers();
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(courier: Courier) {
    if (
      !window.confirm(
        `${courier.full_name} silinsin mi? Bu işlem geri alınamaz.`
      )
    ) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("couriers")
      .delete()
      .eq("id", courier.id)
      .eq("restaurant_id", session.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await refreshCouriers();
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-2xl tracking-tight sm:text-3xl">
            <Bike className="size-7 shrink-0 text-[var(--brand-primary)]" />
            Kuryelerim
          </h1>
          <p className="mt-1 text-sm text-[var(--panel-muted)]">
            Kurye ekleme, şifre/bilgi yönetimi ve anlık durumlar
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-2xl bg-[var(--panel-accent)] px-4 py-3 text-sm font-semibold text-[#1a1208]"
        >
          <Plus className="size-4" />
          Yeni Kurye Ekle
        </button>
      </header>

      {error && !modalOpen ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-white/8">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-[var(--panel-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Ad Soyad</th>
              <th className="px-4 py-3 font-medium">Kullanıcı</th>
              <th className="px-4 py-3 font-medium">Şifre</th>
              <th className="px-4 py-3 font-medium">Telefon</th>
              <th className="px-4 py-3 font-medium">Prim</th>
              <th className="px-4 py-3 font-medium">Durum</th>
              <th className="px-4 py-3 font-medium">Bugün</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {couriers.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-[var(--panel-muted)]"
                >
                  Henüz kurye yok — yeni kurye ekleyin
                </td>
              </tr>
            ) : (
              couriers.map((c) => {
                const st = statusLabel(c);
                return (
                  <tr key={c.id} className="border-t border-white/8">
                    <td className="px-4 py-3 font-medium">{c.full_name}</td>
                    <td className="px-4 py-3 text-[var(--panel-muted)]">
                      {c.username}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{c.password}</td>
                    <td className="px-4 py-3">{c.phone || "—"}</td>
                    <td className="px-4 py-3">
                      {formatMoney(c.package_rate)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-lg px-2 py-1 text-[10px] font-bold uppercase",
                          st.className
                        )}
                      >
                        {st.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {todayCounts.get(c.id) ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="rounded-lg border border-white/10 p-2 text-[var(--panel-muted)] hover:bg-white/5"
                          aria-label="Düzenle"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(c)}
                          className="rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10"
                          aria-label="Sil"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Kapat"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-t-3xl border border-white/10 bg-[#141a22] sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 className="font-[family-name:var(--font-display)] text-xl">
                {editing ? "Kurye Düzenle" : "Yeni Kurye Ekle"}
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
                  ["full_name", "Ad Soyad"],
                  ["username", "Kullanıcı adı"],
                  ["password", "Şifre"],
                  ["phone", "Telefon"],
                  ["package_rate", "Paket başı prim (₺)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block space-y-1.5">
                  <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
                    {label}
                  </span>
                  <input
                    className="field-input"
                    type={key === "package_rate" ? "number" : "text"}
                    step={key === "package_rate" ? "0.01" : undefined}
                    min={key === "package_rate" ? 0 : undefined}
                    value={form[key]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                    required={key !== "phone"}
                  />
                </label>
              ))}
              {error ? (
                <p className="text-sm text-red-300">{error}</p>
              ) : null}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[var(--panel-accent)] py-3 text-sm font-bold text-[#1a1208] disabled:opacity-60"
              >
                {loading ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
