-- Migration number: 0004 	 2024-01-12_16:00:00.sql

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
