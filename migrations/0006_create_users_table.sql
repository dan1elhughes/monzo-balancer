-- Migration number: 0006    2025-01-27_create_users_table.sql

CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Create index for potential future queries
CREATE INDEX idx_users_created_at ON users(created_at);
