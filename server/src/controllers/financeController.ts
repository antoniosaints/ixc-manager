import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/AuthService.js";
import { financeQuery } from "../services/finance/FinanceService.js";

import { FinancePendingService, pendingQuery } from "../services/finance/FinancePendingService.js";
import { IxcReadDatabase } from "../integrations/ixc/database/IxcReadDatabase.js";
import { FinanceSqlService } from "../services/finance/FinanceSqlService.js";
import { FinanceAccountDetailService, accountDetailQuery } from "../services/finance/FinanceAccountDetailService.js";

/** Finance intentionally registers only GET routes. */
export async function financeRoutes(app: FastifyInstance) {
  const auth = new AuthService(),
    database = new IxcReadDatabase(),
    service = new FinanceSqlService(database),
    pending = new FinancePendingService(database),
    composition = new FinanceAccountDetailService(database);
  app.addHook("onClose", async () => {
    await database.close();
  });
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof z.ZodError ? 400 : ((error as { statusCode?: number }).statusCode ?? 502);
    reply.code(status).send({
      message:
        error instanceof z.ZodError
          ? "Revise as datas, o período (até 366 dias) e os filtros informados."
          : status < 500
            ? (error as Error).message
            : "Não foi possível consultar o financeiro no IXC. Atualize a consulta.",
    });
  });
  const read =
    (method: "dashboard" | "banks") => async (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => {
      await auth.requirePermission(request, "finance.dashboard.view");
      const query = financeQuery.parse(request.query);
      const controller = new AbortController();
      const disconnected = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      reply.raw.on("close", disconnected);
      try {
        return await service[method](query, controller.signal);
      } finally {
        reply.raw.off("close", disconnected);
      }
    };
  app.get("/options", { logLevel: "silent" }, async (request) => {
    await auth.requirePermission(request, "finance.dashboard.view");
    return pending.options();
  });
  app.get("/pending", { logLevel: "silent" }, async (request, reply) => {
    await auth.requirePermission(request, "finance.dashboard.view");
    const query = pendingQuery.parse(request.query);
    const controller = new AbortController();
    const disconnected = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.on("close", disconnected);
    try {
      return await pending.list(query, controller.signal);
    } finally {
      reply.raw.off("close", disconnected);
    }
  });
  app.get("/dashboard", { logLevel: "silent" }, read("dashboard"));
  app.get("/account-details", { logLevel: "silent" }, async (request, reply) => {
    await auth.requirePermission(request, "finance.dashboard.view");
    const query = accountDetailQuery.parse(request.query);
    const controller = new AbortController();
    const disconnected = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.on("close", disconnected);
    try {
      return await composition.list(query, controller.signal);
    } finally {
      reply.raw.off("close", disconnected);
    }
  });
  app.get("/banks", { logLevel: "silent" }, read("banks"));
}
