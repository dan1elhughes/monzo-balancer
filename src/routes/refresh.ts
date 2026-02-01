import { Context, Hono } from "hono";
import { Env } from "../types";
import { castId } from "@otters/monzo";
import { logger } from "../logger";
import {
	getMonzoConfig,
	saveTokens,
	createMonzoClient,
} from "../services/monzo";

export function registerRefreshRoutes(app: Hono<{ Bindings: Env }>): void {
	app.post("/refresh/:accountId", handleRefresh);
	app.get("/refresh/:accountId", handleRefresh);
}

async function handleRefresh(c: Context<{ Bindings: Env }>): Promise<Response> {
	const env = c.env;
	const accountId = c.req.param("accountId");

	if (!accountId) {
		return c.json(
			{ status: "error", message: "Missing accountId parameter" },
			400,
		);
	}

	logger.info("Token refresh requested", { accountId });

	try {
		// Get current config
		const configData = await getMonzoConfig(env, castId(accountId, "acc"));

		if (!configData) {
			return c.json(
				{
					status: "error",
					message: `No configuration found for account ${accountId}`,
				},
				404,
			);
		}

		// Create client with current tokens
		const appCreds = {
			client_id: castId(env.MONZO_CLIENT_ID, "oauth2client"),
			client_secret: env.MONZO_CLIENT_SECRET,
			redirect_uri: "http://localhost",
		};

		const client = createMonzoClient(
			env,
			configData.access_token,
			configData.refresh_token,
		);

		// Test current token
		let whoamiResult;
		try {
			whoamiResult = await client.whoami();
			logger.info("Current token is valid", {
				authenticated: whoamiResult.authenticated,
				user_id: whoamiResult.user_id,
			});
		} catch (error) {
			logger.warn("Current token is invalid, will attempt refresh", {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		// Perform refresh
		try {
			const creds = await client.refresh();

			// Preserve existing refresh_token if not returned
			const newRefreshToken = creds.refresh_token || configData.refresh_token;

			// Save new tokens
			await saveTokens(
				env,
				configData.user_id,
				creds.access_token,
				newRefreshToken,
			);

			logger.info("Token refreshed and saved successfully", {
				userId: configData.user_id,
				hasNewRefreshToken: !!creds.refresh_token,
			});

			return c.json({
				status: "success",
				message: "Token refreshed successfully",
				data: {
					user_id: configData.user_id,
					account_id: accountId,
					previous_token_valid: !!whoamiResult,
					new_access_token_preview: `${creds.access_token.slice(0, 10)}...`,
					refresh_token_updated: !!creds.refresh_token,
				},
			});
		} catch (refreshError) {
			logger.error(
				"Token refresh failed",
				refreshError instanceof Error
					? { message: refreshError.message }
					: refreshError,
			);

			// Try to extract more details from the error
			let errorDetails = "Unknown error";
			if (refreshError instanceof Error) {
				errorDetails = refreshError.message;
			}

			return c.json(
				{
					status: "error",
					message: "Token refresh failed",
					error: errorDetails,
				},
				500,
			);
		}
	} catch (e) {
		logger.error("Refresh handler failed", e);
		return c.json(
			{
				status: "error",
				message: "Internal server error",
				error: e instanceof Error ? e.message : String(e),
			},
			500,
		);
	}
}
