-- Migration number: 0001 	 2024-01-12_15:00:00.sql

CREATE TABLE accounts (
  monzo_account_id TEXT PRIMARY KEY,
  monzo_pot_id TEXT NOT NULL,
  target_balance INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);
