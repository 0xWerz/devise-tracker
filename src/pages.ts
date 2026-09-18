export type Lang = "en" | "fr" | "ar";

const ASSET: Record<Lang, string> = {
  en: "/index.html",
  fr: "/fr.html",
  ar: "/ar.html",
};

const CANONICAL: Record<Lang, string> = { en: "/", fr: "/fr", ar: "/ar" };

const IN_LANGUAGE: Record<Lang, string> = {
  en: "en",
  fr: "fr-DZ",
  ar: "ar-DZ",
};

const LOCALE: Record<Lang, string> = {
  en: "en-GB",
  fr: "fr-FR",
  ar: "ar-DZ-u-nu-latn",
};

interface RateRow {
  side: string;
  ts: number;
  best: number;
  median: number;
}

interface DayRow {
  day: string;
  buy: number | null;
  sell: number | null;
  n: number;
}

interface StatsRow {
  side: string;
  readings: number;
  first_ts: number;
  last_ts: number;
  low: number;
  high: number;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmt2 = (lang: Lang) =>
  new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fmt0 = (lang: Lang) => new Intl.NumberFormat(LOCALE[lang]);

const dateLong = (ts: number, lang: Lang): string =>
  new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: "Africa/Algiers",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ts * 1000));

const dateShort = (ts: number, lang: Lang): string =>
  new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: "Africa/Algiers",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(ts * 1000));

const timeShort = (ts: number, lang: Lang): string =>
  new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: "Africa/Algiers",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts * 1000));

const dayLong = (day: string, lang: Lang): string =>
  new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));

interface FaqItem {
  q: string;
  a: string;
}

interface Texts {
  noData: string;
  sentence: (d: string, t: string, buy: string, sell: string) => string;
  plain: (d: string, t: string, buy: string, sell: string) => string;
  tableHead: [string, string, string];
  noTableRows: string;
  foot: (n: string, d: string, lo: string, hi: string) => string;
  faq: (rateAnswer: string) => FaqItem[];
  datasetName: string;
  datasetDesc: string;
}

