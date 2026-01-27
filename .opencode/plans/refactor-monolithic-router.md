# Refactoring Plan: Monolithic Router to Modular Architecture

**Created**: 2026-01-27  
**Status**: PENDING  
**Priority**: Medium  
**Estimated Effort**: 1-2 days

---

## Executive Summary

The current `src/index.ts` file contains 389 lines with all route handling, OAuth logic, HTML rendering, and webhook processing mixed together. This plan outlines a comprehensive refactoring to extract these concerns into a modular, maintainable architecture using Hono as the router framework.

### Current Problems

- **Mixed Concerns**: Routing, OAuth, HTML rendering, and business logic all in one file
- **Difficult to Maintain**: Hard to locate and modify specific functionality
- **Limited Testability**: Business logic is tightly coupled to HTTP handlers
- **Hard to Extend**: Adding new routes or features requires modifying a large file
- **Presentation Logic**: HTML templates are embedded as strings in function bodies

### End Goal

- Clean separation of concerns across multiple focused files
- Proper routing system replacing the if-then chain
- Reusable services with testable business logic
- Easy to understand, maintain, and extend codebase

---

## Current State Analysis

### File Structure

```
src/
├── index.ts           (389 lines - MONOLITHIC)
├── types.ts           (18 lines - ✓ Good)
├── logger.ts          (exists)
├── monzo.ts           (120 lines - ✓ Good separation)
└── balancer.ts        (101 lines - ✓ Good separation)
```

### Current Route Handling (index.ts lines 15-35)

```typescript
if (url.pathname === "/login" && request.method === "GET") { ... }
if (url.pathname === "/oauth/callback" && request.method === "GET") { ... }
if (url.pathname === "/setup/finish" && request.method === "POST") { ... }
if (url.pathname === "/setup/continue" && request.method === "POST") { ... }
if (url.pathname === "/" && request.method === "POST") { ... }
```

### Issues with Current Routing

- Sequential if-then checks are inefficient
- No middleware support
- No request parameter validation
- Difficult to add new routes
- Hard to test routes in isolation

### Code Distribution in index.ts

- **Lines 1-37**: Router/entry point (if-then chain)
- **Lines 39-55**: `handleLogin()` function
- **Lines 57-106**: `handleCallback()` function + OAuth token exchange
- **Lines 108-121**: `handleSetupContinue()` function
- **Lines 123-258**: `renderAccountSelection()` function (150 lines of logic + HTML)
- **Lines 260-334**: `handleSetupFinish()` function + webhook registration
- **Lines 336-388**: `handleWebhook()` function

---

## Proposed New Architecture

### Directory Structure

```
src/
├── index.ts                      # Entry point (30 lines) - App initialization
├── types.ts                      # (keep as is)
├── logger.ts                     # (keep as is)
├── monzo.ts                      # (keep as is)
├── balancer.ts                   # (keep as is)
├── routes/
│   ├── auth.ts                   # OAuth routes (/login, /oauth/callback)
│   ├── setup.ts                  # Setup routes (/setup/continue, /setup/finish)
│   └── webhook.ts                # Webhook handler (POST /)
├── services/
│   ├── oauth.service.ts          # OAuth token exchange logic
│   ├── webhook-registration.ts   # Webhook registration logic
│   └── account-selection.ts      # Account/pot selection logic
└── views/
    ├── approval-required.ts      # HTML template for approval page
    ├── account-selection.ts      # HTML template for account selection form
    └── setup-complete.ts         # HTML template for completion message
```

### Router Framework Choice: Hono

**Why Hono?**

- ✓ Lightweight and fast (designed for Cloudflare Workers)
- ✓ Excellent TypeScript support
- ✓ Built-in middleware system
- ✓ Cleaner API than alternatives
- ✓ Good error handling
- ✓ Popular in Workers ecosystem
- ✓ No breaking changes expected with your existing code

**Alternative Options Considered**:

