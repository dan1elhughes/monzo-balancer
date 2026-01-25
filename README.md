# Monzo Balancer

A Cloudflare Worker that automatically maintains a target balance in your Monzo account by moving excess funds to a designated Pot, or withdrawing from it to cover deficits.

**The goal is to keep the majority of your funds in a high-interest savings pot (which earns interest) while maintaining just enough in your main account to cover daily spending without going overdrawn.**

## ⚠️ Disclaimer

**This project was completely vibe coded.** Use at your own risk.

## Features

- **Auto-Sweep**: Moves money above your target balance into a savings pot.
- **Top-Up**: Withdraws money from the pot if your main account drops below the target.
- **Dry Run Mode**: Simulate transactions without actually moving money to test your configuration.
- **Web-Based Setup**: Easy configuration via a web interface - no need to manually edit config files or database entries.
- **Auto-Webhook Registration**: Automatically sets up the necessary webhooks with Monzo.
- **Deduplication**: Uses UUIDs to prevent duplicate transactions.

## Prerequisites & Monzo Setup

Before setting up the Worker, you need to create a client in the Monzo Developer Portal.

1.  **Go to the Monzo Developer Portal**:
    Visit [developers.monzo.com](https://developers.monzo.com/) and sign in with your Monzo account email. You will receive a magic link in your email to log in.

2.  **Create a New Client**:
    - Navigate to "Clients" and click "New Client".
    - **Name**: "Monzo Balancer" (or whatever you prefer).
    - **Logo URL**: Optional.
    - **Redirect URLs**: This must be the full URL to the callback endpoint of your worker.
      - For local development: `http://localhost:8787/oauth/callback`
      - For production: `https://<your-worker-name>.<your-subdomain>.workers.dev/oauth/callback`
    - **Confidentiality**: Select **Confidential**.
    - Click **Submit**.

3.  **Get Credentials**:
    Note down your `Client ID` and `Client Secret`. You will need these for the configuration.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup (Cloudflare D1)

This project uses Cloudflare D1 to store account configuration and OAuth tokens.

First, create the database:

```bash
npx wrangler d1 create monzo-balancer
```

This will output a `database_id`. Update your `wrangler.toml` file with this ID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "monzo-balancer"
database_id = "<YOUR_DATABASE_ID>"
```

Then, run the migrations to create the necessary tables:

```bash
# For local development
npx wrangler d1 migrations apply monzo-balancer --local

# For production (do this after deploying)
npx wrangler d1 migrations apply monzo-balancer --remote
```

### 3. Configuration (Secrets)

Set the following secrets using `wrangler secret put`:

- `MONZO_CLIENT_ID`: Your Monzo Client ID.
- `MONZO_CLIENT_SECRET`: Your Monzo Client Secret.
- `MONZO_REDIRECT_URI`: Your callback URL (e.g., `https://monzo-balancer.your-subdomain.workers.dev/oauth/callback`).

```bash
npx wrangler secret put MONZO_CLIENT_ID
npx wrangler secret put MONZO_CLIENT_SECRET
npx wrangler secret put MONZO_REDIRECT_URI
```

### 4. Development

Start the local development server:

```bash
npm run dev
```

### 5. Testing

Run the unit test suite:

```bash
npm test
```

## Deployment & Usage

### 1. Deploy

Deploy the project to Cloudflare Workers:

```bash
npm run deploy
```

_Don't forget to run the remote migrations if you haven't already (see Step 2)._

### 2. Configure via Web Interface

1.  Visit your deployed Worker URL (e.g., `https://monzo-balancer.your-subdomain.workers.dev`).
2.  Click **"Login with Monzo"**.
3.  Check your email and approve the login request from Monzo.
4.  You will be redirected to the setup page.
5.  **Select Account**: Choose the Monzo account you want to balance.
6.  **Select Pot**: Choose the Pot where excess funds should be sent/withdrawn from.
7.  **Target Balance**: Set the amount you want to keep in your main account (e.g., `100.00`).
8.  **Dry Run**: Check this box if you want to test the logic without moving real money. Logs will show what _would_ have happened.
9.  Click **"Save Configuration"**.

### 3. All Set!

The Worker will automatically register a webhook with Monzo. Whenever a transaction occurs in your account, Monzo will notify the Worker, which will check your balance and move money if necessary to restore your target balance.

## Troubleshooting

### Manual Webhook Registration (Fallback)

If the automatic webhook registration fails, or if you prefer to set it up manually:

1.  Go to the [Monzo Developer Portal](https://developers.monzo.com/) (API Playground).
2.  Authenticate with your Monzo account.
3.  Use the "Register webhook" endpoint (`POST /webhooks`).
4.  **Parameters**:
    - `account_id`: Your Monzo Account ID.
    - `url`: The URL of your deployed Worker (e.g. `https://monzo-balancer.your-subdomain.workers.dev/`).
5.  Click **Send**.

Alternatively, via `curl` (requires a valid Access Token):

```bash
curl -X POST "https://api.monzo.com/webhooks" \
  -H "Authorization: Bearer $YOUR_ACCESS_TOKEN" \
  -d "account_id=$YOUR_ACCOUNT_ID" \
  -d "url=https://monzo-balancer.your-subdomain.workers.dev/"
```