const TEXTS: Record<Lang, Texts> = {
  en: {
    noData:
      "No data has been collected yet — the first hourly sample arrives shortly.",
    sentence: (d, t, buy, sell) =>
      `On <strong>${d}</strong> at <strong>${t}</strong> (Algiers), the USD/DZD parallel market (square) rate is <strong>${buy} DZD</strong> to buy and <strong>${sell} DZD</strong> to sell.`,
    plain: (d, t, buy, sell) =>
      `On ${d} at ${t} (Algiers), the USD/DZD parallel market (square) rate is ${buy} DZD to buy and ${sell} DZD to sell.`,
    tableHead: ["Date", "Buy (DZD per USD)", "Sell (DZD per USD)"],
    noTableRows: "History appears after the first day of collection.",
    foot: (n, d, lo, hi) =>
      `${n} hourly sample${n === "1" ? "" : "s"} since ${d} · range ${lo} – ${hi} DZD`,
    faq: (rateAnswer) => [
      {
        q: "What is the square rate in Algeria?",
        a: "The square (French: carré) is Algeria's informal currency market, where dollars and euros trade outside the official banking system. Its USD/DZD rate is usually well above the official bank rate.",
      },
      {
        q: "What is the USD to DZD parallel market rate today?",
        a: `${rateAnswer} Rates are refreshed every hour.`,
      },
      {
        q: "Why track USDT instead of USD?",
        a: "USDT trades within roughly 0.1% of USD on the parallel market and has the deepest, most transparent order book on Binance P2P, which makes it the best available proxy for the street rate.",
      },
      {
        q: "How are these rates calculated?",
        a: "Every hour we take the top 20 Binance P2P ads per side and weight each one by the amount it can actually trade. We publish the capacity-weighted median, plus the best price among ads that can fill a trade of at least 50,000 DZD. Prices more than 10% away from the median are ignored.",
      },
      {
        q: "Where does the data come from, and can I download it?",
        a: "The data comes from the public Binance P2P order book for USDT/DZD. The full history is available as CSV and JSON from the links at the top of the page. This site is informational only and not financial advice.",
      },
    ],
    datasetName: "USD/DZD Algerian parallel market rate (hourly)",
    datasetDesc:
      "Hourly buy and sell prices for USD/DZD on Algeria's parallel market, derived from Binance P2P USDT/DZD ads weighted by tradable capacity.",
  },
  fr: {
    noData:
      "Aucune donnée pour le moment — le premier relevé horaire arrive bientôt.",
    sentence: (d, t, buy, sell) =>
      `Le <strong>${d}</strong> à <strong>${t}</strong> (heure d'Alger), le taux du marché parallèle (square) USD/DZD est de <strong>${buy} DZD</strong> à l'achat et <strong>${sell} DZD</strong> à la vente.`,
    plain: (d, t, buy, sell) =>
      `Le ${d} à ${t} (heure d'Alger), le taux du marché parallèle (square) USD/DZD est de ${buy} DZD à l'achat et ${sell} DZD à la vente.`,
    tableHead: ["Date", "Achat (DZD par USD)", "Vente (DZD par USD)"],
    noTableRows: "L'historique apparaît après le premier jour de collecte.",
    foot: (n, d, lo, hi) =>
      `${n} relevé${n === "1" ? "" : "s"} horaire${n === "1" ? "" : "s"} depuis le ${d} · plage ${lo} – ${hi} DZD`,
    faq: (rateAnswer) => [
      {
        q: "Qu'est-ce que le taux du square en Algérie ?",
        a: "Le square (ou carré) est le marché informel des devises en Algérie, où le dollar et l'euro s'échangent en dehors du système bancaire officiel. Son taux USD/DZD est généralement bien supérieur au taux officiel.",
      },
      {
        q: "Quel est le taux du dollar au marché parallèle aujourd'hui ?",
        a: `${rateAnswer} Les taux sont actualisés toutes les heures.`,
      },
      {
        q: "Pourquoi suivre l'USDT plutôt que le dollar ?",
        a: "L'USDT s'échange à environ 0,1 % du dollar sur le marché parallèle et dispose du carnet d'ordres le plus profond et le plus transparent sur Binance P2P : c'est le meilleur proxy disponible pour le taux de la rue.",
      },
      {
        q: "Comment ces taux sont-ils calculés ?",
        a: "Chaque heure, nous prenons les 20 meilleures annonces Binance P2P de chaque côté et pondérons chacune par le montant qu'elle peut réellement traiter. Nous publions la médiane pondérée par la capacité, ainsi que le meilleur prix parmi les annonces pouvant honorer une transaction d'au moins 50 000 DZD. Les prix à plus de 10 % de la médiane sont ignorés.",
      },
      {
        q: "D'où viennent les données et puis-je les télécharger ?",
        a: "Les données proviennent du carnet d'ordres public Binance P2P pour USDT/DZD. L'historique complet est disponible en CSV et JSON via les liens en haut de page. Ce site est purement informatif et ne constitue pas un conseil financier.",
      },
    ],
    datasetName: "Taux USD/DZD du marché parallèle algérien (horaire)",
    datasetDesc:
      "Prix d'achat et de vente horaires de l'USD/DZD sur le marché parallèle algérien, calculés à partir des annonces Binance P2P USDT/DZD pondérées par leur capacité de transaction.",
  },
  ar: {
    noData: "لا توجد بيانات بعد — ستصل أول قراءة خلال الساعة.",
    sentence: (d, t, buy, sell) =>
      `بتاريخ <strong>${d}</strong> على الساعة <strong>${t}</strong> (توقيت الجزائر)، سعر السوق الموازية (السكوير) لزوج USD/DZD هو <strong>${buy} دج</strong> للشراء و<strong>${sell} دج</strong> للبيع.`,
    plain: (d, t, buy, sell) =>
      `بتاريخ ${d} على الساعة ${t} (توقيت الجزائر)، سعر السوق الموازية (السكوير) لزوج USD/DZD هو ${buy} دج للشراء و${sell} دج للبيع.`,
    tableHead: ["التاريخ", "الشراء (دج لكل دولار)", "البيع (دج لكل دولار)"],
    noTableRows: "يظهر السجل بعد أول يوم من الجمع.",
    foot: (n, d, lo, hi) => `${n} قراءة كل ساعة منذ ${d} · المدى ${lo} – ${hi} دج`,
    faq: (rateAnswer) => [
      {
        q: "ما هو سعر السكوير في الجزائر؟",
        a: "السكوير (السوق الموازية) هو سوق الصرف غير الرسمي في الجزائر، حيث يُتداول الدولار والأورو خارج النظام البنكي الرسمي. سعره للدولار أعلى عادة من السعر الرسمي.",
      },
      {
        q: "كم سعر الدولار في السوق الموازية اليوم؟",
        a: `${rateAnswer} يتم تحديث الأسعار كل ساعة.`,
      },
      {
        q: "لماذا نتابع USDT بدل الدولار؟",
        a: "يتداول USDT بفارق لا يتجاوز 0.1٪ عن الدولار في السوق الموازية، ويتمتع بأعمق وأوضح دفتر أوامر على Binance P2P، ما يجعله أفضل مؤشر متاح لسعر السوق.",
      },
      {
        q: "كيف تُحتسب هذه الأسعار؟",
        a: "كل ساعة نأخذ أفضل 20 إعلاناً على Binance P2P من كل جهة، ونزن كل إعلان بالمبلغ الذي يمكنه تداوله فعلاً. ننشر الوسيط المرجّح بالسعة، وأفضل سعر بين الإعلانات القادرة على تنفيذ صفقة بـ 50,000 دج على الأقل. يتم تجاهل الأسعار التي تبعد أكثر من 10٪ عن الوسيط.",
      },
      {
        q: "من أين تأتي البيانات وهل يمكنني تحميلها؟",
        a: "تأتي البيانات من دفتر الأوامر العام لـ Binance P2P لزوج USDT/DZD. السجل الكامل متاح بصيغة CSV و JSON عبر الروابط أعلى الصفحة. الموقع لأغراض إعلامية فقط وليس نصيحة مالية.",
      },
    ],
    datasetName: "سعر الدولار مقابل الدينار في السوق الموازية الجزائرية (كل ساعة)",
    datasetDesc:
      "أسعار الشراء والبيع كل ساعة لزوج USD/DZD في السوق الموازية الجزائرية، محسوبة من إعلانات Binance P2P لـ USDT/DZD مرجّحة بحجم التداول المتاح.",
  },
};

