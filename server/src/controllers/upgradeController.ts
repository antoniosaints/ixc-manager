import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/AuthService.js";
import { UpgradeService } from "../services/upgrades/UpgradeService.js";
import { createUpgradePdf } from "../services/upgrades/UpgradePdf.js";
import { SettingsService } from "../services/settings/SettingsService.js";

const pagination = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((n) => n === 10 || n === 25)
    .default(10),
});
export const upgradeQuery = pagination.extend({
  status: z.enum(["eligible", "expired", "expiring", "missing"]).default("eligible"),
  days: z.coerce
    .number()
    .int()
    .refine((n) => [30, 60, 90].includes(n))
    .default(30),
  search: z.string().trim().max(120).default(""),
  searchBy: z.enum(["name", "customerId", "contractId"]).default("name"),
  plan: z.string().trim().max(100).default(""),
  planId: z.coerce.number().int().positive().safe().optional(),
  branchId: z.coerce.number().int().positive().safe().optional(),
});
const exportBody = z
  .object({
    filters: upgradeQuery,
    themeMode: z.enum(["light", "dark"]).default("light"),
    includeNotes: z.boolean().default(true),
    peopleCount: z.number().int().min(1).max(20),
    clientsPerPerson: z.number().int().min(1).max(20),
    names: z.array(z.string().trim().max(80)).max(20).default([]),
    contractIds: z.array(z.number().int().positive()).min(1).max(200).optional(),
  })
  .refine((body) => body.peopleCount * body.clientsPerPerson <= 200);

export async function upgradeRoutes(app: FastifyInstance) {
  const auth = new AuthService();
  const service = new UpgradeService();
  const settings = new SettingsService();
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
  const options = { logLevel: "silent" as const };
  app.get("/opportunities", options, async (request) => {
    await auth.requirePermission(request, "upgrades.opportunities.view");
    return service.opportunities(upgradeQuery.parse(request.query));
  });
  app.get("/summary", options, async (request) => {
    await auth.requirePermission(request, "upgrades.opportunities.view");
    return service.summary(upgradeQuery.parse(request.query));
  });
  app.post("/export", options, async (request, reply) => {
    await auth.requirePermission(request, "upgrades.opportunities.view", "upgrades.export");
    const { filters, themeMode, ...distributionOptions } = exportBody.parse(request.body);
    const [distribution, appearance] = await Promise.all([service.distribution(filters, distributionOptions), settings.appearance()]);
    const pdf = await createUpgradePdf(distribution, { accentColor: appearance[themeMode].upgrades });
    return reply
      .type("application/pdf")
      .header("Content-Disposition", `attachment; filename="upgrades-${distribution.referenceDate}.pdf"`)
      .send(pdf);
  });
  app.get("/contracts/:id", options, async (request) => {
    await auth.requirePermission(request, "upgrades.contract.view");
    return service.contract(z.object({ id: z.coerce.number().int().positive() }).parse(request.params).id);
  });
  app.get("/contracts/:id/logins", options, async (request) => {
    const user = await auth.requirePermission(request, "upgrades.contract.view", "upgrades.logins.view");
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    return service.logins(id, pagination.parse(request.query), auth.can(user, "upgrades.equipment.access"));
  });
  app.get("/contracts/:id/logins/:loginId/secrets/:field", options, async (request) => {
    await auth.requirePermission(request, "upgrades.contract.view", "upgrades.logins.view", "upgrades.credentials.view");
    const { id, loginId, field } = z
      .object({
        id: z.coerce.number().int().positive(),
        loginId: z.coerce.number().int().positive(),
        field: z.enum(["authentication", "router1", "router2", "wifi24", "wifi5", "wpa"]),
      })
      .parse(request.params);
    return service.loginSecret(id, loginId, field);
  });
  app.post("/contracts/:id/logins/:loginId/access", options, async (request) => {
    await auth.requirePermission(
      request,
      "upgrades.contract.view",
      "upgrades.logins.view",
      "upgrades.credentials.view",
      "upgrades.equipment.access"
    );
    const { id, loginId } = z
      .object({ id: z.coerce.number().int().positive(), loginId: z.coerce.number().int().positive() })
      .parse(request.params);
    const { protocol, port } = z
      .object({ protocol: z.enum(["http", "https"]), port: z.union([z.literal(80), z.literal(7000), z.literal(7001)]) })
      .parse(request.body);
    return service.loginAccess(id, loginId, protocol, port);
  });
  app.get("/plans", options, async (request) => {
    await auth.requirePermission(request, "upgrades.plans.view");
    return service.plans(pagination.extend({ search: z.string().trim().max(100).default("") }).parse(request.query));
  });
}
