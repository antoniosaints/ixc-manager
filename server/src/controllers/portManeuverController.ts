import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/AuthService.js";
import { PortManeuverService, portManeuverInput } from "../services/network/PortManeuverService.js";
import { OnuBusyError } from "../services/network/OnuOperationStore.js";
const boxParams = z.object({ boxId: z.coerce.number().int().positive().safe() });
const operationParams = boxParams.extend({ token: z.string().uuid() });
const permissions = ["network.boxes.view", "network.logins.view", "network.ports.manage"] as const;

export async function portManeuverRoutes(app: FastifyInstance) {
  const auth = new AuthService(),
    service = new PortManeuverService();
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
          ? "Revise a CTO, o login e a porta selecionada."
          : error instanceof OnuBusyError
            ? `Outra operação está usando esta CTO, OLT ou login. Aguarde ${error.blockage.retryAfterSeconds ?? 180} segundos e consulte novamente. Esta tentativa não enviou gravações.`
            : status < 500
              ? (error as Error).message
              : "Não foi possível consultar ou coordenar a manobra. Atualize e tente novamente.",
    });
  });
  const access = (request: FastifyRequest) => auth.requirePermission(request, ...permissions);
  app.get("/logins/:loginId", { logLevel: "silent" }, async (request) => {
    await access(request);
    return service.loginContext(z.object({ loginId: z.coerce.number().int().positive().safe() }).parse(request.params).loginId);
  });
  app.get("/boxes/:boxId/login-ports/:loginId", { logLevel: "silent" }, async (request) => {
    await access(request);
    const { boxId, loginId } = boxParams.extend({ loginId: z.coerce.number().int().positive().safe() }).parse(request.params);
    return service.options(boxId, loginId);
  });
  app.get("/boxes/:boxId", { logLevel: "silent" }, async (request) => {
    await access(request);
    return service.options(boxParams.parse(request.params).boxId);
  });
  app.get("/boxes/:boxId/destinations", { logLevel: "silent" }, async (request) => {
    await access(request);
    const { search } = z.object({ search: z.string().trim().max(100).default("") }).parse(request.query);
    return service.destinations(boxParams.parse(request.params).boxId, search);
  });
  app.post("/boxes/:boxId/plans", { logLevel: "silent", bodyLimit: 512 }, async (request) => {
    const user = await access(request);
    return service.prepare(user.id, boxParams.parse(request.params).boxId, portManeuverInput.parse(request.body));
  });
  app.get("/boxes/:boxId/operations/:token", { logLevel: "silent" }, async (request) => {
    const user = await access(request),
      { boxId, token } = operationParams.parse(request.params);
    return service.status(user.id, token, boxId);
  });
  app.post("/boxes/:boxId/operations/:token/recovery", { logLevel: "silent", bodyLimit: 128 }, async (request) => {
    const user = await access(request),
      { boxId, token } = operationParams.parse(request.params);
    z.object({}).strict().parse(request.body);
    return service.prepareRecovery(user.id, token, boxId);
  });
  app.post("/boxes/:boxId/operations/:token/execute", { logLevel: "silent", bodyLimit: 128 }, async (request) => {
    const user = await access(request),
      { boxId, token } = operationParams.parse(request.params);
    z.object({ confirmed: z.literal(true) })
      .strict()
      .parse(request.body);
    return service.execute(user.id, token, boxId, async () => {
      const current = await auth.authenticate(request);
      if (!current || current.id !== user.id || !permissions.every((permission) => auth.can(current, permission)))
        throw Object.assign(new Error("A sessão ou permissão mudou. Nenhum próximo passo será enviado."), { statusCode: 403 });
    });
  });
}
