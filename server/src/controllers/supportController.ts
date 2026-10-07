import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/AuthService.js";
import { SupportService } from "../services/support/SupportService.js";
import { SupportCaseService, casePageQuery } from "../services/support/SupportCaseService.js";
import { CustomerAnalysisService } from "../services/support/CustomerAnalysisService.js";

const pagination = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((n) => n === 10 || n === 25)
    .default(10),
});
export const supportCustomerQuery = pagination.extend({
  status: z.enum(["active", "inactive", "all"]).default("active"),
  search: z.string().trim().max(120).default(""),
  searchBy: z.enum(["name", "id", "login", "document", "address"]).default("name"),
});
const ids = z.object({ id: z.coerce.number().int().positive(), loginId: z.coerce.number().int().positive().optional() });
export async function supportRoutes(app: FastifyInstance) {
  const auth = new AuthService();
  const service = new SupportService();
  const caseService = new SupportCaseService();
  app.addHook("onClose", () => caseService.close());
  const options = { logLevel: "silent" as const };
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  app.addHook("preHandler", async (request) => {
    await auth.requireUser(request);
  });
  app.setErrorHandler((error, _request, reply) => {
    const details = error as { statusCode?: number; message?: string };
    const status =
      error instanceof z.ZodError
        ? 400
        : details.statusCode && details.statusCode >= 400 && details.statusCode < 500
          ? details.statusCode
          : 502;
    reply.code(status).send({
      message:
        error instanceof z.ZodError
          ? "Revise os filtros informados."
          : status === 502
            ? "Não foi possível consultar o IXC agora. Tente atualizar a consulta."
            : details.message,
    });
  });
  app.get("/customers", options, async (request) => {
    await auth.requirePermission(request, "support.customers.view");
    return service.customers(supportCustomerQuery.parse(request.query));
  });
  app.get("/customers/:id", options, async (request) => {
    await auth.requirePermission(request, "support.customer.view");
    return service.customer(ids.parse(request.params).id);
  });
  app.get("/customers/:id/analysis", options, async (request, reply) => {
    await auth.requirePermission(request, "support.customer.view", "support.customer.analyze");
    const customerId = ids.parse(request.params).id;
    const controller = new AbortController();
    const disconnected = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.on("close", disconnected);
    try {
      return await new CustomerAnalysisService().analyze(customerId, controller.signal);
    } finally {
      reply.raw.off("close", disconnected);
    }
  });
  app.get("/customers/:id/contracts", options, async (request) => {
    await auth.requirePermission(request, "support.customer.view", "support.contract.view");
    return service.contracts(ids.parse(request.params).id, pagination.parse(request.query));
  });
  app.get("/customers/:id/logins", options, async (request) => {
    const user = await auth.requirePermission(request, "support.customer.view", "support.logins.view");
    return service.logins(ids.parse(request.params).id, pagination.parse(request.query), auth.can(user, "support.equipment.access"));
  });
  for (const kind of ["orders", "tickets"] as const)
    app.get(`/customers/:id/${kind}`, options, async (request) => {
      await auth.requirePermission(request, "support.customer.view", kind === "orders" ? "support.orders.view" : "support.tickets.view");
      return service.cases(ids.parse(request.params).id, kind, pagination.parse(request.query));
    });
  for (const kind of ["orders", "tickets"] as const) {
    for (const section of ["detail", "messages", "movements"] as const) {
      const suffix = section === "detail" ? "" : `/${section}`;
      app.get(`/customers/:id/${kind}/:caseId${suffix}`, options, async (request, reply) => {
        await auth.requirePermission(request, "support.customer.view", kind === "orders" ? "support.orders.view" : "support.tickets.view");
        const { id, caseId } = z
          .object({ id: z.coerce.number().int().positive(), caseId: z.coerce.number().int().positive() })
          .parse(request.params);
        const query = casePageQuery.parse(request.query);
        const controller = new AbortController();
        const disconnected = () => {
          if (!reply.raw.writableEnded) controller.abort();
        };
        reply.raw.on("close", disconnected);
        try {
          return section === "detail"
            ? await caseService.detail(id, kind, caseId, controller.signal)
            : await caseService.history(id, kind, caseId, section, query, controller.signal);
        } finally {
          reply.raw.off("close", disconnected);
        }
      });
    }
  }
  app.get("/contracts/:id", options, async (request) => {
    await auth.requirePermission(request, "support.contract.view");
    return service.technical.contract(ids.parse(request.params).id);
  });
  app.get("/contracts/:id/comodato", options, async (request) => {
    await auth.requirePermission(request, "support.contract.view", "support.comodato.view");
    return service.comodato(ids.parse(request.params).id, pagination.parse(request.query));
  });
  app.get("/contracts/:id/logins", options, async (request) => {
    const user = await auth.requirePermission(request, "support.contract.view", "support.logins.view");
    return service.technical.logins(
      ids.parse(request.params).id,
      pagination.parse(request.query),
      auth.can(user, "support.equipment.access")
    );
  });
  app.get("/contracts/:id/logins/:loginId", options, async (request) => {
    const user = await auth.requirePermission(request, "support.contract.view", "support.logins.view");
    const { id, loginId } = ids.required().parse(request.params);
    return service.technical.login(id, loginId, auth.can(user, "support.equipment.access"));
  });
  app.get("/contracts/:id/logins/:loginId/secrets/:field", options, async (request) => {
    await auth.requirePermission(request, "support.contract.view", "support.logins.view", "support.credentials.view");
    const { id, loginId } = ids.required().parse(request.params);
    const { field } = z.object({ field: z.enum(["authentication", "router1", "router2", "wifi24", "wifi5", "wpa"]) }).parse(request.params);
    return service.technical.loginSecret(id, loginId, field);
  });
  app.post("/contracts/:id/logins/:loginId/access", options, async (request) => {
    await auth.requirePermission(
      request,
      "support.contract.view",
      "support.logins.view",
      "support.credentials.view",
      "support.equipment.access"
    );
    const { id, loginId } = ids.required().parse(request.params);
    const { protocol, port } = z
      .object({ protocol: z.enum(["http", "https"]), port: z.union([z.literal(80), z.literal(7000), z.literal(7001)]) })
      .parse(request.body);
    return service.technical.loginAccess(id, loginId, protocol, port);
  });
}
