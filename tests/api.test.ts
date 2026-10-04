import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import worker from "../src/index";
import { PAYMENT_METHOD } from "../src/scrape";

function database() {
  const sqlite = new Database(":memory:");
  sqlite.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../migrations/0001_quote_quality.sql", import.meta.url), "utf8"));
  const prepare = (sql: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => prepare(sql, args),
    all: async () => ({results: sqlite.query(sql).all(...values as any[])}),
  });
  const env = {SCRAPE_KEY: "test-only-key", DB: {
    prepare, batch: (statements: ReturnType<typeof prepare>[]) => Promise.all(statements.map(s => s.all())),
  }} as unknown as Env;
  const request = (path: string, init?: RequestInit) => worker.fetch(
    new Request(`https://example.test${path}`, init), env,
  );
  return {sqlite, request};
}

test("API keeps flagged raw values but excludes them from latest and statistics", async () => {
  const {sqlite, request} = database();
  const ts = Math.floor(Date.now() / 1000) - 3600;
  const insert = sqlite.prepare("INSERT INTO rates (ts, side, best, median, avg, ads_total, sample_size) VALUES (?, ?, ?, ?, ?, 20, 20)");
  insert.run(ts - 3600, "buy", 254, 255, 255);
  insert.run(ts - 3600, "sell", 253, 252, 252);
  insert.run(ts, "buy", 259.9, 295, 287.96);
  insert.run(ts, "sell", 253.17, 251.5, 251.66);
  const latest = await (await request("/api/latest")).json() as any;
  expect(latest.data.find((r: any) => r.side === "buy").median).toBe(255);
  const stats = await (await request("/api/stats")).json() as any;
  expect(stats.data.find((r: any) => r.side === "buy").readings).toBe(1);
  const series = await (await request("/api/series?hours=24")).json() as any;
  expect(series.data.find((r: any) => r.median === 295).anomaly_reason).toBe("legacy_buy_divergence");
  const csv = await (await request("/api/export.csv")).text();
  expect(csv).toContain("methodology_version,anomaly_reason");
  expect(csv).toContain("legacy_buy_divergence");
  expect(csv).toContain(",295,");
  sqlite.close();
});

test("ingest recalculates modern quotes and rejects incomplete or crossed books", async () => {
  const {sqlite, request} = database();
  const snapshot = (side: "buy" | "sell", base: number) => ({
    side, ts: Math.floor(Date.now() / 3600000) * 3600,
    best: 270, median: 270, avg: 270, adsTotal: 20, sampleSize: 5, methodologyVersion: 2,
    top: [0, 1, 2, 3, 4].map(i => ({
      price: base + i / 10, amount: 1000, min: 10000, max: 200000,
      merchant: `merchant-${i}`, merchantId: `merchant-${i}`,
      methods: ["Baridimob"], methodIds: [PAYMENT_METHOD],
    })),
  });
  const ingest = (snapshots: unknown[]) => request("/api/ingest", {
    method: "POST", headers: {"content-type": "application/json", "x-scrape-key": "test-only-key"},
    body: JSON.stringify({snapshots}),
  });
  expect((await ingest([snapshot("buy", 254)])).status).toBe(400);
  expect((await ingest([snapshot("buy", 254), snapshot("sell", 270)])).status).toBe(400);
  expect(sqlite.query("SELECT COUNT(*) AS n FROM rates").get()).toEqual({n: 0});
  expect((await ingest([snapshot("buy", 254), snapshot("sell", 251)])).status).toBe(200);
  expect(sqlite.query("SELECT median, methodology_version FROM rates WHERE side = 'buy'").get()).toEqual({median: 254.2, methodology_version: 2});
  expect(sqlite.query("SELECT median FROM rates WHERE side = 'sell'").get()).toEqual({median: 251.2});
  sqlite.close();
});
