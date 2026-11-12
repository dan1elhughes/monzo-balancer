CREATE TABLE access_checks (
  account_id TEXT NOT NULL,
  check_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'unhealthy', 'untested')),
  detail TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  notified_status TEXT NOT NULL DEFAULT 'healthy',
  claim_id TEXT,
  claim_until INTEGER,
  PRIMARY KEY (account_id, check_name)
);