function dailyTable(rows: DayRow[], lang: Lang): string {
  const t = TEXTS[lang];
  if (rows.length === 0) return `<p class="lead">${esc(t.noTableRows)}</p>`;
  const f = fmt2(lang);
  const head = t.tableHead.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr><td>${esc(dayLong(r.day, lang))}</td>` +
        `<td class="n">${r.buy != null ? f.format(r.buy) : "–"}</td>` +
        `<td class="n">${r.sell != null ? f.format(r.sell) : "–"}</td></tr>`,
    )
    .join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function faqItems(items: FaqItem[]): string {
  return items
    .map(
      (i) =>
        `<div class="qa"><h3>${esc(i.q)}</h3><p>${esc(i.a)}</p></div>`,
    )
    .join("");
}

function jsonLd(
  origin: string,
  lang: Lang,
  canonical: string,
  faq: FaqItem[],
  stats: StatsRow[],
): string {
  const t = TEXTS[lang];
  const buy = stats.find((s) => s.side === "buy");
  const first = buy?.first_ts ?? stats[0]?.first_ts;
  const last = buy?.last_ts ?? stats[0]?.last_ts;
  const temporalCoverage =
    first && last
      ? `${new Date(first * 1000).toISOString().slice(0, 10)}/${new Date(last * 1000).toISOString().slice(0, 10)}`
      : undefined;

  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebSite",
      "@id": `${origin}/#website`,
      name: "Devise DZ",
      url: `${origin}/`,
      inLanguage: IN_LANGUAGE[lang],
    },
    {
      "@type": "Dataset",
      name: t.datasetName,
      description: t.datasetDesc,
      url: `${origin}${canonical}`,
      isAccessibleForFree: true,
      inLanguage: IN_LANGUAGE[lang],
      creator: { "@type": "Organization", name: "Devise DZ", url: `${origin}/` },
      variableMeasured: "DZD per USD",
      measurementTechnique:
        "Capacity-weighted median and best tradable price of Binance P2P USDT/DZD advertisements, sampled hourly",
      temporalCoverage,
      distribution: [
        {
          "@type": "DataDownload",
          name: "CSV export",
          encodingFormat: "text/csv",
          contentUrl: `${origin}/api/export.csv`,
        },
        {
          "@type": "DataDownload",
          name: "JSON API",
          encodingFormat: "application/json",
          contentUrl: `${origin}/api/series?hours=876000`,
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: faq.map((i) => ({
        "@type": "Question",
        name: i.q,
        acceptedAnswer: ({ "@type": "Answer", text: i.a } as unknown),
      })),
    },
  ];

  return `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  })}</script>`;
}

