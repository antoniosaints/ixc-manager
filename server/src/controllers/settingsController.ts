import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/AuthService.js";
import { SettingsService } from "../services/settings/SettingsService.js";

export async function settingsRoutes(app: FastifyInstance) {
  const auth = new AuthService(),
    service = new SettingsService();
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
