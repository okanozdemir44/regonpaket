"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import {
  Bike,
  BarChart3,
  History,
  LogOut,
  Menu,
  MoreHorizontal,
  Package,
  Settings,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RestoranProvider, useRestoran } from "./RestoranProvider";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: typeof Package;
  match: (path: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/restoran",
    label: "Canlı Operasyon",
    shortLabel: "Operasyon",
    icon: Package,
    match: (path) => path === "/restoran",
  },
  {
    href: "/restoran/kasa",
    label: "Gün Sonu Kasa",
    shortLabel: "Kasa",
    icon: Wallet,
    match: (path) => path.startsWith("/restoran/kasa"),
  },
  {
    href: "/restoran/gecmis-siparisler",
    label: "Geçmiş Siparişlerim",
    shortLabel: "Geçmiş",
    icon: History,
    match: (path) => path.startsWith("/restoran/gecmis-siparisler"),
  },
  {
    href: "/restoran/raporlar",
    label: "Performans",
    shortLabel: "Rapor",
    icon: BarChart3,
    match: (path) => path.startsWith("/restoran/raporlar"),
  },
  {
    href: "/restoran/kuryelerim",
    label: "Kuryelerim",
    shortLabel: "Kurye",
    icon: Bike,
    match: (path) => path.startsWith("/restoran/kuryelerim"),
  },
  {
    href: "/restoran/musterilerim",
    label: "Müşterilerim",
    shortLabel: "Müşteri",
    icon: Users,
    match: (path) => path.startsWith("/restoran/musterilerim"),
  },
  {
    href: "/restoran/ayarlar",
    label: "Dükkan Ayarları",
    shortLabel: "Ayarlar",
    icon: Settings,
    match: (path) => path.startsWith("/restoran/ayarlar"),
  },
];

/** Alt barda görünen ana sekmeler */
const MOBILE_PRIMARY = NAV_ITEMS.filter((i) =>
  ["/restoran", "/restoran/kasa", "/restoran/gecmis-siparisler"].includes(
    i.href
  )
);
const MOBILE_MORE = NAV_ITEMS.filter(
  (i) =>
    !["/restoran", "/restoran/kasa", "/restoran/gecmis-siparisler"].includes(
      i.href
    )
);

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
  const box = size === "sm" ? "size-9 sm:size-10" : "size-16";
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const brandStyle = {
    "--brand-primary": primary,
    "--brand-secondary": secondary,
    "--panel-accent": primary,
  } as CSSProperties;

  const moreActive = MOBILE_MORE.some((i) => i.match(pathname));

  useEffect(() => {
    setMoreOpen(false);
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen && !drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen, drawerOpen]);

  return (
    <div
      className="panel-shell flex min-h-dvh flex-1 bg-[var(--panel-bg)] text-[var(--panel-ink)]"
      style={brandStyle}
    >
      {/* Masaüstü sidebar */}
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

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
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
        {/* Mobil üst bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/8 bg-[var(--panel-sidebar)]/95 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-md sm:px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-xl border border-white/10 p-2.5 text-[var(--panel-muted)] hover:bg-white/5 hover:text-[var(--panel-ink)]"
            aria-label="Menü"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <BrandMark
              name={displayName}
              logoUrl={restaurant?.logo_url}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-display)] text-sm leading-tight sm:text-base">
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
            className="rounded-xl border border-white/10 p-2.5 text-[var(--panel-muted)] hover:bg-white/5 hover:text-[var(--panel-ink)]"
            aria-label="Çıkış yap"
          >
            <LogOut className="size-4" />
          </button>
        </header>

        <main className="relative min-h-0 flex-1 overflow-auto pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0">
          <div className={cn(loading && "pointer-events-none opacity-40")}>
            {children}
          </div>
          {loading ? (
            <div className="absolute inset-0 z-10 flex min-h-[50vh] items-center justify-center bg-[var(--panel-bg)]/70 text-sm text-[var(--panel-muted)] backdrop-blur-[1px]">
              Canlı veriler yükleniyor…
            </div>
          ) : null}
        </main>

        {/* Mobil alt navigasyon — 3 ana + Daha fazla */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-[var(--panel-sidebar)]/97 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
          <div className="grid grid-cols-4 gap-0.5 px-1 py-1.5">
            {MOBILE_PRIMARY.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-center transition-all",
                    active
                      ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"
                      : "text-[var(--panel-muted)]"
                  )}
                >
                  <Icon className="size-[1.15rem] shrink-0" />
                  <span className="max-w-full truncate text-[10px] font-semibold leading-tight">
                    {item.shortLabel}
                  </span>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-center transition-all",
                moreActive || moreOpen
                  ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"
                  : "text-[var(--panel-muted)]"
              )}
            >
              <MoreHorizontal className="size-[1.15rem] shrink-0" />
              <span className="text-[10px] font-semibold leading-tight">
                Daha fazla
              </span>
            </button>
          </div>
        </nav>
      </div>

      {/* Mobil yan menü (drawer) */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Kapat"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(100%,300px)] flex-col border-r border-white/10 bg-[var(--panel-sidebar)] pt-[env(safe-area-inset-top)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <BrandMark
                  name={displayName}
                  logoUrl={restaurant?.logo_url}
                  size="sm"
                />
                <p className="truncate font-[family-name:var(--font-display)] text-base">
                  {displayName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg border border-white/10 p-2 text-[var(--panel-muted)]"
                aria-label="Kapat"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {NAV_ITEMS.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium",
                      active
                        ? "bg-[var(--brand-primary)] text-[#1a1208]"
                        : "text-[var(--panel-muted)] hover:bg-white/5"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-white/8 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-sm text-[var(--panel-muted)]"
              >
                <LogOut className="size-4" />
                Çıkış yap
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {/* Daha fazla alt sheet */}
      {moreOpen ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            aria-label="Kapat"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-white/10 bg-[#141a22] pb-[env(safe-area-inset-bottom)] shadow-2xl">
            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <p className="text-sm font-semibold">Diğer menüler</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-lg border border-white/10 p-2 text-[var(--panel-muted)]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
              {MOBILE_MORE.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition",
                      active
                        ? "border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]"
                        : "border-white/8 bg-white/[0.03] text-[var(--panel-ink)]"
                    )}
                  >
                    <Icon className="size-5" />
                    <span className="text-xs font-semibold">{item.shortLabel}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
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
