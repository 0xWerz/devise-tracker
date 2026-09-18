export type Side = "buy" | "sell";

export interface Ad {
  price: number;
  amount: number;
  min: number;
  max: number;
  merchant: string;
  methods: string[];
}

export interface SideSnapshot {
  side: Side;
  ts: number;
  best: number;
  median: number;
  avg: number;
  adsTotal: number;
  sampleSize: number;
  top: Ad[];
}

const P2P_URL =
  "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

const HEADERS: Record<string, string> = {
  "content-type": "application/json",
  accept: "*/*",
  "accept-language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  priority: "u=1, i",
  origin: "https://p2p.binance.com",
  referer:
    "https://p2p.binance.com/en/trade/sell/USDT?fiat=DZD&payment=all-payments",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(
  tradeType: "BUY" | "SELL",
  rows: number,
): Promise<{ total: number; data: unknown[] }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(P2P_URL, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
          asset: "USDT",
          fiat: "DZD",
          merchantCheck: false,
          page: 1,
          payTypes: [],
          publisherType: null,
          clientType: "web",
          rows,
          tradeType,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `HTTP ${res.status}${text ? `: ${text.replace(/\s+/g, " ").slice(0, 240)}` : ""}`,
        );
      }
      const body = (await res.json()) as {
        code?: string;
        message?: string;
        total?: number;
        data?: unknown[];
      };
      if (body.code !== "000000")
        throw new Error(`API ${body.code}: ${body.message ?? "unknown"}`);
      if (!Array.isArray(body.data) || body.data.length === 0)
        throw new Error("empty advertisement data");
      return { total: num(body.total), data: body.data };
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await sleep(attempt * 1500);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// The raw order book can have a long tail of small, expensive ads (especially
// on the ask side), so a plain median of the top 20 diverges from the rate a
// real trade gets. We therefore weight every ad by its tradable capacity
// (available USDT * price, capped by the ad's max transaction size) and report
// the capacity-weighted median. "Best" only considers ads that can fill a
// meaningful trade.
const TRADE_FLOOR_DZD = 50_000;
const FALLBACK_FLOOR_DZD = 25_000;

const capacityDzd = (a: Ad): number =>
  Math.min(a.amount * a.price, a.max > 0 ? a.max : Number.POSITIVE_INFINITY);

function weightedMedian(items: { price: number; weight: number }[]): number {
  if (items.length === 0) return 0;
  const sorted = [...items].sort((a, b) => a.price - b.price);
  const total = sorted.reduce((sum, i) => sum + i.weight, 0);
  if (!(total > 0)) return median(sorted.map((i) => i.price));
  let acc = 0;
  for (const item of sorted) {
    acc += item.weight;
    if (acc >= total / 2) return item.price;
  }
  return sorted[sorted.length - 1].price;
}

// Binance request tradeType is the *taker* side: "BUY" returns the ads you can
// buy USDT from (you pay DZD, higher rate), "SELL" returns ads buying your
// USDT (you receive DZD, lower rate). Response adv.tradeType is the maker side.
export async function scrapeSide(side: Side, rows = 20): Promise<SideSnapshot> {
  const json = await search(side === "buy" ? "BUY" : "SELL", rows);

  const ads: Ad[] = (json.data as Record<string, any>[])
    .map((row) => ({
      price: num(row?.adv?.price),
      amount: num(row?.adv?.surplusAmount),
      min: num(row?.adv?.minSingleTransAmount),
      max: num(row?.adv?.maxSingleTransAmount),
      merchant: String(row?.advertiser?.nickName ?? ""),
      methods: Array.isArray(row?.adv?.tradeMethods)
        ? (row.adv.tradeMethods as Record<string, unknown>[])
            .map((m) =>
              String(m?.tradeMethodShortName ?? m?.identifier ?? ""),
            )
            .filter(Boolean)
        : [],
    }))
    .filter((ad) => ad.price > 0 && ad.amount > 0);

  if (ads.length === 0) throw new Error(`no usable ${side} ads`);

  const center = median(ads.map((a) => a.price));
  const sane = ads.filter(
    (a) => a.price >= center * 0.9 && a.price <= center * 1.1,
  );

  const weighted = sane.map((a) => ({ price: a.price, weight: capacityDzd(a) }));
  const totalWeight = weighted.reduce((sum, i) => sum + i.weight, 0);

  const byCapacity = (floor: number) =>
    sane.filter((a) => capacityDzd(a) >= floor);
  let tradable = byCapacity(TRADE_FLOOR_DZD);
  if (tradable.length === 0) tradable = byCapacity(FALLBACK_FLOOR_DZD);
  const med = weightedMedian(weighted);
  const best = tradable.length > 0
    ? side === "buy"
      ? Math.min(...tradable.map((a) => a.price))
      : Math.max(...tradable.map((a) => a.price))
    : med;

  return {
    side,
    ts: Math.floor(Date.now() / 3_600_000) * 3600,
    best,
    median: med,
    avg:
      totalWeight > 0
        ? weighted.reduce((sum, i) => sum + i.price * i.weight, 0) / totalWeight
        : median(weighted.map((i) => i.price)),
    adsTotal: json.total,
    sampleSize: sane.length,
    top: sane.slice(0, 5),
  };
}
