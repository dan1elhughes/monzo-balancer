import { Env } from "./types";
import { withMonzoClient } from "./monzo";
import { balanceAccount } from "./balancer";
import { logger } from "./logger";
import { MonzoAPI, castId } from "@otters/monzo";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/login" && request.method === "GET") {
			return handleLogin(request, env);
		}

		if (url.pathname === "/oauth/callback" && request.method === "GET") {
			return handleCallback(request, env);
		}

		if (url.pathname === "/" && request.method === "POST") {
			return handleWebhook(request, env, ctx);
		}

		return new Response("Not Found", { status: 404 });
	},
};

async function handleLogin(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const potName = url.searchParams.get("potName");
	const targetBalance = url.searchParams.get("target");

	if (!potName || !targetBalance) {
		return new Response("Missing potName or target query parameter", {
			status: 400,
		});
	}

	const state = btoa(JSON.stringify({ potName, targetBalance }));

	const authUrl = new URL("https://auth.monzo.com/");
	authUrl.searchParams.set("client_id", env.MONZO_CLIENT_ID);
	authUrl.searchParams.set("redirect_uri", env.MONZO_REDIRECT_URI);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("state", state);

	return Response.redirect(authUrl.toString(), 302);
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");

	if (!code || !state) {
		return new Response("Missing code or state query parameter", {
			status: 400,
		});
	}

	const { potName, targetBalance } = JSON.parse(atob(state));

	// Exchange code for token
	const params = new URLSearchParams();
	params.append("grant_type", "authorization_code");
	params.append("client_id", env.MONZO_CLIENT_ID);
	params.append("client_secret", env.MONZO_CLIENT_SECRET);
	params.append("redirect_uri", env.MONZO_REDIRECT_URI);
	params.append("code", code);

	const response = await fetch("https://api.monzo.com/oauth2/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: params,
	});

	if (!response.ok) {
		const text = await response.text();
		logger.error("Failed to exchange token", { text });
		return new Response(`Failed to exchange token: ${text}`, { status: 500 });
	}

	const tokenData = (await response.json()) as any;
	const { access_token, refresh_token } = tokenData;

	const client = new MonzoAPI(
		{ access_token, refresh_token },
		{
			client_id: castId(env.MONZO_CLIENT_ID, "oauth2client"),
			client_secret: env.MONZO_CLIENT_SECRET,
			redirect_uri: env.MONZO_REDIRECT_URI,
		},
	);

	// Get accounts
	const accounts = await client.getAccounts();
	const account = accounts.find((a) => a.type === "uk_retail");
	if (!account) {
		return new Response("No retail account found", { status: 400 });
	}
	const accountId = account.id;

	// Get pots
	const pots = await client.getPots(accountId);
	const pot = pots.find((p) => p.name === potName);
	if (!pot) {
		return new Response(`Pot with name "${potName}" not found`, {
			status: 400,
		});
	}
	const potId = pot.id;

	// Check for webhook and create if it doesn't exist
	const workerUrl = new URL(request.url);
	const webhookUrl = `${workerUrl.protocol}//${workerUrl.host}/`;

	const webhooksResponse = await fetch(
		`https://api.monzo.com/webhooks?account_id=${accountId}`,
		{
			headers: { Authorization: `Bearer ${access_token}` },
		},
	);
	if (!webhooksResponse.ok) {
		const text = await webhooksResponse.text();
		logger.error("Failed to list webhooks", { text });
		return new Response(`Failed to list webhooks: ${text}`, { status: 500 });
	}
	const { webhooks } = (await webhooksResponse.json()) as {
		webhooks: { id: string; url: string; account_id: string }[];
	};
	const webhookExists = webhooks.some((w) => w.url === webhookUrl);

	if (!webhookExists) {
		const registerResponse = await fetch("https://api.monzo.com/webhooks", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Authorization: `Bearer ${access_token}`,
			},
			body: new URLSearchParams({ account_id: accountId, url: webhookUrl }),
		});

		if (!registerResponse.ok) {
			const text = await registerResponse.text();
			logger.error("Failed to register webhook", { text });
			return new Response(`Failed to register webhook: ${text}`, {
				status: 500,
			});
		}
		logger.info(`Webhook registered for account ${accountId}`);
	} else {
		logger.info(`Webhook already exists for account ${accountId}`);
	}

	// Save to D1
	const stmt = env.DB.prepare(
		`INSERT OR REPLACE INTO accounts (monzo_account_id, monzo_pot_id, target_balance, client_id, client_secret, access_token, refresh_token, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).bind(
		accountId,
		potId,
		parseInt(targetBalance, 10),
		env.MONZO_CLIENT_ID,
		env.MONZO_CLIENT_SECRET,
		access_token,
		refresh_token,
		Date.now(),
		Date.now(),
	);
	await stmt.run();

	return new Response("Account setup complete!");
}

async function handleWebhook(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
): Promise<Response> {
	let accountId: any;
	try {
		const body = (await request.json()) as any;
		logger.info(`Received ${body.type} event`, { body });

		if (body.type !== "transaction.created") {
			return new Response("Ignored event type", { status: 200 });
		}
		accountId = body.data?.account_id;
		if (!accountId) {
			logger.error("Missing account_id in webhook body");
			return new Response("Bad Request: Missing account_id", { status: 400 });
		}
	} catch (e) {
		logger.error("Error parsing webhook body", e);
		return new Response("Bad Request", { status: 400 });
	}

	ctx.waitUntil(
		withMonzoClient(env, castId(accountId, "acc"), async (client, config) => {
			await balanceAccount(client, config);
		}).catch((err) => {
			logger.error("Balancing logic failed", err);
		}),
	);

	return new Response("OK", { status: 200 });
}
