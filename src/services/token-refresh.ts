import { MonzoAPI } from "@otters/monzo";
import { Env, User } from "../types";
import { createMonzoClient, saveTokens } from "./monzo";
import {
	checkUserAccess,
	describeMonzoFailure,
	MonzoAuthenticationError,
	recordUserCheck,
} from "./access-checks";
import { logger } from "../logger";

export async function refreshMonzoUser(
	env: Env,
	user: Pick<User, "user_id" | "access_token" | "refresh_token">,
): Promise<MonzoAPI> {
	let client: MonzoAPI;
	try {
		const previous = createMonzoClient(
			env,
			user.access_token,
			user.refresh_token,
		);
		const creds = await previous.refresh();
		if (creds.user_id !== user.user_id) throw new MonzoAuthenticationError();
		const refreshToken = creds.refresh_token || user.refresh_token;
		await saveTokens(
			env,
			user.user_id,
			creds.access_token,
			refreshToken,
			Date.now() + (creds.expires_in || 108000) * 1000,
		);
		client = createMonzoClient(env, creds.access_token, refreshToken);
	} catch (error) {
		await recordUserCheck(
			env,
			user.user_id,
			"token_refresh",
			"unhealthy",
			describeMonzoFailure("Token refresh", error),
		);
		throw error;
	}
	await recordUserCheck(
		env,
		user.user_id,
		"token_refresh",
		"healthy",
		"Token refresh succeeded. API permissions are checked separately.",
	);
	await checkUserAccess(env, user.user_id, client);
	logger.info("Monzo token refreshed and saved", { userId: user.user_id });
	return client;
}
