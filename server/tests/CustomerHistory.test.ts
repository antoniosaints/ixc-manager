import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, vi, afterEach } from "vitest";
import Fastify from "fastify";
import { financialTitleStatus } from "../../client/src/financialTitleStatus.js";
import { timelineTarget, type CustomerTimelineEvent } from "../../client/src/customerTimeline.js";
import { canOpenRecord } from "../../client/src/recordNavigation.js";
import { FinanceTitleService } from "../src/services/finance/FinanceTitleService.js";
import { financeRoutes } from "../src/controllers/financeController.js";
import { AuthService } from "../src/services/AuthService.js";
import { assertReadQuery, type IxcReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
afterEach(() => vi.restoreAllMocks());
const event = (type: string, recordId: number | null = 1): CustomerTimelineEvent => ({
  at: "2026-10-10",
  type,
  recordId,
  status: "C",
  description: "Texto com #999: R que não determina o registro",
});
const can =
  (...permissions: string[]) =>
  (p: string) =>
    permissions.includes(p);
describe("Histórico do cliente: registros e títulos", () => {
  it("mapeia códigos IXC e conserva códigos desconhecidos sem inventar um status", () => {
    expect(["A", "P", "R", "C"].map((code) => financialTitleStatus(code).label)).toEqual(["Aberto", "Parcial", "Recebido", "Cancelado"]);
    expect(financialTitleStatus(" r ").label).toBe("Recebido");
    expect(financialTitleStatus("R", "payable").label).toBe("Pago");
    expect(financialTitleStatus("X").label).toBe("Status não identificado (X)");
    expect(financialTitleStatus(null).label).toBe("Não informado");
  });
  it("abre a identidade explícita do histórico com a permissão do destino; texto não cria links", () => {
    const title = timelineTarget(event("FINANCIAL"), 2, can())!;
    expect(title).toEqual({ kind: "receivable", id: 1, customerId: 2 });
    expect(canOpenRecord(title, can("churn.customer.view", "collections.customer.view"))).toBe(false);
    expect(canOpenRecord(title, can("finance.dashboard.view"))).toBe(true);
    const order = timelineTarget(event("SERVICE_ORDER"), 2, can())!;
    expect(order).toEqual({ kind: "orders", id: 1, customerId: 2 });
    expect(canOpenRecord(order, can("support.orders.view"))).toBe(false);
    expect(canOpenRecord(order, can("support.customer.view", "support.orders.view"))).toBe(true);
    expect(timelineTarget(event("TICKET"), 2, can())).toEqual({ kind: "tickets", id: 1, customerId: 2 });
    expect(timelineTarget(event("CONTRACT"), 2, can("support.contract.view"))).toEqual({ kind: "contract", id: 1, module: "support" });
    expect(timelineTarget(event("CONTRACT"), 2, can("upgrades.contract.view"))).toEqual({ kind: "contract", id: 1, module: "upgrades" });
    for (const e of [
      event("CONNECTION"),
      event("UNKNOWN"),
      event("TICKET", null),
      event("TICKET", 0),
      event("FINANCIAL", Number.MAX_SAFE_INTEGER + 1),
    ])
      expect(timelineTarget(e, 2, () => true)).toBeNull();
    expect(canOpenRecord({ kind: "receivable", id: 1, customerId: 0 }, () => true)).toBe(false);
  });
  it("consulta o título exato inclusive cancelado/recebido e não aceita vínculo de outro cliente", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE fn_areceber(id INT,id_cliente INT,id_contrato INT,status TEXT,documento TEXT,data_emissao TEXT,data_vencimento TEXT,pagamento_data TEXT,data_cancelamento TEXT,valor NUMERIC,valor_recebido NUMERIC,valor_aberto NUMERIC,estornado TEXT,titulo_renegociado TEXT,id_conta INT,filial_id INT);
  CREATE TABLE cliente(id INT,razao TEXT); CREATE TABLE cliente_contrato(id INT,id_cliente INT,contrato TEXT);
  CREATE TABLE planejamento_analitico(id INT,planejamento_analitico TEXT);CREATE TABLE filial(id INT,fantasia TEXT,razao TEXT);
  INSERT INTO cliente VALUES(2,'Cliente teste'); INSERT INTO cliente_contrato VALUES(3,99,'Outro cliente');
  INSERT INTO fn_areceber VALUES(1,2,3,'C','DOC','2026-08-01','2026-08-12',NULL,'2026-08-10',123.45,0,0,'N','N',1,1),
  (2,2,3,'R','DOC','2026-08-01','2026-08-12','2026-08-11',NULL,123.45,123.45,0,'N','N',1,1);`);
    const select = async (q: IxcReadQuery) => {
      assertReadQuery(q);
      expect(q.sql).not.toMatch(/senha|password|SELECT\s+\*/i);
      return db.prepare(q.sql).all(...q.params);
    };
    const svc = new FinanceTitleService({ withSnapshot: async (cb: (s: object) => Promise<unknown>) => cb({ select }) } as never);
    try {
      expect(await svc.read(1, 2)).toMatchObject({
        id: 1,
        status: "C",
        amount: 123.45,
        balance: 0,
        received: 0,
        contractName: null,
        cancelledDate: "2026-08-10",
      });
      expect(await svc.read(2, 2)).toMatchObject({ id: 2, status: "R", received: 123.45, balance: 0, paymentDate: "2026-08-11" });
      await expect(svc.read(1, 99)).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      db.close();
    }
  });
  it("exige acesso ao Financeiro antes da consulta; valida IDs, protege erros e mantém somente leitura", async () => {
    const authenticate = vi
      .spyOn(AuthService.prototype, "authenticate")
      .mockResolvedValue({ id: 1, name: "Teste", email: "test@example.test", role: "USER", permissions: ["churn.customer.view"] });
    const read = vi.spyOn(FinanceTitleService.prototype, "read").mockResolvedValue({ id: 1, status: "C" } as never);
    const app = Fastify();
    await app.register(financeRoutes, { prefix: "/api/finance" });
    try {
      expect((await app.inject({ url: "/api/finance/receivables/1?customerId=2" })).statusCode).toBe(403);
      expect(read).not.toHaveBeenCalled();
      authenticate.mockResolvedValue({
        id: 1,
        name: "Teste",
        email: "test@example.test",
        role: "USER",
        permissions: ["finance.dashboard.view"],
      });
      const good = await app.inject({ url: "/api/finance/receivables/1?customerId=2" });
      expect(good.statusCode).toBe(200);
      expect(good.headers["cache-control"]).toBe("no-store");
      expect(read).toHaveBeenCalledWith(1, 2, expect.any(AbortSignal));
      read.mockClear();
      for (const url of [
        "/api/finance/receivables/0?customerId=2",
        "/api/finance/receivables/1",
        "/api/finance/receivables/1?customerId=abc",
      ])
        expect((await app.inject({ url })).statusCode).toBe(400);
      expect(read).not.toHaveBeenCalled();
      expect((await app.inject({ method: "POST", url: "/api/finance/receivables/1?customerId=2" })).statusCode).toBe(404);
      read.mockRejectedValueOnce(new Error("PRIVATE_SQL_PASSWORD"));
      const failure = await app.inject({ url: "/api/finance/receivables/1?customerId=2" });
      expect(failure.statusCode).toBe(502);
      expect(failure.body).not.toContain("PRIVATE");
    } finally {
      await app.close();
    }
  });
});
