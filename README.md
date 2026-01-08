# Monzo Balancer

A Cloudflare Worker that automatically maintains a target balance in your Monzo account by moving excess funds to a designated Pot, or withdrawing from it to cover deficits.

**The goal is to keep the majority of your funds in a high-interest savings pot (which earns interest) while maintaining just enough in your main account to cover daily spending without going overdrawn.**

## ⚠️ Disclaimer

**This project was completely vibe coded.** Use at your own risk.

## Features

- **Auto-Sweep**: Moves money above your target balance into a savings pot.
- **Top-Up**: Withdraws money from the pot if your main account drops below the target.
- **Deduplication**: Uses UUIDs to prevent duplicate transactions.

## Prerequisites & Monzo Setup

Before setting up the Worker, you need to create a client in the Monzo Developer Portal.

1.  **Go to the Monzo Developer Portal**:
    Visit [developers.monzo.com](https://developers.monzo.com/) and sign in with your Monzo account email. You will receive a magic link in your email to log in.

2.  **Create a New Client**:
    - Navigate to "Clients" and click "New Client".
    - **Name**: "Monzo Balancer" (or whatever you prefer).
    - **Logo URL**: Optional.
    - **Redirect URLs**: You can use `http://localhost:3000/callback` if you plan to generate tokens locally, or the URL of your deployed worker if you build an auth flow.
    - **Confidentiality**: Select **Confidential**.
    - Click **Submit**.

3.  **Get Credentials**:
    Note down your `Client ID` and `Client Secret`. You will need these for the configuration.

4.  **Generate Initial Tokens**:
    Since this Worker runs in the background, it needs an initial `access_token` and `refresh_token`. You can use the [Monzo API Playground](https://developers.monzo.com/api/playground) to authenticate and grab these initial values, or write a quick script to perform the OAuth exchange.

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

## Deployment & Webhook Registration

### 1. Deploy
Deploy the project to Cloudflare Workers:
```bash
npm run deploy
```
Make a note of the deployed Worker URL (e.g., `https://monzo-balancer.your-subdomain.workers.dev`).

### 2. Register Webhook
To notify the Worker about transactions, you must register a webhook with Monzo.

1.  Go back to the [Monzo Developer Portal](https://developers.monzo.com/).
2.  Use the **API Playground** or `curl` to register the webhook.
3.  **Endpoint**: `POST /webhooks`
4.  **Parameters**:
    - `account_id`: Your Monzo Account ID.
    - `url`: The URL of your deployed Worker (from step 1).

Example `curl`:
```bash
curl -X POST "https://api.monzo.com/webhooks" \
  -H "Authorization: Bearer $YOUR_ACCESS_TOKEN" \
  -d "account_id=$YOUR_ACCOUNT_ID" \
  -d "url=https://monzo-balancer.your-subdomain.workers.dev"
```

Now, whenever a transaction occurs, Monzo will hit your Worker, and the Worker will balance your account.

For more details on the Monzo API, refer to the [Monzo Documentation](https://docs.monzo.com/).

