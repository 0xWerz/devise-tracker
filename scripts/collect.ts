import { scrapeSide, type Side, type SideSnapshot } from "../src/scrape";

async function main(): Promise<void> {
  const workerUrl = process.env.WORKER_URL;
  const key = process.env.INGEST_KEY;
  if (!workerUrl || !key) {
    throw new Error("WORKER_URL and INGEST_KEY environment variables are required");
  }

  const sides: Side[] = ["buy", "sell"];
  const settled = await Promise.allSettled(sides.map((side) => scrapeSide(side)));

  const snapshots: SideSnapshot[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") snapshots.push(result.value);
    else console.error(`scrape failed (${sides[i]}):`, result.reason);
  });
  if (snapshots.length === 0) throw new Error("both sides failed to scrape");

  for (const s of snapshots) {
    console.log(`${s.side}: median=${s.median.toFixed(2)} best=${s.best.toFixed(2)} ads=${s.adsTotal} sample=${s.sampleSize}`);
  }

  const res = await fetch(`${workerUrl}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-scrape-key": key },
    body: JSON.stringify({ snapshots }),
  });
  const text = await res.text();
  console.log(`ingest: HTTP ${res.status} ${text.slice(0, 300)}`);
  if (!res.ok) throw new Error(`ingest failed: HTTP ${res.status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
