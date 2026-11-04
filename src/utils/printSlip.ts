import type { Order, Restaurant } from "@/types";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "POS / Kart",
  iban: "IBAN",
  online: "Online Ödendi",
};

const PLATFORM_LABEL: Record<string, string> = {
  telefon: "Telefon",
  yemeksepeti: "Yemeksepeti",
  getir: "Getir",
  trendyol: "Trendyol",
  migros: "Migros",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** 80mm termal yazıcı uyumlu fiş penceresi açar ve yazdırır. */
export function printOrderSlip(
  order: Order,
  restaurant?: Restaurant | null,
  courierName?: string | null
): void {
  const win = window.open("", "_blank", "noopener,noreferrer,width=320,height=640");
  if (!win) {
    alert("Yazdırma penceresi açılamadı. Pop-up engelini kontrol edin.");
    return;
  }

  const restaurantName = restaurant?.name ?? "Regon Paket";
  const restaurantPhone = restaurant?.phone ?? "";
  const restaurantAddress = restaurant?.address ?? "";

  win.document.write(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Fiş #${escapeHtml(order.order_number || String(order.id))}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 4mm 3mm;
      width: 80mm;
      font-family: "Courier New", Courier, monospace;
      font-size: 12px;
      color: #000;
      background: #fff;
    }
    h1 { font-size: 16px; margin: 0 0 4px; text-align: center; }
    .muted { text-align: center; font-size: 11px; margin: 0 0 2px; }
    hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
    .label { opacity: 0.8; }
    .value { font-weight: 700; text-align: right; word-break: break-word; }
    .block { margin: 6px 0; }
    .big { font-size: 18px; font-weight: 700; text-align: center; margin: 8px 0; }
    .center { text-align: center; }
  </style>
</head>
<body>
  <h1>${escapeHtml(restaurantName)}</h1>
  ${restaurantAddress ? `<p class="muted">${escapeHtml(restaurantAddress)}</p>` : ""}
  ${restaurantPhone ? `<p class="muted">${escapeHtml(restaurantPhone)}</p>` : ""}
  <hr />
  <div class="big">#${escapeHtml(order.order_number || String(order.id))}</div>
  <div class="row"><span class="label">Tarih</span><span class="value">${escapeHtml(formatTime(order.created_at))}</span></div>
  <div class="row"><span class="label">Platform</span><span class="value">${escapeHtml(PLATFORM_LABEL[order.platform] ?? order.platform)}</span></div>
  <div class="row"><span class="label">Ödeme</span><span class="value">${escapeHtml(PAYMENT_LABEL[order.payment_method] ?? order.payment_method)}</span></div>
  <hr />
  <div class="block">
    <div class="row"><span class="label">Müşteri</span><span class="value">${escapeHtml(order.customer_name || "—")}</span></div>
    <div class="row"><span class="label">Telefon</span><span class="value">${escapeHtml(order.customer_phone || "—")}</span></div>
    <div class="row"><span class="label">Adres</span><span class="value">${escapeHtml(order.delivery_address || "—")}</span></div>
  </div>
  <hr />
  <div class="block">
    <div class="label">İçerik / Not</div>
    <div>${escapeHtml(order.content || "—")}</div>
  </div>
  <hr />
  <div class="row"><span class="label">Tahsilat</span><span class="value">${escapeHtml(formatMoney(order.amount))}</span></div>
  ${courierName ? `<div class="row"><span class="label">Kurye</span><span class="value">${escapeHtml(courierName)}</span></div>` : ""}
  <hr />
  <p class="center">Regon Paket</p>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`);
  win.document.close();
}
