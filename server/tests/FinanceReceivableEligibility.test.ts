import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { pendingSql, pendingQuery } from "../src/services/finance/FinancePendingService.js";
import { financeQuery } from "../src/services/finance/FinanceService.js";
import {
  dashboardAging,
  dashboardTitles,
  dashboardMovements,
  bankAccountsQuery,
} from "../src/integrations/ixc/database/dashboardQueries.js";
import { assertReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
const period = { from: "2026-10-01", to: "2026-10-07" },
  today = "2026-10-07";
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.function("DATEDIFF", (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000));
  db.exec(`CREATE TABLE cliente (id INTEGER PRIMARY KEY,razao TEXT,ativo TEXT);
    CREATE TABLE cliente_contrato (id INTEGER PRIMARY KEY,id_cliente INTEGER,status TEXT,contrato TEXT);
    CREATE TABLE planejamento_analitico (id INTEGER PRIMARY KEY,planejamento_analitico TEXT);
    CREATE TABLE fn_areceber (id TEXT PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,filial_id INTEGER,id_conta INTEGER,previsao TEXT,
      status TEXT,estornado TEXT,titulo_renegociado TEXT,data_vencimento TEXT,data_emissao TEXT,valor NUMERIC,valor_recebido NUMERIC,valor_aberto NUMERIC,documento TEXT);
    CREATE TABLE fornecedor (id INTEGER PRIMARY KEY,razao TEXT);
    CREATE TABLE fn_apagar (id TEXT PRIMARY KEY,id_fornecedor INTEGER,filial_id INTEGER,id_conta INTEGER,previsao TEXT,
      status TEXT,estornado TEXT,data_vencimento TEXT,data_emissao TEXT,valor NUMERIC,valor_pago NUMERIC,valor_aberto NUMERIC,documento TEXT);
    INSERT INTO cliente VALUES (1,'Ativo com contratos mistos','S'),(2,'Cliente inativo','N'),(3,'Ativo com contrato cancelado','S'),(4,'Ativo sem contrato','S');
    INSERT INTO cliente_contrato VALUES (10,1,'A','Plano ativo'),(11,1,'I','Plano cancelado'),(12,2,'A','Plano do inativo'),(13,3,'I','Plano cancelado'),(14,1,'A','Segundo ativo'),(15,1,'P','Pendente'),(16,1,'D','Desativado');
    INSERT INTO planejamento_analitico VALUES (8,'Mensalidades');
    INSERT INTO fornecedor VALUES (1,'Fornecedor sem relação com cadastro de clientes');
    INSERT INTO fn_apagar VALUES ('100',1,1,8,'S','A','N','2026-10-02','2026-10-01',70,0,70,'DOC')`);
  const insert = db.prepare("INSERT INTO fn_areceber VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const title = (id: number, extra: Record<string, unknown> = {}) => {
    const r = {
      customer: 1,
      contract: 10,
      branch: 1,
      account: 8,
      regime: "S",
      status: "A",
      reversed: "N",
      renegotiated: "N",
      due: "2026-10-02",
      amount: 100,
      paid: 0,
      balance: 100,
      ...extra,
    };
    insert.run(
      String(id),
      r.customer as number,
      r.contract as number,
      r.branch as number,
      r.account as number,
      r.regime as string,
      r.status as string,
      r.reversed as string,
      r.renegotiated as string,
      r.due as string,
      "2026-10-01",
      r.amount as number,
      r.paid as number,
      r.balance as number,
      "DOC"
    );
  };
  title(1);
  title(2, { contract: 11, balance: 200 });
  title(3, { customer: 2, contract: 12, balance: 300 });
  title(4, { customer: 3, contract: 13, balance: 400 });
  title(5, { customer: 4, contract: 0, balance: 500 });
  title(6, { contract: 12, balance: 600 }); // Contract belongs to another customer.
  title(7, { contract: 14, status: "P", paid: 60, balance: 40 }); // Active contract, partially received title.
  title(8, { status: "C" });
  title(9, { reversed: "S" });
  title(10, { renegotiated: "S" });
  title(11, { balance: 0 });
  title(12, { due: "2026-10-07", balance: 50 }); // Due today: open, not overdue.
  title(13, { due: "2026-10-20", balance: 60 });
  title(14, { due: "0000-00-00", balance: 70 });
  title(15, { customer: 99, contract: 999, balance: 80 }); // Legacy orphan.
  title(16, { contract: 15, balance: 90 });
  title(17, { contract: 16, balance: 110 });
  return db;
}
function openTotals(rows: Record<string, unknown>[]) {
  const valid = rows.filter(
    (r) =>
      ["A", "P"].includes(String(r.statusCode)) &&
      ["", "N"].includes(String(r.reversedCode)) &&
      ["", "N"].includes(String(r.renegotiatedCode))
  );
  return {
    count: valid.reduce((n, r) => n + Number(r.openCount), 0),
    balance: valid.reduce((n, r) => n + Number(r.openBalance), 0),
    overdue: valid.reduce((n, r) => n + Number(r.overdueBalance), 0),
  };
}
describe("Carteira recuperável do Financeiro", () => {
  it("o padrão é ativo e a opção todos é explícita e validada", () => {
    expect(pendingQuery.parse(period).receivableScope).toBe("active");
    expect(pendingQuery.safeParse({ ...period, receivableScope: "injected" }).success).toBe(false);
    expect(financeQuery.safeParse({ ...period, receivableScope: "injected" }).success).toBe(false);
    for (const q of [
      pendingSql(period, today).summary,
      pendingSql(period, today).details,
      dashboardAging(period, today),
      dashboardTitles("receivable", period, today),
    ]) {
      assertReadQuery(q);
      expect(q.sql).toContain("eligible_customer.ativo='S'");
      expect(q.sql).toContain("eligible_contract.status='A'");
      expect(q.sql).toContain("eligible_contract.id=t.id_contrato");
      expect(q.sql).toContain("eligible_contract.id_cliente=t.id_cliente");
    }
  });
  it("lista, resumo e cards concordam, sem incluir o cancelado de um cliente com outro contrato ativo", () => {
    const db = fixture();
    try {
      for (const receivableScope of ["active", "all"] as const) {
        const input = { ...period, receivableScope },
          pending = pendingSql(input, today);
        const total = db.prepare(pending.summary.sql).get(...pending.summary.params)!;
        const list = db.prepare(pending.details.sql).all(...pending.details.params);
        const expected = receivableScope === "active" ? { total: 2, balance: 140 } : { total: 10, balance: 2420 };
        expect(total).toMatchObject(expected);
        expect(list).toHaveLength(expected.total);
        expect(list.reduce((n, r) => n + Number(r.balance), 0)).toBe(expected.balance);
        if (receivableScope === "active") expect(list.map((r) => String(r.id))).toEqual(["1", "7"]);
        else {
          expect(list.find((r) => r.id === "3")).toMatchObject({ partyActive: "N", contractStatus: "A" });
          expect(list.find((r) => r.id === "2")).toMatchObject({ partyActive: "S", contractStatus: "I" });
          expect(list.find((r) => r.id === "5")?.contractStatus).toBeNull();
          expect(list.find((r) => r.id === "6")?.contractName).toBeNull();
        }
        const aging = dashboardAging(input, today),
          buckets = db
            .prepare(aging.sql)
            .all(...aging.params)
            .filter((r) => r.renegotiatedCode === "N" && r.bucket !== "unknown");
        expect(buckets.reduce((n, r) => n + Number(r.openCount), 0)).toBe(expected.total);
        expect(buckets.reduce((n, r) => n + Number(r.openBalance), 0)).toBe(expected.balance);
        const receivable = dashboardTitles("receivable", input, today),
          open = openTotals(db.prepare(receivable.sql).all(...receivable.params));
        const inPeriod = pendingSql({ ...input, scope: "period" }, today),
          periodTotal = db.prepare(inPeriod.summary.sql).get(...inPeriod.summary.params)!;
        expect(open.count).toBe(Number(periodTotal.total));
        expect(open.balance).toBe(Number(periodTotal.balance));
        expect(open.overdue).toBe(expected.balance);
      }
    } finally {
      db.close();
    }
  });
  it("todos continua excluindo títulos cancelados, estornados, renegociados, zerados e datas zero", () => {
    const db = fixture();
    try {
      const q = pendingSql({ ...period, receivableScope: "all", limit: 25 }, today),
        ids = db
          .prepare(q.details.sql)
          .all(...q.details.params)
          .map((r) => r.id);
      for (const id of ["8", "9", "10", "11", "12", "13", "14"]) expect(ids).not.toContain(id);
      expect(ids).toContain("15"); // All explicitly preserves legacy titles without a valid customer.
      const scoped = pendingSql({ ...period, branchId: 9, receivableScope: "all" }, today);
      expect(db.prepare(scoped.summary.sql).get(...scoped.summary.params)).toMatchObject({ total: 0, balance: 0 });
    } finally {
      db.close();
    }
  });
  it("a opção de clientes não altera fornecedores, movimentação, resultado contábil ou bancos", () => {
    const db = fixture();
    try {
      const a = pendingSql({ ...period, kind: "payable" }, today),
        b = pendingSql({ ...period, kind: "payable", receivableScope: "all" }, today);
      expect(a.summary).toEqual(b.summary);
      expect(a.details).toEqual(b.details);
      expect(db.prepare(a.summary.sql).get(...a.summary.params)).toMatchObject({ total: 1, balance: 70 });
      expect(dashboardTitles("payable", period, today)).toEqual(dashboardTitles("payable", { ...period, receivableScope: "all" }, today));
      expect(dashboardMovements(period)).toEqual(dashboardMovements({ ...period, receivableScope: "all" }));
      expect(bankAccountsQuery(period)).toEqual(bankAccountsQuery({ ...period, receivableScope: "all" }));
    } finally {
      db.close();
    }
  });
});
