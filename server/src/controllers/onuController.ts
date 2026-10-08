import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/AuthService.js";
import { IxcReadDatabase } from "../integrations/ixc/database/IxcReadDatabase.js";
import { OnuService, onuListQuery, onuPlanRequest } from "../services/network/OnuService.js";
import { OnuBusyError } from "../services/network/OnuOperationStore.js";
const id = z.coerce.number().int().positive().safe();
export async function onuRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  const auth = new AuthService(),
    db = new IxcReadDatabase(),
    service = new OnuService(db);
  app.addHook("onClose", async () => {
    await service.close();
    await db.close();
  });
  app.setErrorHandler((error, _request, reply) => {
    const code = (error as { statusCode?: number }).statusCode,
      status = error instanceof z.ZodError ? 400 : code && code >= 400 && code < 500 ? code : 502;
    if (error instanceof OnuBusyError && error.blockage.retryAfterSeconds !== null)
      reply.header("Retry-After", String(error.blockage.retryAfterSeconds));
    reply.code(status).send({
      ...(error instanceof OnuBusyError
        ? { code: error.code, blockage: error.blockage }
        : (error as { code?: string }).code === "ONU_REVIEW_UNAVAILABLE"
          ? { code: "ONU_REVIEW_UNAVAILABLE" }
          : {}),
      message:
        error instanceof z.ZodError
          ? "Revise os campos da ONU e confirme os dados selecionados."
          : status < 500
            ? (error as Error).message
            : "Não foi possível consultar ou coordenar a operação de ONU. Atualize e tente novamente.",
    });
  });
  for (const path of [
    "/contracts",
    "/contracts/:id/logins",
    "/profiles/:id",
    "/options",
    "/pending",
    "/registered",
    "/logins",
    "/boxes/:id/ports",
    "/:id",
    "/operations/:token",
  ] as const)
    app.get(path, { logLevel: "silent" }, async (request) => {
      const user = await auth.requirePermission(request, "network.onus.view");
      if (path === "/contracts") {
        await auth.requirePermission(request, "network.equipment.authorize");
        return service.contracts(z.object({ search: z.string().trim().min(1).max(100) }).parse(request.query).search);
      }
      if (path === "/contracts/:id/logins") {
        await auth.requirePermission(request, "network.equipment.authorize");
        return service.contractLogins(
          z.object({ id }).parse(request.params).id,
          z.object({ search: z.string().trim().max(100).default("") }).parse(request.query).search
        );
      }
      if (path === "/profiles/:id") {
        await auth.requirePermission(request, "network.equipment.authorize");
        return service.profile(z.object({ id }).parse(request.params).id, z.object({ oltId: id }).parse(request.query).oltId);
      }
      if (path === "/options") {
        const q = z.object({ oltId: id.optional(), projectId: id.optional() }).parse(request.query);
        return service.options(q.oltId, q.projectId);
      }
      if (path === "/pending") return service.pending(onuListQuery.parse(request.query));
      if (path === "/registered") return service.registered(onuListQuery.parse(request.query));
      if (path === "/logins") {
        const q = z
          .object({
            search: z.string().trim().min(1).max(100),
            kind: z.enum(["login", "customer", "document", "contractId", "loginId"]).default("login"),
          })
          .parse(request.query);
        return service.logins(q.search, q.kind);
      }
      if (path === "/operations/:token") {
        await auth.requirePermission(request, "network.equipment.authorize");
        return service.status(user.id, z.object({ token: z.string().uuid() }).parse(request.params).token);
      }
      const onuId = z.object({ id }).parse(request.params).id;
      if (path === "/boxes/:id/ports") {
        const q = z.object({ loginId: id.optional(), onuId: id.optional() }).parse(request.query);
        return service.ports(onuId, q.loginId, q.onuId);
      }
      return service.detail(onuId);
    });
  app.post("/plans", { logLevel: "silent", bodyLimit: 8192 }, async (request) => {
    const user = await auth.requirePermission(request, "network.onus.view", "network.equipment.authorize");
    return service.prepare(user.id, onuPlanRequest.parse(request.body));
  });
  app.post("/operations/:token/execute", { logLevel: "silent", bodyLimit: 256 }, async (request) => {
    const user = await auth.requirePermission(request, "network.onus.view", "network.equipment.authorize");
    const token = z.object({ token: z.string().uuid() }).parse(request.params).token;
    z.object({ confirmed: z.literal(true) })
      .strict()
      .parse(request.body);
    return service.execute(user.id, token, async () => {
      const current = await auth.authenticate(request);
      if (
        !current ||
        current.id !== user.id ||
        !auth.can(current, "network.onus.view") ||
        !auth.can(current, "network.equipment.authorize")
      )
        throw Object.assign(new Error("A permissão de operar equipamentos foi revogada."), { statusCode: 403 });
    });
  });
}
