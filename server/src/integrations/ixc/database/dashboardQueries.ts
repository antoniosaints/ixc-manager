import { financeQuery, comparisonPeriod, type FinanceQuery } from "../../../services/finance/FinanceService.js";
import { addDays } from "../../../services/upgrades/UpgradeService.js";
import type { IxcReadQuery } from "./IxcReadDatabase.js";

export function financialScope(query: FinanceQuery, alias = "t", regimeField = `${alias}.previsao`) {
  const code = query.regime === "cash" ? "S" : query.regime === "competence" ? "N" : query.regime === "manual" ? "M" : undefined;
  return {
    sql: `${query.branchId ? ` AND ${alias}.filial_id = ?` : ""}${query.accountId ? ` AND ${alias}.id_conta = ?` : ""}${code ? ` AND ${regimeField} = ?` : ""}`,
    params: [...(query.branchId ? [query.branchId] : []), ...(query.accountId ? [query.accountId] : []), ...(code ? [code] : [])],
  };
}
export function dashboardMovements(input: FinanceQuery): IxcReadQuery {
  const query = financeQuery.parse(input),
    filter = financialScope(query, "t", "a.previsao");
  return {
    name: "dashboard-movements",
    sql: `SELECT t.data day, t.id_conta accountId, a.planejamento_analitico accountName,
      a.classificacao classification, a.tipo analyticType, p.tipo syntheticType, a.previsao regimeCode,
      COALESCE(t.cancelamento, '') cancellationCode,
      CASE WHEN COALESCE(t.id_fn_tranferencia_caixa,0)>0 THEN 1 ELSE 0 END isTransfer,
      CASE WHEN x.id IS NOT NULL AND co.id IS NOT NULL AND cd.id IS NOT NULL
        AND co.id<>cd.id THEN 1 ELSE 0 END validTransfer,
      SUM(t.credito) credit, SUM(t.debito) debit, COUNT(*) records
      FROM fn_movim_finan t
      LEFT JOIN planejamento_analitico a ON a.id=t.id_conta
      LEFT JOIN planejamento p ON p.id=a.id_planejamento
      LEFT JOIN fn_transferencia_caixa x ON x.id=t.id_fn_tranferencia_caixa
      LEFT JOIN contas co ON co.id=x.contas_id_origem
      LEFT JOIN contas cd ON cd.id=x.contas_id_destino
      WHERE t.data>=? AND t.data<?${filter.sql}
      GROUP BY t.data,t.id_conta,a.planejamento_analitico,a.classificacao,a.tipo,p.tipo,a.previsao,t.cancelamento,isTransfer,validTransfer
      ORDER BY t.data,t.id_conta`,
    params: [comparisonPeriod(query).from, addDays(query.to, 1), ...filter.params],
  };
}
export function dashboardTitles(source: "receivable" | "payable", input: FinanceQuery, today: string): IxcReadQuery {
  const query = financeQuery.parse(input),
    filter = financialScope(query);
  const table = source === "receivable" ? "fn_areceber" : "fn_apagar";
  const renegotiated = source === "receivable" ? "COALESCE(t.titulo_renegociado,'')" : "''";
  return {
    name: `dashboard-${source}`,
    timeoutSeconds: 5,
    sql: `SELECT t.status statusCode, COALESCE(t.estornado,'') reversedCode, ${renegotiated} renegotiatedCode,
      COUNT(*) records, SUM(t.valor_aberto IS NULL) nullBalances, SUM(t.valor_aberto<0) negativeBalances,
      SUM(t.valor_aberto>0) openCount,
      SUM(CASE WHEN t.valor_aberto>0 THEN t.valor_aberto ELSE 0 END) openBalance,
      SUM(CASE WHEN t.valor_aberto>0 AND t.data_vencimento<? THEN t.valor_aberto ELSE 0 END) overdueBalance
      FROM ${table} t WHERE t.data_vencimento>=? AND t.data_vencimento<?${filter.sql}
      GROUP BY t.status,t.estornado${source === "receivable" ? ",t.titulo_renegociado" : ""}`,
    params: [today, query.from, addDays(query.to, 1), ...filter.params],
  };
}
export function dashboardAging(input: FinanceQuery, today: string): IxcReadQuery {
  const query = financeQuery.parse(input),
    filter = financialScope(query);
  return {
    name: "dashboard-current-aging",
    timeoutSeconds: 5,
    sql: `SELECT CASE WHEN t.data_vencimento<'1000-01-01' THEN 'unknown'
      WHEN DATEDIFF(?,t.data_vencimento)<=30 THEN '1-30'
      WHEN DATEDIFF(?,t.data_vencimento)<=60 THEN '31-60'
      WHEN DATEDIFF(?,t.data_vencimento)<=90 THEN '61-90' ELSE '91+' END bucket,
      COALESCE(t.titulo_renegociado,'') renegotiatedCode,
      COUNT(*) records, SUM(t.valor_aberto IS NULL) nullBalances, SUM(t.valor_aberto<0) negativeBalances,
      SUM(t.valor_aberto>0) openCount,
      SUM(CASE WHEN t.valor_aberto>0 THEN t.valor_aberto ELSE 0 END) openBalance
      FROM fn_areceber t WHERE t.data_vencimento<? AND t.status IN ('A','P')
      AND COALESCE(t.estornado,'') IN ('','N')${filter.sql}
      GROUP BY bucket,t.titulo_renegociado`,
    params: [today, today, today, today, ...filter.params],
  };
}
export function dashboardConcilation(input: FinanceQuery): IxcReadQuery {
  const query = financeQuery.parse(input),
    filter = financialScope(query, "t", "a.previsao");
  return {
    name: "dashboard-reconciliation-status",
    timeoutSeconds: 5,
    sql: `SELECT COALESCE(t.conciliado,'') code, COALESCE(t.cancelamento,'') cancellationCode, COUNT(*) records,
      SUM(t.credito) credit, SUM(t.debito) debit
      FROM fn_movim_finan t LEFT JOIN planejamento_analitico a ON a.id=t.id_conta
      WHERE t.data>=? AND t.data<?${filter.sql} GROUP BY t.conciliado,t.cancelamento`,
    params: [query.from, addDays(query.to, 1), ...filter.params],
  };
}
export function bankAccountsQuery(input: FinanceQuery): IxcReadQuery {
  const query = financeQuery.parse(input);
  return {
    name: "bank-accounts",
    timeoutSeconds: 3,
    sql: `SELECT c.id, c.conta name, c.id_planejamento accountId, c.tipo_conta type, c.ativo active,
      c.data_abertura openingDate, c.saldo_abertura openingBalance,
      (SELECT COUNT(*) FROM contas d WHERE d.id_planejamento=c.id_planejamento) linkedAccounts
      FROM contas c WHERE c.data_abertura<?${query.accountId ? " AND c.id_planejamento=?" : ""} ORDER BY c.conta,c.id`,
    params: [addDays(query.to, 1), ...(query.accountId ? [query.accountId] : [])],
  };
}
export function bankLedgerQuery(input: FinanceQuery): IxcReadQuery {
  const query = financeQuery.parse(input);
  return {
    name: "bank-period-opening-and-movements",
    timeoutSeconds: 5,
    sql: `SELECT c.id bankId, COALESCE(t.cancelamento,'') cancellationCode,
      SUM(CASE WHEN t.data<? THEN t.debito-t.credito ELSE 0 END) priorVariation,
      SUM(CASE WHEN t.data>=? THEN t.debito ELSE 0 END) inflow,
      SUM(CASE WHEN t.data>=? THEN t.credito ELSE 0 END) outflow,
      SUM(CASE WHEN t.data=c.data_abertura AND c.saldo_abertura<>0
        AND (t.debito=ABS(c.saldo_abertura) OR t.credito=ABS(c.saldo_abertura)) THEN 1 ELSE 0 END) possibleOpeningDuplicate,
      COUNT(*) records
      FROM contas c JOIN fn_movim_finan t ON t.id_conta=c.id_planejamento
        AND t.data>=c.data_abertura AND t.data<?
      WHERE c.data_abertura>='1000-01-01'${query.accountId ? " AND c.id_planejamento=?" : ""}
      GROUP BY c.id,t.cancelamento`,
    params: [query.from, query.from, query.from, addDays(query.to, 1), ...(query.accountId ? [query.accountId] : [])],
  };
}
