-- Migration number: 0008    2025-01-27_move_tokens_to_user_level.sql
-- Move access_token and refresh_token from monzo_accounts to users table
-- Tokens are user-level, not account-level, according to Monzo API docs
-- Existing users will reconnect to populate new token fields

-- Add token columns to users table (nullable initially for migration)
ALTER TABLE users ADD COLUMN access_token TEXT;
ALTER TABLE users ADD COLUMN refresh_token TEXT;

-- Drop token columns from monzo_accounts table
ALTER TABLE monzo_accounts DROP COLUMN access_token;
ALTER TABLE monzo_accounts DROP COLUMN refresh_token;
