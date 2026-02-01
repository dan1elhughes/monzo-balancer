-- Add token_expires_at column to users table to track access token expiration
ALTER TABLE users ADD COLUMN token_expires_at INTEGER;
