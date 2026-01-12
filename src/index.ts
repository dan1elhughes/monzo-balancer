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

		if (url.pathname === "/setup/finish" && request.method === "POST") {
			return handleSetupFinish(request, env);
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
	logger.info("Fetching accounts...");
	let accounts;
	try {
		accounts = await client.getAccounts();
		logger.info("Accounts fetched successfully", { count: accounts.length });
	} catch (e) {
		logger.error("Failed to fetch accounts", e);
		// Return retry page
		return new Response(
			`
      <html>
        <body>
          <h1>Action Required</h1>
          <p>Please check your Monzo app to approve access for this application.</p>
          <p>Once approved, click the button below to finish setup.</p>
          <form action="/setup/finish" method="POST">
            <input type="hidden" name="access_token" value="${access_token}" />
            <input type="hidden" name="refresh_token" value="${refresh_token}" />
            <input type="hidden" name="potName" value="${potName}" />
            <input type="hidden" name="targetBalance" value="${targetBalance}" />
            <button type="submit">Finish Setup</button>
          </form>
        </body>
      </html>
      `,
			{
				headers: { "Content-Type": "text/html" },
			},
		);
	}

	return await finishSetup(
		env,
		access_token,
		refresh_token,
		potName,
		targetBalance,
		request.url,
		accounts,
	);
}

async function handleSetupFinish(
	request: Request,
	env: Env,
): Promise<Response> {
	const formData = await request.formData();
	const access_token = formData.get("access_token") as string;
	const refresh_token = formData.get("refresh_token") as string;
	const potName = formData.get("potName") as string;
	const targetBalance = formData.get("targetBalance") as string;

	const client = new MonzoAPI(
		{ access_token, refresh_token },
		{
			client_id: castId(env.MONZO_CLIENT_ID, "oauth2client"),
			client_secret: env.MONZO_CLIENT_SECRET,
			redirect_uri: env.MONZO_REDIRECT_URI,
		},
	);

	try {
		const accounts = await client.getAccounts();
		return await finishSetup(
			env,
			access_token,
			refresh_token,
			potName,
			targetBalance,
			request.url,
			accounts,
		);
	} catch (e: any) {
		logger.error("Failed to fetch accounts on retry", e);
		return new Response(
			`Failed to fetch accounts: ${e.message}. Please try refreshing or restarting the login flow.`,
			{ status: 500 },
		);
	}
}

async function finishSetup(
	env: Env,
	access_token: string,
	refresh_token: string,
	potName: string,
	targetBalance: string,
	requestUrl: string,
	accounts: any[],
): Promise<Response> {
	const client = new MonzoAPI(
		{ access_token, refresh_token },
		{
			client_id: castId(env.MONZO_CLIENT_ID, "oauth2client"),
			client_secret: env.MONZO_CLIENT_SECRET,
			redirect_uri: env.MONZO_REDIRECT_URI,
		},
	);

	const account = accounts.find((a) => a.type === "uk_retail");
	if (!account) {
		return new Response("No retail account found", { status: 400 });
	}
	const accountId = account.id;

	// Get pots
	logger.info(`Fetching pots for account ${accountId}...`);
	let pots;
	try {
		pots = await client.getPots(accountId);
		logger.info("Pots fetched successfully", { count: pots.length });
	} catch (e) {
		logger.error("Failed to fetch pots", e);
		return new Response("Failed to fetch pots from Monzo", { status: 500 });
	}

	const pot = pots.find((p) => p.name === potName);
	if (!pot) {
		return new Response(`Pot with name "${potName}" not found`, {
			status: 400,
		});
	}
	const potId = pot.id;

	// Check for webhook and create if it doesn't exist
	const workerUrl = new URL(requestUrl);
	const webhookUrl = `${workerUrl.protocol}//${workerUrl.host}/`;

	logger.info("Checking webhooks...");
	const webhooksResponse = await fetch(
		`https://api.monzo.com/webhooks?account_id=${accountId}`,
		{
			headers: { Authorization: `Bearer ${access_token}` },
		},
	);
	if (!webhooksResponse.ok) {
		const text = await webhooksResponse.text();
		logger.error("Failed to list webhooks", {
			status: webhooksResponse.status,
			text,
		});
		return new Response(`Failed to list webhooks: ${text}`, { status: 500 });
	}
	const { webhooks } = (await webhooksResponse.json()) as {
		webhooks: { id: string; url: string; account_id: string }[];
	};
	const webhookExists = webhooks.some((w) => w.url === webhookUrl);

	if (!webhookExists) {
		logger.info("Registering new webhook...");
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
			logger.error("Failed to register webhook", {
				status: registerResponse.status,
				text,
			});
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
