import { Context, Hono } from "hono";
import { Env } from "../types";
import {
	createOAuthState,
	buildAuthUrl,
	validateOAuthState,
	exchangeCodeForTokens,
} from "../services/oauth.service";
import { fetchAccountsWithData } from "../services/account-selection";
import { ApprovalRequired } from "../views/approval-required";
import { AccountSelection } from "../views/account-selection";
import { createMonzoClient } from "../services/monzo";
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

		return renderAccountSelectionPage(c, env, access_token, refresh_token);
	} catch (e) {
		logger.error("OAuth callback failed", e);
		return c.text("OAuth callback failed", 500);
	}
}

async function renderAccountSelectionPage(
	c: Context<{ Bindings: Env }>,
	env: Env,
	accessToken: string,
	refreshToken: string,
): Promise<Response> {
	try {
		const client = createMonzoClient(env, accessToken, refreshToken);

		const accounts = await fetchAccountsWithData(client);

		return c.html(
			<AccountSelection
				accessToken={accessToken}
				refreshToken={refreshToken}
				accounts={accounts}
			/>,
		);
	} catch (e) {
		logger.error("Failed to render account selection", e);
		return c.html(
			<ApprovalRequired
				accessToken={accessToken}
				refreshToken={refreshToken}
			/>,
		);
	}
}
