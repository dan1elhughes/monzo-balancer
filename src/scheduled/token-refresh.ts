import { Env, User } from "../types";
import { logger } from "../logger";
import { createMonzoClient } from "../services/monzo";
import { checkUserAccess } from "../services/access-checks";
import { refreshMonzoUser } from "../services/token-refresh";
import { flushPendingAccessAlerts } from "../services/access-alerts";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

export async function handleScheduledTokenRefresh(
	event: ScheduledEvent,
	env: Env,
	_ctx: ExecutionContext,
): Promise<void> {
	logger.info("Scheduled Monzo access monitoring started", {
		scheduledTime: event.scheduledTime,
		cron: event.cron,
	});
	const users = await env.DB.prepare(
		`SELECT u.* FROM users u WHERE EXISTS (
		SELECT 1 FROM monzo_accounts ma WHERE ma.user_id = u.user_id
	)`,
	).all<User>();
	for (const user of users.results) {
		try {
			if (
				user.token_expires_at == null ||
				user.token_expires_at <= Date.now() + TWELVE_HOURS_MS
			) {
				await refreshMonzoUser(env, user);
			} else {
				await checkUserAccess(
					env,
					user.user_id,
					createMonzoClient(env, user.access_token, user.refresh_token),
				);
			}
		} catch {
			logger.error("Scheduled Monzo monitoring failed for user", {
				userId: user.user_id,
			});
			await checkUserAccess(
				env,
				user.user_id,
				createMonzoClient(env, user.access_token, user.refresh_token),
			);
		}
	}
	await flushPendingAccessAlerts(env);
	logger.info("Scheduled Monzo access monitoring completed", {
		totalUsers: users.results.length,
	});
}
