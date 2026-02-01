import { Env, User } from "../types";
import { logger } from "../logger";
import { createMonzoClient, saveTokens } from "../services/monzo";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * Get all users whose tokens expire within the next 12 hours
 */
async function getUsersWithExpiringTokens(env: Env): Promise<User[]> {
	const threshold = Date.now() + TWELVE_HOURS_MS;

	const result = await env.DB.prepare(
		"SELECT * FROM users WHERE token_expires_at <= ?",
	)
		.bind(threshold)
		.all<User>();

	return result.results || [];
}

/**
 * Refresh a user's tokens and save them to the database
 */
async function refreshUserTokens(
	env: Env,
	user: User,
): Promise<{ success: boolean; error?: string }> {
	try {
		// Create client with current tokens
		const client = createMonzoClient(
			env,
			user.access_token,
			user.refresh_token,
		);

		// Perform refresh
		const creds = await client.refresh();

		// Preserve existing refresh_token if not returned
		const newRefreshToken = creds.refresh_token || user.refresh_token;

		// Calculate token expiration. Monzo API returns expires_in in seconds.
		// Default to ~30 hours (108000 seconds) if not provided.
		const expiresInSeconds = creds.expires_in || 108000;
		const tokenExpiresAt = Date.now() + expiresInSeconds * 1000;

		// Save new tokens
		await saveTokens(
			env,
			user.user_id,
			creds.access_token,
			newRefreshToken,
			tokenExpiresAt,
		);

		logger.info("Token refreshed successfully via scheduled job", {
			user_id: user.user_id,
			hasNewRefreshToken: !!creds.refresh_token,
			newExpiresAt: tokenExpiresAt,
		});

		return { success: true };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error("Failed to refresh token via scheduled job", {
			user_id: user.user_id,
			error: errorMessage,
		});
		return { success: false, error: errorMessage };
	}
}

/**
 * Scheduled handler for token refresh cron job
 * Runs hourly and refreshes tokens expiring within the next 12 hours
 */
export async function handleScheduledTokenRefresh(
	event: ScheduledEvent,
	env: Env,
	ctx: ExecutionContext,
): Promise<void> {
	logger.info("Scheduled token refresh job started", {
		scheduledTime: event.scheduledTime,
		cron: event.cron,
	});

	try {
		// Get all users with expiring tokens
		const users = await getUsersWithExpiringTokens(env);

		logger.info("Found users with expiring tokens", {
			count: users.length,
			threshold: new Date(Date.now() + TWELVE_HOURS_MS).toISOString(),
		});

		if (users.length === 0) {
			logger.info("No tokens need refreshing at this time");
			return;
		}

		// Refresh tokens for all users
		const results = await Promise.allSettled(
			users.map((user) => refreshUserTokens(env, user)),
		);

		// Log results
		let successCount = 0;
		let failureCount = 0;

		results.forEach((result, index) => {
			const user = users[index];
			if (result.status === "fulfilled") {
				if (result.value.success) {
					successCount++;
				} else {
					failureCount++;
					logger.error("Token refresh failed for user", {
						user_id: user.user_id,
						error: result.value.error,
					});
				}
			} else {
				failureCount++;
				logger.error("Token refresh promise rejected for user", {
					user_id: user.user_id,
					reason: result.reason,
				});
			}
		});

		logger.info("Scheduled token refresh job completed", {
			totalUsers: users.length,
			successCount,
			failureCount,
		});
	} catch (error) {
		logger.error("Scheduled token refresh job failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		throw error; // Re-throw to mark the scheduled job as failed in Cloudflare logs
	}
}
