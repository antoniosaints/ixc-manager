import { describe, expect, it } from "vitest";
import { compareSortValues, sortTableRows } from "../../client/src/utils/tableSort.js";
import { sortTableRows as sortServerRows } from "../src/utils/tableSort.js";
import { useTableSort } from "../../client/src/composables/useTableSort.js";
import { columnOrder, ixcColumnOrder } from "../src/utils/columnSort.js";
import { pendingSql } from "../src/services/finance/FinancePendingService.js";
import { collectionsSql } from "../src/services/collections/CollectionsService.js";
import { loginListQuery, loginListSql } from "../src/services/network/NetworkLoginService.js";
import { supportContractsSql } from "../src/services/support/SupportContractsService.js";
import { supportOrdersSql } from "../src/services/support/SupportOrdersService.js";

const today = "2026-10-13";
describe("Ordenação por coluna", () => {
  it("compara números, textos em português, datas e volumes sem perder precisão; mantém vazios no fim", () => {
    expect(compareSortValues(9, 100, "asc")).toBeLessThan(0);
    expect(compareSortValues(-20, 5, "desc")).toBeGreaterThan(0);
    expect(compareSortValues("Água 2", "agua 10", "asc")).toBeLessThan(0);
    expect(compareSortValues("2026-01-15", "2025-12-31", "asc")).toBeGreaterThan(0);
    expect(compareSortValues(9007199254740993n, 9007199254740992n, "asc")).toBeGreaterThan(0);
    expect(compareSortValues(null, 3, "asc")).toBeGreaterThan(0);
    expect(compareSortValues(undefined, 3, "desc")).toBeGreaterThan(0);
    expect(compareSortValues(NaN, 3, "desc")).toBeGreaterThan(0);
  });
  it("mantém a ordem dos empates, não modifica a origem e limpa os parâmetros e a ordenação", () => {
    const rows = [
      { id: 1, value: 9 },
      { id: 2, value: 2 },
      { id: 3, value: 9 },
    ];
    const state = useTableSort();
    state.setTableSort({ column: "value", direction: "asc" });
    expect(state.sortParams()).toEqual({ sortColumn: "value", sortDirection: "asc" });
    expect(state.sortedRows(rows, (row) => row.value).map((row) => row.id)).toEqual([2, 1, 3]);
    expect(sortServerRows(rows, state.tableSort.value, (row) => row.value)).toEqual(
      sortTableRows(rows, state.tableSort.value, (row) => row.value)
    );
    state.setTableSort(null);
    expect(state.sortParams()).toEqual({});
    expect(state.sortedRows(rows, (row) => row.value)).toEqual(rows);
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
  });
  it("aceita apenas colunas conhecidas e preserva a ordenação original quando não há escolha", () => {
    const columns = { amount: "t.valor" };
    expect(columnOrder({}, columns, "t.id DESC", "t.id")).toBe("t.id DESC");
    expect(columnOrder({ sortColumn: "amount", sortDirection: "desc" }, columns, "t.id", "t.id")).toBe(
      "(t.valor IS NULL) ASC,t.valor DESC,t.id"
    );
    expect(ixcColumnOrder({ sortColumn: "amount", sortDirection: "asc" }, columns, "t.id", "desc")).toEqual({
      sortname: "t.valor",
      sortorder: "asc",
    });
    for (const sortColumn of ["senha", "toString", "__proto__", "amount DESC; DELETE FROM cliente"])
      expect(() => columnOrder({ sortColumn }, columns, "t.id", "t.id")).toThrow("Coluna de ordenação inválida");
  });
  it("usa o campo certo em financeiro, cobrança, contratos, logins e prioridade de OS", () => {
    const financial = { from: "2026-10-01", to: today, sortColumn: "paid", sortDirection: "desc" as const };
    expect(pendingSql({ ...financial, kind: "receivable" }, today).details.sql).toContain("t.valor_recebido DESC,t.id LIMIT");
    expect(pendingSql({ ...financial, kind: "payable" }, today).details.sql).toContain("t.valor_pago DESC,t.id LIMIT");
    expect(collectionsSql({ sortColumn: "titles", sortDirection: "asc" }, today).customers.sql).toContain("g.titles ASC,c.id LIMIT");
    expect(collectionsSql({ sortColumn: "amount", sortDirection: "desc" }, today, { customerId: 1 }).titles.sql).toContain(
      "t.valor DESC,t.id LIMIT"
    );
    expect(loginListSql(loginListQuery.parse({ sortColumn: "customerName", sortDirection: "asc" })).list.sql).toContain(
      "c.razao ASC,r.id LIMIT"
    );
    expect(supportContractsSql({ sortColumn: "planName", sortDirection: "desc" }).list.sql).toContain("p.nome DESC,cc.id LIMIT");
    expect(supportOrdersSql({ sortColumn: "priority", sortDirection: "desc" }, new Date(`${today}T15:00:00Z`)).list.sql).toContain(
      "WHEN 'C' THEN 3 END DESC,t.id LIMIT"
    );
  });
});
