import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/AuthService.js";
import {
  ProviderAnalyticsService,
  providerAnalyticsQuery,
  portfolioEvolutionQuery,
} from "../services/providerAnalytics/ProviderAnalyticsService.js";

export async function providerAnalyticsRoutes(app: FastifyInstance) {
  const auth = new AuthService(),
    service = new ProviderAnalyticsService();
  app.addHook("onClose", () => service.close());
  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof z.ZodError ? 400 : ((error as { statusCode?: number }).statusCode ?? 502);
    reply.code(status).send({
      message:
        status === 400
          ? "Informe um período de até 366 dias ou um ano válido, sem datas futuras."
          : status < 500
            ? (error as Error).message
            : "Não foi possível consultar o painel. Tente atualizar.",
    });
  });
  app.get("/portfolio-evolution", { logLevel: "silent" }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const user = await auth.requirePermission(request, "analytics.dashboard.view");
    if (!auth.can(user, "churn.dashboard") && !auth.can(user, "support.customers.view"))
      throw Object.assign(new Error("Sem permissão para consultar a carteira."), { statusCode: 403 });
    const { year, mode } = portfolioEvolutionQuery.parse(request.query);
    const controller = new AbortController();
    const disconnected = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.on("close", disconnected);
    try {
      return await service.portfolioEvolution(year, controller.signal, mode);
    } finally {
      reply.raw.off("close", disconnected);
    }
  });
  app.get("/dashboard", { logLevel: "silent" }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const user = await auth.requirePermission(request, "analytics.dashboard.view"),
      query = providerAnalyticsQuery.parse(request.query);
    const controller = new AbortController();
    const disconnected = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.on("close", disconnected);
    try {
      return await service.dashboard(query, (p) => auth.can(user, p), controller.signal);
    } finally {
      reply.raw.off("close", disconnected);
    }
  });
}
