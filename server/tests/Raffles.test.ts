import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { WebSocket } from "ws";
import { RaffleParticipants, participantsSql } from "../src/services/raffles/RaffleParticipants.js";
import { RaffleService } from "../src/services/raffles/RaffleService.js";
import { raffleConfig, raffleFilters, type RaffleState } from "../src/services/raffles/raffleModel.js";
import type { RaffleStorage } from "../src/services/raffles/RaffleStore.js";
import { createRafflePdf } from "../src/services/raffles/RafflePdf.js";
import { assertReadQuery, type IxcReadQuery, type IxcReadSession } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { raffleRoutes } from "../src/controllers/raffleController.js";
import { AuthService } from "../src/services/AuthService.js";
import { effectivePermissions, permissionKeys, accessPresets } from "../src/config/permissions.js";

afterEach(() => vi.restoreAllMocks());
const config = () => ({ name: "Cliente premiado", prizes: ["PIX de R$ 500", "Smartphone"], filters: {} });
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(`CREATE TABLE cliente(id INTEGER PRIMARY KEY,razao TEXT,cidade INTEGER);
    CREATE TABLE cidade(id INTEGER PRIMARY KEY,nome TEXT);
    CREATE TABLE vd_contratos(id INTEGER PRIMARY KEY,nome TEXT);
    CREATE TABLE produtos(id INTEGER PRIMARY KEY,descricao TEXT);
    CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_vd_contrato INTEGER,status TEXT,data_ativacao TEXT,endereco_padrao_cliente TEXT,cidade INTEGER);
    CREATE TABLE vd_contratos_produtos(id INTEGER PRIMARY KEY,id_contrato INTEGER,id_vd_contrato INTEGER,id_produto INTEGER);
    INSERT INTO cidade VALUES(1,'São Luís'),(2,'Bacabal');
    INSERT INTO cliente VALUES(1,'Ana de Teste',1),(2,'João Exemplo',2),(3,'Marina Demonstração',1);
    INSERT INTO vd_contratos VALUES(10,'Fibra 500'),(20,'Fibra 800');
    INSERT INTO produtos VALUES(100,'Internet'),(200,'Streaming'),(300,'Telefone');
    INSERT INTO cliente_contrato VALUES(1,1,10,'A','2026-01-01','S',2),(2,1,20,'A','2026-03-01','S',2),(3,2,20,'A','2026-03-31','N',1),(4,3,10,'I','2026-04-01','S',1),(5,3,10,'A','2026-04-01','S',1);
    INSERT INTO vd_contratos_produtos VALUES(1,0,10,100),(2,0,10,100),(3,0,20,100),(4,2,0,200),(5,3,0,300);`);
  const select = vi.fn(async <T extends object>(q: IxcReadQuery) => {
    assertReadQuery(q);
    return sql.prepare(q.sql).all(...q.params) as T[];
  });
  const reader = { withSnapshot: async <T>(fn: (s: IxcReadSession) => Promise<T>) => fn({ select }), close: async () => {} };
  const participants = new RaffleParticipants(reader);
  const rows = new Map<string, RaffleState>();
  let lock = Promise.resolve();
  const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  const store: RaffleStorage = {
    create: async (s) => {
      rows.set(s.id, copy(s));
    },
    list: async () =>
      [...rows.values()].map((s) => ({
        id: s.id,
        name: s.config.name,
        total: s.participants.length,
        drawn: s.results.length,
        createdAt: s.createdAt,
      })),
    read: async (id) => {
      const s = rows.get(id);
      if (!s) throw Object.assign(new Error("Ausente"), { statusCode: 404 });
      return copy(s);
    },
    revision: async (id) => rows.get(id)!.revision,
    publicId: async (hash) => {
      const s = [...rows.values()].find((s) => s.publicHash === hash);
      if (!s) throw Object.assign(new Error("Ausente"), { statusCode: 404 });
      return s.id;
    },
    mutate: async (id, fn) => {
      const previous = lock;
      let release!: () => void;
      lock = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const s = await store.read(id);
        fn(s);
        rows.set(id, copy(s));
        return s;
      } finally {
        release();
      }
    },
  };
  let now = Date.parse("2026-10-13T18:00:00Z");
  const pick = vi.fn((max: number) => max - 1);
  const service = new RaffleService(store, participants, () => now, pick);
  return {
    sql,
    select,
    participants,
    store,
    rows,
    service,
    pick,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("Sorteios: participantes e regras", () => {
  it("filtra ativação inclusive, planos e produtos sem duplicar contratos; inclui vínculo do plano e do contrato", async () => {
    const f = fixture();
    try {
      expect((await f.participants.list({})).items.map((p) => p.contractId)).toEqual([1, 2, 3, 5]);
      const range = { startFrom: "2026-03-01", startTo: "2026-03-31", planIds: [20] };
      expect((await f.participants.list(range)).items.map((p) => p.contractId)).toEqual([2, 3]);
      expect((await f.participants.list({ ...range, productIds: [100, 200], productMatch: "all" })).items.map((p) => p.contractId)).toEqual(
        [2, 3]
      );
      expect((await f.participants.list({ productIds: [200, 300] })).items.map((p) => p.contractId)).toEqual([2, 3]);
      expect((await f.participants.list({ productIds: [100] })).total).toBe(4);
      expect((await f.participants.list({ status: "all" })).total).toBe(5);
      expect((await f.participants.list({})).items[0]?.city).toBe("São Luís");
      expect((await f.participants.options()).products).toHaveLength(3);
      for (const q of Object.values(participantsSql({ productIds: [200] }))) {
        assertReadQuery(q);
        expect(q.sql).not.toMatch(/SELECT \*|cnpj_cpf|fone|senha/);
        expect(q.params).toContain(200);
      }
    } finally {
      f.sql.close();
    }
  });
  it("valida datas reais, intervalos, cores, logos e limites antes de preparar", () => {
    for (const date of ["2026-02-30", "2026-99-01", "garbage"]) expect(raffleFilters.safeParse({ startFrom: date }).success).toBe(false);
    expect(raffleFilters.safeParse({ startFrom: "2026-05-01", startTo: "2026-04-01" }).success).toBe(false);
    expect(raffleConfig.safeParse({ ...config(), background: "url(evil)" }).success).toBe(false);
    expect(raffleConfig.safeParse({ ...config(), logo: "https://evil.test/x.svg" }).success).toBe(false);
    expect(raffleConfig.safeParse({ ...config(), prizes: [] }).success).toBe(false);
    expect(raffleFilters.parse({ planIds: [1, 1] }).planIds).toEqual([1]);
  });
  it("aplica datas com E sobre planos OU produtos, incluindo os limites e respeitando o status geral", async () => {
    const f = fixture();
    try {
      const period = { startFrom: "2026-03-31", startTo: "2026-03-31" };
      expect((await f.participants.list(period)).items.map((p) => p.contractId)).toEqual([3]);
      expect((await f.participants.list({ ...period, planIds: [10] })).items.map((p) => p.contractId)).toEqual([]);
      expect((await f.participants.list({ ...period, productIds: [200] })).items.map((p) => p.contractId)).toEqual([]);
      const filters = { startTo: "2026-03-01", planIds: [10], productIds: [200] };
      const preview = await f.participants.list(filters),
        frozen = await f.participants.list(filters, true);
      expect(preview.items.map((p) => p.contractId)).toEqual([1, 2]);
      expect(preview.total).toBe(2);
      expect(frozen.items).toEqual(preview.items);
      expect((await f.participants.list({ ...filters, startFrom: "2026-03-01" })).items.map((p) => p.contractId)).toEqual([2]);
      expect((await f.participants.list({ planIds: [10], productIds: [200] })).items.map((p) => p.contractId)).toEqual([1, 2, 5]);
      expect((await f.participants.list({ ...filters, startTo: "2026-04-01", status: "all" })).items.map((p) => p.contractId)).toEqual([
        1, 2, 4, 5,
      ]);
      expect(
        (await f.participants.list({ planIds: [10], productIds: [200, 300], productMatch: "all" })).items.map((p) => p.contractId)
      ).toEqual([1, 5]);
      expect((await f.participants.list({ ...period, planIds: [20], productIds: [200] })).items.map((p) => p.contractId)).toEqual([3]);
    } finally {
      f.sql.close();
    }
  });
  it("materializa produtos sem uma subconsulta por contrato e conserva vínculos nulos, diretos e combinações", async () => {
    const f = fixture();
    try {
      f.sql.exec(`INSERT INTO produtos VALUES(1553,'Cliente Premiado');
        INSERT INTO vd_contratos_produtos VALUES(6,NULL,10,1553),(7,2,10,1553),(8,999,20,1553),(9,5,20,1553);`);
      const query = participantsSql({ productIds: [1553] }).count;
      const plan = f.sql.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).all(...query.params);
      expect(plan.map((step) => step.detail).join(" ")).not.toMatch(/CORRELATED/i);
      expect((await f.participants.list({ productIds: [1553] })).items.map((p) => p.contractId)).toEqual([1, 2, 5]);
      expect((await f.participants.list({ productIds: [1553, 300], productMatch: "any" })).items.map((p) => p.contractId)).toEqual([
        1, 2, 3, 5,
      ]);
      expect((await f.participants.list({ productIds: [1553, 200], productMatch: "all" })).items.map((p) => p.contractId)).toEqual([2]);
      const frozen = await f.participants.list({ productIds: [1553] }, true);
      expect(frozen.total).toBe(3);
      expect(frozen.items).toHaveLength(3);
    } finally {
      f.sql.close();
    }
  });
  it("não inclui ativações posteriores, vazias ou zeradas ao selecionar apenas a data final", async () => {
    const f = fixture();
    try {
      f.sql.exec(`INSERT INTO cliente_contrato VALUES
        (6,3,10,'A',NULL,'S',1),(7,3,10,'A','0000-00-00','S',1),(8,3,10,'A','','S',1);`);
      const filters = { planIds: [10], productIds: [200] };
      expect((await f.participants.list(filters)).items.map((p) => p.contractId)).toEqual([1, 2, 5, 6, 7, 8]);
      const limited = await f.participants.list({ ...filters, startTo: "2026-03-01" }, true);
      expect(limited.items.map((p) => p.contractId)).toEqual([1, 2]);
      expect(limited.total).toBe(2);
    } finally {
      f.sql.close();
    }
  });
  it("sorteia também contratos fora da amostra e recusa listas acima do limite sem truncar participantes", async () => {
    const f = fixture();
    try {
      for (let id = 6; id <= 65; id++) f.sql.prepare("INSERT INTO cliente_contrato VALUES(?,3,10,'A','2026-04-01','S',1)").run(id);
      const preview = await f.participants.list({});
      expect(preview.total).toBe(64);
      expect(preview.items).toHaveLength(25);
      const { id } = await f.service.create(config(), 1);
      await f.service.draw(id, randomUUID(), 1);
      f.advance(3000);
      expect(f.service.admin(await f.service.get(id)).results[0]?.contractId).toBe(65);
      f.select.mockResolvedValueOnce([{ total: 50001 }]);
      await expect(f.service.create(config(), 1)).rejects.toMatchObject({ statusCode: 422 });
    } finally {
      f.sql.close();
    }
  });
  it("congela o universo e não sorteia a amostra; não revela o vencedor nos três segundos iniciais", async () => {
    const f = fixture();
    try {
      const initial = await f.service.create(config(), 1);
      f.sql.exec("DELETE FROM cliente_contrato WHERE id=5");
      const requestId = randomUUID(),
        pending = await f.service.draw(initial.id, requestId, 1);
      expect(pending).toMatchObject({ total: 4, phase: "countdown", results: [], countdownEndsAt: "2026-10-13T18:00:03.000Z" });
      expect(f.pick).toHaveBeenCalledWith(4);
      const publicView = f.service.presentation(await f.service.get(initial.id));
      expect(publicView).not.toHaveProperty("pending");
      expect(publicView).not.toHaveProperty("sample");
      expect(publicView).not.toHaveProperty("config");
      expect(JSON.stringify(publicView)).not.toMatch(/Marina|customerId|publicHash|drawnBy|requestId/);
      f.advance(2999);
      expect(f.service.admin(await f.service.get(initial.id)).results).toHaveLength(0);
      f.advance(1);
      const completed = f.service.admin(await f.service.get(initial.id));
      expect(completed.results[0]).toMatchObject({ contractId: 5, customerName: "Marina Demonstração", prize: "PIX de R$ 500", order: 1 });
      expect(completed.remaining).toBe(3);
      const retry = await f.service.draw(initial.id, requestId, 1);
      expect(retry.results).toHaveLength(1);
      expect(retry.phase).toBe("ready");
      expect(f.pick).toHaveBeenCalledTimes(1);
    } finally {
      f.sql.close();
    }
  });
  it("serializa administradores, não repete contrato e preserva a rodada após recriar o serviço", async () => {
    const f = fixture();
    try {
      const { id } = await f.service.create(config(), 1),
        requestId = randomUUID();
      const same = await Promise.all([f.service.draw(id, requestId, 1), f.service.draw(id, requestId, 2)]);
      expect(same[0].countdownEndsAt).toBe(same[1].countdownEndsAt);
      expect(f.pick).toHaveBeenCalledTimes(1);
      await expect(f.service.draw(id, randomUUID(), 2)).rejects.toMatchObject({ statusCode: 409 });
      f.advance(3000);
      await f.service.get(id);
      await f.service.draw(id, randomUUID(), 2);
      expect(f.pick).toHaveBeenLastCalledWith(3);
      const restored = new RaffleService(f.store, f.participants, () => Date.parse("2026-10-13T18:00:06Z"));
      const s = await restored.get(id);
      expect(s.results.map((r) => r.contractId)).toEqual([5, 3]);
      expect(restored.presentation(s).phase).toBe("finished");
      await expect(restored.draw(id, randomUUID(), 1)).rejects.toMatchObject({ statusCode: 409 });
      await expect(f.service.update(id, config())).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      f.sql.close();
    }
  });
  it("permite um prêmio por cliente, bloqueia prêmio sem participante e evita mudanças de critérios no evento", async () => {
    const f = fixture();
    try {
      f.pick.mockImplementation(() => 0);
      const { id } = await f.service.create({ ...config(), oncePerCustomer: true }, 1);
      await f.service.draw(id, randomUUID(), 1);
      f.advance(3000);
      const s = await f.service.get(id);
      expect(f.service.admin(s).remaining).toBe(2);
      await f.service.draw(id, randomUUID(), 1);
      expect(f.pick).toHaveBeenLastCalledWith(2);
      await expect(f.service.create({ ...config(), filters: { planIds: [999] } }, 1)).rejects.toMatchObject({ statusCode: 422 });
      await expect(f.service.create({ ...config(), prizes: ["1", "2", "3", "4"], oncePerCustomer: true }, 1)).rejects.toMatchObject({
        statusCode: 422,
      });
      const fresh = await f.service.create(config(), 1);
      await expect(f.service.update(fresh.id, { ...config(), filters: { planIds: [20] } })).rejects.toMatchObject({ statusCode: 409 });
      const updated = await f.service.update(fresh.id, {
        ...config(),
        name: "Evento de teste",
        background: "#112233",
        prizes: ["TV", "PIX"],
      });
      expect(updated.name).toBe("Evento de teste");
      expect(updated.prizes).toEqual(["TV", "PIX"]);
    } finally {
      f.sql.close();
    }
  });
  it("gera PDF paginado com acentos e nomes longos; nunca inclui o vencedor ainda em contagem", async () => {
    const f = fixture();
    try {
      const { id } = await f.service.create(config(), 1);
      await f.service.draw(id, randomUUID(), 1);
      const pendingPdf = await PDFDocument.load(await createRafflePdf(await f.service.get(id)));
      expect(pendingPdf.getPageCount()).toBe(1);
      f.advance(3000);
      const state = await f.service.get(id);
      state.results = Array.from({ length: 35 }, (_, i) => ({
        ...state.results[0]!,
        order: i + 1,
        prize: "Prêmio de demonstração ".repeat(4),
        customerName: "São Luís João de Demonstração ".repeat(4),
      }));
      const pdf = await PDFDocument.load(await createRafflePdf(state));
      expect(pdf.getPageCount()).toBeGreaterThan(1);
      expect(pdf.getTitle()).toBe("Cliente premiado");
    } finally {
      f.sql.close();
    }
  });
});

