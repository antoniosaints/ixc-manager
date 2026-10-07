import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService } from "../services/AuthService.js";
import { CollectionsService, collectionsQuery, collectionsExport } from "../services/collections/CollectionsService.js";
import { createCollectionsPdf } from "../services/collections/CollectionsPdf.js";
import { SettingsService } from "../services/settings/SettingsService.js";

/** All IXC operations are SELECTs. POST /export only builds a PDF in memory. */
export async function collectionsRoutes(app: FastifyInstance) {
  const auth = new AuthService(),
    service = new CollectionsService(),
    settings = new SettingsService();
  app.addHook("onClose", () => service.close());
  app.addHook("onRequest", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof z.ZodError ? 400 : ((error as { statusCode?: number }).statusCode ?? 502);
    reply.code(status >= 400 && status < 500 ? status : 502).send({
      message:
        error instanceof z.ZodError
          ? "Revise as datas, os filtros e as quantidades informadas."
          : status < 500
            ? (error as Error).message
            : "Não foi possível consultar as cobranças no IXC. Atualize a consulta.",
    });
  });
  const read = async <T>(reply: FastifyReply, fn: (signal: AbortSignal) => Promise<T>) => {
    const controller = new AbortController();
    const disconnected = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.on("close", disconnected);
    try {
      return await fn(controller.signal);
    } finally {
      reply.raw.off("close", disconnected);
    }
  };
  const allowed = async (request: FastifyRequest) => {
    await auth.requirePermission(request, "collections.customers.view");
  };
  const options = { logLevel: "silent" as const };
  app.get("/options", options, async (request, reply) => {
    await allowed(request);
    return read(reply, (s) => service.options(s));
  });
  app.get("/customers", options, async (request, reply) => {
    await allowed(request);
    const q = collectionsQuery.parse(request.query);
    return read(reply, (s) => service.list(q, s));
  });
  app.get("/customers/:id", options, async (request, reply) => {
    await allowed(request);
    await auth.requirePermission(request, "collections.customer.view");
    const { id } = z.object({ id: z.coerce.number().int().positive().safe() }).parse(request.params),
      q = collectionsQuery.parse(request.query);
    return read(reply, (s) => service.customer(id, q, s));
  });
  app.post("/export", options, async (request, reply) => {
    await allowed(request);
    await auth.requirePermission(request, "collections.export");
    const body = collectionsExport.parse(request.body);
    return read(reply, async (signal) => {
      const distribution = await service.distribution(body, signal),
        appearance = await settings.appearance();
      const buffer = await createCollectionsPdf(distribution, { accentColor: appearance[body.themeMode].collections });
      return reply.header("Content-Disposition", 'attachment; filename="lista-de-cobrancas.pdf"').type("application/pdf").send(buffer);
    });
  });
}
