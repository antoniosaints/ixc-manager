import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/AuthService.js";
import { SettingsService } from "../services/settings/SettingsService.js";

import { AnalyticsSettingsService } from "../services/settings/AnalyticsSettingsService.js";
import { churnSettings } from "../services/settings/ChurnSettingsService.js";

export async function settingsRoutes(app: FastifyInstance) {
  const auth = new AuthService(),
    service = new SettingsService(),
    analytics = new AnalyticsSettingsService();
  app.addHook("onClose", () => analytics.close());
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof z.ZodError ? 400 : Number((error as { statusCode?: number }).statusCode ?? 500);
    reply.code(status).send({
      message:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Revise os dados informados.")
          : status >= 500
            ? "Não foi possível carregar ou salvar as configurações."
            : (error as Error).message,
    });
  });
  app.get("/appearance", async () => service.appearance());
  app.put("/appearance", { bodyLimit: 1_048_576, logLevel: "silent" }, async (request) => {
    const user = await auth.requireUser(request, ["ADMIN"]);
    return service.saveAppearance(request.body, user.id);
  });
  app.get("/analytics", { logLevel: "silent" }, async (request) => {
    await auth.requireUser(request, ["ADMIN"]);
    return analytics.get();
  });
  app.get("/churn", { logLevel: "silent" }, async (request) => {
    await auth.requireUser(request, ["ADMIN"]);
    return churnSettings.get();
  });
  app.put("/churn", { logLevel: "silent", bodyLimit: 4096 }, async (request) => {
    const user = await auth.requireUser(request, ["ADMIN"]);
    return churnSettings.save(request.body, user.id);
  });
  app.put("/analytics", { logLevel: "silent", bodyLimit: 16384 }, async (request) => {
    const user = await auth.requireUser(request, ["ADMIN"]);
    return analytics.save(request.body, user.id);
  });
  app.get("/access", async (request) => {
    await auth.requireUser(request, ["ADMIN"]);
    return service.access();
  });
  app.post("/profiles", async (request) => {
    await auth.requireUser(request, ["ADMIN"]);
    return service.saveProfile(request.body);
  });
  app.put("/profiles/:id", async (request) => {
    await auth.requireUser(request, ["ADMIN"]);
    return service.saveProfile(request.body, z.object({ id: z.coerce.number().int().positive() }).parse(request.params).id);
  });
}
