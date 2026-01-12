# Plan: Refactor for Multiple Accounts using Cloudflare D1

## Overview

Refactor the existing Monzo Balancer to support multiple Monzo accounts by migrating configuration storage from Cloudflare KV to Cloudflare D1 (SQL database).

## Goals

- Support managing multiple distinct Monzo accounts from a single worker instance.
- Store account-specific configuration (tokens, IDs, target balance) in D1.
- Dynamically load the correct configuration based on the incoming webhook's account ID.

## Architecture

### Database Schema (D1)

We will create a table named `accounts` to store configuration for each monitored account.

```sql
CREATE TABLE accounts (
  monzo_account_id TEXT PRIMARY KEY,  -- The ID of the Monzo Current Account (used for lookup)
  monzo_pot_id TEXT NOT NULL,         -- The ID of the Pot to use for balancing
  target_balance INTEGER NOT NULL,    -- Target balance in pennies
  client_id TEXT NOT NULL,            -- OAuth Client ID
  client_secret TEXT NOT NULL,        -- OAuth Client Secret
  access_token TEXT NOT NULL,         -- OAuth Access Token
  refresh_token TEXT NOT NULL,        -- OAuth Refresh Token
  created_at INTEGER,                 -- Timestamp (ms)
  updated_at INTEGER                  -- Timestamp (ms)
);
```

### Configuration

- **Binding Name**: `DB`
- **Migration**: Manual entry of existing account details into the D1 database.

### Code Changes

1.  **`wrangler.toml`**
    - Remove `kv_namespaces`.
    - Add `[[d1_databases]]` binding with binding name `DB`.

2.  **`src/types.ts`**
    - Update `Env` interface to replace `MONZO_CONFIG: KVNamespace` with `DB: D1Database`.

3.  **`src/monzo.ts`**
    - Update `getMonzoConfig(env, accountId)`:
      - Query the `accounts` table where `monzo_account_id = ?`.
    - Update `saveTokens(env, accountId, accessToken, refreshToken)`:
      - Update `access_token`, `refresh_token`, and `updated_at` in the `accounts` table for the given `monzo_account_id`.
    - Update `withMonzoClient`:
      - Accept `accountId` as an argument.
      - Pass it to `getMonzoConfig` and `saveTokens`.

4.  **`src/index.ts`** (Webhook Entrypoint)
    - Parse the incoming webhook body.
    - Verify `body.type === 'transaction.created'`.
    - Extract `accountId` from `body.data.account_id`.
    - Pass `accountId` to `withMonzoClient`.
    - Handle cases where the account is not configured (log warning and exit).

## Implementation Steps

1.  **Database Setup**:
    - Configure D1 in `wrangler.toml`.
    - Create the migration file `migrations/0001_create_accounts_table.sql`.
    - (User Action) Run `wrangler d1 migrations apply`.

2.  **Code Refactoring**:
    - Modify `src/types.ts`.
    - Modify `src/monzo.ts` to use D1 logic.
    - Modify `src/index.ts` to parse account ID and handle flow.

3.  **Verification**:
    - Ensure types are correct.
    - Verify SQL queries are correct.
