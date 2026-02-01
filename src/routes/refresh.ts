import { Context, Hono } from "hono";
import { Env } from "../types";
import { castId } from "@otters/monzo";
import { logger } from "../logger";
import { getUserById } from "../services/user.service";
import { createMonzoClient } from "../services/monzo";

export function registerRefreshRoutes(app: Hono<{ Bindings: Env }>): void {
	app.post("/refresh/:userId", handleRefresh);
	app.get("/refresh/:userId", handleRefresh);
}

async function handleRefresh(c: Context<{ Bindings: Env }>): Promise<Response> {
	const env = c.env;
	const userId = c.req.param("userId");

	if (!userId) {
		return c.json(
			{ status: "error", message: "Missing userId parameter" },
			400,
		);
	}

	logger.info("Token refresh requested", { userId });

	try {
		// Get user with tokens directly
		const user = await getUserById(env, userId);

		if (!user) {
			return c.json(
				{
					status: "error",
					message: `No user found with id ${userId}`,
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
			user.access_token,
			user.refresh_token,
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
			const newRefreshToken = creds.refresh_token || user.refresh_token;

			// Calculate token expiration. Monzo API returns expires_in in seconds.
			// Default to ~30 hours (108000 seconds) if not provided.
			const expiresInSeconds = creds.expires_in || 108000;
			const tokenExpiresAt = Date.now() + expiresInSeconds * 1000;

			// Save new tokens
			await saveUserTokens(
				env,
				userId,
				creds.access_token,
				newRefreshToken,
				tokenExpiresAt,
			);

			logger.info("Token refreshed and saved successfully", {
				userId,
				hasNewRefreshToken: !!creds.refresh_token,
			});

			return c.json({
				status: "success",
				message: "Token refreshed successfully",
				data: {
					user_id: userId,
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

/**
 * Save refreshed tokens to database (user level)
 */
async function saveUserTokens(
	env: Env,
	userId: string,
	accessToken: string,
	refreshToken: string,
	tokenExpiresAt: number,
) {
	const stmt = env.DB.prepare(
		"UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = ? WHERE user_id = ?",
	).bind(accessToken, refreshToken, tokenExpiresAt, Date.now(), userId);
	await stmt.run();
}
