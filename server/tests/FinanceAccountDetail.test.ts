import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { FinanceAccountDetailService, accountDetailQuery, accountDetailSql } from "../src/services/finance/FinanceAccountDetailService.js";
import { assertReadQuery, type IxcReadQuery, type IxcReadSession } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { financeRoutes } from "../src/controllers/financeController.js";
import { AuthService } from "../src/services/AuthService.js";
const period = { from: "2026-10-01", to: "2026-10-08", accountId: 1 };
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE planejamento (id INTEGER PRIMARY KEY,tipo TEXT);
 CREATE TABLE planejamento_analitico (id INTEGER PRIMARY KEY,id_planejamento INTEGER,tipo TEXT,previsao TEXT,planejamento_analitico TEXT,classificacao TEXT);
 CREATE TABLE fn_movim_finan (id INTEGER PRIMARY KEY,data TEXT,id_conta INTEGER,filial_id INTEGER,credito NUMERIC,debito NUMERIC,cancelamento TEXT,id_fn_tranferencia_caixa INTEGER,id_receber INTEGER,id_pagar INTEGER,documento TEXT,historico TEXT);
 CREATE TABLE fn_areceber (id TEXT PRIMARY KEY,documento TEXT,data_vencimento TEXT,valor NUMERIC,status TEXT,id_cliente INTEGER,id_contrato INTEGER);
 CREATE TABLE cliente (id INTEGER PRIMARY KEY,razao TEXT);
 CREATE TABLE fn_apagar (id INTEGER PRIMARY KEY,documento TEXT,data_vencimento TEXT,valor NUMERIC,status TEXT,id_fornecedor INTEGER);
 CREATE TABLE fornecedor (id INTEGER PRIMARY KEY,razao TEXT);
 INSERT INTO planejamento VALUES (1,'R'),(2,'D'),(3,'A');
 INSERT INTO planejamento_analitico VALUES (1,1,'R','S','Receita','1'),(2,2,'D','N','Despesa','2'),(3,1,'D','S','Inconsistente','3'),(4,3,'A','S','Ativo','4');
 INSERT INTO cliente VALUES (1,'Cliente teste');
 INSERT INTO fornecedor VALUES (1,'Fornecedor teste');
 INSERT INTO fn_areceber VALUES ('9007199254740993','Mensalidade','2026-09-01',100,'R',1,10);
 INSERT INTO fn_apagar VALUES (20,'Despesa','2026-10-04',200,'P',1);
 INSERT INTO fn_movim_finan VALUES
 (1,'2026-10-02',1,1,60,0,'N',0,'9007199254740993',0,'DOC','Primeira baixa'),
 (2,'2026-10-03',1,1,40,0,'',0,'9007199254740993',0,'DOC','Segunda baixa'),
 (3,'2026-10-04',1,1,0,10,'N',0,'9007199254740993',0,'DOC','Estorno'),
 (4,'2026-10-05',1,1,5.11,0,'N',0,'0',0,'Ajuste','Sem título'),
 (5,'2026-10-05',1,1,500,0,'S',0,'0',0,'','Cancelado'),
 (6,'2026-10-05',1,1,300,0,'N',1,'0',0,'','Transferência'),
 (7,'2026-10-05',1,2,7,0,'N',0,'0',0,'','Outra filial'),
 (8,'2026-09-30',1,1,900,0,'N',0,'0',0,'','Anterior'),
 (9,'2026-10-09',1,1,800,0,'N',0,'0',0,'','Posterior'),
 (10,'2026-10-06',2,1,0,50,'N',0,'0',20,'Despesa','Pagamento parcial'),
 (11,'2026-10-07',2,1,5,0,'N',0,'0',20,'Despesa','Estorno'),
 (12,'2026-10-07',3,1,0,400,'N',0,'0',0,'','Classificação inconsistente'),
 (13,'2026-10-07',4,1,0,400,'N',0,'0',0,'','Conta patrimonial');`);
  const select = async <T extends object>(q: IxcReadQuery): Promise<T[]> => {
    assertReadQuery(q);
    const statement = db.prepare(q.sql);
    statement.setReadBigInts(true);
    return statement
      .all(...q.params)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k,
            ["credit", "debit", "total", "receivableTitles", "payableTitles", "unlinked", "receivableAmount", "payableAmount"].includes(
              k
            ) && v !== null
              ? String(v)
              : typeof v === "bigint"
                ? ["branchId", "customerId", "supplierId", "contractId"].includes(k) ||
                  (k === "id" && q.name === "finance-composition-account")
                  ? Number(v)
                  : String(v)
                : v,
          ])
        )
      ) as T[];
  };
  return { db, reader: { withSnapshot: async <T>(read: (session: IxcReadSession) => Promise<T>) => read({ select }) } };
}
describe("Composição das contas financeiras", () => {
  it("explains partial receipts, reversals and unlinked entries without summing title originals or duplicating joins", async () => {
    const { db, reader } = fixture();
    try {
      const result = await new FinanceAccountDetailService(reader).list({ ...period, branchId: 1, regime: "cash" });
      expect(result).toMatchObject({
        total: 4,
        credit: 105.11,
        debit: 10,
        value: 95.11,
        receivableTitles: 1,
        payableTitles: 0,
        unlinked: 1,
      });
      expect(result.items.map((x) => x.id)).toEqual(["4", "3", "2", "1"]);
      expect(result.items.reduce((s, x) => s + Math.round(x.value * 100), 0)).toBe(9511);
      expect(result.items[1]?.titles[0]).toMatchObject({
        id: "9007199254740993",
        amount: 100,
        status: "R",
        partyName: "Cliente teste",
        contractId: 10,
      });
      expect(result.items[0]?.titles).toEqual([]);
      const ledger = await new FinanceAccountDetailService(reader).list({ ...period, branchId: 1, basis: "ledger" });
      expect(ledger).toMatchObject({ total: 5, value: 395.11 });
    } finally {
      db.close();
    }
  });
  it("uses expense debit minus credit and account regimes, while ledger uses credit minus debit", async () => {
    const { db, reader } = fixture();
    try {
      const service = new FinanceAccountDetailService(reader);
      expect(await service.list({ ...period, accountId: 2, regime: "competence" })).toMatchObject({
        total: 2,
        value: 45,
        payableTitles: 1,
      });
      expect(await service.list({ ...period, accountId: 2, basis: "ledger" })).toMatchObject({ total: 2, value: -45 });
      expect(await service.list({ ...period, accountId: 2, regime: "cash" })).toMatchObject({ total: 0, value: 0 });
      expect(await service.list({ ...period, accountId: 3 })).toMatchObject({ total: 0, value: 0 });
      expect(await service.list({ ...period, accountId: 4 })).toMatchObject({ total: 0, value: 0 });
      expect(await service.list({ ...period, accountId: 4, basis: "ledger" })).toMatchObject({ total: 1, value: -400 });
      await expect(service.list({ ...period, accountId: 999 })).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      db.close();
    }
  });
  it("keeps all filters identical for summary and paginated details and validates inputs", () => {
    const { summary, details } = accountDetailSql({ ...period, branchId: 2, regime: "cash", page: 2, limit: 25 });
    expect(summary.params).toEqual(["2026-10-01", "2026-10-09", 2, 1, "S"]);
    expect(details.params).toEqual([...summary.params, 25, 25]);
    expect(summary.sql).not.toMatch(/valor_aberto|ativo|titulo_renegociado/);
    for (const extra of [
      { accountId: 0 },
      { accountId: "1 OR 1=1" },
      { from: "2026-02-30" },
      { page: 0 },
      { limit: 1000 },
      { basis: "pending" },
    ])
      expect(accountDetailQuery.safeParse({ ...period, ...extra }).success).toBe(false);
  });
  it("enforces financial permission, read-only HTTP and sanitized error responses", async () => {
    const permission = vi.spyOn(AuthService.prototype, "requirePermission").mockResolvedValue({ id: 1 } as never);
    const list = vi.spyOn(FinanceAccountDetailService.prototype, "list").mockResolvedValue({ items: [] } as never);
    const app = Fastify();
    await app.register(financeRoutes, { prefix: "/api/finance" });
    const url = "/api/finance/account-details?" + new URLSearchParams({ ...period, accountId: "1" });
    try {
      const result = await app.inject({ url });
      expect(result.statusCode).toBe(200);
      expect(result.headers["cache-control"]).toBe("no-store");
      expect(permission.mock.calls[0]?.[1]).toBe("finance.dashboard.view");
      permission.mockRejectedValueOnce(Object.assign(new Error("Sem permissão"), { statusCode: 403 }));
      expect((await app.inject({ url })).statusCode).toBe(403);
      expect(list).toHaveBeenCalledTimes(1);
      list.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_DETAIL"));
      const failed = await app.inject({ url });
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain("PRIVATE");
      expect((await app.inject({ method: "POST", url })).statusCode).toBe(404);
      expect((await app.inject({ url: url.replace("accountId=1", "accountId=0") })).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
