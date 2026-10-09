import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/AuthService.js";
import {
  LoginToolsService,
  consumptionRange,
  loginToolScope,
  loginAction,
  loginReadPermissions,
  loginActionPermissions,
  type LoginToolScope,
  type LoginAction,
} from "../services/network/LoginToolsService.js";
import { OnuBusyError } from "../services/network/OnuOperationStore.js";
const ids = z.object({ loginId: z.coerce.number().int().positive().safe() });
const tokenId = z.object({ token: z.string().uuid() });

export async function loginToolsRoutes(app: FastifyInstance) {
  const auth = new AuthService(),
    service = new LoginToolsService();
  app.addHook("onClose", () => service.close());
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as { statusCode?: number }).statusCode;
    const status = error instanceof z.ZodError ? 400 : statusCode && statusCode >= 400 && statusCode < 500 ? statusCode : 502;
    reply.code(status).send({
      message:
        error instanceof z.ZodError
          ? "Revise o login, o contexto e o período informado."
          : error instanceof OnuBusyError
            ? `Há uma operação em andamento ${error.blockage.scope === "olt" ? "na OLT" : "neste login"}. Aguarde ${error.blockage.retryAfterSeconds ?? 180} segundos e tente novamente. Nenhum comando foi enviado.`
            : status < 500
              ? (error as Error).message
              : "Não foi possível consultar ou coordenar a operação. Atualize e tente novamente.",
    });
  });
  const requireAccess = async (request: FastifyRequest, scope: LoginToolScope, action?: LoginAction) =>
    auth.requirePermission(request, ...loginReadPermissions(scope), ...(action ? [loginActionPermissions[action]] : []));
  app.get("/:loginId/consumption", { logLevel: "silent" }, async (request) => {
    const { loginId } = ids.parse(request.params);
    const q = z
      .object({
        module: z.string(),
        contractId: z.coerce.number().int().positive().safe().optional(),
        boxId: z.coerce.number().int().positive().safe().optional(),
        from: z.string(),
        to: z.string(),
      })
      .strict()
      .parse(request.query);
    const scope = loginToolScope.parse({
      module: q.module,
      ...(q.contractId ? { contractId: q.contractId } : {}),
      ...(q.boxId ? { boxId: q.boxId } : {}),
    });
    await requireAccess(request, scope);
    return service.consumption(loginId, scope, consumptionRange.parse({ from: q.from, to: q.to }));
  });
  app.post("/:loginId/plans", { logLevel: "silent", bodyLimit: 1024 }, async (request) => {
    const { loginId } = ids.parse(request.params);
    const input = z.object({ scope: loginToolScope, action: loginAction }).strict().parse(request.body);
    const user = await requireAccess(request, input.scope, input.action);
    return service.prepare(user.id, loginId, input.scope, input.action);
  });
  app.get("/operations/:token", { logLevel: "silent" }, async (request) => {
    const user = await auth.requireUser(request),
      token = tokenId.parse(request.params).token;
    const op = await service.operation(user.id, token);
    await requireAccess(request, loginToolScope.parse(op.plan.scope), loginAction.parse(op.plan.action));
    return { state: op.state, result: op.result ?? null };
  });
  app.post("/operations/:token/execute", { logLevel: "silent", bodyLimit: 256 }, async (request) => {
    z.object({ confirmed: z.literal(true) })
      .strict()
      .parse(request.body);
    const user = await auth.requireUser(request),
      token = tokenId.parse(request.params).token;
    return service.execute(user.id, token, async (scope, action) => {
      const current = await auth.authenticate(request);
      if (
        !current ||
        ![...loginReadPermissions(scope), loginActionPermissions[action]].every((permission) => auth.can(current, permission))
      )
        throw Object.assign(new Error("A permissão da operação foi revogada."), { statusCode: 403 });
      if (current.id !== user.id) throw Object.assign(new Error("A sessão mudou. Revise novamente."), { statusCode: 403 });
    });
  });
}
