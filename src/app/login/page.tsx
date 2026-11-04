"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCourierSession,
  getRestaurantSession,
  loginCourier,
  loginRestaurant,
} from "@/services/authService";
import { cn } from "@/lib/utils";

type RoleTab = "restaurant" | "courier";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<RoleTab>("restaurant");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (getRestaurantSession()) {
      router.replace("/restoran");
      return;
    }
    if (getCourierSession()) {
      router.replace("/kurye");
    }
  }, [router]);

  useEffect(() => {
    setUsername("");
    setPassword("");
    setError(null);
  }, [tab]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (tab === "restaurant") {
        await loginRestaurant(username, password);
        router.replace("/restoran");
      } else {
        await loginCourier(username, password);
        router.replace("/kurye");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell relative flex min-h-full flex-1 items-center justify-center overflow-hidden px-4 py-10">
      <div className="login-glow login-glow-a" aria-hidden />
      <div className="login-glow login-glow-b" aria-hidden />
      <div className="login-grid" aria-hidden />

      <div
        className={cn(
          "relative z-10 w-full max-w-[420px] transition-all duration-700 ease-out",
          mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        )}
      >
        <header className="mb-8 text-center">
          <p className="login-brand font-[family-name:var(--font-display)] text-4xl tracking-tight text-[var(--login-ink)] sm:text-5xl">
            Regon Paket
          </p>
          <p className="mt-2 text-sm text-[var(--login-muted)]">
            Restoran kasa ve kurye girişi
          </p>
        </header>

        <section className="login-card overflow-hidden rounded-2xl border border-white/10 bg-[var(--login-card)] shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <div className="grid grid-cols-2 border-b border-white/10 p-1.5">
            <button
              type="button"
              onClick={() => setTab("restaurant")}
              className={cn(
                "rounded-xl px-3 py-3 text-sm font-medium transition-all duration-300",
                tab === "restaurant"
                  ? "bg-[var(--login-accent)] text-[#1a1208] shadow-lg shadow-[var(--login-accent)]/25"
                  : "text-[var(--login-muted)] hover:bg-white/5 hover:text-[var(--login-ink)]"
              )}
            >
              🏪 Restoran Girişi
            </button>
            <button
              type="button"
              onClick={() => setTab("courier")}
              className={cn(
                "rounded-xl px-3 py-3 text-sm font-medium transition-all duration-300",
                tab === "courier"
                  ? "bg-[var(--login-accent)] text-[#1a1208] shadow-lg shadow-[var(--login-accent)]/25"
                  : "text-[var(--login-muted)] hover:bg-white/5 hover:text-[var(--login-ink)]"
              )}
            >
              🛵 Kurye Girişi
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-6 sm:p-7">
            <div
              key={tab}
              className="animate-login-in space-y-4"
            >
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--login-muted)]">
                  Kullanıcı adı
                </span>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="login-input w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-[var(--login-ink)] outline-none transition focus:border-[var(--login-accent)]/60 focus:ring-2 focus:ring-[var(--login-accent)]/20"
                  placeholder={tab === "restaurant" ? "doydoy" : "kurye1"}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--login-muted)]">
                  Şifre
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="login-input w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-[var(--login-ink)] outline-none transition focus:border-[var(--login-accent)]/60 focus:ring-2 focus:ring-[var(--login-accent)]/20"
                  placeholder="••••••"
                />
              </label>
            </div>

            {error ? (
              <p
                role="alert"
                className="animate-login-in rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full overflow-hidden rounded-xl bg-[var(--login-accent)] px-4 py-3.5 text-sm font-semibold text-[#1a1208] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="relative z-10">
                {loading
                  ? "Giriş yapılıyor…"
                  : tab === "restaurant"
                    ? "Kasaya Gir"
                    : "Vardiyaya Başla"}
              </span>
              <span
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition duration-700 group-hover:translate-x-full"
                aria-hidden
              />
            </button>
          </form>
        </section>

        <p className="mt-6 text-center text-xs text-[var(--login-muted)]/80">
          Yalnızca restoran kasa paneli ve kurye mobil ekranı
        </p>
      </div>
    </main>
  );
}
