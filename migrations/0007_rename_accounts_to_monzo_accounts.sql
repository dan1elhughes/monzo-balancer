-- Migration number: 0007    2025-01-27_rename_accounts_to_monzo_accounts.sql

-- Drop old accounts table and create new monzo_accounts table
DROP TABLE IF EXISTS accounts;

CREATE TABLE monzo_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  monzo_account_id TEXT NOT NULL UNIQUE,
  monzo_pot_id TEXT NOT NULL,
  target_balance INTEGER NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  dry_run INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Create indexes on new table
CREATE INDEX idx_monzo_accounts_user_id ON monzo_accounts(user_id);
CREATE INDEX idx_monzo_accounts_monzo_account_id ON monzo_accounts(monzo_account_id);
