ALTER TABLE rates ADD COLUMN methodology_version INTEGER NOT NULL DEFAULT 1;

-- Flag legacy estimates that contradict their own tradable quote or the
-- contemporaneous opposite side. These checks express uncertainty, not a
-- replacement price; the original snapshots remain available in raw exports.
CREATE VIEW rate_quality AS
SELECT r.*,
  CASE
    WHEN r.methodology_version = 1 AND r.side = 'buy'
      AND (r.median > r.best * 1.05 OR EXISTS (
        SELECT 1 FROM rates other WHERE other.ts = r.ts AND other.side = 'sell'
          AND r.median > other.median * 1.10
      )) THEN 'legacy_buy_divergence'
    WHEN r.methodology_version = 1 AND r.side = 'sell' AND EXISTS (
      SELECT 1 FROM rates other WHERE other.ts = r.ts AND other.side = 'buy'
        AND r.median > other.median * 1.02
    ) THEN 'legacy_crossed_market'
    ELSE NULL
  END AS anomaly_reason
FROM rates r;

CREATE VIEW reliable_rates AS
SELECT * FROM rate_quality WHERE anomaly_reason IS NULL;
