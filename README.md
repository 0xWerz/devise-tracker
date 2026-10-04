# devise-tracker

Hourly tracker for the Algerian parallel-market USD/DZD rate ("le carré"), sampled from
Binance P2P (`USDT/DZD`, all payment methods). Live at **https://devise.werz.xyz**.

- **Cloudflare Worker** serves the dashboard and API, stores readings in **D1**, and every
  hour (`0 * * * *`) dispatches the scrape workflow on GitHub via the API.
- **GitHub Actions** does the actual scraping because Binance's WAF returns 403 to
  Cloudflare's egress IPs. The runner computes both sides of the book and POSTs the
  snapshot to `/api/ingest`.
  - `buy` = ask side — what you pay in DZD to acquire USDT/USD.
  - `sell` = bid side — what you receive in DZD when selling USDT/USD.
- A `17 */6 * * *` schedule in the workflow is a low-frequency backup trigger in case the
  Worker's dispatch token ever stops working.

Storage: one row per hour per side in `rates` — best price, median, average, ad counts,
methodology version and inspected ads (`top_json`; legacy rows only retained five ads).
Re-runs in the same hour upsert, so overlapping triggers are safe.

## API

| Route | Description |
| --- | --- |
| `GET /api/latest` | Most recent reading per side |
| `GET /api/series?hours=168` | Time series for charting |
| `GET /api/stats` | Ranges, first/last sample, reading counts |
| `GET /api/export.csv` | Full history as CSV (UTC + Algiers time) |
| `POST /api/ingest` | Store snapshots, needs `x-scrape-key: <SCRAPE_KEY>` |
| `POST /api/dispatch` | Manually fire the scrape workflow, same key |

## Commands

```sh
bun install
bun run dev            # local worker on http://localhost:8787 (local D1)
bun run db:init:local  # create the local table
bun run db:migrate:local # apply quote-quality views and version column
bun run typecheck
bun run test
bun run deploy
bunx wrangler tail     # live logs
```

## Secrets

Worker (`bunx wrangler secret put <NAME>`):

- `SCRAPE_KEY` — shared secret for `/api/ingest` and `/api/dispatch`
- `GH_TOKEN` — fine-grained PAT, repo `0xWerz/devise-tracker`, permission **Actions: Read and write**

GitHub repo secret: `INGEST_KEY` — same value as `SCRAPE_KEY`.

## First-time deploy (already done for this instance)

```sh
bunx wrangler login
bunx wrangler d1 create devise-tracker          # put database_id into wrangler.jsonc
bun run db:init                                 # applies schema.sql to the remote D1
bun run db:migrate                              # applies migrations before deploying
bun run deploy                                  # also attaches the devise.werz.xyz custom domain
```

## Notes

- The buy/sell change badges follow the selected chart period (24H, 7D, 30D, 90D,
  1Y, or All), comparing the first and last readings in view. Hover for the exact
  comparison dates. If collection began inside the selected period, the badges
  say "since start" and the chart shows when the available history began.
- USDT stands in for USD: on the parallel market the two trade within ~0.1%.
- Methodology v2 compares offers for exactly 50,000 DZD via Baridimob. The API
  filters by ticket size and payment method; local checks verify payment method,
  minimum/maximum limits and available USDT. Up to three pages are inspected.
  Select the five most competitive offers from distinct merchants and take their
  equally weighted median. At least three merchants per side are required.
  `best` and `avg` use the same eligible offers. Advertised balances never weight
  the price. Missing sides or a sell median above the buy median abort collection.
- Legacy methodology v1 used capacity weights across all payment methods, which
  allowed large or niche ads to distort the headline. `rate_quality` flags legacy
  buys over 5% above their recorded best quote or over 10% above the simultaneous
  sell median, and sells over 2% above the simultaneous buy median. These are
  conservative representativeness checks, not proof that an ad was fraudulent.
  `reliable_rates` excludes flagged readings from the latest rates, stats and daily
  summaries. The chart shows gaps and percentage changes ignore flagged readings.
  CSV/JSON keep all original values, `methodology_version` and `anomaly_reason`.
  Historical prices are not reconstructed from the incomplete five-ad archive.
- If bad rows ever need surgery, D1 Time Travel keeps 30 days of history:
  `bunx wrangler d1 time-travel info devise-tracker` then
  `bunx wrangler d1 time-travel restore devise-tracker --timestamp=...`.
- To run a scrape on demand: `gh workflow run scrape.yml -R 0xWerz/devise-tracker`
  or `POST /api/dispatch` with the scrape key.
