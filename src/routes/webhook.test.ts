import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerWebhookRoutes } from "./webhook";
import { Env } from "../types";

const { balanceAccount, getClient } = vi.hoisted(() => ({
	balanceAccount: vi.fn(),
	getClient: vi.fn(),
}));

vi.mock("../balancer", () => ({ balanceAccount }));
vi.mock("../services/monzo", () => ({ getClient }));

function createApp(): Hono<{ Bindings: Env }> {
	const app = new Hono<{ Bindings: Env }>();
	registerWebhookRoutes(app);
	return app;
}

function createWebhookRequest(transactionId: string): Request {
	return new Request("http://localhost/", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			type: "transaction.created",
			data: {
				id: transactionId,
				account_id: "acc_test",
				description: "Pet Family",
			},
		}),
	});
}

describe("webhook routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("ignores a transaction when the authoritative transaction is declined", async () => {
		const transaction = {
			id: "tx_declined",
			account_id: "acc_test",
			amount: -5890,
			decline_reason: "CARD_CLOSED",
		};
		const client = {
			getTransaction: vi.fn().mockResolvedValue(transaction),
		};
		getClient.mockResolvedValue({
			client,
			config: { monzo_pot_id: "pot_test" },
		});

		const response = await createApp().fetch(
			createWebhookRequest(transaction.id),
			{} as Env,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: "ignored",
			reason: "Declined transaction",
		});
		expect(client.getTransaction).toHaveBeenCalledWith(transaction.id);
		expect(balanceAccount).not.toHaveBeenCalled();
	});

	it.each([
		["pending", ""],
		["settled", "2026-08-12T19:50:58.21Z"],
	])("balances an accepted %s transaction", async (_state, settled) => {
		const transaction = {
			id: `tx_${_state}`,
			account_id: "acc_test",
			amount: -5890,
			decline_reason: "",
			settled,
		};
		const client = {
			getTransaction: vi.fn().mockResolvedValue(transaction),
		};
		const config = { monzo_pot_id: "pot_test" };
		getClient.mockResolvedValue({ client, config });

		const response = await createApp().fetch(
			createWebhookRequest(transaction.id),
			{} as Env,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
		expect(balanceAccount).toHaveBeenCalledWith(
			client,
			config,
			transaction.id,
			transaction.amount,
		);
	});
});
