import { Context, Hono } from "hono";
import { Env } from "../types";
import { fetchAccountsWithData } from "../services/account-selection";
import { registerWebhookIfNeeded } from "../services/webhook-registration";
import { createMonzoAccountForUser } from "../services/user.service";
import { ApprovalRequired } from "../views/approval-required";
import { AccountSelection } from "../views/account-selection";
import { SetupComplete } from "../views/setup-complete";
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
	const userId = formData.get("userId") as string;

	if (!accessToken || !refreshToken || !userId) {
		return c.text("Missing tokens or user ID", 400);
	}

	return renderAccountSelectionPage(
		c,
		c.env,
		accessToken,
		refreshToken,
		userId,
	);
}

async function handleSetupFinish(
	c: Context<{ Bindings: Env }>,
): Promise<Response> {
	const env = c.env;
	const formData = await c.req.formData();

	const accessToken = formData.get("access_token") as string;
	const refreshToken = formData.get("refresh_token") as string;
	const userId = formData.get("userId") as string;
	const accountId = formData.get("accountId") as string;
	const potId = formData.get("potId") as string;
	const targetBalance = formData.get("targetBalance") as string;
	const dryRun = formData.get("dryRun") === "true";

	if (
		!accessToken ||
		!refreshToken ||
		!userId ||
		!accountId ||
		!potId ||
		!targetBalance
	) {
		return c.text("Missing required fields", 400);
	}

	try {
		// Register webhook
		const webhookUrl = `${new URL(c.req.url).origin}/`;
		await registerWebhookIfNeeded(accountId, webhookUrl, accessToken);

		// Create Monzo account for user (tokens are already stored at user level)
		const targetBalancePennies = Math.round(parseFloat(targetBalance) * 100);
		await createMonzoAccountForUser(env, userId, {
			monzo_account_id: accountId,
			monzo_pot_id: potId,
			target_balance: targetBalancePennies,
			dry_run: dryRun,
		});

		return c.html(<SetupComplete />);
	} catch (e) {
		logger.error("Setup finish failed", e);
		return c.text("Setup failed", 500);
	}
}

async function renderAccountSelectionPage(
	c: Context<{ Bindings: Env }>,
	env: Env,
	accessToken: string,
	refreshToken: string,
	userId: string,
): Promise<Response> {
	try {
		const client = createMonzoClient(env, accessToken, refreshToken);

		const accounts = await fetchAccountsWithData(client);

		return c.html(
			<AccountSelection
				accessToken={accessToken}
				refreshToken={refreshToken}
				userId={userId}
				accounts={accounts}
			/>,
		);
	} catch (e) {
		logger.error("Failed to render account selection", e);
		return c.html(
			<ApprovalRequired
				accessToken={accessToken}
				refreshToken={refreshToken}
				userId={userId}
			/>,
		);
	}
}
