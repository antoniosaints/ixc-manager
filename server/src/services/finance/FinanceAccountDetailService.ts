import { z } from "zod";
import { financeQuery } from "./FinanceService.js";
import { IxcReadDatabase, type IxcReadSession, type IxcReadQuery } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { financialScope } from "../../integrations/ixc/database/dashboardQueries.js";
import { decimalToUnits, mapDate } from "../../integrations/ixc/database/maps/valueMappers.js";
import { addDays } from "../upgrades/UpgradeService.js";

export const accountDetailQuery = z
  .object({
    from: z.string(),
    to: z.string(),
    accountId: z.coerce.number().int().positive().safe(),
    branchId: z.coerce.number().int().positive().optional(),
    regime: z.enum(["all", "cash", "competence", "manual"]).optional(),
    basis: z.enum(["result", "ledger"]).default("result"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce
      .number()
      .int()
      .refine((n) => n === 10 || n === 25)
      .default(10),
  })
  .superRefine((q, ctx) => {
    if (!financeQuery.safeParse(q).success) ctx.addIssue({ code: "custom", message: "Período inválido" });
  });
export type AccountDetailQuery = z.input<typeof accountDetailQuery>;
export function accountDetailSql(input: AccountDetailQuery) {
  const query = accountDetailQuery.parse(input),
    filter = financialScope(query, "t", "a.previsao");
  // Same inclusion rules as FinanceSqlService.dashboard. Customer activity only filters
  // open receivables; it must not remove payments that already compose the result.
  const base = `FROM fn_movim_finan t
    JOIN planejamento_analitico a ON a.id=t.id_conta
    JOIN planejamento p ON p.id=a.id_planejamento
    WHERE t.data>=? AND t.data<?${filter.sql}
    AND TRIM(COALESCE(t.cancelamento,'')) IN ('','N')
    AND a.tipo=p.tipo AND a.tipo IN (${query.basis === "result" ? "'R','D'" : "'R','D','A','P','C','PT'"})
    ${query.basis === "result" ? "AND COALESCE(t.id_fn_tranferencia_caixa,0)<=0" : ""}`;
  const params = [query.from, addDays(query.to, 1), ...filter.params];
  const summary: IxcReadQuery = {
    name: "finance-account-composition-summary",
    timeoutSeconds: 5,
    params,
    sql: `SELECT COUNT(*) total, COALESCE(SUM(t.credito),0) credit, COALESCE(SUM(t.debito),0) debit,
      COUNT(DISTINCT CASE WHEN t.id_receber>0 THEN t.id_receber END) receivableTitles,
      COUNT(DISTINCT CASE WHEN t.id_pagar>0 THEN t.id_pagar END) payableTitles,
      SUM(CASE WHEN COALESCE(t.id_receber,0)<=0 AND COALESCE(t.id_pagar,0)<=0 THEN 1 ELSE 0 END) unlinked ${base}`,
  };
  const details: IxcReadQuery = {
    name: "finance-account-composition-rows",
    timeoutSeconds: 5,
    sql: `SELECT m.id,m.data day,m.documento document,m.historico history,m.filial_id branchId,
      m.credito credit,m.debito debit, NULLIF(m.id_receber,0) receivableId,NULLIF(m.id_pagar,0) payableId,
      r.documento receivableDocument,r.data_vencimento receivableDueDate,r.valor receivableAmount,
      r.status receivableStatus,r.id_cliente customerId,c.razao customerName,r.id_contrato contractId,
      v.documento payableDocument,v.data_vencimento payableDueDate,v.valor payableAmount,
      v.status payableStatus,v.id_fornecedor supplierId,f.razao supplierName
      FROM (SELECT t.id ${base} ORDER BY t.data DESC,t.id DESC LIMIT ? OFFSET ?) selected
      JOIN fn_movim_finan m ON m.id=selected.id
      LEFT JOIN fn_areceber r ON r.id=m.id_receber
      LEFT JOIN cliente c ON c.id=r.id_cliente
      LEFT JOIN fn_apagar v ON v.id=m.id_pagar
      LEFT JOIN fornecedor f ON f.id=v.id_fornecedor
      ORDER BY m.data DESC,m.id DESC`,
    params: [...params, query.limit, (query.page - 1) * query.limit],
  };
  return { query, summary, details };
}
interface Reader {
  withSnapshot<T>(read: (session: IxcReadSession) => Promise<T>, signal?: AbortSignal): Promise<T>;
}
interface Summary {
  total: string;
  credit: string;
  debit: string;
  receivableTitles: string;
  payableTitles: string;
  unlinked: string | null;
}
interface Detail {
  id: string;
  day: string;
  document: string | null;
  history: string | null;
  branchId: number;
  credit: string;
  debit: string;
  receivableId: string | null;
  payableId: string | null;
  receivableDocument: string | null;
  receivableDueDate: string | null;
  receivableAmount: string | null;
  receivableStatus: string | null;
  customerId: number | null;
  customerName: string | null;
  contractId: number | null;
  payableDocument: string | null;
  payableDueDate: string | null;
  payableAmount: string | null;
  payableStatus: string | null;
  supplierId: number | null;
  supplierName: string | null;
}
const money = (value: bigint) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
    throw Object.assign(new Error("Valor excede a precisão disponível."), { statusCode: 422 });
  return Number(value) / 100;
};
export class FinanceAccountDetailService {
  constructor(
    private db: Reader = new IxcReadDatabase(),
    private now = () => new Date()
  ) {}
  async list(input: AccountDetailQuery, signal?: AbortSignal) {
    const { query, summary, details } = accountDetailSql(input);
    return this.db.withSnapshot(async (session) => {
      const [account] = await session.select<{ id: number; name: string; type: string; classification: string }>({
        name: "finance-composition-account",
        timeoutSeconds: 3,
        params: [query.accountId],
        sql: "SELECT id,planejamento_analitico name,tipo type,classificacao classification FROM planejamento_analitico WHERE id=? LIMIT 1",
      });
      if (!account) throw Object.assign(new Error("Conta contábil não encontrada."), { statusCode: 404 });
      const [totals] = await session.select<Summary>(summary);
      const rows = await session.select<Detail>(details);
      const credit = decimalToUnits(totals?.credit ?? "0"),
        debit = decimalToUnits(totals?.debit ?? "0");
      const contribution = (credit: bigint, debit: bigint) =>
        money(query.basis === "result" && account.type === "D" ? debit - credit : credit - debit);
      return {
        account,
        basis: query.basis,
        period: { from: query.from, to: query.to },
        page: query.page,
        limit: query.limit,
        total: Number(totals?.total ?? 0),
        credit: money(credit),
        debit: money(debit),
        value: contribution(credit, debit),
        receivableTitles: Number(totals?.receivableTitles ?? 0),
        payableTitles: Number(totals?.payableTitles ?? 0),
        unlinked: Number(totals?.unlinked ?? 0),
        items: rows.map((row) => ({
          id: String(row.id),
          day: mapDate(row.day),
          document: row.document,
          history: row.history,
          branchId: row.branchId,
          credit: money(decimalToUnits(row.credit)),
          debit: money(decimalToUnits(row.debit)),
          value: contribution(decimalToUnits(row.credit), decimalToUnits(row.debit)),
          titles: [
            ...(row.receivableId
              ? [
                  {
                    kind: "receivable" as const,
                    id: String(row.receivableId),
                    document: row.receivableDocument,
                    dueDate: mapDate(row.receivableDueDate),
                    amount: row.receivableAmount === null ? null : money(decimalToUnits(row.receivableAmount)),
                    status: row.receivableStatus,
                    partyId: row.customerId,
                    partyName: row.customerName,
                    contractId: row.contractId,
                  },
                ]
              : []),
            ...(row.payableId
              ? [
                  {
                    kind: "payable" as const,
                    id: String(row.payableId),
                    document: row.payableDocument,
                    dueDate: mapDate(row.payableDueDate),
                    amount: row.payableAmount === null ? null : money(decimalToUnits(row.payableAmount)),
                    status: row.payableStatus,
                    partyId: row.supplierId,
                    partyName: row.supplierName,
                    contractId: null,
                  },
                ]
              : []),
          ],
        })),
        queriedAt: this.now().toISOString(),
      };
    }, signal);
  }
}
