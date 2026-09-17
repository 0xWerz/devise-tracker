import type { Side, SideSnapshot } from "./scrape";

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

// Cloudflare egress IPs are blocked by Binance's WAF (HTTP 403), so the actual
// scraping runs on a GitHub Actions runner. The hourly cron here just pings it.
async function dispatchWorkflow(env: Env): Promise<void> {
  if (!env.GH_TOKEN) {
    console.error("GH_TOKEN is not configured; cannot dispatch scrape workflow");
    return;
  }
  const res = await fetch(
    `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/scrape.yml/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GH_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "devise-tracker-worker",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  const text = await res.text();
  if (res.status === 204) {
    console.log("dispatched scrape workflow");
  } else {
    console.error(`dispatch failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
}

interface IngestPayload {
  snapshots?: unknown;
}

function validSnapshot(value: unknown): SideSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const s = value as Record<string, unknown>;
  const side = s.side;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (side !== "buy" && side !== "sell") return null;
  if (!num(s.ts) || !num(s.best) || !num(s.median) || !num(s.avg)) return null;
  if (!num(s.adsTotal) || !num(s.sampleSize)) return null;
  if ((s.best as number) <= 0 || (s.median as number) <= 0) return null;
  return {
    side,
    ts: Math.floor(s.ts as number),
    best: s.best as number,
    median: s.median as number,
    avg: s.avg as number,
    adsTotal: s.adsTotal as number,
    sampleSize: s.sampleSize as number,
    top: Array.isArray(s.top) ? s.top : [],
  };
}

async function ingest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  if (!env.SCRAPE_KEY || request.headers.get("x-scrape-key") !== env.SCRAPE_KEY) {
    return json({ error: "forbidden" }, 403);
  }

  let payload: IngestPayload;
  try {
    payload = (await request.json()) as IngestPayload;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const snapshots = (Array.isArray(payload.snapshots) ? payload.snapshots : [])
    .map(validSnapshot)
    .filter((s): s is SideSnapshot => s !== null);

  if (snapshots.length === 0) return json({ error: "no valid snapshots" }, 400);

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
  return json({ stored: snapshots.map((s) => ({ side: s.side, ts: s.ts })) });
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(dispatchWorkflow(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      switch (url.pathname) {
        case "/api/ingest":
          return await ingest(request, env);
        case "/api/latest":
          return await latest(env);
        case "/api/series":
          return await series(env, url);
        case "/api/stats":
          return await stats(env);
        case "/api/export.csv":
          return await exportCsv(env);
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
