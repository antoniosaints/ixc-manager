import { z } from "zod";
import { financeQuery } from "./FinanceService.js";
import { IxcReadDatabase, type IxcReadSession, type IxcReadQuery } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { financialScope } from "../../integrations/ixc/database/dashboardQueries.js";
import { decimalToUnits, mapDate } from "../../integrations/ixc/database/maps/valueMappers.js";
import { addDays, referenceDate } from "../upgrades/UpgradeService.js";
import { receivableEligibility } from "../../integrations/ixc/database/receivableEligibility.js";

export const pendingQuery = z
  .object({
    from: z.string(),
    to: z.string(),
    branchId: z.coerce.number().int().positive().optional(),
    accountId: z.coerce.number().int().positive().optional(),
    regime: z.enum(["all", "cash", "competence", "manual"]).optional(),
    receivableScope: z.enum(["active", "all"]).default("active"),
    kind: z.enum(["receivable", "payable"]).default("receivable"),
    scope: z.enum(["aging", "period", "overdue"]).default("aging"),
    bucket: z.enum(["all", "1-30", "31-60", "61-90", "91+"]).default("all"),
    search: z.string().trim().max(120).default(""),
    searchBy: z.enum(["name", "partyId", "titleId", "contractId"]).default("name"),
    sort: z.enum(["oldest", "newest", "balance"]).default("oldest"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce
      .number()
      .int()
      .refine((n) => n === 10 || n === 25)
      .default(10),
  })
  .superRefine((q, ctx) => {
    if (!financeQuery.safeParse(q).success) ctx.addIssue({ code: "custom", message: "Período inválido" });
    if (q.scope !== "aging" && q.bucket !== "all") ctx.addIssue({ code: "custom", message: "Faixas de atraso exigem a carteira atual" });
    if (q.search && q.searchBy !== "name" && !/^[1-9]\d*$/.test(q.search))
      ctx.addIssue({ code: "custom", message: "Informe um ID positivo" });
    if (q.kind === "payable" && q.searchBy === "contractId")
      ctx.addIssue({ code: "custom", message: "Contratos só se aplicam a recebíveis" });
  });
export type PendingQuery = z.input<typeof pendingQuery>;
interface Reader {
  withSnapshot<T>(read: (session: IxcReadSession) => Promise<T>, signal?: AbortSignal): Promise<T>;
  close?(): Promise<void>;
}
interface TitleRow {
  id: string;
  partyId: number | null;
  partyName: string | null;
  partyActive: string | null;
  contractId: number | null;
  contractName: string | null;
  contractStatus: string | null;
  accountId: number | null;
  accountName: string | null;
  branchId: number | null;
  document: string | null;
  dueDate: string;
  issuedDate: string;
  amount: string;
  paid: string;
  balance: string;
  status: string;
  daysLate: string;
}
const fail = (message: string) => Object.assign(new Error(message), { statusCode: 502 });
const money = (raw: string) => {
  const cents = decimalToUnits(raw);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) throw fail("Saldo excede a precisão disponível.");
  return Number(cents) / 100;
};
export function pendingSql(input: PendingQuery, today: string) {
  const query = pendingQuery.parse(input),
    scope = financialScope(query),
    receiving = query.kind === "receivable";
  const table = receiving ? "fn_areceber" : "fn_apagar",
    party = receiving ? "cliente" : "fornecedor",
    partyField = receiving ? "id_cliente" : "id_fornecedor";
  let where = "t.status IN ('A','P') AND COALESCE(t.estornado,'') IN ('','N') AND t.valor_aberto>0";
  const params: (string | number | null)[] = [];
  if (receiving) where += " AND COALESCE(t.titulo_renegociado,'') IN ('','N')";
  if (receiving) where += receivableEligibility(query.receivableScope);
  where += " AND t.data_vencimento>='1000-01-01'";
  if (query.scope === "aging") {
    const bounds: Record<string, [number, number | null]> = { "1-30": [1, 30], "31-60": [31, 60], "61-90": [61, 90], "91+": [91, null] };
    const range = bounds[query.bucket];
    where += " AND t.data_vencimento<?";
    params.push(range ? addDays(today, 1 - range[0]) : today);
    if (range?.[1]) {
      where += " AND t.data_vencimento>=?";
      params.push(addDays(today, -range[1]));
    }
  } else {
    where += " AND t.data_vencimento>=? AND t.data_vencimento<?";
    params.push(query.from, addDays(query.to, 1));
    if (query.scope === "overdue") {
      where += " AND t.data_vencimento<?";
      params.push(today);
    }
  }
  where += scope.sql;
  params.push(...scope.params);
  if (query.search) {
    const fields = { name: "c.razao", partyId: `t.${partyField}`, titleId: "t.id", contractId: "t.id_contrato" };
    if (query.searchBy === "name") {
      where += " AND c.razao LIKE ? ESCAPE '='";
      params.push(`%${query.search.replace(/[=%_]/g, "=$&")}%`);
    } else {
      where += ` AND ${fields[query.searchBy]}=?`;
      params.push(query.search);
    }
  }
  const base = `FROM ${table} t LEFT JOIN ${party} c ON c.id=t.${partyField} WHERE ${where}`;
  const summary: IxcReadQuery = {
    name: "pending-summary",
    timeoutSeconds: 5,
    sql: `SELECT COUNT(*) total, COALESCE(SUM(t.valor_aberto),0) balance ${base}`,
    params,
  };
  const order =
    query.sort === "balance"
      ? "t.valor_aberto DESC,t.data_vencimento,t.id"
      : `t.data_vencimento ${query.sort === "newest" ? "DESC" : "ASC"},t.id`;
  const details: IxcReadQuery = {
    name: "pending-titles",
    timeoutSeconds: 5,
    sql: `SELECT t.id,t.${partyField} partyId,c.razao partyName,${receiving ? "c.ativo" : "NULL"} partyActive,
 ${receiving ? "t.id_contrato contractId,cc.contrato contractName,cc.status contractStatus" : "NULL contractId,NULL contractName,NULL contractStatus"},t.id_conta accountId,a.planejamento_analitico accountName,
 t.filial_id branchId,t.documento document,t.data_vencimento dueDate,t.data_emissao issuedDate,t.valor amount,
 t.${receiving ? "valor_recebido" : "valor_pago"} paid,t.valor_aberto balance,t.status,DATEDIFF(?,t.data_vencimento) daysLate
 FROM ${table} t LEFT JOIN ${party} c ON c.id=t.${partyField}
 LEFT JOIN planejamento_analitico a ON a.id=t.id_conta
 ${receiving ? "LEFT JOIN cliente_contrato cc ON cc.id=t.id_contrato AND cc.id_cliente=t.id_cliente" : ""}
 WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    params: [today, ...params, query.limit, (query.page - 1) * query.limit],
  };
  return { query, summary, details };
}
export class FinancePendingService {
  constructor(
    private readonly db: Reader = new IxcReadDatabase(),
    private readonly now = () => new Date()
  ) {}
  async close() {
    await this.db.close?.();
  }
  async options(signal?: AbortSignal) {
    return this.db.withSnapshot(async (session) => {
      const branches = await session.select<{ id: number; name: string }>({
        name: "finance-branch-options",
        timeoutSeconds: 3,
        params: [],
        sql: "SELECT id,COALESCE(NULLIF(fantasia,''),razao) name FROM filial ORDER BY name,id LIMIT 5001",
      });
      const accounts = await session.select<{ id: number; name: string; type: string; classification: string }>({
        name: "finance-account-options",
        timeoutSeconds: 3,
        params: [],
        sql: "SELECT id,planejamento_analitico name,tipo type,classificacao classification FROM planejamento_analitico WHERE tipo IN ('R','D') OR id IN (SELECT id_planejamento FROM contas) ORDER BY classificacao,id LIMIT 5001",
      });
      return {
        branches: branches.slice(0, 5000),
        accounts: accounts.slice(0, 5000),
        truncated: branches.length > 5000 || accounts.length > 5000,
      };
    }, signal);
  }
  async list(input: PendingQuery, signal?: AbortSignal) {
    const today = referenceDate(this.now()),
      { query, summary, details } = pendingSql(input, today);
    return this.db.withSnapshot(async (session) => {
      const totals = await session.select<{ total: string; balance: string }>(summary);
      const rows = await session.select<TitleRow>(details);
      const total = Number(totals[0]?.total ?? 0);
      if (!Number.isSafeInteger(total) || total < 0) throw fail("Contagem de títulos inválida.");
      return {
        items: rows.map((row) => ({
          partyId: row.partyId,
          partyName: row.partyName,
          partyActive: row.partyActive ?? null,
          contractId: row.contractId,
          contractName: row.contractName,
          contractStatus: row.contractStatus ?? null,
          accountId: row.accountId,
          accountName: row.accountName,
          branchId: row.branchId,
          document: row.document,
          status: row.status,
          id: String(row.id),
          dueDate: mapDate(row.dueDate),
          issuedDate: mapDate(row.issuedDate),
          amount: money(row.amount),
          paid: row.paid === null ? null : money(row.paid),
          balance: money(row.balance),
          daysLate: Math.max(0, Number(row.daysLate)),
        })),
        total,
        balance: money(totals[0]?.balance ?? "0"),
        page: query.page,
        limit: query.limit,
        kind: query.kind,
        scope: query.scope,
        bucket: query.bucket,
        receivableScope: query.receivableScope,
        asOf: today,
        queriedAt: this.now().toISOString(),
      };
    }, signal);
  }
}
