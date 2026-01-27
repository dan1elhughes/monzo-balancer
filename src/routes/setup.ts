import { Context, Hono } from "hono";
import { Env } from "../types";
import { fetchAccountsWithData } from "../services/account-selection";
import { registerWebhookIfNeeded } from "../services/webhook-registration";
import { renderApprovalRequired } from "../views/approval-required";
import { renderAccountSelection } from "../views/account-selection";
import { renderSetupComplete } from "../views/setup-complete";
import { createMonzoClient } from "../services/monzo";
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
		const client = createMonzoClient(env, accessToken, refreshToken);

		const accounts = await fetchAccountsWithData(client);

		const html = renderAccountSelection({
			accessToken,
			refreshToken,
			accounts,
		});

		return new Response(html, {
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	} catch (e) {
		logger.error("Failed to render account selection", e);
		const html = renderApprovalRequired(accessToken, refreshToken);
		return new Response(html, {
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	}
}
