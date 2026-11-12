import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "../test-utils/d1";
import { Env } from "../types";
import { flushPendingAccessAlerts, recordAccessCheck } from "./access-alerts";

vi.mock("cloudflare:email", () => ({
	EmailMessage: class {
		constructor(
			public from: string,
			public to: string,
			public raw: string,
		) {}
	},
}));

describe("access alerts", () => {
	let store: ReturnType<typeof createTestDatabase>;
	let env: Env;
	const send = vi.fn();
	const failure = {
		accountId: "acc_test",
		check: "transactions" as const,
		status: "unhealthy" as const,
		detail: "GET /transactions/:id returned HTTP 403.",
	};

	beforeEach(() => {
		vi.resetAllMocks();
		store = createTestDatabase(
			readFileSync("migrations/0010_create_access_checks.sql", "utf8") +
				readFileSync(
					"migrations/0011_preserve_pending_access_alerts.sql",
					"utf8",
				),
		);
		env = {
			DB: store.db,
			ALERT_EMAIL: { send },
			ALERT_FROM: "monzo-balancer@danhughes.dev",
			ALERT_TO: "cloudflare@danhughes.dev",
		} as unknown as Env;
		send.mockResolvedValue(undefined);
	});

	afterEach(() => {
		store.database.close();
		vi.restoreAllMocks();
	});

	it("sends one failure email and suppresses repeated failures", async () => {
		await recordAccessCheck(env, failure);
		await recordAccessCheck(env, { ...failure, detail: "Still denied." });
		expect(send).toHaveBeenCalledTimes(1);
		const message = send.mock.calls[0][0];
		expect(message.to).toBe("cloudflare@danhughes.dev");
		expect(message.raw).toContain(
			"Subject: Monzo Balancer: transactions failed",
		);
		expect(message.raw).toContain("acc_test");
		expect(message.raw).toContain("HTTP 403");
		expect(message.raw).toContain(
			"No balance correction was attempted by this check.",
		);
		expect(
			store.database
				.prepare("SELECT status, notified_status FROM access_checks")
				.get(),
		).toMatchObject({ status: "unhealthy", notified_status: "unhealthy" });
	});

	it("sends a recovery only after an alerted failure", async () => {
		await recordAccessCheck(env, {
			...failure,
			status: "healthy",
			detail: "Transaction access verified.",
		});
		expect(send).not.toHaveBeenCalled();
		await recordAccessCheck(env, failure);
		await recordAccessCheck(env, {
			...failure,
			status: "healthy",
			detail: "Transaction access verified.",
		});
		await recordAccessCheck(env, {
			...failure,
			status: "healthy",
			detail: "Transaction access verified.",
		});
		expect(send).toHaveBeenCalledTimes(2);
		expect(send.mock.calls[1][0].raw).toContain(
			"Subject: Monzo Balancer: transactions recovered",
		);
		expect(send.mock.calls[1][0].raw).toContain(
			"Pot transfers were not tested",
		);
	});

	it("does not treat an untested lookup as recovery", async () => {
		await recordAccessCheck(env, failure);
		await recordAccessCheck(env, {
			...failure,
			status: "untested",
			detail: "No transactions available.",
		});
		expect(send).toHaveBeenCalledTimes(1);
		await recordAccessCheck(env, {
			...failure,
			status: "healthy",
			detail: "Verified.",
		});
		expect(send).toHaveBeenCalledTimes(2);
	});

	it("keeps account and check incidents separate", async () => {
		await recordAccessCheck(env, failure);
		await recordAccessCheck(env, { ...failure, check: "withdrawals" });
		await recordAccessCheck(env, { ...failure, accountId: "acc_other" });
		await recordAccessCheck(env, {
			...failure,
			status: "healthy",
			detail: "Verified.",
		});
		expect(send).toHaveBeenCalledTimes(4);
		expect(
			store.database
				.prepare(
					"SELECT status FROM access_checks WHERE check_name='withdrawals'",
				)
				.get(),
		).toMatchObject({ status: "unhealthy" });
	});

	it("claims concurrent notifications once", async () => {
		await Promise.all([
			recordAccessCheck(env, failure),
			recordAccessCheck(env, failure),
		]);
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("retries email delivery on the next observation", async () => {
		send.mockRejectedValueOnce(new Error("delivery unavailable"));
		await expect(recordAccessCheck(env, failure)).resolves.toBeUndefined();
		expect(
			store.database
				.prepare("SELECT notified_status, claim_id FROM access_checks")
				.get(),
		).toMatchObject({ notified_status: "healthy", claim_id: null });
		await recordAccessCheck(env, failure);
		expect(send).toHaveBeenCalledTimes(2);
	});

	it("retries pending alerts without a new observation", async () => {
		send.mockRejectedValueOnce(new Error("delivery unavailable"));
		await recordAccessCheck(env, { ...failure, check: "withdrawals" });
		await flushPendingAccessAlerts(env);
		expect(send).toHaveBeenCalledTimes(2);
		expect(
			store.database.prepare("SELECT notified_status FROM access_checks").get(),
		).toMatchObject({ notified_status: "unhealthy" });
	});

	it("retains a recovery that occurs while the failure email is being sent", async () => {
		let finish!: () => void;
		send.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
		);
		const failureSend = recordAccessCheck(env, failure);
		await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
		await recordAccessCheck(env, {
			...failure,
			status: "healthy",
			detail: "Verified.",
		});
		finish();
		await failureSend;
		await flushPendingAccessAlerts(env);
		expect(send).toHaveBeenCalledTimes(2);
		expect(send.mock.calls[1][0].raw).toContain("transactions recovered");
	});

	it("retries an expired notification lease", async () => {
		await recordAccessCheck(env, failure);
		store.database.exec(
			"UPDATE access_checks SET notified_status='healthy', pending_status='unhealthy', pending_detail=detail, pending_checked_at=checked_at, claim_id='dead-worker', claim_until=0",
		);
		await recordAccessCheck(env, failure);
		expect(send).toHaveBeenCalledTimes(2);
	});

	it("preserves an undelivered failure after recovery and sends both in order", async () => {
		send.mockRejectedValueOnce(new Error("email unavailable"));
		await recordAccessCheck(env, failure);
		await recordAccessCheck(env, {
			...failure,
			status: "healthy",
			detail: "Verified again.",
		});
		await flushPendingAccessAlerts(env);
		expect(send).toHaveBeenCalledTimes(3);
		expect(send.mock.calls[1][0].raw).toContain("transactions failed");
		expect(send.mock.calls[1][0].raw).toContain("HTTP 403");
		expect(send.mock.calls[2][0].raw).toContain("transactions recovered");
		expect(
			store.database
				.prepare(
					"SELECT status, notified_status, pending_status FROM access_checks",
				)
				.get(),
		).toMatchObject({
			status: "healthy",
			notified_status: "healthy",
			pending_status: null,
		});
	});

	it("does not let notification database failures escape", async () => {
		store.database.exec("DROP TABLE access_checks");
		await expect(recordAccessCheck(env, failure)).resolves.toBeUndefined();
		expect(send).not.toHaveBeenCalled();
	});
});
