# Monzo Balancer

A Cloudflare Worker that automatically maintains a target balance in your Monzo account by moving excess funds to a designated Pot, or withdrawing from it to cover deficits.

## ⚠️ Disclaimer

**This project was completely vibe coded.** Use at your own risk.

## Features

- **Auto-Sweep**: Moves money above your target balance into a savings pot.
- **Top-Up**: Withdraws money from the pot if your main account drops below the target.
- **Deduplication**: Uses UUIDs to prevent duplicate transactions.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configuration
You will need to set up the following secrets in your Cloudflare Worker environment (KV namespace `MONZO_CONFIG` or via `wrangler secret put`):

- `MONZO_ACCESS_TOKEN`
- `MONZO_REFRESH_TOKEN`
- `MONZO_CLIENT_ID`
- `MONZO_CLIENT_SECRET`
- `MONZO_ACCOUNT_ID`
- `MONZO_POT_ID`
- `TARGET_BALANCE` (in pennies, e.g., `100000` for £1000.00)

### 3. Development
Start the local development server:
```bash
npm run dev
```

### 4. Testing
Run the unit test suite:
```bash
npm test
```

## Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```
