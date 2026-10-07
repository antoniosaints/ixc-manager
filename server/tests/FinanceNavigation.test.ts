import { describe, expect, it } from "vitest";
import { financeNavigationQuery, readFinanceNavigation } from "../../client/src/financeNavigation.js";

const defaults = { from: "2026-10-01", to: "2026-10-07", branchId: "", accountId: "", regime: "all", receivableScope: "active" };

describe("Financeiro: navegação entre Painel e Lista", () => {
  it("preserva o período, filial, conta, regime e elegibilidade ao abrir uma faixa de atraso", () => {
    const filters = { ...defaults, from: "2026-09-01", branchId: "2", accountId: "174", regime: "cash", receivableScope: "all" };
    const selection = {
      tab: "pending" as const,
      type: "all",
      accountSearch: "",
      pending: { kind: "receivable", scope: "aging", bucket: "31-60", search: "", searchBy: "name", sort: "oldest" },
    };
    expect(readFinanceNavigation(financeNavigationQuery(filters, selection), defaults)).toEqual({ filters, selection });
  });

  it("restaura todas as visões por link direto ou histórico do navegador", () => {
    for (const tab of ["accounts", "series", "ledger", "banks", "pending"] as const) {
      const { filters, selection } = readFinanceNavigation(
        { tab, type: "D", accountSearch: "Salários", search: "Cliente", sort: "balance" },
        defaults
      );
      expect(readFinanceNavigation(financeNavigationQuery(filters, selection), defaults)).toEqual({ filters, selection });
      expect(selection.tab).toBe(tab);
    }
  });

  it("mantém distintos os recebíveis, pagamentos e períodos dos atalhos", () => {
    expect(
      readFinanceNavigation({ tab: "pending", kind: "payable", scope: "period", bucket: "91+", searchBy: "contractId" }, defaults).selection
        .pending
    ).toMatchObject({ kind: "payable", scope: "period", bucket: "all", searchBy: "name" });
    expect(readFinanceNavigation({ scope: "overdue" }, defaults).selection.pending.scope).toBe("overdue");
  });

  it("ignora parâmetros inválidos mantendo clientes e contratos ativos como padrão", () => {
    for (const from of ["2026-99-01", "2026-02-30", "2027-10-01", "2024-01-01", ""]) {
      const parsed = readFinanceNavigation(
        { from, to: "2026-10-07", branchId: "-1", accountId: "x", tab: "x", receivableScope: "x" },
        defaults
      );
      expect(parsed.filters).toEqual(defaults);
      expect(parsed.selection.tab).toBe("accounts");
    }
  });
});
