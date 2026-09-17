import { scrapeSide, type Side, type SideSnapshot } from "./scrape";

const SIDES: Side[] = ["buy", "sell"];

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

interface ScrapeResult {
  snapshots: SideSnapshot[];
  errors: { side: Side; error: string }[];
}

async function runScrape(env: Env): Promise<ScrapeResult> {
  const results = await Promise.allSettled(SIDES.map((side) => scrapeSide(side)));
  const snapshots: SideSnapshot[] = [];
  const errors: ScrapeResult["errors"] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") snapshots.push(r.value);
    else {
      const error = r.reason instanceof Error ? r.reason.message : String(r.reason);
      errors.push({ side: SIDES[i], error });
      console.error(`scrape failed (${SIDES[i]}):`, r.reason);
    }
  });
  if (snapshots.length > 0) {
    const stmt = env.DB.prepare(
      `INSERT INTO rates (ts, side, best, median, avg, ads_total, sample_size, top_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ts, side) DO UPDATE SET
         best = excluded.best,
         median = excluded.median,
         avg = excluded.avg,
         ads_total = excluded.ads_total,
         sample_size = excluded.sample_size,
         top_json = excluded.top_json`,
    );
    await env.DB.batch(
      snapshots.map((s) =>
        stmt.bind(
          s.ts,
          s.side,
          s.best,
          s.median,
          s.avg,
          s.adsTotal,
          s.sampleSize,
          JSON.stringify(s.top),
        ),
      ),
    );
    console.log(
      "stored",
      snapshots.map((s) => `${s.side}=${s.median.toFixed(2)}`).join(" "),
    );
  }
  return { snapshots, errors };
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runScrape(env).then(() => undefined));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      switch (url.pathname) {
        case "/api/latest":
          return await latest(env);
        case "/api/series":
          return await series(env, url);
        case "/api/stats":
          return await stats(env);
        case "/api/export.csv":
          return await exportCsv(env);
        case "/api/scrape":
          return await manual(request, env);
        default:
          return json({ error: "not found" }, 404);
      }
    } catch (err) {
      console.error(err);
      return json(
        { error: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  },
} satisfies ExportedHandler<Env>;

async function latest(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT r.ts, r.side, r.best, r.median, r.avg, r.ads_total, r.sample_size
     FROM rates r
     JOIN (SELECT side, MAX(ts) AS ts FROM rates GROUP BY side) m
       ON r.side = m.side AND r.ts = m.ts`,
  ).all();
  return json({ data: results });
}

async function series(env: Env, url: URL): Promise<Response> {
  const hours = Math.min(
    Math.max(Number(url.searchParams.get("hours") ?? 168) || 168, 1),
    24 * 3660,
  );
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const { results } = await env.DB.prepare(
    `SELECT ts, side, best, median, avg, ads_total, sample_size
     FROM rates WHERE ts >= ? ORDER BY ts ASC`,
  )
    .bind(since)
    .all();
  return json({ data: results });
}

async function stats(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT side, COUNT(*) AS readings, MIN(ts) AS first_ts, MAX(ts) AS last_ts,
            MIN(median) AS low, MAX(median) AS high
     FROM rates GROUP BY side`,
  ).all();
  return json({ data: results });
}

async function exportCsv(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT ts, datetime(ts, 'unixepoch') AS utc,
            datetime(ts, 'unixepoch', '+1 hour') AS algiers,
            side, best, median, avg, ads_total, sample_size
     FROM rates ORDER BY ts ASC, side ASC`,
  ).all<Record<string, unknown>>();

  const columns = [
    "ts",
    "utc",
    "algiers",
    "side",
    "best",
    "median",
    "avg",
    "ads_total",
    "sample_size",
  ];
  const lines = [
    columns.join(","),
    ...results.map((row) => columns.map((c) => row[c] ?? "").join(",")),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="dzd-rates.csv"',
    },
  });
}

async function manual(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "POST required" }, 405);
  }
  const key = request.headers.get("x-scrape-key");
  if (!env.SCRAPE_KEY || key !== env.SCRAPE_KEY) {
    return json({ error: "forbidden" }, 403);
  }
  const { snapshots, errors } = await runScrape(env);
  return json({
    data: snapshots.map(({ side, ts, best, median, adsTotal, sampleSize }) => ({
      side,
      ts,
      best,
      median,
      adsTotal,
      sampleSize,
    })),
    errors,
  });
}