- **itty-router**: Simpler but fewer features
- **Custom Router**: More control but more work to maintain
- **Oak/Deno**: Wrong platform, not suitable for Workers

---

## Refactoring Phases

### Phase 1: Infrastructure Setup (Low Risk)

**Duration**: 30-45 minutes  
**Changes**: Dependencies and structure only, no logic changes

#### Step 1.1: Add Hono Dependency

```bash
npm install hono
```

- Add to `package.json` dependencies
- No code changes yet

#### Step 1.2: Create Directory Structure

Create empty directories:

- `src/routes/`
- `src/services/`
- `src/views/`

**Verification**: Run `ls -la src/` to confirm structure

---

### Phase 2: Extract View Templates (Zero Logic Changes)

**Duration**: 1-2 hours  
**Changes**: Pure string extraction, no logic modification

#### Step 2.1: Extract "Approval Required" HTML

**Source**: `index.ts` lines 146-164  
**Create**: `src/views/approval-required.ts`

```typescript
export function renderApprovalRequired(
	accessToken: string,
	refreshToken: string,
): string {
	return `
    <html>
      <body>
        <h1>Action Required</h1>
        <p>Please check your Monzo app to approve access for this application.</p>
        <p>Once approved, click the button below.</p>
        <form action="/setup/continue" method="POST">
          <input type="hidden" name="access_token" value="${accessToken}" />
          <input type="hidden" name="refresh_token" value="${refreshToken}" />
          <button type="submit">I've Approved Access</button>
        </form>
      </body>
    </html>
  `;
}
```

**Testing**: Ensure whitespace/formatting is identical to original

#### Step 2.2: Extract Account Selection HTML

**Source**: `index.ts` lines 204-257  
**Create**: `src/views/account-selection.ts`

