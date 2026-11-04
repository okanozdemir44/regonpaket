import type { Courier, Order } from "@/types";

const ISTANBUL_TZ = "Europe/Istanbul";

export interface BusinessDayRange {
  start: string;
  end: string;
}

export interface CourierCollectionTotals {
  cashTotal: number;
  cashCount: number;
  cardTotal: number;
  cardCount: number;
  ibanTotal: number;
  ibanCount: number;
  onlineTotal: number;
  onlineCount: number;
  deliveredCount: number;
  /** Kuryenin kasaya teslim etmesi gereken: nakit + POS slip + IBAN */
  expectedTotal: number;
  /** Opsiyonel paket başı prim toplamı */
  courierEarnedTotal: number;
}

function getIstanbulParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ISTANBUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
  };
}

/** Europe/Istanbul duvar saatini UTC Date'e çevirir. */
function istanbulWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number
): Date {
  const utcGuess = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, ms)
  );

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: ISTANBUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    dtf
      .formatToParts(utcGuess)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  const offsetMs = asUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

/**
 * İş günü: TR saatiyle 05:00 → ertesi gün 04:59:59.999
 * Gece vardiyası 00:00'ı geçtiğinde hâlâ aynı iş gününde kalır.
 */
export function getBusinessDayRange(date: Date = new Date()): BusinessDayRange {
  const parts = getIstanbulParts(date);

  let year = parts.year;
  let month = parts.month;
  let day = parts.day;

  if (parts.hour < 5) {
    const prev = new Date(Date.UTC(year, month - 1, day));
    prev.setUTCDate(prev.getUTCDate() - 1);
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth() + 1;
    day = prev.getUTCDate();
  }

  const start = istanbulWallTimeToUtc(year, month, day, 5, 0, 0, 0);

  const nextCalendar = new Date(Date.UTC(year, month - 1, day));
  nextCalendar.setUTCDate(nextCalendar.getUTCDate() + 1);

  const end = istanbulWallTimeToUtc(
    nextCalendar.getUTCFullYear(),
    nextCalendar.getUTCMonth() + 1,
    nextCalendar.getUTCDate(),
    4,
    59,
    59,
    999
  );

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/**
 * Teslim edilmiş paketlerden kurye tahsilat / prim özetini hesaplar.
 * Online ödemeler kasaya 0 yazar; tutar yalnızca onlineTotal sayacında tutulur.
 */
export function calculateCourierCollectionTotals(
  packages: Order[],
  courierPackageRate: number
): CourierCollectionTotals {
  const delivered = packages.filter((p) => p.status === "delivered");

  let cashTotal = 0;
  let cashCount = 0;
  let cardTotal = 0;
  let cardCount = 0;
  let ibanTotal = 0;
  let ibanCount = 0;
  let onlineTotal = 0;
  let onlineCount = 0;

  for (const pkg of delivered) {
    const amount = Number(pkg.amount) || 0;

    switch (pkg.payment_method) {
      case "cash":
        cashTotal += amount;
        cashCount += 1;
        break;
      case "card":
        cardTotal += amount;
        cardCount += 1;
        break;
      case "iban":
        ibanTotal += amount;
        ibanCount += 1;
        break;
      case "online":
        // Online önceden ödendi; kurye nakit/POS almadı → kasaya 0
        onlineTotal += amount;
        onlineCount += 1;
        break;
      default:
        break;
    }
  }

  const deliveredCount = delivered.length;
  const expectedTotal = cashTotal + cardTotal + ibanTotal;
  const courierEarnedTotal = deliveredCount * (Number(courierPackageRate) || 0);

  return {
    cashTotal,
    cashCount,
    cardTotal,
    cardCount,
    ibanTotal,
    ibanCount,
    onlineTotal,
    onlineCount,
    deliveredCount,
    expectedTotal,
    courierEarnedTotal,
  };
}

export type ReportPeriod = "today" | "yesterday" | "7d" | "month";

/** Rapor aralığı (TR iş günü mantığıyla bugün/dün). */
export function getReportRange(
  period: ReportPeriod,
  now: Date = new Date()
): BusinessDayRange {
  if (period === "today") return getBusinessDayRange(now);

  if (period === "yesterday") {
    const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return getBusinessDayRange(y);
  }

  if (period === "7d") {
    const end = getBusinessDayRange(now).end;
    const startDay = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const start = getBusinessDayRange(startDay).start;
    return { start, end };
  }

  // Bu ay: ayın 1'i 05:00 TR → şimdi
  const parts = getIstanbulParts(now);
  const start = istanbulWallTimeToUtc(parts.year, parts.month, 1, 5, 0, 0, 0);
  return { start: start.toISOString(), end: now.toISOString() };
}

export type CourierPerformanceRow = {
  courierId: string;
  fullName: string;
  packageCount: number;
  avgDeliveryMinutes: number | null;
  revenueTotal: number;
};

/**
 * Teslim edilen paketlerden kurye performans özeti.
 * Ortalama süre: assigned_at → delivered_at (dk).
 * Ciro: nakit + POS + IBAN + online tutar toplamı.
 */
export function calculateCourierPerformance(
  packages: Order[],
  couriers: Courier[],
  range: BusinessDayRange
): CourierPerformanceRow[] {
  const startMs = new Date(range.start).getTime();
  const endMs = new Date(range.end).getTime();

  const delivered = packages.filter((o) => {
    if (o.status !== "delivered" || !o.delivered_at) return false;
    const t = new Date(o.delivered_at).getTime();
    return t >= startMs && t <= endMs;
  });

  const byCourier = new Map<
    string,
    { minutes: number[]; revenue: number; count: number }
  >();

  for (const o of delivered) {
    const courierId = o.delivered_by_courier_id || o.courier_id;
    if (!courierId) continue;

    const bucket = byCourier.get(courierId) ?? {
      minutes: [],
      revenue: 0,
      count: 0,
    };
    bucket.count += 1;
    bucket.revenue += Number(o.amount) || 0;

    if (o.assigned_at && o.delivered_at) {
      const mins =
        (new Date(o.delivered_at).getTime() -
          new Date(o.assigned_at).getTime()) /
        60000;
      if (mins >= 0 && mins < 24 * 60) bucket.minutes.push(mins);
    }

    byCourier.set(courierId, bucket);
  }

  const rows: CourierPerformanceRow[] = couriers.map((c) => {
    const bucket = byCourier.get(c.id);
    const avg =
      bucket && bucket.minutes.length > 0
        ? bucket.minutes.reduce((a, b) => a + b, 0) / bucket.minutes.length
        : null;
    return {
      courierId: c.id,
      fullName: c.full_name,
      packageCount: bucket?.count ?? 0,
      avgDeliveryMinutes: avg != null ? Math.round(avg) : null,
      revenueTotal: bucket?.revenue ?? 0,
    };
  });

  // Teslimatı olup listede olmayan kuryeler
  for (const [courierId, bucket] of byCourier) {
    if (rows.some((r) => r.courierId === courierId)) continue;
    const avg =
      bucket.minutes.length > 0
        ? bucket.minutes.reduce((a, b) => a + b, 0) / bucket.minutes.length
        : null;
    rows.push({
      courierId,
      fullName: "Eski kurye",
      packageCount: bucket.count,
      avgDeliveryMinutes: avg != null ? Math.round(avg) : null,
      revenueTotal: bucket.revenue,
    });
  }

  return rows.sort((a, b) => b.packageCount - a.packageCount);
}
