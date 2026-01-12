import { MonzoAPI, castId, Id } from "@otters/monzo";
import { Env, AccountConfig } from "./types";
import { logger } from "./logger";

export async function getMonzoConfig(
	env: Env,
	accountId: Id<"acc">,
): Promise<AccountConfig | null> {
	const stmt = env.DB.prepare(
		"SELECT * FROM accounts WHERE monzo_account_id = ?",
	).bind(accountId);
	const result = await stmt.first<AccountConfig>();

	if (!result) {
		return null;
	}

	return {
		...result,
		monzo_account_id: castId(result.monzo_account_id, "acc"),
		monzo_pot_id: castId(result.monzo_pot_id, "pot"),
	};
}

export async function saveTokens(
	env: Env,
	accountId: Id<"acc">,
	accessToken: string,
	refreshToken: string,
) {
	const stmt = env.DB.prepare(
		"UPDATE accounts SET access_token = ?, refresh_token = ?, updated_at = ? WHERE monzo_account_id = ?",
	).bind(accessToken, refreshToken, Date.now(), accountId);
	await stmt.run();
}

export async function withMonzoClient<T>(
	env: Env,
	accountId: Id<"acc">,
	action: (client: MonzoAPI, config: AccountConfig) => Promise<T>,
): Promise<T> {
	const config = await getMonzoConfig(env, accountId);
	if (!config) {
		throw new Error(`Missing Monzo Configuration for account ${accountId}`);
	}

	const appCreds = {
		client_id: castId(env.MONZO_CLIENT_ID, "oauth2client"),
		client_secret: env.MONZO_CLIENT_SECRET,
		redirect_uri: "http://localhost", // Placeholder
	};

	const client = new MonzoAPI(
		{
			access_token: config.access_token,
			refresh_token: config.refresh_token,
		},
		appCreds,
	);

	try {
		return await action(client, config);
	} catch (error: any) {
		logger.warn("Monzo API call failed, attempting refresh", error);

		try {
			const params = new URLSearchParams();
			params.append("grant_type", "refresh_token");
			params.append("client_id", env.MONZO_CLIENT_ID);
			params.append("client_secret", env.MONZO_CLIENT_SECRET);
			params.append("refresh_token", config.refresh_token);

			const response = await fetch("https://api.monzo.com/oauth2/token", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: params,
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(
					`Refresh failed with status ${response.status}: ${text}`,
				);
			}

			const newCreds = (await response.json()) as any;
			logger.info("Token refreshed successfully");

			await saveTokens(
				env,
				accountId,
				newCreds.access_token,
				newCreds.refresh_token,
			);

			const refreshedClient = new MonzoAPI(newCreds, appCreds);
			const newConfig = { ...config, ...newCreds };

			return await action(refreshedClient, newConfig);
		} catch (refreshError: any) {
			logger.error("Failed to refresh token", refreshError);
			if (refreshError.response) {
				try {
					const body = await refreshError.response.clone().text();
					logger.error("Refresh error response", {
						status: refreshError.response.status,
						body,
					});
				} catch (e) {
					logger.error("Failed to read refresh error response body", e);
				}
			}
			throw refreshError;
		}
	}
}
