CREATE TABLE IF NOT EXISTS rates (
  ts INTEGER NOT NULL,
  side TEXT NOT NULL,
  best REAL NOT NULL,
  median REAL NOT NULL,
  avg REAL NOT NULL,
  ads_total INTEGER NOT NULL,
  sample_size INTEGER NOT NULL,
  top_json TEXT,
  PRIMARY KEY (ts, side)
);

CREATE INDEX IF NOT EXISTS idx_rates_ts ON rates (ts);
