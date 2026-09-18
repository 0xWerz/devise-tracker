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

Storage: one row per hour per side in `rates` — best price, median, average, ad counts and
the top 5 ads (`top_json`). Re-runs in the same hour upsert, so overlapping triggers are safe.

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
bun run typecheck
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
bun run deploy                                  # also attaches the devise.werz.xyz custom domain
```

## Notes

- USDT stands in for USD: on the parallel market the two trade within ~0.1%.
- Prices come from the top 20 Binance P2P ads per side. Each ad is weighted by its
  tradable capacity (`min(surplus USDT × price, max transaction size)`), and the
  headline rate is the capacity-weighted median. Prices more than 10% from the
  median are ignored. `best` is the best price among ads that can fill at least
  50,000 DZD (falling back to 25,000 DZD, then to the median) — this avoids
  headline rates that only exist for $10 trades.
- If bad rows ever need surgery, D1 Time Travel keeps 30 days of history:
  `bunx wrangler d1 time-travel info devise-tracker` then
  `bunx wrangler d1 time-travel restore devise-tracker --timestamp=...`.
- To run a scrape on demand: `gh workflow run scrape.yml -R 0xWerz/devise-tracker`
  or `POST /api/dispatch` with the scrape key.
