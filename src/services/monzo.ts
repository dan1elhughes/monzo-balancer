import { MonzoAPI, castId, Id } from "@otters/monzo";
import { Env, MonzoAccount, MonzoAccountConfig } from "../types";
import { logger } from "../logger";

/**
 * Internal: Fetch Monzo configuration from database
 * @internal
 */
export async function getMonzoConfig(
	env: Env,
	accountId: Id<"acc">,
): Promise<
	(MonzoAccount & { access_token: string; refresh_token: string }) | null
> {
	const stmt = env.DB.prepare(
		`SELECT ma.*, u.access_token, u.refresh_token 
		 FROM monzo_accounts ma
		 JOIN users u ON ma.user_id = u.user_id
		 WHERE ma.monzo_account_id = ?`,
	).bind(accountId);
	const result = await stmt.first<
		MonzoAccount & { access_token: string; refresh_token: string }
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
) {
	const stmt = env.DB.prepare(
		"UPDATE users SET access_token = ?, refresh_token = ?, updated_at = ? WHERE user_id = ?",
	).bind(accessToken, refreshToken, Date.now(), userId);
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

	const appCreds = {
		client_id: castId(env.MONZO_CLIENT_ID, "oauth2client"),
		client_secret: env.MONZO_CLIENT_SECRET,
		redirect_uri: "http://localhost", // Placeholder
	};

	let client = new MonzoAPI(
		{
			access_token: configData.access_token,
			refresh_token: configData.refresh_token,
		},
		appCreds,
	);

	// Check if token is valid by calling whoami
	try {
		await client.whoami();
	} catch (error: unknown) {
		logger.warn(
			"Token appears invalid, attempting refresh",
			error as Record<string, unknown>,
		);

		try {
			const creds = await client.refresh();
			client = new MonzoAPI(creds, appCreds);

			logger.info("Token refreshed successfully");

			await saveTokens(
				env,
				configData.user_id,
				creds.access_token,
				creds.refresh_token,
			);
		} catch (refreshError: unknown) {
			logger.error(
				"Failed to refresh token",
				refreshError as Record<string, unknown>,
			);
			if (
				typeof refreshError === "object" &&
				refreshError !== null &&
				"response" in refreshError
			) {
				try {
					const response = (refreshError as { response: Response }).response;
					const body = await response.clone().text();
					logger.error("Refresh error response", {
						status: response.status,
						body,
					});
				} catch (e) {
					logger.error(
						"Failed to read refresh error response body",
						e as Record<string, unknown>,
					);
				}
			}
			throw refreshError;
		}
	}

	return { client, config: runtimeConfig };
}