describe("Sorteios: permissões, compartilhamento e WebSocket", () => {
  it("inclui permissões e perfil optativo sem ampliar perfis de usuários existentes", () => {
    expect(permissionKeys).toContain("raffles.draw");
    expect(effectivePermissions("ADMIN", null)).toContain("raffles.share");
    expect(effectivePermissions("OPERATOR", null)).not.toContain("raffles.draw");
    expect(effectivePermissions("MANAGER", ["support.customer.view"])).not.toContain("raffles.view");
    expect(accessPresets.find((p) => p.key === "RAFFLES")?.permissions).toContain("raffles.export");
  });
  it("protege cada ação e permite acesso público somente por token ativo, sem expor dados internos", async () => {
    const f = fixture(),
      app = Fastify();
    let permissions: string[] = [];
    vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async (r) =>
      r.headers.authorization ? { id: 1, name: "Teste", email: "test@example.test", role: "USER", permissions: permissions as never } : null
    );
    await app.register(raffleRoutes, { prefix: "/api/raffles", service: f.service });
    const headers = { authorization: "Bearer test" };
    try {
      expect((await app.inject({ url: "/api/raffles/" })).statusCode).toBe(401);
      permissions = ["raffles.view"];
      expect((await app.inject({ url: "/api/raffles/", headers })).statusCode).toBe(200);
      expect((await app.inject({ method: "POST", url: "/api/raffles/", headers, payload: config() })).statusCode).toBe(403);
      permissions.push("raffles.manage");
      const create = await app.inject({ method: "POST", url: "/api/raffles/", headers, payload: config() });
      expect(create.statusCode).toBe(200);
      const id = create.json().id;
      expect(
        (await app.inject({ method: "POST", url: `/api/raffles/${id}/draw`, headers, payload: { requestId: randomUUID() } })).statusCode
      ).toBe(403);
      expect((await app.inject({ method: "POST", url: `/api/raffles/${id}/share`, headers, payload: { enabled: true } })).statusCode).toBe(
        403
      );
      expect((await app.inject({ url: `/api/raffles/${id}/pdf`, headers })).statusCode).toBe(403);
      permissions.push("raffles.draw", "raffles.share", "raffles.export");
      expect(
        (await app.inject({ method: "POST", url: `/api/raffles/${id}/draw`, headers, payload: { requestId: "not-uuid" } })).statusCode
      ).toBe(400);
      const share = await app.inject({ method: "POST", url: `/api/raffles/${id}/share`, headers, payload: { enabled: true } });
      const token = share.json().token;
      const view = await app.inject({ url: `/api/raffles/public/${token}` });
      expect(view.statusCode).toBe(200);
      expect(view.headers["cache-control"]).toBe("no-store");
      expect(view.json()).not.toHaveProperty("sample");
      expect(view.json()).not.toHaveProperty("config");
      expect((await app.inject({ method: "POST", url: `/api/raffles/${id}/draw`, payload: { requestId: randomUUID() } })).statusCode).toBe(
        401
      );
      const renewed = await f.service.share(id, true);
      expect(renewed.token).not.toBe(token);
      expect((await app.inject({ url: `/api/raffles/public/${token}` })).statusCode).toBe(404);
      await f.service.share(id, false);
      expect((await app.inject({ url: `/api/raffles/public/${renewed.token}` })).statusCode).toBe(404);
      const pdf = await app.inject({ url: `/api/raffles/${id}/pdf`, headers });
      expect(pdf.statusCode).toBe(200);
      expect(pdf.headers["content-type"]).toContain("application/pdf");
    } finally {
      await app.close();
      f.sql.close();
    }
  });
  it("transmite contagem e vencedor, atende novos espectadores e fecha o link quando revogado", async () => {
    const f = fixture(),
      app = Fastify();
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({
      id: 1,
      name: "Teste",
      email: "test@example.test",
      role: "USER",
      permissions: ["raffles.view"],
    });
    await app.register(websocket);
    await app.register(raffleRoutes, { prefix: "/api/raffles", service: f.service });
    await app.ready();
    const sockets: WebSocket[] = [];
    try {
      const { id } = await f.service.create(config(), 1),
        { token } = await f.service.share(id, true);
      await expect(app.injectWS(`/api/raffles/public/${token}/live`, { headers: { origin: "https://evil.test" } })).rejects.toThrow("403");
      await expect(app.injectWS("/api/raffles/live?token=private")).rejects.toThrow("400");
      const messages: any[] = [];
      const socket = await app.injectWS(
        `/api/raffles/public/${token}/live`,
        {},
        { onInit: (ws) => ws.on("message", (raw) => messages.push(JSON.parse(raw.toString()))) }
      );
      sockets.push(socket);
      await vi.waitFor(() => expect(messages.at(-1)?.raffle?.phase).toBe("ready"), { timeout: 2000 });
      vi.spyOn(f.store, "revision").mockRejectedValueOnce(new Error("PRIVATE_DATABASE_DETAIL"));
      await vi.waitFor(() => expect(messages.some((m) => m.type === "error")).toBe(true), { timeout: 2000 });
      expect(JSON.stringify(messages)).not.toContain("PRIVATE_DATABASE_DETAIL");
      await vi.waitFor(() => expect(messages.at(-1)?.type).toBe("state"), { timeout: 2000 });
      await f.service.draw(id, randomUUID(), 1);
      await vi.waitFor(() => expect(messages.at(-1)?.raffle?.phase).toBe("countdown"), { timeout: 2000 });
      expect(messages.at(-1).raffle.results).toHaveLength(0);
      const late: any[] = [];
      const spectator = await app.injectWS(
        `/api/raffles/public/${token}/live`,
        {},
        { onInit: (ws) => ws.on("message", (raw) => late.push(JSON.parse(raw.toString()))) }
      );
      sockets.push(spectator);
      await vi.waitFor(() => expect(late[0]?.raffle.countdownEndsAt).toBe(messages.at(-1).raffle.countdownEndsAt), { timeout: 2000 });
      f.advance(3000);
      await vi.waitFor(() => expect(messages.at(-1)?.raffle?.results).toHaveLength(1), { timeout: 2000 });
      const admin = await app.injectWS("/api/raffles/live");
      sockets.push(admin);
      const adminMessages: any[] = [];
      admin.on("message", (raw) => adminMessages.push(JSON.parse(raw.toString())));
      admin.send(JSON.stringify({ id, token: "session" }));
      await vi.waitFor(() => expect(adminMessages[0]?.raffle?.sample).toHaveLength(4), { timeout: 2000 });
      const closed = new Promise<number>((resolve) => socket.once("close", resolve));
      await f.service.share(id, false);
      expect(await closed).toBe(1008);
      expect(messages.at(-1).type).toBe("unavailable");
    } finally {
      sockets.forEach((s) => s.terminate());
      await app.close();
      f.sql.close();
    }
  }, 12000);
});
