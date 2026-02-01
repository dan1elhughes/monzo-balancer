import { Hono } from "hono";
import { Env } from "./types";
import { registerAuthRoutes } from "./routes/auth";
import { registerSetupRoutes } from "./routes/setup";
import { registerWebhookRoutes } from "./routes/webhook";
import { registerRefreshRoutes } from "./routes/refresh";
import { handleScheduledTokenRefresh } from "./scheduled/token-refresh";

const app = new Hono<{ Bindings: Env }>();

// Register all routes
registerAuthRoutes(app);
registerSetupRoutes(app);
registerWebhookRoutes(app);
registerRefreshRoutes(app);

// Handle 404s
app.notFound((c) => c.text("Not Found", 404));

// Export the Hono app as the default export for HTTP requests
export default {
	fetch: app.fetch,
	scheduled: handleScheduledTokenRefresh,
};