```typescript
export interface AccountSelectionInput {
	accessToken: string;
	refreshToken: string;
	accountsHtml: string;
	potsHtml: string;
}

export function renderAccountSelection(input: AccountSelectionInput): string {
	const { accessToken, refreshToken, accountsHtml, potsHtml } = input;
	return `
    <html>
      <head>
        <title>Monzo Balancer Setup</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
          .form-group { margin-bottom: 1rem; }
          label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
          select, input { width: 100%; padding: 0.5rem; font-size: 1rem; }
          button { padding: 0.75rem 1.5rem; background: #2D3E50; color: white; border: none; font-size: 1rem; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>Configure Monzo Balancer</h1>
        <form action="/setup/finish" method="POST">
          <input type="hidden" name="access_token" value="${accessToken}" />
          <input type="hidden" name="refresh_token" value="${refreshToken}" />

          <div class="form-group">
            <label for="accountId">Select Account</label>
            <select name="accountId" id="accountId" required>
              ${accountsHtml}
            </select>
          </div>

          <div class="form-group">
            <label for="potId">Select Pot</label>
            <select name="potId" id="potId" required>
              ${potsHtml}
            </select>
          </div>

          <div class="form-group">
            <label for="targetBalance">Target Balance (£)</label>
            <input type="number" name="targetBalance" id="targetBalance" required min="0" step="0.01" placeholder="e.g. 10.00" />
          </div>

          <div class="form-group">
            <label style="font-weight: normal; display: flex; align-items: center; gap: 0.5rem;">
              <input type="checkbox" name="dryRun" id="dryRun" value="true" style="width: auto;" />
              <span>Dry Run Mode (Simulate only - no money moved)</span>
            </label>
          </div>

          <button type="submit">Save Configuration</button>
        </form>
      </body>
    </html>
  `;
}
```

**Testing**: Compare rendered output character-for-character with original

#### Step 2.3: Extract Setup Complete HTML

**Source**: `index.ts` line 333  
**Create**: `src/views/setup-complete.ts`

```typescript
export function renderSetupComplete(): string {
	return "Account setup complete!";
}
```

**Testing**: Verify response text matches

---

### Phase 3: Extract Services (Testable Business Logic)

**Duration**: 2-3 hours  
**Changes**: Pure logic extraction, behavior unchanged

#### Step 3.1: Create OAuth Service

**Create**: `src/services/oauth.service.ts`

Extract from `index.ts`:

- Lines 40-46: State creation and storage
- Lines 48-54: Auth URL building
- Lines 68-80: State validation logic
- Lines 83-105: Token exchange logic

```typescript
import { Env } from "../types";
import { logger } from "../logger";

export async function createOAuthState(env: Env): Promise<string> {
	const state = crypto.randomUUID();
	await env.DB.prepare(
		"INSERT INTO oauth_states (state, created_at) VALUES (?, ?)",
	)
		.bind(state, Date.now())
		.run();
	return state;
}

export function buildAuthUrl(
	state: string,
	clientId: string,
	redirectUri: string,
): URL {
	const authUrl = new URL("https://auth.monzo.com/");
	authUrl.searchParams.set("client_id", clientId);
	authUrl.searchParams.set("redirect_uri", redirectUri);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("state", state);
	return authUrl;
}

export async function validateOAuthState(
	env: Env,
	state: string,
): Promise<boolean> {
	const storedState = await env.DB.prepare(
		"SELECT state FROM oauth_states WHERE state = ?",
	)
		.bind(state)
		.first();

	if (!storedState) {
		return false;
	}

	await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?")
		.bind(state)
		.run();

	return true;
}

export async function exchangeCodeForTokens(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string,
): Promise<{ access_token: string; refresh_token: string }> {
	const params = new URLSearchParams();
	params.append("grant_type", "authorization_code");
	params.append("client_id", clientId);
	params.append("client_secret", clientSecret);
	params.append("redirect_uri", redirectUri);
	params.append("code", code);

	const response = await fetch("https://api.monzo.com/oauth2/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: params,
	});

	if (!response.ok) {
		const text = await response.text();
		logger.error("Failed to exchange token", { text });
		throw new Error(`Failed to exchange token: ${text}`);
	}

	const tokenData = (await response.json()) as any;
	return {
		access_token: tokenData.access_token,
		refresh_token: tokenData.refresh_token,
	};
}
```

**Testing Strategy**:

- Mock Fetch API for token exchange
- Verify state creation and validation
- Test error cases

#### Step 3.2: Create Account Selection Service

**Create**: `src/services/account-selection.ts`

Extract from `index.ts` lines 168-202:

```typescript
import { MonzoAPI } from "@otters/monzo";
import { logger } from "../logger";

export interface AccountWithData {
	id: string;
	description: string;
	type: string;
	pots: any[];
	balance: any;
}

export async function fetchAccountsWithData(
	client: MonzoAPI,
): Promise<AccountWithData[]> {
	logger.info("Fetching accounts...");
	let accounts;
	try {
		accounts = await client.getAccounts();
		logger.info("Accounts fetched successfully", { count: accounts.length });
	} catch (e) {
		logger.error("Failed to fetch accounts", e);
		throw e;
	}

	// Fetch pots and balances for all accounts
	const accountsWithData = await Promise.all(
		accounts.map(async (acc) => {
			try {
				const [pots, balance] = await Promise.all([
					client.getPots(acc.id),
					client.getBalance(acc.id).catch((e) => {
						logger.error(`Failed to fetch balance for account ${acc.id}`, e);
						return { balance: 0, currency: "GBP" };
					}),
				]);
				return { ...acc, pots, balance: balance as any };
			} catch (e) {
				logger.error(`Failed to fetch data for account ${acc.id}`, e);
				return { ...acc, pots: [], balance: { balance: 0, currency: "GBP" } };
			}
		}),
	);

	return accountsWithData;
}

export function buildAccountsHtml(accounts: AccountWithData[]): string {
	return accounts
		.map((acc) => {
			const balance = (acc.balance.balance / 100).toFixed(2);
			return `<option value="${acc.id}">${acc.description} (${acc.type}, £${balance})</option>`;
		})
		.join("");
}

export function buildPotsHtml(accounts: AccountWithData[]): string {
	return accounts
		.flatMap((acc) =>
			acc.pots
				.filter((pot: any) => !pot.deleted)
				.map((pot: any) => {
					const balance = (pot.balance / 100).toFixed(2);
					return `<option value="${pot.id}">${pot.name} (${acc.description}, £${balance})</option>`;
				}),
		)
		.join("");
}
```

**Testing Strategy**:

- Mock MonzoAPI for account fetching
- Test HTML generation
- Test error handling

#### Step 3.3: Create Webhook Registration Service

**Create**: `src/services/webhook-registration.ts`

Extract from `index.ts` lines 282-315:

```typescript
import { logger } from "../logger";

export async function getExistingWebhooks(
	accountId: string,
	accessToken: string,
): Promise<{ id: string; url: string; account_id: string }[]> {
	const response = await fetch(
		`https://api.monzo.com/webhooks?account_id=${accountId}`,
		{
			headers: { Authorization: `Bearer ${accessToken}` },
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch webhooks: ${response.statusText}`);
	}

	const { webhooks } = (await response.json()) as {
		webhooks: { id: string; url: string; account_id: string }[];
	};

	return webhooks;
}

export async function registerWebhookIfNeeded(
	accountId: string,
	webhookUrl: string,
	accessToken: string,
): Promise<void> {
	try {
		const existingWebhooks = await getExistingWebhooks(accountId, accessToken);
		const webhookExists = existingWebhooks.some((w) => w.url === webhookUrl);

		if (!webhookExists) {
			logger.info("Registering new webhook...");
			const response = await fetch("https://api.monzo.com/webhooks", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Authorization: `Bearer ${accessToken}`,
				},
				body: new URLSearchParams({ account_id: accountId, url: webhookUrl }),
			});

			if (!response.ok) {
				throw new Error(`Failed to register webhook: ${response.statusText}`);
			}
		} else {
			logger.info("Webhook already registered");
		}
	} catch (e) {
		logger.error("Failed to register webhook", e);
		// Continue anyway, we can try again later or it might exist
	}
}
```

**Testing Strategy**:

- Mock fetch for webhook API
- Test webhook existence check
- Test new webhook registration
- Test error recovery

---

### Phase 4: Create Route Handlers (Main Refactoring)

**Duration**: 2-3 hours  
**Changes**: Move handlers to new files, use extracted services

#### Step 4.1: Create Auth Routes

**Create**: `src/routes/auth.ts`

Contains:

- `handleLogin()` from `index.ts` lines 39-55
- `handleCallback()` from `index.ts` lines 57-106

```typescript
import { Context, Hono } from "hono";
import { Env } from "../types";
import {
	createOAuthState,
	buildAuthUrl,
	validateOAuthState,
	exchangeCodeForTokens,
} from "../services/oauth.service";
import {
	fetchAccountsWithData,
	buildAccountsHtml,
	buildPotsHtml,
} from "../services/account-selection";
import { renderApprovalRequired } from "../views/approval-required";
import { renderAccountSelection } from "../views/account-selection";
import { MonzoAPI, castId } from "@otters/monzo";
import { logger } from "../logger";

export function registerAuthRoutes(app: Hono<{ Bindings: Env }>): void {
	app.get("/login", handleLogin);
	app.get("/oauth/callback", handleCallback);
}

async function handleLogin(c: Context<{ Bindings: Env }>): Promise<Response> {
	const env = c.env;

	try {
		const state = await createOAuthState(env);
		const authUrl = buildAuthUrl(
			state,
			env.MONZO_CLIENT_ID,
			env.MONZO_REDIRECT_URI,
		);

		return c.redirect(authUrl.toString(), 302);
	} catch (e) {
		logger.error("Login failed", e);
		return c.text("Login failed", 500);
	}
}

async function handleCallback(
	c: Context<{ Bindings: Env }>,
): Promise<Response> {
	const env = c.env;
	const url = new URL(c.req.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");

	if (!code || !state) {
		return c.text("Missing code or state query parameter", 400);
	}

	try {
		const isValidState = await validateOAuthState(env, state);
		if (!isValidState) {
			return c.text("Invalid state parameter", 400);
		}

		const { access_token, refresh_token } = await exchangeCodeForTokens(
			code,
			env.MONZO_CLIENT_ID,
			env.MONZO_CLIENT_SECRET,
			env.MONZO_REDIRECT_URI,
		);

		return renderAccountSelectionPage(env, access_token, refresh_token);
	} catch (e) {
		logger.error("OAuth callback failed", e);
		return c.text("OAuth callback failed", 500);
	}
}

async function renderAccountSelectionPage(
	env: Env,
	accessToken: string,
	refreshToken: string,
): Promise<Response> {
	try {
		const client = new MonzoAPI(
			{ access_token: accessToken, refresh_token: refreshToken },
			{
				client_id: castId(env.MONZO_CLIENT_ID, "oauth2client"),
				client_secret: env.MONZO_CLIENT_SECRET,
				redirect_uri: env.MONZO_REDIRECT_URI,
			},
		);

		const accounts = await fetchAccountsWithData(client);
		const accountsHtml = buildAccountsHtml(accounts);
		const potsHtml = buildPotsHtml(accounts);

		const html = renderAccountSelection({
			accessToken,
			refreshToken,
			accountsHtml,
			potsHtml,
		});

		return new Response(html, {
			headers: { "Content-Type": "text/html" },
		});
	} catch (e) {
		logger.error("Failed to render account selection", e);
		const html = renderApprovalRequired(accessToken, refreshToken);
		return new Response(html, {
			headers: { "Content-Type": "text/html" },
		});
	}
}
```

**Testing Strategy**:

- Mock OAuth service functions
- Test redirect behavior
- Test error cases

#### Step 4.2: Create Setup Routes

**Create**: `src/routes/setup.ts`

Contains:

- `handleSetupContinue()` from `index.ts` lines 108-121
- `handleSetupFinish()` from `index.ts` lines 260-334

```typescript
import { Context, Hono } from "hono";
import { Env } from "../types";
import {
	fetchAccountsWithData,
	buildAccountsHtml,
	buildPotsHtml,
} from "../services/account-selection";
import { registerWebhookIfNeeded } from "../services/webhook-registration";
import { renderApprovalRequired } from "../views/approval-required";
import { renderAccountSelection } from "../views/account-selection";
import { renderSetupComplete } from "../views/setup-complete";
import { MonzoAPI, castId } from "@otters/monzo";
import { logger } from "../logger";

export function registerSetupRoutes(app: Hono<{ Bindings: Env }>): void {
	app.post("/setup/continue", handleSetupContinue);
	app.post("/setup/finish", handleSetupFinish);
}

async function handleSetupContinue(
	c: Context<{ Bindings: Env }>,
): Promise<Response> {
	const formData = await c.req.formData();
	const accessToken = formData.get("access_token") as string;
	const refreshToken = formData.get("refresh_token") as string;

	if (!accessToken || !refreshToken) {
		return c.text("Missing tokens", 400);
	}

	return renderAccountSelectionPage(c.env, accessToken, refreshToken);
}

async function handleSetupFinish(
	c: Context<{ Bindings: Env }>,
): Promise<Response> {
	const env = c.env;
	const formData = await c.req.formData();

	const accessToken = formData.get("access_token") as string;
	const refreshToken = formData.get("refresh_token") as string;
	const accountId = formData.get("accountId") as string;
	const potId = formData.get("potId") as string;
	const targetBalance = formData.get("targetBalance") as string;
	const dryRun = formData.get("dryRun") === "true";

	if (!accessToken || !refreshToken || !accountId || !potId || !targetBalance) {
		return c.text("Missing required fields", 400);
	}

	try {
		// Register webhook
		const webhookUrl = `${new URL(c.req.url).origin}/`;
		await registerWebhookIfNeeded(accountId, webhookUrl, accessToken);

		// Save to D1
		const stmt = env.DB.prepare(
			`INSERT OR REPLACE INTO accounts (monzo_account_id, monzo_pot_id, target_balance, access_token, refresh_token, created_at, updated_at, dry_run)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		).bind(
			accountId,
			potId,
			Math.round(parseFloat(targetBalance) * 100),
			accessToken,
			refreshToken,
			Date.now(),
			Date.now(),
			dryRun ? 1 : 0,
		);
		await stmt.run();

		const html = renderSetupComplete();
		return c.text(html);
	} catch (e) {
		logger.error("Setup finish failed", e);
		return c.text("Setup failed", 500);
	}
}

