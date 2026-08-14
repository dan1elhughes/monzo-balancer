import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWebhookRoutes } from "./webhook";
import { Env } from "../types";
import { logger } from "../logger";

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

	afterEach(() => {
		vi.restoreAllMocks();
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

	it("logs safe correlated diagnostics for a Monzo HTTP failure", async () => {
		const request = new Request(
			"https://api.monzo.com/transactions/tx_forbidden?expand=merchant",
			{
				method: "GET",
				headers: { Authorization: "Bearer secret-token" },
			},
		);
		const response = new Response('{"error":"invalid_token"}', {
			status: 403,
		});
		const client = {
			getTransaction: vi.fn().mockRejectedValue({ request, response }),
		};
		getClient.mockResolvedValue({
			client,
			config: { monzo_pot_id: "pot_test" },
		});
		const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);

		const routeResponse = await createApp().fetch(
			createWebhookRequest("tx_forbidden"),
			{} as Env,
		);

		expect(routeResponse.status).toBe(500);
		expect(await routeResponse.json()).toEqual({
			status: "error",
			message: "Internal server error",
		});
		expect(error).toHaveBeenCalledWith("Webhook Monzo API request failed", {
			accountId: "acc_test",
			transactionId: "tx_forbidden",
			status: 403,
			method: "GET",
			pathname: "/transactions/tx_forbidden",
			responseBody: '{"error":"invalid_token"}',
			responseBodyTruncated: false,
		});
		const serializedLogs = JSON.stringify(error.mock.calls);
		expect(serializedLogs).not.toContain("secret-token");
		expect(serializedLogs).not.toContain("expand=merchant");
	});

	it("uses only the existing generic log for a non-HTTP failure", async () => {
		const failure = new Error("database unavailable");
		const client = {
			getTransaction: vi.fn().mockRejectedValue(failure),
		};
		getClient.mockResolvedValue({
			client,
			config: { monzo_pot_id: "pot_test" },
		});
		const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);

		const routeResponse = await createApp().fetch(
			createWebhookRequest("tx_failed"),
			{} as Env,
		);

		expect(routeResponse.status).toBe(500);
		expect(error).not.toHaveBeenCalledWith(
			"Webhook Monzo API request failed",
			expect.anything(),
		);
		expect(error).toHaveBeenCalledWith("Webhook handling failed", failure);
	});
});
