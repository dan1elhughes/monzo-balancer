import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonzoAPI } from "@otters/monzo";
import { Env } from "../types";
import {
	checkAccountAccess,
	checkUserAccess,
	describeMonzoFailure,
	recordUserCheck,
} from "./access-checks";
import { recordAccessCheck } from "./access-alerts";
import { createTestDatabase } from "../test-utils/d1";

vi.mock("./access-alerts", () => ({ recordAccessCheck: vi.fn() }));

describe("read-only account access checks", () => {
	const env = {} as Env;
	const whoami = vi.fn();
	const getTransactions = vi.fn();
	const getTransaction = vi.fn();
	const client = {
		whoami,
		getTransactions,
		getTransaction,
	} as unknown as MonzoAPI;

	beforeEach(() => {
		vi.resetAllMocks();
		whoami.mockResolvedValue({ authenticated: true, user_id: "user_test" });
		getTransactions.mockResolvedValue([
			{ id: "tx_latest", created: "2026-11-12T03:00:00Z" },
			{ id: "tx_older", created: "2026-11-11T03:00:00Z" },
		]);
		getTransaction.mockResolvedValue({ id: "tx_latest" });
	});

	afterEach(() => vi.restoreAllMocks());

	it("lists transactions then reads the newest transaction without transferring money", async () => {
		await checkAccountAccess(env, "acc_test", "user_test", client);
		expect(getTransactions).toHaveBeenCalledWith("acc_test", {
			limit: 100,
			since: expect.any(String),
			before: expect.any(String),
		});
		expect(getTransaction).toHaveBeenCalledWith("tx_latest");
		expect(recordAccessCheck).toHaveBeenCalledWith(
			env,
			expect.objectContaining({
				accountId: "acc_test",
				check: "authentication",
				status: "healthy",
			}),
		);
		expect(recordAccessCheck).toHaveBeenCalledWith(
			env,
			expect.objectContaining({ check: "transactions", status: "healthy" }),
		);
	});

	it.each([
		{ authenticated: false, user_id: "user_test" },
		{ authenticated: true, user_id: "user_wrong" },
	])("rejects unauthenticated or mismatched users: %j", async (identity) => {
		whoami.mockResolvedValue(identity);
		await checkAccountAccess(env, "acc_test", "user_test", client);
		expect(getTransactions).not.toHaveBeenCalled();
		expect(recordAccessCheck).toHaveBeenCalledWith(
			env,
			expect.objectContaining({ check: "authentication", status: "unhealthy" }),
		);
		expect(recordAccessCheck).not.toHaveBeenCalledWith(
			env,
			expect.objectContaining({ check: "transactions", status: "healthy" }),
		);
	});

	it("reports individual lookup as untested for an empty account", async () => {
		getTransactions.mockResolvedValue([]);
		await checkAccountAccess(env, "acc_test", "user_test", client);
		expect(getTransaction).not.toHaveBeenCalled();
		expect(recordAccessCheck).toHaveBeenCalledWith(
			env,
			expect.objectContaining({ check: "transactions", status: "untested" }),
		);
		expect(getTransactions).toHaveBeenCalledTimes(3);
		expect(
			vi.mocked(recordAccessCheck).mock.calls.at(-1)?.[1].detail,
		).toContain("last 89 days");
	});

	it("follows a full page to find a newer transaction", async () => {
		const page = Array.from({ length: 100 }, (_, index) => ({
			id: `tx_page_${index}`,
			created: new Date(
				Date.parse("2026-11-12T00:00:00Z") + index * 60000,
			).toISOString(),
		}));
		getTransactions
			.mockResolvedValueOnce(page)
			.mockResolvedValueOnce([
				{ id: "tx_newest", created: "2026-11-12T09:00:00Z" },
			]);
		await checkAccountAccess(env, "acc_test", "user_test", client);
		expect(getTransactions).toHaveBeenNthCalledWith(
			2,
			"acc_test",
			expect.objectContaining({
				since: "tx_page_99",
				before: expect.any(String),
			}),
		);
		expect(getTransaction).toHaveBeenCalledWith("tx_newest");
	});

	it("stops and reports failure when transaction pagination does not advance", async () => {
		getTransactions.mockResolvedValue(
			Array.from({ length: 100 }, () => ({
				id: "tx_repeated",
				created: "2026-11-12T01:00:00Z",
			})),
		);
		await checkAccountAccess(env, "acc_test", "user_test", client);
		expect(getTransactions).toHaveBeenCalledTimes(2);
		expect(getTransaction).not.toHaveBeenCalled();
		expect(recordAccessCheck).toHaveBeenLastCalledWith(
			env,
			expect.objectContaining({ check: "transactions", status: "unhealthy" }),
		);
	});

	it("records a 403 on the individual lookup even when authentication and listing succeed", async () => {
		getTransaction.mockRejectedValue({
			response: { status: 403 },
			request: {
				method: "GET",
				url: "https://api.monzo.com/transactions/tx_latest",
			},
		});
		await checkAccountAccess(env, "acc_test", "user_test", client);
		expect(recordAccessCheck).toHaveBeenLastCalledWith(
			env,
			expect.objectContaining({
				check: "transactions",
				status: "unhealthy",
				detail: "Transaction lookup failed (HTTP 403).",
			}),
		);
	});

	it("records listing errors without attempting an individual lookup", async () => {
		getTransactions.mockRejectedValue(new Error("secret-token"));
		await checkAccountAccess(env, "acc_test", "user_test", client);
		expect(getTransaction).not.toHaveBeenCalled();
		expect(recordAccessCheck).toHaveBeenLastCalledWith(
			env,
			expect.objectContaining({
				check: "transactions",
				status: "unhealthy",
				detail: "Transaction listing failed.",
			}),
		);
		expect(
			JSON.stringify(vi.mocked(recordAccessCheck).mock.calls),
		).not.toContain("secret-token");
	});

	it("never includes credentials or API response bodies in failure descriptions", () => {
		expect(
			describeMonzoFailure("Token refresh", {
				response: { status: 401 },
				message: "secret-access-token",
				body: "secret-refresh-token",
			}),
		).toBe("Token refresh failed (HTTP 401).");
	});

	it("checks all accounts for one user and excludes other users", async () => {
		const store =
			createTestDatabase(`CREATE TABLE monzo_accounts (monzo_account_id TEXT, user_id TEXT);
			INSERT INTO monzo_accounts VALUES ('acc_one','user_test'),('acc_two','user_test'),('acc_other','user_other');`);
		try {
			getTransactions.mockRejectedValueOnce({ response: { status: 403 } });
			await checkUserAccess({ DB: store.db } as Env, "user_test", client);
			expect(getTransactions.mock.calls.map((call) => call[0])).toEqual([
				"acc_one",
				"acc_two",
			]);
			expect(recordAccessCheck).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					accountId: "acc_two",
					check: "transactions",
					status: "healthy",
				}),
			);
		} finally {
			store.database.close();
		}
	});

	it("does not fail token refresh when notification account enumeration fails", async () => {
		const broken = {
			DB: {
				prepare: () => {
					throw new Error("database unavailable");
				},
			},
		} as unknown as Env;
		await expect(
			recordUserCheck(
				broken,
				"user_test",
				"token_refresh",
				"healthy",
				"Refreshed.",
			),
		).resolves.toBeUndefined();
		await expect(
			checkUserAccess(broken, "user_test", client),
		).resolves.toBeUndefined();
	});
});
