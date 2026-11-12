import { MonzoAPI, castId, Id } from "@otters/monzo";
import { Env, MonzoAccount, MonzoAccountConfig } from "../types";
import { logger } from "../logger";
import { recordAccessCheck } from "./access-alerts";
import {
	describeMonzoFailure,
	MonzoAuthenticationError,
} from "./access-checks";
import { refreshMonzoUser } from "./token-refresh";

/**
 * Internal: Fetch Monzo configuration from database
 * @internal
 */
export async function getMonzoConfig(
	env: Env,
	accountId: Id<"acc">,
): Promise<
	| (MonzoAccount & {
			access_token: string;
			refresh_token: string;
			token_expires_at: number | null;
	  })
	| null
> {
	const stmt = env.DB.prepare(
		`SELECT ma.*, u.access_token, u.refresh_token, u.token_expires_at
		 FROM monzo_accounts ma
		 JOIN users u ON ma.user_id = u.user_id
		 WHERE ma.monzo_account_id = ?`,
	).bind(accountId);
	const result = await stmt.first<
		MonzoAccount & {
			access_token: string;
			refresh_token: string;
			token_expires_at: number | null;
		}
	>();

	if (!result) {
		return null;
	}

	return {
		...result,
		monzo_account_id: castId(result.monzo_account_id, "acc"),
		monzo_pot_id: castId(result.monzo_pot_id, "pot"),
		dry_run: !!result.dry_run,
	};
}

/**
 * Internal: Save refreshed tokens to database (user level)
 * @internal
 */
export async function saveTokens(
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

export function createMonzoClient(
	env: Env,
	accessToken: string,
	refreshToken: string,
): MonzoAPI {
	return new MonzoAPI(
		{ access_token: accessToken, refresh_token: refreshToken },
		{
			client_id: castId(env.MONZO_CLIENT_ID, "oauth2client"),
			client_secret: env.MONZO_CLIENT_SECRET,
			redirect_uri: env.MONZO_REDIRECT_URI,
		},
	);
}

export interface GetClientResult {
	client: MonzoAPI;
	config: MonzoAccountConfig;
}

export async function getClient(
	env: Env,
	accountId: Id<"acc">,
): Promise<GetClientResult> {
	const configData = await getMonzoConfig(env, accountId);
	if (!configData) {
		throw new Error(`Missing Monzo Configuration for account ${accountId}`);
	}

	// Create runtime config (excludes tokens for safety)
	const createRuntimeConfig = (data: MonzoAccount): MonzoAccountConfig => ({
		id: data.id,
		user_id: data.user_id,
		monzo_account_id: data.monzo_account_id,
		monzo_pot_id: data.monzo_pot_id,
		target_balance: data.target_balance,
		dry_run: data.dry_run,
	});

	const runtimeConfig = createRuntimeConfig(configData);

	let client = createMonzoClient(
		env,
		configData.access_token,
		configData.refresh_token,
	);

	// Check if token is valid by calling whoami
	try {
		const whoami = await client.whoami();
		const now = Date.now();
		const tokenExpiresAt = configData.token_expires_at;

		logger.info("Monzo token validation completed", {
			accountId,
			userId: configData.user_id,
			authenticated: whoami.authenticated,
			authenticatedUserId: whoami.user_id ?? null,
			tokenExpiresAt,
			tokenExpired: tokenExpiresAt === null ? null : tokenExpiresAt <= now,
			tokenExpiresInMs: tokenExpiresAt === null ? null : tokenExpiresAt - now,
		});
		if (!whoami.authenticated || whoami.user_id !== configData.user_id) {
			throw new MonzoAuthenticationError();
		}
	} catch (error: unknown) {
		logger.warn("Token validation failed, attempting refresh", { accountId });
		try {
			client = await refreshMonzoUser(env, configData);
			const identity = await client.whoami();
			if (!identity.authenticated || identity.user_id !== configData.user_id)
				throw new MonzoAuthenticationError();
		} catch (refreshError: unknown) {
			await recordAccessCheck(env, {
				accountId,
				check: "authentication",
				status: "unhealthy",
				detail: describeMonzoFailure(
					"Authentication after refresh",
					refreshError,
				),
			});
			throw refreshError;
		}
	}
	await recordAccessCheck(env, {
		accountId,
		check: "authentication",
		status: "healthy",
		detail: "Authentication verified for the configured user.",
	});

	return { client, config: runtimeConfig };
}
