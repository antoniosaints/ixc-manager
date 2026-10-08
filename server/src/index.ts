import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { env } from "./config/env.js";
import { retentionRoutes } from "./controllers/retentionController.js";
import { authRoutes } from "./controllers/authController.js";
import { settingsRoutes } from "./controllers/settingsController.js";
import { supportRoutes } from "./controllers/supportController.js";
import { networkRoutes } from "./controllers/networkController.js";
import { financeRoutes } from "./controllers/financeController.js";
import { collectionsRoutes } from "./controllers/collectionsController.js";
import { upgradeRoutes } from "./controllers/upgradeController.js";
import { scheduleRetentionJobs } from "./queues/retentionQueue.js";
import "./workers/retentionWorker.js";
import { registerFrontend } from "./http/frontend.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: env.CORS_ORIGIN });
await app.register(websocket, { options: { maxPayload: 4096 } });
await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(settingsRoutes, { prefix: "/api/settings", logLevel: "silent" });
await app.register(retentionRoutes, { prefix: "/api/retention" });
await app.register(upgradeRoutes, { prefix: "/api/upgrades", logLevel: "silent" });
await app.register(supportRoutes, { prefix: "/api/support", logLevel: "silent" });
await app.register(networkRoutes, { prefix: "/api/network", logLevel: "silent" });
await app.register(financeRoutes, { prefix: "/api/finance", logLevel: "silent" });
await app.register(collectionsRoutes, { prefix: "/api/collections", logLevel: "silent" });
app.get("/health", async () => ({ status: "ok" }));
await registerFrontend(app, env.FRONTEND_DIST);
await app.listen({ port: env.PORT, host: "0.0.0.0" });

// The API remains available for reads even when the background queue is
// temporarily unavailable. Queue-dependent actions then return their own error
// instead of taking down every dashboard request at startup.
scheduleRetentionJobs().catch((error: unknown) => app.log.error(error, "Retention scheduler unavailable; retry after Redis is restored"));
