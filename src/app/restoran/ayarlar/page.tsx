"use client";

import { FormEvent, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  RESTAURANT_SESSION_KEY,
  type RestaurantSession,
} from "@/services/authService";
import { resizeImageToDataUrl } from "@/utils/imageResize";
import { useRestoran } from "../RestoranProvider";
import { cn } from "@/lib/utils";
import type { Restaurant } from "@/types";

const COLOR_PRESETS = [
  {
    id: "donerci",
    label: "Dönerci Kırmızı-Sarı",
    primary: "#ef4444",
    secondary: "#f59e0b",
  },
  {
    id: "kehribar",
    label: "Kehribar-Zümrüt",
    primary: "#f59e0b",
    secondary: "#10b981",
  },
  {
    id: "mavi",
    label: "Mavi-Turuncu",
    primary: "#3b82f6",
    secondary: "#f97316",
  },
  {
    id: "mor",
    label: "Mor-Altın",
    primary: "#8b5cf6",
    secondary: "#eab308",
  },
] as const;

const DEFAULT_PRIMARY = "#f59e0b";
const DEFAULT_SECONDARY = "#10b981";

export default function AyarlarPage() {
  const { restaurant, session, setRestaurant, refreshRestaurant } =
    useRestoran();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [password, setPassword] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoInputUrl, setLogoInputUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_SECONDARY);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurant) return;
    setName(restaurant.name ?? "");
    setPhone(restaurant.phone ?? "");
    setAddress(restaurant.address ?? "");
    setLatitude(
      restaurant.latitude != null ? String(restaurant.latitude) : ""
    );
    setLongitude(
      restaurant.longitude != null ? String(restaurant.longitude) : ""
    );
    setPassword(restaurant.password ?? "");
    setLogoUrl(restaurant.logo_url ?? "");
    setLogoInputUrl(
      restaurant.logo_url && !restaurant.logo_url.startsWith("data:")
        ? restaurant.logo_url
        : ""
    );
    setPrimaryColor(restaurant.primary_color || DEFAULT_PRIMARY);
    setSecondaryColor(restaurant.secondary_color || DEFAULT_SECONDARY);
  }, [restaurant]);

  async function handleLogoFile(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 250);
      setLogoUrl(dataUrl);
      setLogoInputUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo işlenemedi");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const lat = Number(String(latitude).replace(",", "."));
      const lng = Number(String(longitude).replace(",", "."));
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        throw new Error("Harita koordinatları geçerli sayılar olmalı");
      }
      if (!name.trim() || !password) {
        throw new Error("Restoran adı ve şifre zorunludur");
      }

      const finalLogo =
        logoUrl.trim() ||
        (logoInputUrl.trim() ? logoInputUrl.trim() : null);

      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        latitude: lat,
        longitude: lng,
        password,
        logo_url: finalLogo,
        primary_color: primaryColor || DEFAULT_PRIMARY,
        secondary_color: secondaryColor || DEFAULT_SECONDARY,
      };

      const { data, error: updateError } = await supabase
        .from("restaurants")
        .update(payload)
        .eq("id", session.id)
        .select("*")
        .single();

      if (updateError) throw new Error(updateError.message);

      const saved = data as Restaurant;
      setRestaurant(saved);
      await refreshRestaurant();

      const nextSession: RestaurantSession = {
        id: session.id,
        name: saved.name,
        username: saved.username,
      };
      localStorage.setItem(
        RESTAURANT_SESSION_KEY,
        JSON.stringify(nextSession)
      );

      setMessage("Dükkan ayarları kaydedildi — tema anında uygulandı");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setLoading(false);
    }
  }

  const previewLogo = logoUrl || logoInputUrl || null;

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-2xl tracking-tight sm:text-3xl">
          <Settings className="size-7 shrink-0 text-[var(--brand-primary)]" />
          Dükkan Ayarları
        </h1>
        <p className="mt-1 text-sm text-[var(--panel-muted)]">
          Kurumsal kimlik, tema renkleri, adres ve giriş şifresi
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="max-w-xl space-y-5 rounded-3xl border border-white/8 bg-[#12171e] p-5"
      >
        <section className="space-y-4 rounded-2xl border border-white/8 bg-black/20 p-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg">
            Kurumsal Kimlik & Tema Ayarları
          </h2>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              {previewLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewLogo}
                  alt="Logo önizleme"
                  className="size-full object-contain"
                />
              ) : (
                <span className="font-[family-name:var(--font-display)] text-3xl text-[var(--brand-primary)]">
                  {(name || "R").slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
                  Dosyadan logo seç (max 250×250)
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="block w-full text-sm text-[var(--panel-muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--brand-primary)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#1a1208]"
                  onChange={(e) =>
                    void handleLogoFile(e.target.files?.[0] ?? null)
                  }
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
                  veya Logo URL
                </span>
                <input
                  className="field-input"
                  type="url"
                  placeholder="https://..."
                  value={logoInputUrl}
                  onChange={(e) => {
                    setLogoInputUrl(e.target.value);
                    if (e.target.value.trim()) setLogoUrl(e.target.value.trim());
                  }}
                />
              </label>
              {logoUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    setLogoUrl("");
                    setLogoInputUrl("");
                  }}
                  className="text-xs text-red-300 hover:underline"
                >
                  Logoyu kaldır
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
                1. Ana renk (primary)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="size-11 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                />
                <input
                  className="field-input font-mono text-sm"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                />
              </div>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
                2. Ana renk (secondary)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="size-11 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                />
                <input
                  className="field-input font-mono text-sm"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                />
              </div>
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
              Hazır kombinasyonlar
            </p>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => {
                const active =
                  primaryColor.toLowerCase() === preset.primary.toLowerCase() &&
                  secondaryColor.toLowerCase() ===
                    preset.secondary.toLowerCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setPrimaryColor(preset.primary);
                      setSecondaryColor(preset.secondary);
                    }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition",
                      active
                        ? "border-[var(--brand-primary)] bg-white/10"
                        : "border-white/10 hover:bg-white/5"
                    )}
                  >
                    <span
                      className="size-3 rounded-full"
                      style={{ background: preset.primary }}
                    />
                    <span
                      className="size-3 rounded-full"
                      style={{ background: preset.secondary }}
                    />
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <span
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-[#1a1208]"
              style={{ background: primaryColor }}
            >
              Ana buton önizleme
            </span>
            <span
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-[#04140c]"
              style={{ background: secondaryColor }}
            >
              İkincil rozet önizleme
            </span>
          </div>
        </section>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
            Kullanıcı adı (değiştirilemez)
          </span>
          <input
            className="field-input opacity-70"
            value={restaurant?.username ?? session.username}
            readOnly
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
            Restoran adı
          </span>
          <input
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
            Telefon
          </span>
          <input
            className="field-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
            Adres
          </span>
          <textarea
            className="field-input resize-none"
            rows={3}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
              Harita enlem (latitude)
            </span>
            <input
              className="field-input"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
              Harita boylam (longitude)
            </span>
            <input
              className="field-input"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              required
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-[var(--panel-muted)]">
            Giriş şifresi
          </span>
          <input
            className="field-input"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </label>

        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading || !restaurant}
          className="w-full rounded-2xl bg-[var(--brand-primary)] py-3.5 text-sm font-bold text-[#1a1208] disabled:opacity-60"
        >
          {loading ? "Kaydediliyor…" : "Ayarları Kaydet"}
        </button>
      </form>
    </div>
  );
}
