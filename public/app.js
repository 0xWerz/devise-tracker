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
      periods: { "24": "24h", "168": "7D", "720": "30D", "2160": "90D", "8760": "1Y", all: "All" },
      sinceStart: "since start",
      availableSince: (d) => `history since ${d}`,
      changeBetween: (from, to) => `Change from ${from} to ${to}`,
      excluded: (n) => `${n} flagged reading${n === "1" ? "" : "s"} excluded`,
      noDelta: (period) => `${period} –`,
      deltaText: (abs, pct, sign, period) => `${sign}${abs} (${sign}${pct}%) ${period}`,
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
      periods: { "24": "24h", "168": "7J", "720": "30J", "2160": "90J", "8760": "1A", all: "Tout" },
      sinceStart: "depuis le début",
      availableSince: (d) => `historique depuis le ${d}`,
      changeBetween: (from, to) => `Variation du ${from} au ${to}`,
      excluded: (n) => `${n} relevé${n === "1" ? "" : "s"} suspect${n === "1" ? "" : "s"} exclu${n === "1" ? "" : "s"}`,
      noDelta: (period) => `${period} –`,
      deltaText: (abs, pct, sign, period) => `${sign}${abs} (${sign}${pct} %) ${period}`,
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
      periods: { "24": "24س", "168": "7ي", "720": "30ي", "2160": "90ي", "8760": "1س", all: "الكل" },
      sinceStart: "منذ البداية",
      availableSince: (d) => `السجل منذ ${d}`,
      changeBetween: (from, to) => `التغير من ${from} إلى ${to}`,
      excluded: (n) => `تم استبعاد ${n} قراءة مشكوك فيها`,
      noDelta: (period) => `${period} –`,
      deltaText: (abs, pct, sign, period) => `${sign}${abs} (${sign}${pct}٪) ${period}`,
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
    periods: { "24": "24h", "168": "7D", "720": "30D", "2160": "90D", "8760": "1Y", all: "All" },
    sinceStart: "since start",
    availableSince: (d) => `history since ${d}`,
    changeBetween: (from, to) => `Change from ${from} to ${to}`,
    excluded: (n) => `${n} flagged reading${n === "1" ? "" : "s"} excluded`,
    noDelta: (period) => `${period} –`,
    deltaText: (abs, pct, sign, period) => `${sign}${abs} (${sign}${pct}%) ${period}`,
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
  const dtDate = new Intl.DateTimeFormat(L.tag, { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });

  const INK = "#a1a1aa";
  const GRID = "rgba(255, 255, 255, 0.06)";
  const SERIES = {
    buy: { color: "#fafafa", dash: [] },
    sell: { color: "#71717a", dash: [4, 3] },
  };
  let chart = null;
  let range = "24";
  try { range = localStorage.getItem("range") || "24"; } catch {}
  if (!Object.hasOwn(L.periods, range)) range = "24";
  let loadId = 0;

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
    const pts = rows.filter((r) => r.side === side && !r.anomaly_reason);
    if (pts.length < 2) return null;
    const ref = pts[0];
    const last = pts[pts.length - 1];
    if (!Number.isFinite(ref.median) || ref.median <= 0 || !Number.isFinite(last.median)) return null;
    return {
      abs: last.median - ref.median,
      pct: ((last.median - ref.median) / ref.median) * 100,
      from: ref.ts,
      to: last.ts,
    };
  }

  function hasPartialHistory(stats, selectedRange) {
    return selectedRange !== "all" && stats &&
      stats.first_ts > Date.now() / 1000 - Number(selectedRange) * 3600 + 3600;
  }

  function renderBadge(el, d, period) {
    if (!d) {
      el.className = "badge";
      el.textContent = L.noDelta(period);
      el.removeAttribute("title");
      return;
    }
    const cls = d.abs > 0 ? "up" : d.abs < 0 ? "down" : "";
    const sign = d.abs > 0 ? "+" : "";
    el.className = "badge " + cls;
    el.textContent = L.deltaText(nf2.format(d.abs), nf2.format(d.pct), sign, period);
    el.title = L.changeBetween(dtFull.format(new Date(d.from * 1000)), dtFull.format(new Date(d.to * 1000)));
  }

  function setCards(latestRows, seriesRows, statsRows, selectedRange) {
    const bySide = {};
    for (const r of latestRows) bySide[r.side] = r;
    for (const side of ["buy", "sell"]) {
      const row = bySide[side];
      $(side + "-median").textContent = row ? fmt(row.median) : "–";
      $(side + "-best").textContent = row ? fmt(row.best) : "–";
      const stats = statsRows.find((s) => s.side === side);
      const period = hasPartialHistory(stats, selectedRange) ? L.sinceStart : L.periods[selectedRange];
      renderBadge($(side + "-chg"), delta(seriesRows, side), period);
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
    const hasData = rows.some((r) => !r.anomaly_reason);
    $("empty").hidden = hasData;
    if (chart) { chart.destroy(); chart = null; }
    if (!hasData) return;

    const spanHours = (tss[tss.length - 1] - tss[0]) / 3600;
    const sparse = tss.length <= 120;
    const maps = { buy: new Map(), sell: new Map() };
    for (const r of rows) maps[r.side]?.set(r.ts, r.anomaly_reason ? null : r.median);

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
      spanGaps: false,
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

  function setFoot(statsRows, seriesRows, selectedRange) {
    const buy = statsRows.find((s) => s.side === "buy");
    const parts = [];
    if (buy && buy.readings > 0) {
      const n = Number(buy.readings);
      parts.push(L.foot(nf0.format(n), dtFull.format(new Date(buy.first_ts * 1000))));
      parts.push(L.range(fmt(buy.low), fmt(buy.high)));
    }
    const foot = $("foot");
    if (foot) foot.textContent = parts.join(" · ");
    const count = seriesRows.filter((r) => r.side === "buy" && !r.anomaly_reason).length;
    const hint = $("hint");
    if (hint) {
      const parts = count ? [L.samples(nf0.format(count))] : [];
      if (count && hasPartialHistory(buy, selectedRange)) {
        parts.push(L.availableSince(dtDate.format(new Date(buy.first_ts * 1000))));
      }
      const excluded = seriesRows.filter((r) => r.anomaly_reason).length;
      if (excluded) parts.push(L.excluded(nf0.format(excluded)));
      hint.textContent = parts.join(" · ");
    }
  }

  async function load() {
    const requestId = ++loadId;
    const selectedRange = range;
    try {
      const hours = selectedRange === "all" ? 24 * 3660 : Number(selectedRange);
      const [latest, seriesRes, stats] = await Promise.all([
        jget("/api/latest"),
        jget(`/api/series?hours=${hours}`),
        jget("/api/stats"),
      ]);
      if (requestId !== loadId) return;
      const seriesRows = seriesRes.data || [];
      setCards(latest.data || [], seriesRows, stats.data || [], selectedRange);
      drawChart(seriesRows);
      setFoot(stats.data || [], seriesRows, selectedRange);
    } catch (err) {
      if (requestId !== loadId) return;
      console.error(err);
      $("updated").textContent = "—";
    }
  }

  function setRange(value) {
    range = value;
    try { localStorage.setItem("range", value); } catch {}
    for (const b of $("ranges").querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.hours === value);
      b.setAttribute("aria-pressed", String(b.dataset.hours === value));
    }
    for (const side of ["buy", "sell"]) renderBadge($(side + "-chg"), null, L.periods[value]);
    load();
  }

  $("ranges").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-hours]");
    if (btn) setRange(btn.dataset.hours);
  });

  setRange(range);
  setInterval(load, 5 * 60 * 1000);
})();
