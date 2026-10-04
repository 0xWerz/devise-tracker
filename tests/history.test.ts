import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

test("flag legacy distortions without replacing historical prices or suppressing corroborated moves", () => {
  const db = new Database(":memory:");
  db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../migrations/0001_quote_quality.sql", import.meta.url), "utf8"));
  const insert = db.prepare("INSERT INTO rates (ts, side, best, median, avg, ads_total, sample_size, methodology_version) VALUES (?, ?, ?, ?, ?, 20, 5, ?)");
  const point = (ts: number, side: string, best: number, median: number, version = 1) => insert.run(ts, side, best, median, median, version);
  // September 27: inflated median despite a much cheaper qualifying offer.
  point(100, "buy", 259.9, 295); point(100, "sell", 253.17, 251.5);
  // September 30: a bank-only bid crosses the simultaneous buy market.
  point(200, "buy", 254, 254.99); point(200, "sell", 270, 270);
  // A genuine market level change has mutually consistent buy/sell quotes.
  point(300, "buy", 298, 300); point(300, "sell", 296, 295);
  // New snapshots have a distinct methodology version.
  point(400, "buy", 254, 254.5, 2); point(400, "sell", 251.2, 251, 2);
  expect(db.query("SELECT anomaly_reason FROM rate_quality WHERE ts = 100 AND side = 'buy'").get()).toEqual({anomaly_reason: "legacy_buy_divergence"});
  expect(db.query("SELECT anomaly_reason FROM rate_quality WHERE ts = 200 AND side = 'sell'").get()).toEqual({anomaly_reason: "legacy_crossed_market"});
  expect(db.query("SELECT COUNT(*) AS n FROM reliable_rates").get()).toEqual({n: 6});
  expect(db.query("SELECT median FROM rates WHERE ts = 100 AND side = 'buy'").get()).toEqual({median: 295});
  expect(db.query("SELECT median FROM rates WHERE ts = 200 AND side = 'sell'").get()).toEqual({median: 270});
  expect(db.query("SELECT COUNT(*) AS n FROM reliable_rates WHERE ts = 300").get()).toEqual({n: 2});
  db.close();
});
