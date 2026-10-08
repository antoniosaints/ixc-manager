import type { FastifyInstance, FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { AuthService } from "../services/AuthService.js";
import { IxcReadDatabase } from "../integrations/ixc/database/IxcReadDatabase.js";
import { NetworkService, boxesQuery, boxLoginsQuery } from "../services/network/NetworkService.js";
import { NetworkMonitor, connectionPermissions } from "../services/network/NetworkMonitor.js";
import { LoginSignalService } from "../services/upgrades/LoginSignalService.js";
import { env } from "../config/env.js";
import { NetworkLoginService, loginListQuery } from "../services/network/NetworkLoginService.js";
import { onuRoutes } from "./onuController.js";

/** Reads remain separate from explicitly permissioned ONU operations. */
export async function networkRoutes(app: FastifyInstance) {
  await app.register(onuRoutes, { prefix: "/onus" });
  if (!app.hasDecorator("websocketServer")) await app.register(websocket, { options: { maxPayload: 4096 } });
  const auth = new AuthService(),
    db = new IxcReadDatabase(),
    service = new NetworkService(db),
    logins = new NetworkLoginService(db),
    signals = new LoginSignalService(db);
  const monitor = new NetworkMonitor(db, async (token, scope) => {
    const user = await auth.authenticate({ headers: { authorization: `Bearer ${token}` } } as FastifyRequest);
    if (!user) throw Object.assign(new Error("Autenticação necessária"), { statusCode: 401 });
    if (!connectionPermissions(scope).every((permission) => auth.can(user, permission)))
      throw Object.assign(new Error("Sem permissão"), { statusCode: 403 });
    return user;
  });
  app.addHook("onClose", async () => {
    monitor.close();
    await db.close();
  });
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  app.setErrorHandler((error, _request, reply) => {
    const code = (error as { statusCode?: number }).statusCode;
    const status = error instanceof z.ZodError ? 400 : code && code >= 400 && code < 500 ? code : 502;
    reply.code(status).send({
      message:
        error instanceof z.ZodError
          ? "Revise os filtros da consulta de rede."
          : status === 422
            ? "A consulta demorou mais que o esperado. Use a busca para restringir as caixas e tente novamente."
            : status < 500
              ? (error as Error).message
              : "Não foi possível consultar a rede no IXC. Tente atualizar a consulta.",
    });
  });
  app.get(
    "/live",
    {
      websocket: true,
      logLevel: "silent",
      preValidation: async (request) => {
        const origin = request.headers.origin;
        let sameOrigin = false;
        try {
          sameOrigin = !!origin && new URL(origin).host === request.headers.host && /^https?:/.test(origin);
        } catch {
          /* Invalid origin. */
        }
        if (origin && origin !== env.CORS_ORIGIN && !sameOrigin)
          throw Object.assign(new Error("Origem não permitida"), { statusCode: 403 });
        if (Object.keys(request.query as object).length)
          throw Object.assign(new Error("Use autenticação pela conexão"), { statusCode: 400 });
      },
    },
    (socket) => monitor.attach(socket)
  );
  for (const path of ["/logins", "/logins/filters", "/logins/:loginId", "/logins/:loginId/signal"] as const)
    app.get(path, { logLevel: "silent" }, async (request, reply) => {
      await auth.requirePermission(request, "network.logins.list", ...(path.includes(":loginId") ? ["network.logins.view" as const] : []));
      const controller = new AbortController();
      const disconnected = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      reply.raw.on("close", disconnected);
      try {
        if (path === "/logins") return await logins.list(loginListQuery.parse(request.query), controller.signal);
        if (path === "/logins/filters") return await logins.filters(controller.signal);
        const loginId = z.object({ loginId: z.coerce.number().int().positive().safe() }).parse(request.params).loginId;
        const result = await logins.detail(loginId, controller.signal);
        if (path.endsWith("/signal")) {
          if (!result.login.customerId) throw Object.assign(new Error("Cliente do login não encontrado."), { statusCode: 404 });
          return await signals.read({ loginId, customerId: result.login.customerId, contractId: result.login.contractId });
        }
        return result;
      } finally {
        reply.raw.off("close", disconnected);
      }
    });
  for (const path of [
    "/boxes",
    "/boxes/:id",
    "/boxes/:id/logins",
    "/boxes/:id/logins/:loginId",
    "/boxes/:id/logins/:loginId/signal",
  ] as const)
    app.get(path, { logLevel: "silent" }, async (request, reply) => {
      await auth.requirePermission(request, "network.boxes.view", ...(path.includes("/logins") ? ["network.logins.view" as const] : []));
      const boxes = path === "/boxes" ? boxesQuery.parse(request.query) : null;
      if (boxes?.search && ["login", "ip", "customer"].includes(boxes.searchBy))
        await auth.requirePermission(request, "network.logins.view");
      const controller = new AbortController();
      const disconnected = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      reply.raw.on("close", disconnected);
      try {
        if (boxes) return await service.boxes(boxes, controller.signal);
        const id = z.object({ id: z.coerce.number().int().positive().safe() }).parse(request.params).id;
        if (path === "/boxes/:id") return await service.detail(id, controller.signal);
        if (path.includes(":loginId")) {
          const result = await service.login(
            id,
            z.object({ loginId: z.coerce.number().int().positive().safe() }).parse(request.params).loginId,
            controller.signal
          );
          if (path.endsWith("/signal")) {
            if (!result.login.customerId) throw Object.assign(new Error("Cliente do login não encontrado no IXC."), { statusCode: 404 });
            return await signals.read({
              loginId: result.login.id,
              customerId: result.login.customerId,
              contractId: result.login.contractId,
              boxId: id,
            });
          }
          return result;
        }
        return await service.logins(id, boxLoginsQuery.parse(request.query), controller.signal);
      } finally {
        reply.raw.off("close", disconnected);
      }
    });
}
