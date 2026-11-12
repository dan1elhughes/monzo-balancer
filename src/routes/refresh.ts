import { Context, Hono } from "hono";
import { Env } from "../types";
import { logger } from "../logger";
import { getUserById } from "../services/user.service";
import { refreshMonzoUser } from "../services/token-refresh";

export function registerRefreshRoutes(app: Hono<{ Bindings: Env }>): void {
	app.post("/refresh/:userId", handleRefresh);
	app.get("/refresh/:userId", handleRefresh);
}

async function handleRefresh(c: Context<{ Bindings: Env }>): Promise<Response> {
	const userId = c.req.param("userId");
	try {
		const user = await getUserById(c.env, userId);
		if (!user)
			return c.json({ status: "error", message: "User not found" }, 404);
		await refreshMonzoUser(c.env, user);
		return c.json({
			status: "success",
			message:
				"Token refreshed. Permission check results are recorded separately.",
			data: { user_id: userId },
		});
	} catch {
		logger.error("Token refresh failed", { userId });
		return c.json({ status: "error", message: "Token refresh failed" }, 500);
	}
}