async function renderAccountSelectionPage(
	env: Env,
	accessToken: string,
	refreshToken: string,
): Promise<Response> {
	try {
		const client = new MonzoAPI(
			{ access_token: accessToken, refresh_token: refreshToken },
			{
				client_id: castId(env.MONZO_CLIENT_ID, "oauth2client"),
				client_secret: env.MONZO_CLIENT_SECRET,
				redirect_uri: env.MONZO_REDIRECT_URI,
			},
		);

		const accounts = await fetchAccountsWithData(client);
		const accountsHtml = buildAccountsHtml(accounts);
		const potsHtml = buildPotsHtml(accounts);

		const html = renderAccountSelection({
			accessToken,
			refreshToken,
			accountsHtml,
			potsHtml,
		});

		return new Response(html, {
			headers: { "Content-Type": "text/html" },
		});
	} catch (e) {
		logger.error("Failed to render account selection", e);
		const html = renderApprovalRequired(accessToken, refreshToken);
		return new Response(html, {
			headers: { "Content-Type": "text/html" },
		});
	}
}
```

**Testing Strategy**:

- Mock form data parsing
- Test database operations
- Test error handling

#### Step 4.3: Create Webhook Route

**Create**: `src/routes/webhook.ts`

Contains:

- `handleWebhook()` from `index.ts` lines 336-388

```typescript
import { Context, Hono } from "hono";
import { Env } from "../types";
import { withMonzoClient } from "../monzo";
import { balanceAccount } from "../balancer";
import { logger } from "../logger";
import { castId } from "@otters/monzo";

