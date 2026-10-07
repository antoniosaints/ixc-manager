import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { FinancePendingService, pendingSql, pendingQuery } from "../src/services/finance/FinancePendingService.js";
import { assertReadQuery, type IxcReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { financeRoutes } from "../src/controllers/financeController.js";
import { AuthService } from "../src/services/AuthService.js";
const period = { from: "2026-10-01", to: "2026-10-06" };
afterEach(() => vi.restoreAllMocks());
describe("Pendências financeiras em tempo real", () => {
  it("filters all aging boundaries using indexed date predicates and excludes reversed/renegotiated titles", () => {
    const expected = {
      all: ["2026-10-06"],
      "1-30": ["2026-10-06", "2026-09-06"],
      "31-60": ["2026-09-06", "2026-08-07"],
      "61-90": ["2026-08-07", "2026-07-08"],
      "91+": ["2026-07-08"],
    };
    for (const [bucket, dates] of Object.entries(expected)) {
      const { summary, details } = pendingSql({ ...period, bucket: bucket as "all" }, "2026-10-06");
      expect(summary.params).toEqual(dates);
      expect(details.params).toEqual(["2026-10-06", ...dates, 10, 0]);
      expect(summary.sql).toContain("t.valor_aberto>0");
      expect(summary.sql).toContain("t.titulo_renegociado");
      expect(summary.sql).not.toContain("DATEDIFF");
      expect(summary.sql).not.toContain(period.from);
      assertReadQuery(summary);
      assertReadQuery(details);
    }
  });
  it("applies scope and escaping identically to count and list without interpolating search or IDs", () => {
    const { summary, details } = pendingSql(
      {
        ...period,
        kind: "payable",
        scope: "overdue",
        branchId: 8,
        accountId: 20,
        regime: "cash",
        search: "a_%'",
        page: 2,
        limit: 25,
        sort: "balance",
      },
      "2026-10-06"
    );
    expect(summary.params).toEqual(["2026-10-01", "2026-10-07", "2026-10-06", 8, 20, "S", "%a=_=%'%"]);
    expect(details.params).toEqual(["2026-10-06", ...summary.params, 25, 25]);
    expect(details.sql).toContain("LEFT JOIN fornecedor");
    expect(details.sql).not.toContain("titulo_renegociado");
    expect(details.sql).not.toContain("a_%'");
    expect(details.sql).toContain("t.valor_aberto DESC");
    expect(details.sql).not.toMatch(/gateway|token|pix|codigo_barras/);
  });
  it("preserves large title IDs, exact totals and real paid/open values in one read snapshot", async () => {
    const select = vi.fn(async (q: IxcReadQuery) =>
      q.name === "pending-summary"
        ? [{ total: "1", balance: "10.11" }]
        : [
            {
              unexpectedSecret: "PRIVATE_FIELD",
              id: "9007199254740993",
              partyId: 1,
              partyName: "Teste",
              contractId: 2,
              contractName: "Plano",
              accountId: 3,
              accountName: "Conta",
              branchId: 8,
              document: "Fatura",
              dueDate: "2026-09-01",
              issuedDate: "0000-00-00",
              amount: "20.22",
              paid: "10.11",
              balance: "10.11",
              status: "P",
              daysLate: "35",
            },
          ]
    );
    const db = { withSnapshot: vi.fn(async (read: (s: { select: typeof select }) => Promise<unknown>) => read({ select })) };
    const result = await new FinancePendingService(db as never, () => new Date("2026-10-06T12:00:00Z")).list(period);
    expect(result.items[0]).toMatchObject({
      id: "9007199254740993",
      amount: 20.22,
      paid: 10.11,
      balance: 10.11,
      issuedDate: null,
      daysLate: 35,
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_FIELD");
    expect(result.balance).toBe(10.11);
    expect(db.withSnapshot).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledTimes(2);
  });
  it("loads only names and IDs for branch/account choices, with bounded reads", async () => {
    const select = vi.fn(async (q: IxcReadQuery) => {
      assertReadQuery(q);
      expect(q.sql).not.toMatch(/token|senha|cnpj|telefone/);
      return q.name === "finance-branch-options"
        ? [{ id: 8, name: "Filial teste" }]
        : [{ id: 10, name: "Conta teste", type: "R", classification: "1.01" }];
    });
    const service = new FinancePendingService({ withSnapshot: async (read) => read({ select: select as never }) });
    const result = await service.options();
    expect(result.branches[0]?.name).toBe("Filial teste");
    expect(result.accounts[0]?.id).toBe(10);
    expect(result.truncated).toBe(false);
    expect(select).toHaveBeenCalledTimes(2);
  });
  it("rejects incompatible filters, invalid dates and arbitrary paging", () => {
    for (const extra of [
      { scope: "period", bucket: "91+" },
      { kind: "payable", searchBy: "contractId" },
      { searchBy: "titleId", search: "1 OR 1=1" },
      { limit: 1000 },
      { page: 0 },
      { from: "2026-02-30" },
    ])
      expect(pendingQuery.safeParse({ ...period, ...extra }).success).toBe(false);
  });
  it("protects pending reads with finance permission, no-store and sanitized errors", async () => {
    const permission = vi.fn().mockResolvedValue({ id: 1 });
    vi.spyOn(AuthService.prototype, "requirePermission").mockImplementation(permission);
    const list = vi.spyOn(FinancePendingService.prototype, "list").mockResolvedValue({
      items: [],
      total: 0,
      balance: 0,
      page: 1,
      limit: 10,
      kind: "receivable",
      scope: "aging",
      bucket: "all",
      asOf: "2026-10-06",
      queriedAt: "2026-10-06T12:00:00Z",
    });
    const options = vi
      .spyOn(FinancePendingService.prototype, "options")
      .mockResolvedValue({ branches: [], accounts: [], truncated: false });
    const app = Fastify();
    await app.register(financeRoutes, { prefix: "/api/finance" });
    try {
      expect((await app.inject({ url: "/api/finance/options" })).statusCode).toBe(200);
      expect(options).toHaveBeenCalledOnce();
      const url = "/api/finance/pending?" + new URLSearchParams(period);
      const response = await app.inject({ url });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(permission.mock.calls[0]?.[1]).toBe("finance.dashboard.view");
      permission.mockRejectedValueOnce(Object.assign(new Error("Sem permissão"), { statusCode: 403 }));
      expect((await app.inject({ url })).statusCode).toBe(403);
      expect(list).toHaveBeenCalledTimes(1);
      list.mockRejectedValueOnce(new Error("DATABASE_PRIVATE_PASSWORD"));
      const failed = await app.inject({ url });
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain("PRIVATE_PASSWORD");
      expect((await app.inject({ method: "POST", url })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
