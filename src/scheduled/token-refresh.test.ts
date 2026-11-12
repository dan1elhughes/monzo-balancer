import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleScheduledTokenRefresh } from "./token-refresh";
import { checkUserAccess } from "../services/access-checks";
import { refreshMonzoUser } from "../services/token-refresh";
import { createMonzoClient } from "../services/monzo";
import { Env } from "../types";

vi.mock("../services/monzo", () => ({ createMonzoClient: vi.fn() }));
vi.mock("../services/token-refresh", () => ({ refreshMonzoUser: vi.fn() }));
vi.mock("../services/access-checks", () => ({ checkUserAccess: vi.fn() }));
vi.mock("../services/access-alerts", () => ({
	flushPendingAccessAlerts: vi.fn(),
}));

describe("scheduled access monitoring", () => {
	const all = vi.fn();
	const prepare = vi.fn(() => ({ all, bind: vi.fn(() => ({ all })) }));
	const env = { DB: { prepare } } as unknown as Env;
	const event = { scheduledTime: 123, cron: "0 * * * *" } as ScheduledEvent;
	const context = {} as ExecutionContext;
	const user = {
		user_id: "user_test",
		access_token: "access",
		refresh_token: "refresh",
		token_expires_at: Date.now() + 24 * 60 * 60 * 1000,
	};
	const client = {} as any;

	beforeEach(() => {
		vi.clearAllMocks();
		all.mockResolvedValue({ results: [user] });
		vi.mocked(createMonzoClient).mockReturnValue(client);
	});

	it("checks users with configured accounts even when no token needs refresh", async () => {
		await handleScheduledTokenRefresh(event, env, context);
		expect(prepare).toHaveBeenCalledWith(expect.stringContaining("EXISTS"));
		expect(refreshMonzoUser).not.toHaveBeenCalled();
		expect(checkUserAccess).toHaveBeenCalledWith(env, user.user_id, client);
	});

	it("refreshes expiring or missing-expiry tokens, which checks the new token", async () => {
		all.mockResolvedValue({ results: [{ ...user, token_expires_at: null }] });
		await handleScheduledTokenRefresh(event, env, context);
		expect(refreshMonzoUser).toHaveBeenCalledWith(
			env,
			expect.objectContaining({ user_id: user.user_id }),
		);
		expect(checkUserAccess).not.toHaveBeenCalled();
	});

	it("continues to check other users when a refresh fails", async () => {
		all.mockResolvedValue({
			results: [
				{ ...user, token_expires_at: 0 },
				{ ...user, user_id: "user_other" },
			],
		});
		vi.mocked(refreshMonzoUser).mockRejectedValueOnce(
			new Error("refresh failed"),
		);
		await handleScheduledTokenRefresh(event, env, context);
		expect(checkUserAccess).toHaveBeenCalledWith(env, "user_test", client);
		expect(checkUserAccess).toHaveBeenCalledWith(env, "user_other", client);
	});
});
