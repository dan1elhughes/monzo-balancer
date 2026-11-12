import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerRefreshRoutes } from "./refresh";
import { Env } from "../types";
import { getUserById } from "../services/user.service";
import { refreshMonzoUser } from "../services/token-refresh";

vi.mock("../services/user.service", () => ({ getUserById: vi.fn() }));
vi.mock("../services/token-refresh", () => ({ refreshMonzoUser: vi.fn() }));

describe("manual token refresh", () => {
	beforeEach(() => vi.resetAllMocks());
	it("uses the shared refresh and permission checks without returning token previews", async () => {
		const user = {
			user_id: "user_test",
			access_token: "secret-access",
			refresh_token: "secret-refresh",
		} as any;
		vi.mocked(getUserById).mockResolvedValue(user);
		const app = new Hono<{ Bindings: Env }>();
		registerRefreshRoutes(app);
		const response = await app.fetch(
			new Request("https://test/refresh/user_test", { method: "POST" }),
			{} as Env,
		);
		expect(response.status).toBe(200);
		expect(refreshMonzoUser).toHaveBeenCalledWith(expect.anything(), user);
		const text = await response.text();
		expect(text).not.toContain("secret");
		expect(text).not.toContain("token_preview");
	});
});
