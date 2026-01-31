import { Context, Hono } from "hono";
import { Env } from "../types";
import { withMonzoClient } from "../services/monzo";
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
			return c.json(
				{ status: "ignored", reason: "Event type not handled" },
				200,
			);
		}

		logger.info(`Received ${body.type} event`, { body });

		const accountId = body.data?.account_id;
		const transactionId = body.data?.id;
		const description = body.data?.description;
		const potId = body.data?.metadata?.pot_id;

		if (!accountId) {
			logger.error("Missing account_id in webhook body");
			return c.json({ status: "error", message: "Missing account_id" }, 400);
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

				let transactionAmount: number | undefined;

				if (transactionId) {
					// Fetch the transaction from the API to get the authoritative amount
					// This avoids race conditions from trusting webhook data
					const transaction = await client.getTransaction(
						castId(transactionId, "tx"),
					);
					transactionAmount = transaction.amount;

					logger.info("Fetched transaction from API", {
						transactionId,
						amount: transactionAmount,
					});
				} else {
					// No transaction ID - balance based on current account balance
					logger.info(
						"No transaction ID provided, balancing based on current balance",
					);
				}

				await balanceAccount(client, config, transactionId, transactionAmount);
			},
		);

		return c.json({ status: "ok" }, 200);
	} catch (e) {
		logger.error("Webhook handling failed", e);
		return c.json({ status: "error", message: "Internal server error" }, 500);
	}
}
