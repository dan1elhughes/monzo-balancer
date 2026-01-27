import { Env } from "../types";
import { logger } from "../logger";

export async function createOAuthState(env: Env): Promise<string> {
	const state = crypto.randomUUID();
	await env.DB.prepare(
		"INSERT INTO oauth_states (state, created_at) VALUES (?, ?)",
	)
		.bind(state, Date.now())
		.run();
	return state;
}

export function buildAuthUrl(
	state: string,
	clientId: string,
	redirectUri: string,
): URL {
	const authUrl = new URL("https://auth.monzo.com/");
	authUrl.searchParams.set("client_id", clientId);
	authUrl.searchParams.set("redirect_uri", redirectUri);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("state", state);
	return authUrl;
}

export async function validateOAuthState(
	env: Env,
	state: string,
): Promise<boolean> {
	const storedState = await env.DB.prepare(
		"SELECT state FROM oauth_states WHERE state = ?",
	)
		.bind(state)
		.first();

	if (!storedState) {
		return false;
	}

	await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?")
		.bind(state)
		.run();

	return true;
}

export async function exchangeCodeForTokens(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string,
): Promise<{ access_token: string; refresh_token: string }> {
	const params = new URLSearchParams();
	params.append("grant_type", "authorization_code");
	params.append("client_id", clientId);
	params.append("client_secret", clientSecret);
	params.append("redirect_uri", redirectUri);
	params.append("code", code);

	const response = await fetch("https://api.monzo.com/oauth2/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: params,
	});

	if (!response.ok) {
		const text = await response.text();
		logger.error("Failed to exchange token", { text });
		throw new Error(`Failed to exchange token: ${text}`);
	}

	const tokenData = (await response.json()) as {
		access_token: string;
		refresh_token: string;
	};
	return {
		access_token: tokenData.access_token,
		refresh_token: tokenData.refresh_token,
	};
}
