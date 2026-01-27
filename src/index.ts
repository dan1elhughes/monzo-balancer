import { Hono } from "hono";
import { Env } from "./types";
import { registerAuthRoutes } from "./routes/auth";
import { registerSetupRoutes } from "./routes/setup";
import { registerWebhookRoutes } from "./routes/webhook";

const app = new Hono<{ Bindings: Env }>();

// Register all routes
registerAuthRoutes(app);
registerSetupRoutes(app);
registerWebhookRoutes(app);

// Handle 404s
app.notFound((c) => c.text("Not Found", 404));

export default app;
