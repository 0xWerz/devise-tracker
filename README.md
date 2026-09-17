# devise-tracker

Hourly tracker for the Algerian parallel-market USD/DZD rate ("le carré"), sampled from
Binance P2P (`USDT/DZD`, all payment methods).

- **Worker** scrapes both sides of the book every hour (`0 * * * *` UTC).
  - `buy` = ask side — what you pay in DZD to acquire USDT/USD.
  - `sell` = bid side — what you receive in DZD when selling USDT/USD.
- **D1** stores one row per hour per side: best price, median, average, ad counts and the top 5 ads.
- **Dashboard** is served from the same Worker at `/`.

## API

| Route | Description |
| --- | --- |
| `GET /api/latest` | Most recent reading per side |
| `GET /api/series?hours=168` | Time series for charting |
| `GET /api/stats` | Ranges, first/last sample, reading counts |
| `GET /api/export.csv` | Full history as CSV (UTC + Algiers time) |
| `POST /api/scrape` | Manual trigger, needs `x-scrape-key: <SCRAPE_KEY>` |

## Commands

```sh
bun install
bun run dev            # local worker on http://localhost:8787 (local D1)
bun run db:init:local  # create the local table
bun run typecheck
bun run deploy
```

## First-time deploy

```sh
bunx wrangler login
bunx wrangler d1 create devise-tracker          # put database_id into wrangler.jsonc
bun run db:init                                 # applies schema.sql to the remote D1
bun run deploy
```

Trigger a sample immediately after deploying:

```sh
curl -X POST https://devise-tracker.<subdomain>.workers.dev/api/scrape \
  -H "x-scrape-key: <SCRAPE_KEY from wrangler.jsonc>"
```

## Notes

- USDT stands in for USD: on the parallel market the two trade within ~0.1%.
- The scraped price is the median of the first page (top 20 ads) per side, with
  outliers beyond ±15% of the median dropped.
- Binance P2P caps the search endpoint at 20 rows per page; page 1 is the best
  liquidity view and enough for a stable median.
