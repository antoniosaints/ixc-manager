import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { FinanceSqlService, type SqlMovement, type SqlTitle, type SqlAging } from "../src/services/finance/FinanceSqlService.js";
import type { IxcReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { assertReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import {
  dashboardMovements,
  dashboardTitles,
  dashboardAging,
  dashboardConcilation,
  bankLedgerQuery,
} from "../src/integrations/ixc/database/dashboardQueries.js";
import { AuthService } from "../src/services/AuthService.js";
import { financeRoutes } from "../src/controllers/financeController.js";
import { IxcApiService } from "../src/integrations/ixc/IxcApiService.js";
const input = { from: "2026-10-01", to: "2026-10-06" };
const now = () => new Date("2026-10-06T12:00:00Z");
const movement = (extra: Partial<SqlMovement> = {}): SqlMovement => ({
  day: "2026-10-01",
  accountId: 10,
  accountName: "Conta de teste",
  classification: "1.01",
  analyticType: "R",
  syntheticType: "R",
  regimeCode: "S",
  cancellationCode: "",
  isTransfer: 0,
  validTransfer: 0,
  credit: "100.10",
  debit: "0.00",
  records: "1",
  ...extra,
});
const title = (extra: Partial<SqlTitle> = {}): SqlTitle => ({
  statusCode: "A",
  reversedCode: "N",
  renegotiatedCode: "N",
  records: "1",
  nullBalances: "0",
  negativeBalances: "0",
  openCount: "1",
  openBalance: "20.10",
  overdueBalance: "20.10",
  ...extra,
});
const aging = (extra: Partial<SqlAging> = {}): SqlAging => ({
  bucket: "1-30",
  renegotiatedCode: "N",
  records: "1",
  nullBalances: "0",
  negativeBalances: "0",
  openCount: "1",
  openBalance: "20.10",
  ...extra,
});
function fixture(extra: Record<string, unknown[] | Error> = {}) {
  const source: Record<string, unknown[] | Error> = {
    "dashboard-movements": [
      movement(),
      movement({ day: "2026-09-25", credit: "50.00" }),
      movement({ day: "2026-10-02", credit: "0.00", debit: "10.10" }),
      movement({ day: "2026-10-02", accountId: 20, analyticType: "D", syntheticType: "D", credit: "5.20", debit: "30.20" }),
      movement({ day: "2026-09-26", accountId: 20, analyticType: "D", syntheticType: "D", credit: "0", debit: "20.00" }),
    ],
    "dashboard-receivable": [title()],
    "dashboard-payable": [title({ openBalance: "3.10", overdueBalance: "3.10" })],
    "dashboard-current-aging": [aging()],
    "dashboard-reconciliation-status": [
      { code: "S", cancellationCode: "", records: "2", credit: "10", debit: "10" },
      { code: "N", cancellationCode: "", records: "1", credit: "0", debit: "1" },
      { code: "", cancellationCode: "", records: "1", credit: "0", debit: "1" },
    ],
    ...extra,
  };
  const select = vi.fn(async (query: IxcReadQuery) => {
    assertReadQuery(query);
    const result = source[query.name] ?? [];
    if (result instanceof Error) throw result;
    return result as never;
  });
  const withSnapshot = vi.fn(async (read: (session: { select: typeof select }) => Promise<unknown>) => read({ select }));
  return { select, withSnapshot, service: new FinanceSqlService({ withSnapshot: withSnapshot as never }, now) };
}
afterEach(() => vi.restoreAllMocks());
describe("Painel financeiro SQL", () => {
  it("produces the same net result, comparison and zeros with exact money, without calling the API", async () => {
    const api = vi.spyOn(IxcApiService.prototype, "listPage");
    const { service, withSnapshot, select } = fixture();
    const result = await service.dashboard(input);
    expect(result.totals).toMatchObject({ revenue: 90, expense: 25, result: 65 });
    expect(result.previous).toMatchObject({ revenue: 50, expense: 20, result: 30 });
    expect(result.growth).toEqual({ revenue: 80, expense: 25, resultDifference: 35 });
    expect(result.receivable).toEqual({ total: 20.1, overdue: 20.1, count: 1 });
    expect(result.series).toHaveLength(6);
    expect(result.series[5]?.result).toBe(0);
    expect(result.source).toBe("ixc-database");
    expect(api).not.toHaveBeenCalled();
    expect(withSnapshot).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledTimes(5);
  });
  it("separates transfers, flagged cancellation and inconsistent accounts while keeping legitimate signed reversals", async () => {
    const { service } = fixture({
      "dashboard-movements": [
        movement(),
        movement({ credit: "0", debit: "10.10" }),
        movement({ credit: "1000", isTransfer: 1, validTransfer: 1 }),
        movement({ accountId: 11, credit: "1000", cancellationCode: "S" }),
        movement({ accountId: 12, credit: "1000", syntheticType: "D" }),
        movement({ credit: "0", debit: "25.00", accountId: 30, analyticType: "A", syntheticType: "A" }),
      ],
    });
    const result = await service.dashboard(input);
    expect(result.totals.revenue).toBe(90);
    expect(result.quality).toEqual({ transferRecords: 1, invalidTransfers: 0, flaggedMovements: 1, unclassified: 1 });
    expect(result.ledger.some((row) => row.type === "A")).toBe(true);
    expect(result.warnings).toHaveLength(2);
  });
  it("binds regime to each matching source and keeps dates indexable, with previous period and inclusive end", () => {
    const query = { ...input, branchId: 8, accountId: 10, regime: "cash" as const };
    const movements = dashboardMovements(query);
    expect(movements.params).toEqual(["2026-09-25", "2026-10-07", 8, 10, "S"]);
    expect(movements.sql).toContain("AND a.previsao = ?");
    expect(dashboardTitles("receivable", query, "2026-10-06").params).toEqual(["2026-10-06", "2026-10-01", "2026-10-07", 8, 10, "S"]);
    const debt = dashboardAging(query, "2026-10-06");
    expect(debt.params).toEqual(["2026-10-06", "2026-10-06", "2026-10-06", "2026-10-06", 8, 10, "S"]);
    expect(debt.sql).not.toContain("2026-10-01");
    expect(debt.sql).toContain("t.data_vencimento<?");
    for (const sql of [movements, dashboardConcilation(query), bankLedgerQuery(query)]) assertReadQuery(sql);
    expect(movements.sql).not.toMatch(/DATE\(t\.data\)/);
  });
  it("includes old overdue debt and excludes canceled, reversed and old renegotiated title balances", async () => {
    const { service } = fixture({
      "dashboard-receivable": [
        title(),
        title({ statusCode: "C", openBalance: "1000" }),
        title({ reversedCode: "S", openBalance: "1000" }),
        title({ renegotiatedCode: "S", openBalance: "1000" }),
      ],
      "dashboard-current-aging": [
        aging(),
        aging({ bucket: "91+", openBalance: "99.90" }),
        aging({ renegotiatedCode: "S", openBalance: "1000", openCount: "2" }),
        aging({ bucket: "unknown", openBalance: "9.90" }),
      ],
    });
    const result = await service.dashboard(input);
    expect(result.receivable?.total).toBe(20.1);
    expect(result.aging).toMatchObject({ total: 120, count: 2, excludedRenegotiated: 2, undated: { count: 1, total: 9.9 } });
    expect(result.aging?.buckets.map((row) => row.total)).toEqual([20.1, 0, 0, 99.9]);
    expect(result.warnings[0]).toContain("vencimento válido");
  });
  it("distinguishes unavailable and corrupt amounts from zero, without exposing source errors", async () => {
    const { service } = fixture({
      "dashboard-payable": new Error("PRIVATE_PASSWORD"),
      "dashboard-receivable": [title({ nullBalances: "1" })],
      "dashboard-current-aging": [aging({ negativeBalances: "1" })],
    });
    const result = await service.dashboard(input);
    expect(result.payable).toBeNull();
    expect(result.receivable).toBeNull();
    expect(result.aging).toBeNull();
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PASSWORD");
    expect(result.warnings).toHaveLength(3);
    const empty = await fixture({
      "dashboard-movements": [],
      "dashboard-receivable": [],
      "dashboard-payable": [],
      "dashboard-current-aging": [],
    }).service.dashboard(input);
    expect(empty.totals.result).toBe(0);
    expect(empty.growth.revenue).toBeNull();
    expect(empty.aging?.total).toBe(0);
  });
  it("reports reconciliation state separately from actual bank statement verification", async () => {
    const result = await fixture().service.dashboard(input);
    expect(result.reconciliation).toMatchObject({ reconciled: 2, pending: 1, unknown: 1, percentage: 50, statementVerified: false });
  });
  it("calculates historical bank balances and separates account creation inside the period", async () => {
    const bank = {
      id: 1,
      name: "Banco exemplo",
      accountId: 30,
      type: "B",
      active: "S",
      openingDate: "2020-01-01",
      openingBalance: "100.00",
      linkedAccounts: "1",
    };
    const row = {
      bankId: 1,
      cancellationCode: "",
      priorVariation: "20.00",
      inflow: "50.10",
      outflow: "10.20",
      possibleOpeningDuplicate: "0",
      records: "3",
    };
    const { service } = fixture({
      "bank-accounts": [bank, { ...bank, id: 2, openingDate: "2026-10-03" }],
      "bank-period-opening-and-movements": [row, { ...row, bankId: 2, priorVariation: "0" }],
    });
    const result = await service.banks(input);
    expect(result.accounts[0]).toMatchObject({ opening: 120, openingAdjustment: 0, inflow: 50.1, outflow: 10.2, closing: 159.9 });
    expect(result.accounts[1]).toMatchObject({ opening: 0, openingAdjustment: 100, closing: 139.9 });
    const scoped = fixture();
    expect((await scoped.service.banks({ ...input, branchId: 8 })).accounts).toEqual([]);
    expect(scoped.select).not.toHaveBeenCalled();
  });
  it("does not invent balances with duplicated opening, shared account or timed-out history", async () => {
    const bank = {
      id: 1,
      name: "Banco exemplo",
      accountId: 30,
      type: "B",
      active: "S",
      openingDate: "2020-01-01",
      openingBalance: "100.00",
      linkedAccounts: "1",
    };
    const row = {
      bankId: 1,
      cancellationCode: "",
      priorVariation: "20.00",
      inflow: "50.10",
      outflow: "10.20",
      possibleOpeningDuplicate: "1",
      records: "3",
    };
    expect(
      (await fixture({ "bank-accounts": [bank], "bank-period-opening-and-movements": [row] }).service.banks(input)).accounts[0]
    ).toMatchObject({ opening: null, closing: null, reason: expect.stringContaining("duplicidade") });
    expect(
      (await fixture({ "bank-accounts": [{ ...bank, linkedAccounts: "2" }], "bank-period-opening-and-movements": [] }).service.banks(input))
        .accounts[0]?.closing
    ).toBeNull();
    const unavailable = await fixture({
      "bank-accounts": [bank],
      "bank-period-opening-and-movements": new Error("PRIVATE_SQL"),
    }).service.banks(input);
    expect(unavailable.accounts[0]?.closing).toBeNull();
    expect(JSON.stringify(unavailable)).not.toContain("PRIVATE_SQL");
  });
  it("rejects invalid scope, huge totals and cancellation before querying", async () => {
    const { service, select } = fixture();
    const signal = new AbortController();
    signal.abort();
    await expect(service.dashboard(input, signal.signal)).rejects.toMatchObject({ statusCode: 499 });
    expect(select).not.toHaveBeenCalled();
    await expect(service.dashboard({ ...input, regime: "fake" as never })).rejects.toThrow();
    await expect(
      fixture({ "dashboard-movements": [movement({ credit: "9007199254740993.00" })] }).service.dashboard(input)
    ).rejects.toMatchObject({ statusCode: 422 });
  });
  it("protects both SQL routes and hides connection information", async () => {
    const authenticate = vi
      .spyOn(AuthService.prototype, "authenticate")
      .mockResolvedValue({ id: 1, name: "Operador", email: "test@example.test", role: "OPERATOR", permissions: [] });
    const dashboard = vi.spyOn(FinanceSqlService.prototype, "dashboard").mockRejectedValue(new Error("PRIVATE_DATABASE_HOST"));
    const banks = vi
      .spyOn(FinanceSqlService.prototype, "banks")
      .mockResolvedValue({ accounts: [], warnings: [], queriedAt: now().toISOString() });
    const app = Fastify();
    await app.register(financeRoutes, { prefix: "/api/finance" });
    try {
      for (const endpoint of ["dashboard", "banks"]) {
        const url = `/api/finance/${endpoint}?from=${input.from}&to=${input.to}`;
        expect((await app.inject({ url })).statusCode).toBe(403);
        for (const method of ["POST", "PATCH", "PUT", "DELETE"] as const) expect((await app.inject({ url, method })).statusCode).toBe(404);
      }
      expect(dashboard).not.toHaveBeenCalled();
      expect(banks).not.toHaveBeenCalled();
      authenticate.mockResolvedValue({ id: 1, name: "Admin", email: "test@example.test", role: "ADMIN" });
      const response = await app.inject({ url: `/api/finance/dashboard?from=${input.from}&to=${input.to}` });
      expect(response.statusCode).toBe(502);
      expect(response.body).not.toContain("PRIVATE_DATABASE_HOST");
      const bankResponse = await app.inject({ url: `/api/finance/banks?from=${input.from}&to=${input.to}` });
      expect(bankResponse.statusCode).toBe(200);
      expect(bankResponse.headers["cache-control"]).toBe("no-store");
    } finally {
      await app.close();
    }
  });
});