export async function renderPage(
  request: Request,
  env: Env,
  lang: Lang,
): Promise<Response> {
  const origin = new URL(request.url).origin;
  const asset = await env.ASSETS.fetch(new URL(ASSET[lang], origin));
  if (!asset.ok) return new Response("Not found", { status: 404 });
  let html = await asset.text();

  const [latestRes, dailyRes, statsRes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT side, ts, best, median FROM rates
       WHERE (side, ts) IN (SELECT side, MAX(ts) FROM rates GROUP BY side)`,
    ),
    env.DB.prepare(
      `SELECT date(ts, 'unixepoch', '+1 hour') AS day,
              AVG(CASE WHEN side = 'buy' THEN median END) AS buy,
              AVG(CASE WHEN side = 'sell' THEN median END) AS sell,
              COUNT(*) AS n
       FROM rates GROUP BY day ORDER BY day DESC LIMIT 14`,
    ),
    env.DB.prepare(
      `SELECT side, COUNT(*) AS readings, MIN(ts) AS first_ts, MAX(ts) AS last_ts,
              MIN(median) AS low, MAX(median) AS high
       FROM rates GROUP BY side`,
    ),
  ]);

  const latest = (latestRes.results ?? []) as unknown as RateRow[];
  const daily = (dailyRes.results ?? []) as unknown as DayRow[];
  const stats = (statsRes.results ?? []) as unknown as StatsRow[];

  const buyRow = latest.find((r) => r.side === "buy");
  const sellRow = latest.find((r) => r.side === "sell");
  const t = TEXTS[lang];
  const f = fmt2(lang);
  const tokens: Record<string, string> = {};

  let ratePlain: string;
  if (buyRow && sellRow) {
    const d = dateLong(buyRow.ts, lang);
    const tm = timeShort(buyRow.ts, lang);
    const buy = f.format(buyRow.median);
    const sell = f.format(sellRow.median);
    tokens.RATE_SENTENCE = t.sentence(d, tm, buy, sell);
    ratePlain = t.plain(d, tm, buy, sell);
    tokens.BUY_MEDIAN = buy;
    tokens.BUY_BEST = f.format(buyRow.best);
    tokens.SELL_MEDIAN = sell;
    tokens.SELL_BEST = f.format(sellRow.best);
    tokens.SPREAD = f.format(buyRow.median - sellRow.median);
    const pct = ((buyRow.median - sellRow.median) / buyRow.median) * 100;
    tokens.SPREAD_PCT = f.format(pct) + (lang === "en" ? "% of buy rate" : lang === "fr" ? " % du taux d'achat" : "٪ من سعر الشراء");
    tokens.UPDATED = timeShort(buyRow.ts, lang);
  } else {
    tokens.RATE_SENTENCE = esc(t.noData);
    ratePlain = t.noData;
    for (const k of ["BUY_MEDIAN", "BUY_BEST", "SELL_MEDIAN", "SELL_BEST", "SPREAD", "SPREAD_PCT"]) {
      tokens[k] = "–";
    }
    tokens.UPDATED = "—";
  }

  const faq = t.faq(ratePlain);
  const buyStats = stats.find((s) => s.side === "buy");
  if (buyStats) {
    const n = String(buyStats.readings);
    tokens.FOOT = t.foot(
      fmt0(lang).format(buyStats.readings),
      dateShort(buyStats.first_ts, lang),
      f.format(buyStats.low),
      f.format(buyStats.high),
    );
    void n;
  } else {
    tokens.FOOT = "";
  }

  tokens.DAILY_TABLE = dailyTable(daily, lang);
  tokens.FAQ_ITEMS = faqItems(faq);
  tokens.JSONLD = jsonLd(origin, lang, CANONICAL[lang], faq, stats);

  for (const [key, value] of Object.entries(tokens)) {
    html = html.split(`{{${key}}}`).join(value);
  }

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function renderSitemap(env: Env, origin: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT MAX(ts) AS ts FROM rates`).first<{
    ts: number | null;
  }>();
  const lastmod = new Date((row?.ts ?? Date.now() / 1000) * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "+00:00");

  const urls = (["en", "fr", "ar"] as Lang[])
    .map((lang) => {
      const loc = `${origin}${CANONICAL[lang]}`;
      const alternates = (["en", "fr", "ar"] as Lang[])
        .map(
          (alt) =>
            `    <xhtml:link rel="alternate" hreflang="${alt}" href="${origin}${CANONICAL[alt]}"/>`,
        )
        .join("\n");
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
${alternates}
    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}/"/>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
