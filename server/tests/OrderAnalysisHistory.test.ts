import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { db } from "../src/repositories/database.js";
import { AuthService } from "../src/services/AuthService.js";
import { supportRoutes } from "../src/controllers/supportController.js";
import { OrderAnalysisService } from "../src/services/support/OrderAnalysisService.js";
import {
  OrderAnalysisHistoryRepository,
  OrderAnalysisHistoryService,
  orderAnalysisHistoryQuery,
  type HistoryStore,
  type OrderAnalysisSnapshot,
} from "../src/services/support/OrderAnalysisHistoryService.js";
import { AiProviderClient } from "../src/services/ai/AiProviderClient.js";
import { IxcReadDatabase } from "../src/integrations/ixc/database/IxcReadDatabase.js";

afterEach(() => vi.restoreAllMocks());
const at = new Date("2026-11-19T15:00:00Z");
const uuid = "f62d3bc6-85db-4dda-8f23-876fc3723822";
type Result = Awaited<ReturnType<OrderAnalysisService["analyze"]>>;
function result(): Result {
  return {
    filters: { subjectId: 1, from: "2026-10-01", to: "2026-10-31" },
    subject: { id: 1, name: "Sem conexão" },
    queriedAt: at.toISOString(),
    totals: {
      orders: 1,
      customers: 1,
      recurringCustomers: 0,
      closed: 0,
      missingCustomer: 0,
      missingCity: 0,
      missingNetworkBranch: 0,
      withoutText: 0,
    },
    messageCount: 1,
    warnings: [],
    ai: {
      status: "completed",
      provider: "gemini",
      model: "gemini-test",
      batches: 1,
      message: null,
      report: {
        summary: "Relatos de perda de conexão.",
        findings: [{ title: "Sintoma registrado", assessment: "Conferir rede.", severity: "low", orderIds: [1] }],
        actions: ["Verificar a rede."],
        limitations: ["Dados da data da consulta."],
      },
    },
    orders: [
      {
        id: 1,
        customerId: 7,
        customerName: "PRIVATE_CUSTOMER",
        contractId: 2,
        loginId: 3,
        online: "S",
        status: "A",
        openedAt: "2026-10-01",
        closedAt: null,
        cityId: 1,
        city: "Cidade",
        networkBranch: "8:7",
        message: "PRIVATE_MESSAGE senha=PRIVATE_KEY",
        response: "PRIVATE_RESPONSE",
        truncated: false,
        messages: [{ date: null, body: "PRIVATE_HISTORY" }],
      },
    ],
    customers: [
      {
        id: 7,
        name: "PRIVATE_CUSTOMER",
        orderIds: [1],
        total: 1,
        recurring: false,
        lastOpenedAt: null,
        linkedLogins: 1,
        online: 1,
        offline: 0,
        unknownConnection: 0,
      },
    ],
    clusters: [{ city: "Cidade", networkBranch: null, orderIds: [1], orders: 1, customers: 1 }],
    daily: [],
  };
}
function fixture() {
  const saved = new Map<string, { id: string; createdAt: string; snapshot: OrderAnalysisSnapshot }>();
  const store: HistoryStore = {
    insert: vi.fn(async (id, snapshot, _user, created) => {
      if (!saved.has(id)) saved.set(id, { id, createdAt: created.toISOString(), snapshot: structuredClone(snapshot) });
    }),
    detail: vi.fn(async (id) => saved.get(id) ?? null),
    list: vi.fn(async () => ({ items: [], total: saved.size, subjects: [{ id: 1, name: "Sem conexão" }] })),
  };
  let time = at;
  const service = new OrderAnalysisHistoryService(store, () => time);
  return {
    service,
    store,
    saved,
    setTime: (value: Date) => {
      time = value;
    },
  };
}
describe("Histórico persistente de análises de OS", () => {
  it("salva assunto, período, indicadores e relatório e omite OS, cadastro e mensagens brutas", async () => {
    const f = fixture(),
      response = await f.service.capture(result(), 9);
    expect(response).toMatchObject({ saved: true, message: null, createdAt: at.toISOString() });
    const record = await f.service.detail(response!.id);
    expect(record.snapshot).toMatchObject({
      subject: result().subject,
      filters: result().filters,
      totals: { orders: 1, cities: 1 },
      ai: { provider: "gemini", report: result().ai.report },
    });
    expect(record.snapshot).not.toHaveProperty("orders");
    expect(record.snapshot).not.toHaveProperty("customers");
    expect(JSON.stringify(record)).not.toContain("PRIVATE");
    expect(f.store.insert).toHaveBeenCalledWith(response!.id, expect.anything(), 9, at);
  });
  it("não grava falhas ou consultas sem resumo real de IA", async () => {
    const f = fixture();
    for (const status of ["failed", "unconfigured", "empty"] as const) {
      const value = result();
      value.ai.status = status;
      value.ai.report = null;
      expect(await f.service.capture(value, 1)).toBeNull();
    }
    expect(f.store.insert).not.toHaveBeenCalled();
  });
  it("preserva a análise quando a gravação falha e repete com o mesmo ID, só para o autor e sem nova IA", async () => {
    const f = fixture();
    vi.mocked(f.store.insert).mockRejectedValueOnce(new Error("PRIVATE_SQL"));
    const response = await f.service.capture(result(), 9);
    expect(response?.saved).toBe(false);
    expect(JSON.stringify(response)).not.toContain("PRIVATE_SQL");
    await expect(f.service.retry(response!.id, 10)).rejects.toMatchObject({ statusCode: 404 });
    expect(await f.service.retry(response!.id, 9)).toMatchObject({ saved: true, id: response!.id });
    expect(f.store.insert).toHaveBeenCalledTimes(2);
    expect(f.saved.size).toBe(1);
    await expect(f.service.retry(response!.id, 9)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("expira a recuperação temporária após 30 minutos e valida filtros de consulta", async () => {
    const f = fixture();
    vi.mocked(f.store.insert).mockRejectedValue(new Error("falha"));
    const response = await f.service.capture(result(), 9);
    f.setTime(new Date(at.getTime() + 31 * 60000));
    await expect(f.service.retry(response!.id, 9)).rejects.toMatchObject({ statusCode: 404 });
    for (const value of [
      { limit: 100 },
      { page: 0 },
      { subjectId: "1 OR 1=1" },
      { from: "2026-02-30" },
      { from: "2026-11-20", to: "2026-11-01" },
    ])
      expect(orderAnalysisHistoryQuery.safeParse(value).success).toBe(false);
    expect((await f.service.list({ page: 2, limit: 25, subjectId: 1 })).page).toBe(2);
  });
  it("a leitura antes da migração retorna histórico vazio, sem criar tabelas", async () => {
    const query = vi.spyOn(db, "query").mockRejectedValue(Object.assign(new Error("missing"), { code: "ER_NO_SUCH_TABLE" }));
    const execute = vi.spyOn(db, "execute");
    const repository = new OrderAnalysisHistoryRepository();
    expect(await repository.list(orderAnalysisHistoryQuery.parse({}))).toEqual({ items: [], total: 0, subjects: [] });
    expect(await repository.detail(uuid)).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    expect(query.mock.calls.every(([sql]) => String(sql).startsWith("SELECT"))).toBe(true);
  });
  it("instala apenas no primeiro salvamento e usa INSERT idempotente e consultas parametrizadas", async () => {
    const f = fixture(),
      saved = await f.service.capture(result(), 1),
      snapshot = f.saved.get(saved!.id)!.snapshot;
    const execute = vi
      .spyOn(db, "execute")
      .mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ER_NO_SUCH_TABLE" }))
      .mockResolvedValue([{}, []] as never);
    const query = vi.spyOn(db, "query").mockResolvedValue([[], []] as never);
    const repository = new OrderAnalysisHistoryRepository();
    await repository.insert(uuid, snapshot, 1, at);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(String(execute.mock.calls[0]?.[0])).toContain("ON DUPLICATE KEY UPDATE id=id");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS retention_order_analysis_history"));
    query.mockClear();
    query
      .mockResolvedValueOnce([[{ total: 0 }], []] as never)
      .mockResolvedValueOnce([[], []] as never)
      .mockResolvedValueOnce([[], []] as never);
    await repository.list(orderAnalysisHistoryQuery.parse({ subjectId: 12, from: "2026-10-01", to: "2026-10-31", page: 2 }));
    expect(query.mock.calls[1]?.[1]).toEqual([12, "2026-10-01", "2026-10-31", 10, 10]);
    expect(String(query.mock.calls[1]?.[0])).toContain("ORDER BY created_at DESC,id DESC");
  });
});
describe("Rotas de histórico", () => {
  it("protege a consulta e abre o relatório salvo sem consultar IXC ou IA", async () => {
    const auth = vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue(null);
    const list = vi.spyOn(OrderAnalysisHistoryService.prototype, "list").mockResolvedValue({
      items: [],
      total: 0,
      subjects: [],
      page: 1,
      limit: 10,
      subjectId: 0,
      from: "",
      to: "",
      queriedAt: at.toISOString(),
    });
    const f = fixture(),
      captured = await f.service.capture(result(), 1),
      record = await f.service.detail(captured!.id);
    const detail = vi.spyOn(OrderAnalysisHistoryService.prototype, "detail").mockResolvedValue(record);
    const ixc = vi.spyOn(IxcReadDatabase.prototype, "withSnapshot"),
      ai = vi.spyOn(AiProviderClient.prototype, "generate");
    const app = Fastify();
    await app.register(supportRoutes, { prefix: "/api/support" });
    try {
      const urls = ["/api/support/order-analysis/history", `/api/support/order-analysis/history/${uuid}`];
      for (const url of urls) expect((await app.inject({ url })).statusCode).toBe(401);
      auth.mockResolvedValue({ id: 1, role: "OPERATOR", permissions: ["support.orders.analyze"] } as never);
      for (const url of urls) expect((await app.inject({ url })).statusCode).toBe(403);
      expect(list).not.toHaveBeenCalled();
      expect(detail).not.toHaveBeenCalled();
      auth.mockResolvedValue({ id: 1, role: "OPERATOR", permissions: ["support.orders.analyze", "support.orders.view"] } as never);
      for (const url of urls) {
        const response = await app.inject({ url });
        expect(response.statusCode).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
      }
      expect(ixc).not.toHaveBeenCalled();
      expect(ai).not.toHaveBeenCalled();
      expect((await app.inject({ url: "/api/support/order-analysis/history/invalid" })).statusCode).toBe(400);
      detail.mockRejectedValueOnce(new Error("PRIVATE_SQL"));
      const failed = await app.inject({ url: urls[1] });
      expect(failed.body).not.toContain("PRIVATE_SQL");
      expect(failed.json().message).toContain("histórico");
    } finally {
      await app.close();
    }
  });
  it("salva automaticamente depois da análise e entrega o resultado mesmo se a gravação falhar", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ id: 9, role: "ADMIN" } as never);
    const analyze = vi.spyOn(OrderAnalysisService.prototype, "analyze").mockResolvedValue(result());
    const capture = vi
      .spyOn(OrderAnalysisHistoryService.prototype, "capture")
      .mockResolvedValue({ id: uuid, saved: false, createdAt: at.toISOString(), message: "Tente salvar novamente." });
    const retry = vi
      .spyOn(OrderAnalysisHistoryService.prototype, "retry")
      .mockResolvedValue({ id: uuid, saved: true, createdAt: at.toISOString(), message: null });
    const app = Fastify();
    await app.register(supportRoutes, { prefix: "/api/support" });
    try {
      const response = await app.inject({ method: "POST", url: "/api/support/order-analysis", payload: result().filters });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ai: { status: "completed" }, history: { saved: false } });
      expect(capture).toHaveBeenCalledWith(result(), 9);
      const retried = await app.inject({ method: "POST", url: `/api/support/order-analysis/history/${uuid}/retry` });
      expect(retried.statusCode).toBe(200);
      expect(retried.json().saved).toBe(true);
      expect(retry).toHaveBeenCalledWith(uuid, 9);
      expect(analyze).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });
});
