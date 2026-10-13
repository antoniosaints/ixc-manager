import type { FastifyInstance, FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { AuthService } from "../services/AuthService.js";
import { RaffleService, publicTokenHash } from "../services/raffles/RaffleService.js";
import { raffleFilters, raffleError } from "../services/raffles/raffleModel.js";
import { RaffleLive } from "../services/raffles/RaffleLive.js";
import { createRafflePdf } from "../services/raffles/RafflePdf.js";
import { env } from "../config/env.js";

const idSchema = z.object({ id: z.string().uuid() });
const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export async function raffleRoutes(app: FastifyInstance, options: { service?: RaffleService }) {
  if (!app.hasDecorator("websocketServer")) await app.register(websocket, { options: { maxPayload: 4096 } });
  const auth = new AuthService(),
    service = options.service ?? new RaffleService(),
    live = new RaffleLive(service);
  app.addHook("onClose", async () => {
    live.close();
    await service.close();
  });
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer");
  });
  app.setErrorHandler((error, _request, reply) => {
    const code = (error as { statusCode?: number }).statusCode;
    const status = error instanceof z.ZodError ? 400 : code && code >= 400 && code < 500 ? code : 502;
    reply.code(status).send({
      message:
        error instanceof z.ZodError
          ? "Revise os dados e filtros do sorteio."
          : status === 502
            ? "Não foi possível carregar o sorteio. Tente novamente."
            : (error as Error).message,
    });
  });
  const quiet = { logLevel: "silent" as const };
  app.get("/", quiet, async (r) => {
    await auth.requirePermission(r, "raffles.view");
    return { items: await service.store.list() };
  });
  app.get("/options", quiet, async (r) => {
    await auth.requirePermission(r, "raffles.view", "raffles.manage");
    return service.participants.options();
  });
  app.post("/preview", quiet, async (r, reply) => {
    await auth.requirePermission(r, "raffles.view", "raffles.manage");
    const controller = new AbortController(),
      cancel = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
    reply.raw.on("close", cancel);
    try {
      return await service.participants.list(raffleFilters.parse(r.body), false, controller.signal);
    } finally {
      reply.raw.off("close", cancel);
    }
  });
  app.post("/", { ...quiet, bodyLimit: 500000 }, async (r, reply) => {
    const user = await auth.requirePermission(r, "raffles.view", "raffles.manage");
    const controller = new AbortController(),
      cancel = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
    reply.raw.on("close", cancel);
    try {
      return await service.create(r.body, user.id, controller.signal);
    } finally {
      reply.raw.off("close", cancel);
    }
  });
  app.get("/:id", quiet, async (r) => {
    await auth.requirePermission(r, "raffles.view");
    return service.admin(await service.get(idSchema.parse(r.params).id));
  });
  app.put("/:id", { ...quiet, bodyLimit: 500000 }, async (r) => {
    await auth.requirePermission(r, "raffles.view", "raffles.manage");
    return service.update(idSchema.parse(r.params).id, r.body);
  });
  app.post("/:id/draw", quiet, async (r) => {
    const user = await auth.requirePermission(r, "raffles.view", "raffles.draw");
    return service.draw(idSchema.parse(r.params).id, z.object({ requestId: z.string().uuid() }).parse(r.body).requestId, user.id);
  });
  app.post("/:id/share", quiet, async (r) => {
    await auth.requirePermission(r, "raffles.view", "raffles.share");
    return service.share(idSchema.parse(r.params).id, z.object({ enabled: z.boolean() }).parse(r.body).enabled);
  });
  app.get("/:id/pdf", quiet, async (r, reply) => {
    await auth.requirePermission(r, "raffles.view", "raffles.export");
    const s = await service.get(idSchema.parse(r.params).id);
    return reply
      .type("application/pdf")
      .header("Content-Disposition", `attachment; filename="sorteio-${s.id}.pdf"`)
      .send(await createRafflePdf(s));
  });
  app.get("/public/:token", quiet, async (r) => (await service.public(tokenSchema.parse(r.params).token)).view);
  const origin = async (r: FastifyRequest) => {
    if (Object.keys(r.query as object).length) throw raffleError("Parâmetros não permitidos.", 400);
    if (!r.headers.origin) return;
    let same = false;
    try {
      same = new URL(r.headers.origin).host === r.headers.host && /^https?:/.test(r.headers.origin);
    } catch {
      /* Invalid origin. */
    }
    if (!same && r.headers.origin !== env.CORS_ORIGIN) throw raffleError("Origem não permitida.", 403);
  };
  app.get(
    "/public/:token/live",
    {
      ...quiet,
      websocket: true,
      preValidation: async (r) => {
        await origin(r);
        tokenSchema.parse(r.params);
      },
    },
    (socket, r) => {
      socket.once("error", () => socket.close());
      const token = tokenSchema.parse(r.params).token;
      void service
        .public(token)
        .then(({ state }) => {
          if (socket.readyState === 1) live.attach(state.id, socket, async (s) => s.publicHash === publicTokenHash(token), false);
        })
        .catch(() => {
          if (socket.readyState !== 1) return;
          socket.send(JSON.stringify({ type: "unavailable" }));
          socket.close(1008);
        });
    }
  );
  app.get("/live", { ...quiet, websocket: true, preValidation: origin }, (socket) => {
    const timeout = setTimeout(() => socket.close(1008, "Autenticação necessária"), 10000);
    timeout.unref();
    socket.once("close", () => clearTimeout(timeout));
    socket.once("error", () => socket.close());
    socket.once("message", (raw) => {
      clearTimeout(timeout);
      void (async () => {
        const input = z.object({ token: z.string().min(1).max(256), id: z.string().uuid() }).parse(JSON.parse(raw.toString()));
        let checkedAt = 0,
          allowed = false;
        const authorize = async () => {
          if (Date.now() - checkedAt > 10000) {
            const user = await auth.authenticate({ headers: { authorization: `Bearer ${input.token}` } } as FastifyRequest);
            checkedAt = Date.now();
            allowed = !!user && auth.can(user, "raffles.view");
          }
          return allowed;
        };
        if (!(await authorize())) throw raffleError("Sem acesso.", 403);
        await service.get(input.id);
        if (socket.readyState === 1) live.attach(input.id, socket, authorize, true);
      })().catch(() => socket.close(1008, "Sem acesso"));
    });
  });
}