export function registerWebhookRoutes(app: Hono<{ Bindings: Env }>): void {
	app.post("/", handleWebhook);
}

async function handleWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
	const env = c.env;

	try {
		const body = await c.req.json();

		if (body.type !== "transaction.created") {
			return c.text("Ignored event type", 200);
		}

		logger.info(`Received ${body.type} event`, { body });

		const accountId = body.data?.account_id;
		const transactionId = body.data?.id;
		const description = body.data?.description;
		const potId = body.data?.metadata?.pot_id;

		if (!accountId) {
			logger.error("Missing account_id in webhook body");
			return c.text("Bad Request: Missing account_id", 400);
		}

		await withMonzoClient(
			env,
			castId(accountId, "acc"),
			async (client, config) => {
				if (
					description === config.monzo_pot_id ||
					potId === config.monzo_pot_id
				) {
					logger.info("Ignoring transaction related to managed pot", {
						potId: config.monzo_pot_id,
					});
					return;
				}

				await balanceAccount(client, config, transactionId);
			},
		);

		return c.text("OK", 200);
	} catch (e) {
		logger.error("Webhook handling failed", e);
		return c.text("Internal Server Error", 500);
	}
}
```

**Testing Strategy**:

- Mock webhook payloads
- Test event filtering
- Test error handling

---

### Phase 5: Update index.ts (Router Integration)

**Duration**: 30-45 minutes  
**Changes**: Replace fetch handler with Hono app initialization

#### Step 5.1: Rewrite index.ts

**New file** (~30 lines):

```typescript
import { Hono } from "hono";
import { Env } from "./types";
import { registerAuthRoutes } from "./routes/auth";
import { registerSetupRoutes } from "./routes/setup";
import { registerWebhookRoutes } from "./routes/webhook";

