import { Context, Hono } from "hono";
import { Env } from "../types";
import { getClient } from "../services/monzo";
import { balanceAccount } from "../balancer";
import { logger } from "../logger";
import { castId } from "@otters/monzo";
import { getMonzoHttpDiagnostics } from "../services/monzo-http-diagnostics";
import { AccessCheckName, recordAccessCheck } from "../services/access-alerts";
import {
	describeMonzoFailure,
	getMonzoStatus,
	MonzoAuthenticationError,
} from "../services/access-checks";

export function registerWebhookRoutes(app: Hono<{ Bindings: Env }>): void {
	app.post("/", handleWebhook);
}

async function handleWebhook(c: Context<{ Bindings: Env }>): Promise<Response> {
	const env = c.env;
	let accountId: string | undefined;
	let transactionId: string | undefined;
	let check: AccessCheckName = "authentication";

	try {
		const body = await c.req.json();

		if (body.type !== "transaction.created") {
			return c.json(
				{ status: "ignored", reason: "Event type not handled" },
				200,
			);
		}

		logger.info(`Received ${body.type} event`, { body });

		accountId = body.data?.account_id;
		transactionId = body.data?.id;
		const description = body.data?.description;
		const potId = body.data?.metadata?.pot_id;

		if (!accountId) {
			logger.error("Missing account_id in webhook body");
			return c.json({ status: "error", message: "Missing account_id" }, 400);
		}

		const { client, config } = await getClient(env, castId(accountId, "acc"));
		check = "transactions";

		if (description === config.monzo_pot_id || potId === config.monzo_pot_id) {
			logger.info("Ignoring transaction related to managed pot", {
				potId: config.monzo_pot_id,
			});
			return c.json({ status: "ignored", reason: "Pot transaction" }, 200);
		}

		let transactionAmount: number | undefined;

		if (transactionId) {
			// Fetch the transaction from the API to get the authoritative amount
			// This avoids race conditions from trusting webhook data
			const transaction = await client.getTransaction(
				castId(transactionId, "tx"),
			);

			if (transaction.decline_reason) {
				logger.info("Ignoring declined transaction", {
					transactionId,
					declineReason: transaction.decline_reason,
				});
				return c.json(
					{ status: "ignored", reason: "Declined transaction" },
					200,
				);
			}

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

		check =
			transactionAmount === undefined
				? "pots"
				: transactionAmount > 0
					? "deposits"
					: "withdrawals";
		const result = await balanceAccount(
			client,
			config,
			transactionId,
			transactionAmount,
		);
		if (result) {
			await recordAccessCheck(env, {
				accountId,
				check: result,
				status: "healthy",
				detail: "A live balancing transfer succeeded.",
			});
			if (result === "withdrawals" || transactionAmount === undefined) {
				await recordAccessCheck(env, {
					accountId,
					check: "pots",
					status: "healthy",
					detail: "Pot listing succeeded during live balancing.",
				});
			}
		}

		return c.json({ status: "ok" }, 200);
	} catch (e) {
		const diagnostics = await getMonzoHttpDiagnostics(e);
		if (diagnostics?.pathname === "/pots") check = "pots";
		else if (/^\/pots\/[^/]+\/deposit$/.test(diagnostics?.pathname ?? ""))
			check = "deposits";
		else if (/^\/pots\/[^/]+\/withdraw$/.test(diagnostics?.pathname ?? ""))
			check = "withdrawals";
		const status = getMonzoStatus(e);
		if (
			accountId &&
			(status === 401 ||
				status === 403 ||
				e instanceof MonzoAuthenticationError)
		) {
			await recordAccessCheck(env, {
				accountId,
				check:
					status === 401 || e instanceof MonzoAuthenticationError
						? "authentication"
						: check,
				status: "unhealthy",
				detail: describeMonzoFailure(`Webhook ${check}`, e),
			});
		}
		if (diagnostics) {
			logger.error("Webhook Monzo API request failed", {
				accountId,
				transactionId,
				...diagnostics,
			});
		}
		logger.error("Webhook handling failed", e);
		return c.json({ status: "error", message: "Internal server error" }, 500);
	}
}
