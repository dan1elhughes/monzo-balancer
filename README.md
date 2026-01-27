# Monzo Balancer

A Cloudflare Worker that automatically maintains a target balance in your Monzo account by moving excess funds to a designated Pot, or withdrawing from it to cover deficits.

**The goal is to keep the majority of your funds in a high-interest savings pot (which earns interest) while maintaining just enough in your main account to cover daily spending without going overdrawn.**

## ⚠️ Disclaimer

**This project was completely vibe coded.** Use at your own risk.

## How It Works

1. You set a **target balance** for your main Monzo account (e.g., £100)
2. Every time a transaction occurs, Monzo sends a webhook notification
3. The Worker automatically:
   - **Deposits excess funds** into your chosen pot if your balance goes above the target
   - **Withdraws funds** from the pot if your balance drops below the target
   - **Logs all activity** for transparency and debugging

## Features

- **Automatic Balancing**: Triggers on every transaction to keep your account at exactly your target balance
- **Safe Defaults**: Won't overdraw your pot if it doesn't have enough funds
- **Dry Run Mode**: Test your configuration without moving real money - all transactions are logged but not executed
- **Web-Based Setup**: Easy 3-step configuration via a web interface
- **Smart Deduplication**: Prevents duplicate transactions using UUIDs

## Getting Started

### Prerequisites

You'll need:

- A [Monzo](https://monzo.com/) account
- A Cloudflare account (free tier works fine)
- Node.js installed locally

### Step 1: Create a Monzo Developer Client

This allows the Balancer to access your account and move money.

1. Visit [developers.monzo.com](https://developers.monzo.com/) and sign in
2. Go to **Clients** → **New Client**
3. Fill in the details:
   - **Name**: "Monzo Balancer"
   - **Redirect URLs**: You'll come back to this - see Step 2 below
   - **Confidentiality**: Select **Confidential**
4. Click **Submit**
5. Save your **Client ID** and **Client Secret** - you'll need them soon

## Installation

### Step 2: Deploy the Worker

Clone this repository and deploy it to Cloudflare:

```bash
# Install dependencies
npm install

# Deploy to Cloudflare Workers
npm run deploy
```

Note your deployed Worker URL (something like `https://monzo-balancer.your-subdomain.workers.dev`)

### Step 3: Configure Your Monzo Client

Back in the Monzo Developer Portal, update your client's **Redirect URLs** to point to your deployed Worker:

```
https://monzo-balancer.your-subdomain.workers.dev/oauth/callback
```

Then, update your `wrangler.toml` file with your credentials:

```toml
[vars]
MONZO_CLIENT_ID = "your-client-id-here"
MONZO_REDIRECT_URI = "https://monzo-balancer.your-subdomain.workers.dev/oauth/callback"
```

And set your secret:

```bash
npx wrangler secret put MONZO_CLIENT_SECRET
# Paste your Client Secret when prompted
```

Redeploy:

```bash
npm run deploy
```

### Step 4: Set Up Your Account

1. Visit your Worker URL: `https://monzo-balancer.your-subdomain.workers.dev`
2. Click **"Login with Monzo"**
3. Check your email and approve the login request
4. Select the **Monzo account** you want to balance
5. Select the **Pot** where excess funds should go
6. Enter your **target balance** (e.g., `100.00` to keep £100 in your main account)
7. Optionally enable **Dry Run** to test without moving real money
8. Click **"Save Configuration"**

That's it! The Worker will automatically register a webhook with Monzo and start balancing your account.

## Usage Examples

### Example 1: Daily Spending

- You set your target balance to **£100**
- Your pot starts with **£1,000**
- You spend **£50** on coffee → Balance: £50
- Webhook triggers → Worker deposits £50 from pot → Balance: £100, Pot: £950
- ✅ You're back to target

### Example 2: Excess Income

- You set your target balance to **£100**
- You receive a **£500** payment → Balance: £600
- Webhook triggers → Worker deposits £500 to pot → Balance: £100, Pot: £1,500
- ✅ Excess funds automatically saved

### Example 3: Insufficient Pot

- You set your target balance to **£100**
- Your pot has **£30**
- You spend **£80** → Balance: £20
- Webhook triggers → Worker withdraws all **£30** from pot → Balance: £50
- ⚠️ Balance is still below target (pot was empty), but Worker won't overdraw

## Local Development

To test the Worker locally:

```bash
# Start the development server
npm run dev

# Run tests
npm test
```

Your local Worker will be available at `http://localhost:8787`

## Troubleshooting

### My balance isn't being balanced

**Check dry run is disabled:**

- Visit your Worker setup page and verify **Dry Run** is unchecked
- In Dry Run mode, no money is actually moved (useful for testing)

**Check the logs:**

- Cloudflare Workers logs are visible in the [Cloudflare Dashboard](https://dash.cloudflare.com/)
- Go to Workers → Your Worker → Logs

### Webhook registration failed

The Worker tries to automatically register a webhook with Monzo, but sometimes this fails if your account doesn't have permission. If setup completes but balancing doesn't happen:

1. Go to the [Monzo Developer Portal](https://developers.monzo.com/) → **API Playground**
2. Use the **Register webhook** endpoint (`POST /webhooks`)
3. Fill in:
   - `account_id`: Your Monzo Account ID
   - `url`: Your Worker URL (e.g., `https://monzo-balancer.your-subdomain.workers.dev/`)
4. Click **Send**

### "Approval Required" message

This means your Monzo account doesn't have the required permissions. You may need to enable developer features or contact Monzo support.

### Need to change your target balance?

Currently, you need to re-run the setup flow by visiting your Worker URL and logging in again. Configuration is stored per-account.