const app = new Hono<{ Bindings: Env }>();

// Register all routes
registerAuthRoutes(app);
registerSetupRoutes(app);
registerWebhookRoutes(app);

// Handle 404s
app.notFound((c) => c.text("Not Found", 404));

export default app;
```

**Verification**:

- File should be ~30 lines (reduced from 389)
- All routes should be registered
- App should export as default

---

### Phase 6: Testing & Validation

**Duration**: 1-2 hours  
**Changes**: Run tests, verify functionality

#### Step 6.1: Run Tests

```bash
npm test
```

Verify:

- All existing tests pass
- No new errors introduced
- Type checking is clean

#### Step 6.2: Manual Testing

Test all flows:

1. Login flow: `/login` → OAuth callback
2. Setup flow: Account selection → webhook registration
3. Webhook handling: POST `/` with transaction event

#### Step 6.3: Code Review Checklist

- [ ] All routes are accessible
- [ ] Error handling is consistent
- [ ] No logic has changed (behavior is identical)
- [ ] TypeScript has no errors
- [ ] File organization is logical
- [ ] No sensitive data in logs

---

## Optional Phase 7: Enhancements (Post-Refactoring)

**Duration**: 2-4 hours (optional)  
**Changes**: Add improvements enabled by new architecture

### Potential Enhancements

#### Error Handling Middleware

```typescript
app.onError((err, c) => {
	logger.error("Unhandled error", err);
	return c.text("Internal Server Error", 500);
});
```

#### Input Validation Middleware

- Validate form data schema
- Validate webhook payloads
- Type-safe query parameter extraction

#### Configuration File

Create `src/config.ts` for constants:

```typescript
export const OAUTH_ENDPOINTS = {
	AUTH_URL: "https://auth.monzo.com/",
	TOKEN_URL: "https://api.monzo.com/oauth2/token",
	WEBHOOKS_URL: "https://api.monzo.com/webhooks",
};
```

#### Request/Response Logging

Add middleware to log all requests/responses for debugging

#### Rate Limiting

Add rate limiting for OAuth and webhook endpoints

---

## File-by-File Checklist

### Files to Create

- [ ] `src/routes/auth.ts` - OAuth routes
- [ ] `src/routes/setup.ts` - Setup routes
- [ ] `src/routes/webhook.ts` - Webhook route
- [ ] `src/services/oauth.service.ts` - OAuth logic
- [ ] `src/services/webhook-registration.ts` - Webhook registration logic
- [ ] `src/services/account-selection.ts` - Account selection logic
- [ ] `src/views/approval-required.ts` - Approval required HTML
- [ ] `src/views/account-selection.ts` - Account selection HTML
- [ ] `src/views/setup-complete.ts` - Setup complete HTML

### Files to Modify

- [ ] `src/index.ts` - Rewrite as Hono app
- [ ] `package.json` - Add Hono dependency

### Files to Keep Unchanged

- [ ] `src/types.ts` - No changes needed
- [ ] `src/logger.ts` - No changes needed
- [ ] `src/monzo.ts` - No changes needed
- [ ] `src/balancer.ts` - No changes needed
- [ ] `tests/` - Update if needed, but logic doesn't change

---

## Key Implementation Details

### TypeScript Configuration

Ensure all files have proper TypeScript types:

- All functions should have explicit return types
- Use `Context<{ Bindings: Env }>` for Hono context
- Export types from `types.ts` for reuse

### Error Handling Strategy

1. **Service Layer**: Throw errors with descriptive messages
2. **Route Layer**: Catch and log errors, return appropriate HTTP status
3. **Client Layer**: Parse HTTP responses, validate before use

### Database Operations

- All D1 queries should handle errors gracefully
- Use prepared statements (already doing this)
- Log all database operations for debugging

### Monzo API Integration

- Existing `monzo.ts` and `balancer.ts` already have good error handling
- No changes needed to these files
- Services should use these existing utilities

### HTML Rendering

- Templates should accept all data as parameters
- No global state in view functions
- Easy to replace with proper templating engine later if needed

---

## Risk Assessment

### Low Risk

- ✓ Pure extraction (no logic changes)
- ✓ Routes are isolated
- ✓ Services can be tested independently
- ✓ Can roll back easily (old `index.ts` is still there)

### Mitigation Strategies

1. **Incremental Changes**: Do one phase at a time
2. **Testing**: Run tests after each phase
3. **Git Commits**: One commit per phase for easy rollback
4. **Code Review**: Review changes before finalizing

---

## Success Criteria

✅ **Code Organization**

- [ ] Each file has a single responsibility
- [ ] Related logic is grouped together
- [ ] File names are descriptive

✅ **Maintainability**

- [ ] Easy to find specific functionality
- [ ] Easy to modify/extend features
- [ ] Clear naming conventions

✅ **Testability**

- [ ] Services can be unit tested
- [ ] Routes can be integration tested
- [ ] No tightly coupled logic

✅ **Performance**

- [ ] No performance degradation
- [ ] Hono overhead is negligible
- [ ] All requests complete in same time

✅ **Functionality**

- [ ] All existing features work identically
- [ ] All tests pass
- [ ] No user-facing changes

---

## Rollback Plan

If issues occur at any phase:

1. **Phase 1 (Infrastructure)**: Delete new directories, no code changes needed
2. **Phase 2 (Views)**: Delete view files, revert to inline HTML in handlers
3. **Phase 3 (Services)**: Delete service files, inline logic back into handlers
4. **Phase 4 (Routes)**: Delete route files, revert index.ts to if-then chain
5. **Phase 5 (Router)**: Revert index.ts to original fetch handler, remove Hono

**Git Rollback**: `git reset --hard HEAD~N` (where N is number of commits to rollback)

---

## Questions for Clarification

Before implementation begins, consider:

1. **Router Choice**: Is Hono acceptable? Any preference for alternative?
2. **Testing**: Should we add unit tests for services during Phase 3?
3. **Enhancements**: Should Phase 7 (optional enhancements) be included?
4. **Timeline**: Can this be done in one session or split across multiple?
5. **Deployment**: Should we deploy after refactoring, or create a PR first?

---

## Timeline Summary

| Phase                   | Duration     | Complexity |
| ----------------------- | ------------ | ---------- |
| 1. Infrastructure       | 30-45 min    | Low        |
| 2. View Templates       | 1-2 hrs      | Low        |
| 3. Services             | 2-3 hrs      | Medium     |
| 4. Routes               | 2-3 hrs      | Medium     |
| 5. Router Integration   | 30-45 min    | Low        |
| 6. Testing & Validation | 1-2 hrs      | Medium     |
| 7. Enhancements (opt.)  | 2-4 hrs      | Low-Medium |
| **Total**               | **1-2 days** | -          |

---

## Status Log

- **Created**: 2026-01-27
- **Status**: PENDING IMPLEMENTATION
- **Last Updated**: 2026-01-27

---

## Notes

- This plan assumes no breaking changes are needed for existing functionality
- All extracted code should have identical behavior to original
- The refactoring is backward compatible
- No changes to deployment or environment setup needed
- After refactoring, the codebase will be much easier to maintain and extend
