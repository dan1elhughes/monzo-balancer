import { Env } from "./types";
import { withMonzoClient } from "./monzo";
import { balanceAccount } from "./balancer";
import { logger } from "./logger";
import { castId } from "@otters/monzo";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		if (request.method !== "POST") {
			return new Response("Method Not Allowed", { status: 405 });
		}

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
	},
};
