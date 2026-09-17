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
  const kept = ads.filter(
    (a) => a.price >= center * 0.85 && a.price <= center * 1.15,
  );
  const prices = kept.map((a) => a.price);

  return {
    side,
    ts: Math.floor(Date.now() / 3_600_000) * 3600,
    best: side === "buy" ? Math.min(...prices) : Math.max(...prices),
    median: median(prices),
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    adsTotal: json.total,
    sampleSize: kept.length,
    top: ads.slice(0, 5),
  };
}
