(() => {
  const $ = (id) => document.getElementById(id);
  const LANG = document.documentElement.lang || "en";

  const LOC = {
    en: {
      tag: "en-GB", unit: "DZD",
      legendBuy: "Buy (ask)", legendSell: "Sell (bid)",
      ago: {
        now: "just now",
        min: (m) => `${m} min ago`,
        hour: (h, m) => `${h}h ${m}m ago`,
        day: (d) => `${d}d ago`,
      },
      noDelta: "24h –",
      deltaText: (abs, pct, sign) => `${sign}${abs} (${sign}${pct}%) 24h`,
      spreadOf: (p) => `${p}% of buy rate`,
      samples: (n) => `${n} sample${n === 1 ? "" : "s"} in view`,
      foot: (n, d) => `${n} hourly sample${n === 1 ? "" : "s"} since ${d}`,
      range: (lo, hi) => `range ${lo} – ${hi} DZD`,
    },
    fr: {
      tag: "fr-FR", unit: "DZD",
      legendBuy: "Achat (ask)", legendSell: "Vente (bid)",
      ago: {
        now: "à l'instant",
        min: (m) => `il y a ${m} min`,
        hour: (h, m) => `il y a ${h} h ${m} min`,
        day: (d) => `il y a ${d} j`,
      },
      noDelta: "24h –",
      deltaText: (abs, pct, sign) => `${sign}${abs} (${sign}${pct} %) 24h`,
      spreadOf: (p) => `${p} % du taux d'achat`,
      samples: (n) => `${n} point${n === 1 ? "" : "s"} affiché${n === 1 ? "" : "s"}`,
      foot: (n, d) => `${n} relevé${n === 1 ? "" : "s"} horaire${n === 1 ? "" : "s"} depuis le ${d}`,
      range: (lo, hi) => `plage ${lo} – ${hi} DZD`,
    },
    ar: {
      tag: "ar-DZ-u-nu-latn", unit: "دج",
      legendBuy: "شراء", legendSell: "بيع",
      ago: {
        now: "الآن",
        min: (m) => `قبل ${m} دقيقة`,
        hour: (h, m) => `قبل ${h} س ${m} د`,
        day: (d) => `قبل ${d} يوم`,
      },
      noDelta: "24س –",
      deltaText: (abs, pct, sign) => `${sign}${abs} (${sign}${pct}٪) 24س`,
      spreadOf: (p) => `${p}٪ من سعر الشراء`,
      samples: (n) => `${n} نقطة معروضة`,
      foot: (n, d) => `${n} قراءة كل ساعة منذ ${d}`,
      range: (lo, hi) => `المدى ${lo} – ${hi} دج`,
    },
  }[LANG] || null;

  const L = LOC || {
    tag: "en-GB", unit: "DZD",
    legendBuy: "Buy (ask)", legendSell: "Sell (bid)",
    ago: { now: "just now", min: (m) => `${m} min ago`, hour: (h, m) => `${h}h ${m}m ago`, day: (d) => `${d}d ago` },
    noDelta: "24h –",
    deltaText: (abs, pct, sign) => `${sign}${abs} (${sign}${pct}%) 24h`,
    spreadOf: (p) => `${p}% of buy rate`,
    samples: (n) => `${n} sample${n === 1 ? "" : "s"} in view`,
    foot: (n, d) => `${n} hourly sample${n === 1 ? "" : "s"} since ${d}`,
    range: (lo, hi) => `range ${lo} – ${hi} DZD`,
  };

  const TZ = "Africa/Algiers";
  const nf2 = new Intl.NumberFormat(L.tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat(L.tag);
  const dtShort = new Intl.DateTimeFormat(L.tag, { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const dtTime = new Intl.DateTimeFormat(L.tag, { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  const dtFull = new Intl.DateTimeFormat(L.tag, { timeZone: TZ, weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

  const INK = "#a1a1aa";
  const GRID = "rgba(255, 255, 255, 0.06)";
  const SERIES = {
    buy: { color: "#fafafa", dash: [] },
    sell: { color: "#71717a", dash: [4, 3] },
  };
  let chart = null;
  let range = "24";
  try { range = localStorage.getItem("range") || "24"; } catch {}

  const fmt = (v) => v == null || !isFinite(v) ? "–" : nf2.format(v);
  const clock = (ts) => dtTime.format(new Date(ts * 1000));

  function agoText(tsSeconds) {
    const mins = Math.max(0, Math.round((Date.now() / 1000 - tsSeconds) / 60));
    if (mins < 2) return L.ago.now;
    if (mins < 60) return L.ago.min(mins);
    const h = Math.floor(mins / 60);
    if (h < 24) return L.ago.hour(h, mins % 60);
    return L.ago.day(Math.floor(h / 24));
  }

  async function jget(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.json();
  }

  function delta(rows, side) {
    const pts = rows.filter((r) => r.side === side);
    if (pts.length < 2) return null;
    const last = pts[pts.length - 1];
    const cutoff = last.ts - 24 * 3600;
    let ref = null;
    for (const p of pts) if (p.ts <= cutoff) ref = p;
    if (!ref) {
      const first = pts[0];
      if (last.ts - first.ts < 20 * 3600) return null;
      ref = first;
    }
    if (!ref) return null;
    return { abs: last.median - ref.median, pct: ((last.median - ref.median) / ref.median) * 100 };
  }

  function renderBadge(el, d) {
    if (!d) {
      el.className = "badge";
      el.textContent = L.noDelta;
      return;
    }
    const cls = d.abs > 0 ? "up" : d.abs < 0 ? "down" : "";
    const sign = d.abs > 0 ? "+" : "";
    el.className = "badge " + cls;
    el.textContent = L.deltaText(nf2.format(d.abs), nf2.format(d.pct), sign);
  }

  function setCards(latestRows, seriesRows) {
    const bySide = {};
    for (const r of latestRows) bySide[r.side] = r;
    for (const side of ["buy", "sell"]) {
      const row = bySide[side];
      $(side + "-median").textContent = row ? fmt(row.median) : "–";
      $(side + "-best").textContent = row ? fmt(row.best) : "–";
      renderBadge($(side + "-chg"), delta(seriesRows, side));
    }
    const buy = bySide.buy, sell = bySide.sell;
    if (buy && sell) {
      const abs = buy.median - sell.median;
      $("spread").textContent = fmt(abs);
      $("spread-pct").textContent = L.spreadOf(nf2.format((abs / buy.median) * 100));
    } else {
      $("spread").textContent = "–";
      $("spread-pct").textContent = "–";
    }
    if (buy) $("updated").textContent = `${clock(buy.ts)} · ${agoText(buy.ts)}`;
  }

  const labelFor = (ts, spanHours) => spanHours <= 48 ? clock(ts) : dtShort.format(new Date(ts * 1000));

  function drawChart(rows) {
    const tss = [...new Set(rows.map((r) => r.ts))].sort((a, b) => a - b);
    $("empty").hidden = tss.length > 0;
    if (chart) { chart.destroy(); chart = null; }
    if (tss.length === 0) return;

    const spanHours = (tss[tss.length - 1] - tss[0]) / 3600;
    const sparse = tss.length <= 120;
    const maps = { buy: new Map(), sell: new Map() };
    for (const r of rows) maps[r.side]?.set(r.ts, r.median);

    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = INK;

    const datasets = ["buy", "sell"].map((side) => ({
      label: side === "buy" ? L.legendBuy : L.legendSell,
      data: tss.map((t) => maps[side].get(t) ?? null),
      borderColor: SERIES[side].color,
      borderWidth: 1.75,
      borderDash: SERIES[side].dash,
      pointRadius: sparse ? 3 : 0,
      pointBorderWidth: sparse ? 1.5 : 0,
      pointBorderColor: "#09090b",
      pointBackgroundColor: SERIES[side].color,
      pointHitRadius: 12,
      pointHoverRadius: 3.5,
      pointHoverBackgroundColor: SERIES[side].color,
      pointHoverBorderColor: "#09090b",
      tension: 0.2,
      spanGaps: true,
      fill: false,
    }));

    chart = new Chart($("chart"), {
      type: "line",
      data: { labels: tss.map((t) => labelFor(t, spanHours)), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        normalized: true,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 4, right: 4 } },
        scales: {
          x: {
            ticks: { color: INK, maxTicksLimit: 7, maxRotation: 0, autoSkip: true, padding: 6 },
            grid: { display: false },
            border: { color: "#27272a" },
          },
          y: {
            grace: "8%",
            ticks: { color: INK, padding: 8, callback: (v) => nf0.format(v) },
            grid: { color: GRID, drawTicks: false },
            border: { display: false },
          },
        },
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: {
              color: INK, boxWidth: 6, boxHeight: 6, usePointStyle: true,
              pointStyle: "circle", padding: 14, font: { size: 11.5 },
            },
          },
          tooltip: {
            backgroundColor: "#09090b",
            borderColor: "#27272a",
            borderWidth: 1,
            titleColor: "#fafafa",
            bodyColor: "#a1a1aa",
            cornerRadius: 8,
            padding: 10,
            boxPadding: 4,
            usePointStyle: true,
            callbacks: {
              title: (items) => items.length ? dtFull.format(new Date(tss[items[0].dataIndex] * 1000)) : "",
              label: (item) => ` ${item.dataset.label}: ${fmt(item.parsed.y)} ${L.unit}`,
            },
          },
        },
      },
    });
  }

  function setFoot(statsRows, seriesRows) {
    const buy = statsRows.find((s) => s.side === "buy");
    const parts = [];
    if (buy && buy.readings > 0) {
      const n = Number(buy.readings);
      parts.push(L.foot(nf0.format(n), dtFull.format(new Date(buy.first_ts * 1000))));
      parts.push(L.range(fmt(buy.low), fmt(buy.high)));
    }
    const foot = $("foot");
    if (foot) foot.textContent = parts.join(" · ");
    const count = seriesRows.filter((r) => r.side === "buy").length;
    const hint = $("hint");
    if (hint) hint.textContent = count ? L.samples(nf0.format(count)) : "";
  }

  async function load() {
    try {
      const hours = range === "all" ? 24 * 3660 : Number(range);
      const [latest, seriesRes, stats] = await Promise.all([
        jget("/api/latest"),
        jget(`/api/series?hours=${hours}`),
        jget("/api/stats"),
      ]);
      const seriesRows = seriesRes.data || [];
      setCards(latest.data || [], seriesRows);
      drawChart(seriesRows);
      setFoot(stats.data || [], seriesRows);
    } catch (err) {
      console.error(err);
      $("updated").textContent = "—";
    }
  }

  function setRange(value) {
    range = value;
    try { localStorage.setItem("range", value); } catch {}
    for (const b of $("ranges").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.hours === value);
    }
    load();
  }

  $("ranges").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-hours]");
    if (btn) setRange(btn.dataset.hours);
  });

  setRange(range);
  setInterval(load, 5 * 60 * 1000);
})();
