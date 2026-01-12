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
			return handleWebhook(request, env);
		}

		return new Response("Not Found", { status: 404 });
	},
};

async function handleLogin(request: Request, env: Env): Promise<Response> {
	const state = crypto.randomUUID();

	await env.DB.prepare(
		"INSERT INTO oauth_states (state, created_at) VALUES (?, ?)",
	)
		.bind(state, Date.now())
		.run();

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

	const storedState = await env.DB.prepare(
		"SELECT state FROM oauth_states WHERE state = ?",
	)
		.bind(state)
		.first();

	if (!storedState) {
		return new Response("Invalid state parameter", { status: 400 });
	}

	await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?")
		.bind(state)
		.run();

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
          <p>Once approved, refresh this page.</p>
        </body>
      </html>
      `,
			{
				headers: { "Content-Type": "text/html" },
			},
		);
	}

	// Fetch pots for all accounts
	const accountsWithPots = await Promise.all(
		accounts.map(async (acc) => {
			try {
				const pots = await client.getPots(acc.id);
				return { ...acc, pots };
			} catch (e) {
				logger.error(`Failed to fetch pots for account ${acc.id}`, e);
				return { ...acc, pots: [] };
			}
		}),
	);

	const accountsHtml = accountsWithPots
		.map(
			(acc) =>
				`<option value="${acc.id}">${acc.description} (${acc.id})</option>`,
		)
		.join("");

	// Group pots by account for display, or just list them all?
	// The prompt says "show an account list and pot list".
	// Ideally the user picks an account, and the pot list updates, but this is a simple static form.
	// I'll just list all pots, perhaps with the account name in the label.
	const potsHtml = accountsWithPots
		.flatMap((acc) =>
			acc.pots.map(
				(pot: any) =>
					`<option value="${pot.id}">${pot.name} (${acc.description})</option>`,
			),
		)
		.join("");

	return new Response(
		`
    <html>
      <head>
        <title>Monzo Balancer Setup</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 600px; margin: 2rem auto; padding: 0 1rem; }
          .form-group { margin-bottom: 1rem; }
          label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
          select, input { width: 100%; padding: 0.5rem; font-size: 1rem; }
          button { padding: 0.75rem 1.5rem; background: #2D3E50; color: white; border: none; font-size: 1rem; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>Configure Monzo Balancer</h1>
        <form action="/setup/finish" method="POST">
          <input type="hidden" name="access_token" value="${access_token}" />
          <input type="hidden" name="refresh_token" value="${refresh_token}" />
          
          <div class="form-group">
            <label for="accountId">Select Account</label>
            <select name="accountId" id="accountId" required>
              ${accountsHtml}
            </select>
          </div>

          <div class="form-group">
            <label for="potId">Select Pot</label>
            <select name="potId" id="potId" required>
              ${potsHtml}
            </select>
          </div>

          <div class="form-group">
            <label for="targetBalance">Target Balance (in pennies)</label>
            <input type="number" name="targetBalance" id="targetBalance" required min="0" placeholder="e.g. 1000 for £10.00" />
          </div>

          <button type="submit">Save Configuration</button>
        </form>
      </body>
    </html>
    `,
		{
			headers: { "Content-Type": "text/html" },
		},
	);
}

async function handleSetupFinish(
	request: Request,
	env: Env,
): Promise<Response> {
	const formData = await request.formData();
	const access_token = formData.get("access_token") as string;
	const refresh_token = formData.get("refresh_token") as string;
	const accountId = formData.get("accountId") as string;
	const potId = formData.get("potId") as string;
	const targetBalance = formData.get("targetBalance") as string;

	if (
		!access_token ||
		!refresh_token ||
		!accountId ||
		!potId ||
		!targetBalance
	) {
		return new Response("Missing required fields", { status: 400 });
	}

	// Register webhook
	const workerUrl = new URL(request.url);
	const webhookUrl = `${workerUrl.protocol}//${workerUrl.host}/`;

	try {
		const webhooksResponse = await fetch(
			`https://api.monzo.com/webhooks?account_id=${accountId}`,
			{
				headers: { Authorization: `Bearer ${access_token}` },
			},
		);

		if (webhooksResponse.ok) {
			const { webhooks } = (await webhooksResponse.json()) as {
				webhooks: { id: string; url: string; account_id: string }[];
			};
			const webhookExists = webhooks.some((w) => w.url === webhookUrl);

			if (!webhookExists) {
				logger.info("Registering new webhook...");
				await fetch("https://api.monzo.com/webhooks", {
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
						Authorization: `Bearer ${access_token}`,
					},
					body: new URLSearchParams({ account_id: accountId, url: webhookUrl }),
				});
			}
		}
	} catch (e) {
		logger.error("Failed to register webhook", e);
		// Continue anyway, we can try again later or it might exist
	}

	// Save to D1
	const stmt = env.DB.prepare(
		`INSERT OR REPLACE INTO accounts (monzo_account_id, monzo_pot_id, target_balance, access_token, refresh_token, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
	).bind(
		accountId,
		potId,
		parseInt(targetBalance, 10),
		access_token,
		refresh_token,
		Date.now(),
		Date.now(),
	);
	await stmt.run();

	return new Response("Account setup complete!");
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
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

	try {
		await withMonzoClient(
			env,
			castId(accountId, "acc"),
			async (client, config) => {
				await balanceAccount(client, config);
			},
		);
	} catch (e) {
		logger.error("Balancing logic failed", e);
		return new Response("Internal Server Error", { status: 500 });
	}

	return new Response("OK", { status: 200 });
}
