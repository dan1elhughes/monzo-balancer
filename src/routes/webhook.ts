import { Context, Hono } from "hono";
import { Env } from "../types";
import { withMonzoClient } from "../monzo";
import { balanceAccount } from "../balancer";
import { logger } from "../logger";
import { castId } from "@otters/monzo";

export function registerWebhookRoutes(app: Hono<{ Bindings: Env }>): void {
	app.post("/", handleWebhook);
}

async function handleWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
	const env = c.env;

	try {
		const body = await c.req.json();

		if (body.type !== "transaction.created") {
			return c.text("Ignored event type", 200);
		}

		logger.info(`Received ${body.type} event`, { body });

		const accountId = body.data?.account_id;
		const transactionId = body.data?.id;
		const description = body.data?.description;
		const potId = body.data?.metadata?.pot_id;

		if (!accountId) {
			logger.error("Missing account_id in webhook body");
			return c.text("Bad Request: Missing account_id", 400);
		}

		await withMonzoClient(
			env,
			castId(accountId, "acc"),
			async (client, config) => {
				if (
					description === config.monzo_pot_id ||
					potId === config.monzo_pot_id
				) {
					logger.info("Ignoring transaction related to managed pot", {
						potId: config.monzo_pot_id,
					});
					return;
				}

				await balanceAccount(client, config, transactionId);
			},
		);

		return c.text("OK", 200);
	} catch (e) {
		logger.error("Webhook handling failed", e);
		return c.text("Internal Server Error", 500);
	}
}
