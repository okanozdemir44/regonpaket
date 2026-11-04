"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bike,
  BarChart3,
  History,
  LogOut,
  Package,
  Settings,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RestoranProvider, useRestoran } from "./RestoranProvider";
import type { CSSProperties } from "react";

const NAV_ITEMS = [
  {
    href: "/restoran",
    label: "Canlı Operasyon",
    icon: Package,
    match: (path: string) => path === "/restoran",
  },
  {
    href: "/restoran/kasa",
    label: "Gün Sonu Kasa",
    icon: Wallet,
    match: (path: string) => path.startsWith("/restoran/kasa"),
  },
  {
    href: "/restoran/gecmis-siparisler",
    label: "Geçmiş Siparişlerim",
    icon: History,
    match: (path: string) => path.startsWith("/restoran/gecmis-siparisler"),
  },
  {
    href: "/restoran/raporlar",
    label: "Performans",
    icon: BarChart3,
    match: (path: string) => path.startsWith("/restoran/raporlar"),
  },
  {
    href: "/restoran/kuryelerim",
    label: "Kuryelerim",
    icon: Bike,
    match: (path: string) => path.startsWith("/restoran/kuryelerim"),
  },
  {
    href: "/restoran/musterilerim",
    label: "Müşterilerim",
    icon: Users,
    match: (path: string) => path.startsWith("/restoran/musterilerim"),
  },
  {
    href: "/restoran/ayarlar",
    label: "Dükkan Ayarları",
    icon: Settings,
    match: (path: string) => path.startsWith("/restoran/ayarlar"),
  },
] as const;

function restaurantInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "R";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function BrandMark({
  name,
  logoUrl,
  size = "md",
}: {
  name: string;
  logoUrl?: string | null;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "size-10" : "size-16";
  const text = size === "sm" ? "text-sm" : "text-xl";

  if (logoUrl) {
    return (
      <div
        className={cn(
          box,
          "overflow-hidden rounded-2xl border-2 border-[var(--brand-primary)]/50 bg-white/5 shadow-lg shadow-black/20"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name} className="size-full object-contain" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        box,
        "flex items-center justify-center rounded-2xl border-2 border-[var(--brand-primary)]/40 font-[family-name:var(--font-display)] font-bold text-[#1a1208]",
        text
      )}
      style={{ background: "var(--brand-primary)" }}
    >
      {restaurantInitials(name)}
    </div>
  );
}

function RestoranShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, restaurant, loading, logout } = useRestoran();
  const displayName = restaurant?.name ?? session.name;
  const primary = restaurant?.primary_color || "#f59e0b";
  const secondary = restaurant?.secondary_color || "#10b981";

  const brandStyle = {
    "--brand-primary": primary,
    "--brand-secondary": secondary,
    "--panel-accent": primary,
  } as CSSProperties;

  return (
    <div
      className="panel-shell flex min-h-full flex-1 bg-[var(--panel-bg)] text-[var(--panel-ink)]"
      style={brandStyle}
    >
      <aside className="panel-sidebar sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-white/8 bg-[var(--panel-sidebar)] lg:flex">
        <div className="flex flex-col items-center gap-3 border-b border-white/8 px-5 py-6 text-center">
          <BrandMark name={displayName} logoUrl={restaurant?.logo_url} />
          <div className="min-w-0 w-full">
            <p className="truncate font-[family-name:var(--font-display)] text-xl tracking-tight">
              {displayName}
            </p>
            <p
              className="mt-2 inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#04140c]"
              style={{ background: "var(--brand-secondary)" }}
            >
              Kasa Paneli
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-[var(--brand-primary)] text-[#1a1208] shadow-lg shadow-black/20"
                    : "text-[var(--panel-muted)] hover:bg-white/5 hover:text-[var(--panel-ink)]"
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition",
                    active ? "opacity-90" : "opacity-70 group-hover:opacity-90"
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-white/8 p-3">
          <p className="flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] text-[var(--panel-muted)]">
            <Zap className="size-3.5 text-[var(--brand-primary)]" />
            Regon Paket Altyapısı
          </p>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[var(--panel-muted)] transition hover:bg-white/5 hover:text-[var(--panel-ink)]"
          >
            <LogOut className="size-4" />
            Çıkış yap
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/8 bg-[var(--panel-sidebar)]/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark
              name={displayName}
              logoUrl={restaurant?.logo_url}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-display)] text-base leading-tight">
                {displayName}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-[var(--brand-secondary)]">
                Kasa Paneli
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-white/10 p-2 text-[var(--panel-muted)] hover:bg-white/5 hover:text-[var(--panel-ink)]"
            aria-label="Çıkış yap"
          >
            <LogOut className="size-4" />
          </button>
        </header>

        <main className="relative flex-1 overflow-auto pb-24 lg:pb-0">
          <div className={cn(loading && "pointer-events-none opacity-40")}>
            {children}
          </div>
          {loading ? (
            <div className="absolute inset-0 z-10 flex min-h-[50vh] items-center justify-center bg-[var(--panel-bg)]/70 text-sm text-[var(--panel-muted)] backdrop-blur-[1px]">
              Canlı veriler yükleniyor…
            </div>
          ) : null}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/8 bg-[var(--panel-sidebar)]/95 backdrop-blur-md lg:hidden">
          <div className="grid grid-cols-7 gap-0.5 px-0.5 py-1.5">
            {NAV_ITEMS.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-center transition-all duration-200",
                    active
                      ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"
                      : "text-[var(--panel-muted)]"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="max-w-full truncate text-[9px] font-medium leading-tight">
                    {item.label.split(" ")[0]}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

export function RestoranClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RestoranProvider>
      <RestoranShell>{children}</RestoranShell>
    </RestoranProvider>
  );
}
