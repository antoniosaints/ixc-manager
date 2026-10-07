import { financeQuery, comparisonPeriod, type FinanceQuery } from "../../../services/finance/FinanceService.js";
import { addDays } from "../../../services/upgrades/UpgradeService.js";
import type { IxcReadQuery } from "./IxcReadDatabase.js";

function scope(query: FinanceQuery, field: string, from: string) {
  return {
    sql: `t.${field} >= ? AND t.${field} < ?${query.branchId ? " AND t.filial_id = ?" : ""}${query.accountId ? " AND t.id_conta = ?" : ""}`,
    params: [from, addDays(query.to, 1), ...(query.branchId ? [query.branchId] : []), ...(query.accountId ? [query.accountId] : [])],
  };
}
/** Group in SQL, preserving cancellation and regime buckets for a reviewed financial definition. */
export function movementQuery(input: FinanceQuery): IxcReadQuery {
  const query = financeQuery.parse(input);
  const filter = scope(query, "data", comparisonPeriod(query).from);
  return {
    name: "financial-movements-by-day-account-regime",
    sql: `SELECT t.data day, t.filial_id branchId, t.id_conta accountId,
      a.planejamento_analitico accountName, a.tipo analyticType, p.tipo syntheticType,
      a.previsao regimeCode, COALESCE(t.cancelamento, '') cancellationCode,
      SUM(t.credito) credit, SUM(t.debito) debit, COUNT(*) movementCount,
      SUM(COALESCE(t.id_fn_tranferencia_caixa, 0) > 0) transferLinkedCount
      FROM fn_movim_finan t
      LEFT JOIN planejamento_analitico a ON a.id = t.id_conta
      LEFT JOIN planejamento p ON p.id = a.id_planejamento
      WHERE ${filter.sql}
      GROUP BY t.data, t.filial_id, t.id_conta, a.planejamento_analitico, a.tipo, p.tipo, a.previsao, t.cancelamento
      ORDER BY t.data, t.id_conta, t.filial_id`,
    params: filter.params,
  };
}
export function titleQuery(source: "receivable" | "payable", input: FinanceQuery, today: string): IxcReadQuery {
  const query = financeQuery.parse(input);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("Data de referência inválida");
  const table = source === "receivable" ? "fn_areceber" : "fn_apagar";
  const filter = scope(query, "data_vencimento", query.from);
  const renegotiated = source === "receivable" ? "COALESCE(t.titulo_renegociado, '')" : "''";
  return {
    name: `financial-${source}-by-status-regime`,
    sql: `SELECT t.status statusCode, COALESCE(t.previsao, '') regimeCode,
      COALESCE(t.estornado, '') reversedCode, ${renegotiated} renegotiatedCode,
      COUNT(*) titleCount, SUM(t.valor_aberto IS NULL) nullBalanceCount,
      SUM(t.valor_aberto < 0) negativeBalanceCount,
      SUM(t.valor_aberto > 0) openTitleCount,
      SUM(t.valor_aberto) openBalance,
      SUM(CASE WHEN t.data_vencimento < ? THEN t.valor_aberto ELSE 0 END) overdueBalance
      FROM ${table} t WHERE ${filter.sql}
      GROUP BY t.status, t.previsao, t.estornado${source === "receivable" ? ", t.titulo_renegociado" : ""}
      ORDER BY t.status, t.previsao, t.estornado`,
    params: [today, ...filter.params],
  };
}
export function ledgerBalanceQuery(input: FinanceQuery): IxcReadQuery {
  const query = financeQuery.parse(input);
  const filter = scope(query, "data", query.from);
  return {
    name: "financial-period-ledger-control",
    sql: `SELECT COUNT(*) movementCount, SUM(t.credito) credit, SUM(t.debito) debit
      FROM fn_movim_finan t WHERE ${filter.sql}`,
    params: filter.params,
  };
}
