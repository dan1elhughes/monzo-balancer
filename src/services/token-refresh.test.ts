import { beforeEach, describe, expect, it, vi } from "vitest";
import { Env } from "../types";
import { refreshMonzoUser } from "./token-refresh";
import { createMonzoClient, saveTokens } from "./monzo";
import { checkUserAccess, recordUserCheck } from "./access-checks";

vi.mock("./monzo", () => ({ createMonzoClient: vi.fn(), saveTokens: vi.fn() }));
vi.mock("./access-checks", async (original) => ({
	...(await original<typeof import("./access-checks")>()),
	checkUserAccess: vi.fn(),
	recordUserCheck: vi.fn(),
}));
vi.mock("./access-alerts", () => ({ recordAccessCheck: vi.fn() }));

describe("refreshMonzoUser", () => {
	const env = {} as Env;
	const user = {
		user_id: "user_test",
		access_token: "old-access",
		refresh_token: "old-refresh",
	};
	const refresh = vi.fn();
	const freshClient = { whoami: vi.fn() };
	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(createMonzoClient)
			.mockReturnValueOnce({ refresh } as any)
			.mockReturnValue(freshClient as any);
		refresh.mockResolvedValue({
			access_token: "new-access",
			expires_in: 100,
			user_id: "user_test",
		});
	});

	it("saves tokens before testing access with the new token and preserves a missing refresh token", async () => {
		const client = await refreshMonzoUser(env, user);
		expect(client).toBe(freshClient);
		expect(saveTokens).toHaveBeenCalledWith(
			env,
			"user_test",
			"new-access",
			"old-refresh",
			expect.any(Number),
		);
		expect(createMonzoClient).toHaveBeenLastCalledWith(
			env,
			"new-access",
			"old-refresh",
		);
		expect(checkUserAccess).toHaveBeenCalledWith(env, "user_test", freshClient);
		expect(vi.mocked(saveTokens).mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(checkUserAccess).mock.invocationCallOrder[0],
		);
		expect(recordUserCheck).toHaveBeenCalledWith(
			env,
			"user_test",
			"token_refresh",
			"healthy",
			expect.any(String),
		);
	});

	it("alerts refresh failure without running access checks or saving tokens", async () => {
		const error = {
			response: { status: 400 },
			message: "secret-refresh-token",
		};
		refresh.mockRejectedValue(error);
		await expect(refreshMonzoUser(env, user)).rejects.toBe(error);
		expect(saveTokens).not.toHaveBeenCalled();
		expect(checkUserAccess).not.toHaveBeenCalled();
		expect(recordUserCheck).toHaveBeenCalledWith(
			env,
			"user_test",
			"token_refresh",
			"unhealthy",
			"Token refresh failed (HTTP 400).",
		);
	});

	it("does not save refreshed credentials for a different user", async () => {
		refresh.mockResolvedValue({
			access_token: "wrong-user-access",
			user_id: "user_other",
		});
		await expect(refreshMonzoUser(env, user)).rejects.toThrow("authentication");
		expect(saveTokens).not.toHaveBeenCalled();
		expect(recordUserCheck).toHaveBeenCalledWith(
			env,
			"user_test",
			"token_refresh",
			"unhealthy",
			expect.any(String),
		);
	});
});
