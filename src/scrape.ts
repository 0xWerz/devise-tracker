export type Side = "buy" | "sell";

export interface Ad {
  price: number;
  amount: number;
  min: number;
  max: number;
  merchant: string;
  merchantId?: string;
  methods: string[];
  methodIds?: string[];
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
  methodologyVersion: number;
}

export const TRADE_AMOUNT_DZD = 50_000;
export const PAYMENT_METHOD = "AlgerieBaridimob";
const MAX_QUOTES = 5;
const MIN_QUOTES = 3;

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
  page = 1,
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
          page,
          payTypes: [PAYMENT_METHOD],
          transAmount: String(TRADE_AMOUNT_DZD),
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

// Compare the same payment method and ticket size. Advertised inventory is
// neither executed volume nor evidence that a quote represents the market.
// Use one vote per merchant among the five most competitive executable quotes.
export function estimate(side: Side, ads: Ad[]) {
  const eligible = ads.filter((a) =>
    [a.price, a.amount, a.min, a.max].every(Number.isFinite) &&
    a.price > 0 && a.amount > 0 && a.min > 0 &&
    a.min <= TRADE_AMOUNT_DZD && a.max >= TRADE_AMOUNT_DZD &&
    a.amount * a.price >= TRADE_AMOUNT_DZD &&
    a.methodIds?.includes(PAYMENT_METHOD) &&
    (a.merchantId || a.merchant.trim()),
  ).sort((a, b) => side === "buy" ? a.price - b.price : b.price - a.price);
  const merchants = new Set<string>();
  const quotes: Ad[] = [];
  for (const ad of eligible) {
    const id = ad.merchantId || ad.merchant.trim().toLowerCase();
    if (merchants.has(id)) continue;
    merchants.add(id);
    quotes.push(ad);
    if (quotes.length === MAX_QUOTES) break;
  }
  if (quotes.length < MIN_QUOTES) {
    throw new Error(`only ${quotes.length} independent ${side} quotes for ${TRADE_AMOUNT_DZD} DZD via Baridimob; need ${MIN_QUOTES}`);
  }
  return {
    best: quotes[0].price,
    median: median(quotes.map((a) => a.price)),
    avg: quotes.reduce((sum, a) => sum + a.price, 0) / quotes.length,
    sampleSize: quotes.length,
  };
}

export function validateBook(snapshots: SideSnapshot[]): void {
  const buy = snapshots.find((s) => s.side === "buy");
  const sell = snapshots.find((s) => s.side === "sell");
  if (snapshots.length !== 2 || !buy || !sell || buy.ts !== sell.ts ||
      buy.methodologyVersion !== 2 || sell.methodologyVersion !== 2) {
    throw new Error("incomplete comparable order book; keeping the previous snapshot");
  }
  if (sell.median > buy.median) {
    throw new Error(`crossed quotes: sell ${sell.median} exceeds buy ${buy.median}; keeping the previous snapshot`);
  }
}

// Binance request tradeType is the *taker* side: "BUY" returns the ads you can
// buy USDT from (you pay DZD, higher rate), "SELL" returns ads buying your
// USDT (you receive DZD, lower rate). Response adv.tradeType is the maker side.
export async function scrapeSide(side: Side, rows = 20): Promise<SideSnapshot> {
  const tradeType = side === "buy" ? "BUY" : "SELL";
  const json = await search(tradeType, rows);
  const raw = [...json.data];
  // Pagination avoids mistaking a first page with duplicate or stale offers
  // for a thin market. Retain every inspected ad for later diagnosis.
  for (let page = 2; page <= 3 && raw.length < json.total; page++) {
    const next = await search(tradeType, rows, page);
    raw.push(...next.data);
    if (next.data.length < rows) break;
  }

  const ads: Ad[] = (raw as Record<string, any>[])
    .map((row) => ({
      price: num(row?.adv?.price),
      amount: num(row?.adv?.surplusAmount),
      min: num(row?.adv?.minSingleTransAmount),
      max: num(row?.adv?.maxSingleTransAmount),
      merchant: String(row?.advertiser?.nickName ?? ""),
      merchantId: String(row?.advertiser?.userNo ?? ""),
      methodIds: Array.isArray(row?.adv?.tradeMethods)
        ? row.adv.tradeMethods.map((m: Record<string, unknown>) => String(m.identifier ?? ""))
        : [],
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

  return {
    side,
    ts: Math.floor(Date.now() / 3_600_000) * 3600,
    ...estimate(side, ads),
    adsTotal: json.total,
    top: ads,
    methodologyVersion: 2,
  };
}
