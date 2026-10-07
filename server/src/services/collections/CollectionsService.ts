import { z } from "zod";
import { IxcReadDatabase, type IxcReadSession, type IxcReadQuery } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { decimalToUnits, mapDate, mapIdentifier } from "../../integrations/ixc/database/maps/valueMappers.js";
import { addDays, referenceDate } from "../upgrades/UpgradeService.js";
import { contactNumbers } from "../upgrades/UpgradeDetails.js";

const dateInput = z.string().refine((s) => mapDate(s) === s, "Data inválida");
export const collectionsQuery = z
  .object({
    scope: z.enum(["overdue", "open"]).default("overdue"),
    bucket: z.enum(["all", "1-30", "31-60", "61-90", "91+", "upcoming"]).default("all"),
    status: z.enum(["all", "active", "inactive"]).default("all"),
    branchId: z.coerce.number().int().positive().safe().optional(),
    accountId: z.coerce.number().int().positive().safe().optional(),
    from: dateInput.optional(),
    to: dateInput.optional(),
    search: z.string().trim().max(120).default(""),
    searchBy: z.enum(["name", "customerId", "document", "contractId", "titleId"]).default("name"),
    sort: z.enum(["oldest", "balance", "name"]).default("oldest"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce
      .number()
      .int()
      .refine((n) => [10, 25].includes(n))
      .default(10),
  })
  .superRefine((q, ctx) => {
    if ((q.from && !q.to) || (q.to && !q.from) || (q.from && q.to && q.from > q.to))
      ctx.addIssue({ code: "custom", message: "Informe um período completo em ordem crescente." });
    if (q.scope === "overdue" && q.bucket === "upcoming") ctx.addIssue({ code: "custom", message: "A vencer exige títulos em aberto." });
    if (q.search && ["customerId", "contractId", "titleId"].includes(q.searchBy) && !/^[1-9]\d*$/.test(q.search))
      ctx.addIssue({ code: "custom", message: "Informe um ID positivo." });
    if (q.search && q.searchBy === "document" && ![11, 14].includes(q.search.replace(/\D/g, "").length))
      ctx.addIssue({ code: "custom", message: "Informe um CPF ou CNPJ completo." });
  });
export type CollectionsQuery = z.input<typeof collectionsQuery>;
type ParsedQuery = z.output<typeof collectionsQuery>;
export const collectionsExport = z
  .object({
    filters: collectionsQuery,
    themeMode: z.enum(["light", "dark"]).default("light"),
    peopleCount: z.number().int().min(1).max(20),
    clientsPerPerson: z.number().int().min(1).max(20),
    names: z.array(z.string().trim().max(80)).max(20).default([]),
    includeNotes: z.boolean().default(true),
    customerIds: z.array(z.number().int().positive().safe()).min(1).max(200).optional(),
  })
  .refine((q) => q.peopleCount * q.clientsPerPerson <= 200, "Limite de 200 clientes.");
type DistributionOptions = z.input<typeof collectionsExport>;
interface Reader {
  withSnapshot<T>(read: (session: IxcReadSession) => Promise<T>, signal?: AbortSignal): Promise<T>;
  close?(): Promise<void>;
}
type Row = Record<string, unknown>;
const text = (value: unknown) => (value == null ? null : String(value).trim() || null);
const count = (value: unknown) => {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Contagem IXC inválida");
  return n;
};
const money = (value: unknown) => {
  const cents = decimalToUnits(String(value ?? "0"));
  if (cents < 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Valor financeiro inválido");
  return Number(cents) / 100;
};
const flag = (value: unknown) => (value === "S" ? true : value === "N" ? false : null);
const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
// Check the contract of each title, rather than any active contract of its customer.
// EXISTS also prevents duplicate balances and excludes missing/foreign contract links.
const baseEligibility = `t.status IN ('A','P') AND COALESCE(t.estornado,'') IN ('','N') AND COALESCE(t.titulo_renegociado,'') IN ('','N')
 AND EXISTS (SELECT 1 FROM cliente_contrato eligible_contract
 WHERE eligible_contract.id=t.id_contrato AND eligible_contract.id_cliente=t.id_cliente AND eligible_contract.status='A')`;
const query = (name: string, sql: string, params: IxcReadQuery["params"]): IxcReadQuery => ({ name, sql, params, timeoutSeconds: 5 });
const buckets = ["1-30", "31-60", "61-90", "91+", "upcoming"] as const;
const bucketCondition = (bucket: string, today: string) => {
  const ranges: Record<string, [number, number | null]> = { "1-30": [1, 30], "31-60": [31, 60], "61-90": [61, 90], "91+": [91, null] };
  if (bucket === "upcoming") return { sql: "t.data_vencimento>=?", params: [today] };
  const range = ranges[bucket];
  return range
    ? {
        sql: `t.data_vencimento<?${range[1] ? " AND t.data_vencimento>=?" : ""}`,
        params: [addDays(today, 1 - range[0]), ...(range[1] ? [addDays(today, -range[1])] : [])],
      }
    : { sql: "1=1", params: [] };
};

/** Current receivable balances of active, owned contracts; never historical positions. */
export function collectionsScope(q: ParsedQuery, today: string, includeBucket = true, customerId?: number, selectedIds?: number[]) {
  let sql = baseEligibility;
  const params: IxcReadQuery["params"] = [];
  if (q.status !== "all") {
    sql += " AND c.ativo=?";
    params.push(q.status === "active" ? "S" : "N");
  }
  if (q.branchId) {
    sql += " AND t.filial_id=?";
    params.push(q.branchId);
  }
  if (q.accountId) {
    sql += " AND t.id_conta=?";
    params.push(q.accountId);
  }
  if (q.search) {
    if (q.searchBy === "name") {
      sql += " AND c.razao LIKE ? ESCAPE '='";
      params.push(`%${q.search.replace(/[=%_]/g, "=$&")}%`);
    } else if (q.searchBy === "document") {
      sql += " AND REPLACE(REPLACE(REPLACE(REPLACE(c.cnpj_cpf,'.',''),'/',''),'-',''),' ','')=?";
      params.push(q.search.replace(/\D/g, ""));
    } else {
      sql += ` AND ${{ customerId: "t.id_cliente", contractId: "t.id_contrato", titleId: "t.id" }[q.searchBy]}=?`;
      params.push(q.search);
    }
  }
  if (customerId) {
    sql += " AND t.id_cliente=?";
    params.push(customerId);
  }
  if (selectedIds?.length) {
    sql += ` AND t.id_cliente IN (${selectedIds.map(() => "?").join(",")})`;
    params.push(...selectedIds);
  }
  const eligibility = { sql, params: [...params] };
  sql += " AND t.valor_aberto>0 AND t.data_vencimento>='1000-01-01'";
  if (q.scope === "overdue") {
    sql += " AND t.data_vencimento<?";
    params.push(today);
  }
  if (q.from && q.to) {
    sql += " AND t.data_vencimento>=? AND t.data_vencimento<?";
    params.push(q.from, addDays(q.to, 1));
  }
  if (includeBucket && q.bucket !== "all") {
    const b = bucketCondition(q.bucket, today);
    sql += ` AND ${b.sql}`;
    params.push(...b.params);
  }
  return { sql, params, eligibility };
}

export function collectionsSql(
  input: CollectionsQuery,
  today: string,
  options: { customerId?: number; selectedIds?: number[]; take?: number } = {}
) {
  const q = collectionsQuery.parse(input);
  const scope = collectionsScope(q, today, true, options.customerId, options.selectedIds);
  const all = collectionsScope(q, today, false);
  const joins = "FROM fn_areceber t JOIN cliente c ON c.id=t.id_cliente";
  const summaryColumns = ["COUNT(DISTINCT c.id) customers", "COUNT(*) titles", "COALESCE(SUM(t.valor_aberto),0) balance"];
  const summaryParams: IxcReadQuery["params"] = [];
  buckets.forEach((bucket, index) => {
    const b = bucketCondition(bucket, today);
    summaryColumns.push(
      `COUNT(DISTINCT CASE WHEN ${b.sql} THEN c.id END) customers${index}`,
      `COALESCE(SUM(CASE WHEN ${b.sql} THEN t.valor_aberto ELSE 0 END),0) balance${index}`
    );
    summaryParams.push(...b.params, ...b.params);
  });
  const aggregate = `SELECT t.id_cliente customerId,COUNT(*) titles,SUM(t.valor_aberto) balance,
 SUM(CASE WHEN t.data_vencimento<? THEN t.valor_aberto ELSE 0 END) overdueBalance,
 SUM(t.data_vencimento<?) overdueTitles,MIN(t.data_vencimento) oldestDue,MAX(DATEDIFF(?,t.data_vencimento)) daysLate
 ${joins} WHERE ${scope.sql} GROUP BY t.id_cliente`;
  const order = q.sort === "balance" ? "g.balance DESC,g.oldestDue,c.id" : q.sort === "name" ? "c.razao,c.id" : "g.oldestDue,c.id";
  return {
    q,
    summary: query("collections-summary", `SELECT ${summaryColumns.join(",")} ${joins} WHERE ${all.sql}`, [
      ...summaryParams,
      ...all.params,
    ]),
    quality: query(
      "collections-quality",
      `SELECT COUNT(*) excluded FROM fn_areceber t LEFT JOIN cliente c ON c.id=t.id_cliente
 WHERE ${all.eligibility.sql} AND (c.id IS NULL OR t.valor_aberto IS NULL OR t.valor_aberto<0 OR
 (t.valor_aberto>0 AND (t.data_vencimento IS NULL OR t.data_vencimento<'1000-01-01')))`,
      all.eligibility.params
    ),
    count: query("collections-customer-count", `SELECT COUNT(DISTINCT c.id) total ${joins} WHERE ${scope.sql}`, scope.params),
    customers: query(
      "collections-customers",
      `SELECT g.*,c.razao name,c.ativo active,c.cnpj_cpf document,c.fone,c.telefone_celular,c.telefone_comercial,c.whatsapp,
 city.nome city,c.bairro neighborhood,c.email FROM (${aggregate}) g JOIN cliente c ON c.id=g.customerId LEFT JOIN cidade city ON city.id=c.cidade
 ORDER BY ${order} LIMIT ? OFFSET ?`,
      [today, today, today, ...scope.params, options.take ?? q.limit, options.take ? 0 : (q.page - 1) * q.limit]
    ),
    titles: query(
      "collections-titles",
      `SELECT t.id,t.id_cliente customerId,t.id_contrato contractId,cc.contrato contractName,cc.status contractStatus,cc.status_internet internetStatus,
 t.documento document,t.data_vencimento dueDate,t.data_emissao issuedDate,t.valor amount,t.valor_recebido paid,t.valor_aberto balance,t.status,
 t.id_conta accountId,a.planejamento_analitico accountName,t.filial_id branchId,COALESCE(NULLIF(f.fantasia,''),f.razao) branchName,
 t.aguardando_confirmacao_pagamento awaitingConfirmation,t.em_processamento processing,t.em_cobranca inCollection,DATEDIFF(?,t.data_vencimento) daysLate
 ${joins} LEFT JOIN cliente_contrato cc ON cc.id=t.id_contrato AND cc.id_cliente=t.id_cliente
 LEFT JOIN planejamento_analitico a ON a.id=t.id_conta LEFT JOIN filial f ON f.id=t.filial_id
 WHERE ${scope.sql} ORDER BY t.data_vencimento,t.id LIMIT ? OFFSET ?`,
      [today, ...scope.params, q.limit, (q.page - 1) * q.limit]
    ),
    titleCount: query(
      "collections-title-count",
      `SELECT COUNT(*) total,COALESCE(SUM(t.valor_aberto),0) balance ${joins} WHERE ${scope.sql}`,
      scope.params
    ),
  };
}

function customerDto(row: Row) {
  return {
    id: count(row.customerId),
    name: text(row.name) ?? "Cliente sem nome",
    active: flag(row.active),
    document: text(row.document),
    contacts: contactNumbers({}, row),
    city: text(row.city),
    neighborhood: text(row.neighborhood),
    email: text(row.email),
    titles: count(row.titles),
    balance: money(row.balance),
    overdueBalance: money(row.overdueBalance),
    overdueTitles: count(row.overdueTitles),
    oldestDue: mapDate(text(row.oldestDue)),
    daysLate: Math.max(0, Number(row.daysLate ?? 0)),
  };
}

export class CollectionsService {
  constructor(
    private readonly db: Reader = new IxcReadDatabase(),
    private readonly now = () => new Date()
  ) {}
  async close() {
    await this.db.close?.();
  }
  async options(signal?: AbortSignal) {
    return this.db.withSnapshot(
      async (s) => ({
        branches: await s.select<{ id: number; name: string }>(
          query("collections-branches", "SELECT id,COALESCE(NULLIF(fantasia,''),razao) name FROM filial ORDER BY name,id LIMIT 5001", [])
        ),
        accounts: await s.select<{ id: number; name: string }>(
          query(
            "collections-accounts",
            `SELECT id,planejamento_analitico name FROM planejamento_analitico WHERE id IN
 (SELECT DISTINCT t.id_conta FROM fn_areceber t JOIN cliente c ON c.id=t.id_cliente
 WHERE ${baseEligibility} AND t.valor_aberto>0 AND t.data_vencimento>='1000-01-01') ORDER BY name,id LIMIT 5001`,
            []
          )
        ),
      }),
      signal
    );
  }
  async list(input: CollectionsQuery, signal?: AbortSignal) {
    const today = referenceDate(this.now()),
      sql = collectionsSql(input, today);
    return this.db.withSnapshot(async (s) => {
      const [summary] = await s.select<Row>(sql.summary);
      const [quality] = await s.select<Row>(sql.quality);
      const [total] = await s.select<Row>(sql.count);
      const rows = await s.select<Row>(sql.customers);
      return {
        items: rows.map(customerDto),
        total: count(total?.total),
        page: sql.q.page,
        limit: sql.q.limit,
        summary: {
          customers: count(summary?.customers),
          titles: count(summary?.titles),
          balance: money(summary?.balance),
          buckets: buckets.map((key, i) => ({
            key,
            customers: count(summary?.[`customers${i}`]),
            balance: money(summary?.[`balance${i}`]),
          })),
        },
        warnings: count(quality?.excluded)
          ? [
              `${count(quality?.excluded)} títulos com saldo, vencimento ou vínculo de cliente inválidos ficaram fora da fila. Confira-os no IXC.`,
            ]
          : [],
        referenceDate: today,
        queriedAt: this.now().toISOString(),
        source: "database" as const,
      };
    }, signal);
  }
  async customer(customerId: number, input: CollectionsQuery, signal?: AbortSignal) {
    if (!Number.isSafeInteger(customerId) || customerId <= 0) throw fail("Cliente inválido.", 400);
    const today = referenceDate(this.now()),
      sql = collectionsSql(input, today, { customerId, take: 1 });
    return this.db.withSnapshot(async (s) => {
      const [customer] = await s.select<Row>(sql.customers);
      if (!customer || Number(customer.customerId) !== customerId)
        throw fail("Cliente sem pendências para os filtros aplicados. Atualize a lista.", 404);
      const [totals] = await s.select<Row>(sql.titleCount);
      const rows = await s.select<Row>(sql.titles);
      if (rows.some((r) => Number(r.customerId) !== customerId)) throw fail("Não foi possível validar os títulos deste cliente.", 502);
      return {
        customer: customerDto(customer),
        items: rows.map((r) => ({
          id: mapIdentifier(String(r.id)),
          customerId,
          contractId: r.contractId ? count(r.contractId) : null,
          contractName: text(r.contractName),
          contractStatus: text(r.contractStatus),
          internetStatus: text(r.internetStatus),
          document: text(r.document),
          dueDate: mapDate(text(r.dueDate)),
          issuedDate: mapDate(text(r.issuedDate)),
          amount: money(r.amount),
          paid: r.paid == null ? null : money(r.paid),
          balance: money(r.balance),
          status: text(r.status),
          accountId: r.accountId ? count(r.accountId) : null,
          accountName: text(r.accountName),
          branchId: r.branchId ? count(r.branchId) : null,
          branchName: text(r.branchName),
          daysLate: Math.max(0, Number(r.daysLate ?? 0)),
          awaitingConfirmation: flag(r.awaitingConfirmation),
          processing: flag(r.processing),
          inCollection: flag(r.inCollection),
        })),
        total: count(totals?.total),
        balance: money(totals?.balance),
        page: sql.q.page,
        limit: sql.q.limit,
        referenceDate: today,
        queriedAt: this.now().toISOString(),
      };
    }, signal);
  }
  async distribution(input: DistributionOptions, signal?: AbortSignal) {
    const options = collectionsExport.parse(input),
      today = referenceDate(this.now()),
      take = options.peopleCount * options.clientsPerPerson;
    const selectedIds = options.customerIds ? [...new Set(options.customerIds)] : undefined;
    if (selectedIds && selectedIds.length < take) throw fail("Selecione clientes suficientes para a distribuição.", 400);
    const sql = collectionsSql(options.filters, today, { selectedIds, take });
    return this.db.withSnapshot(async (s) => {
      const rows = await s.select<Row>(sql.customers);
      const items = rows.map(customerDto);
      if (items.length < take)
        throw fail(`Há ${items.length} clientes elegíveis para os filtros e a seleção. Reduza as quantidades ou atualize a lista.`, 400);
      if (new Set(items.map((i) => i.id)).size !== items.length || (selectedIds && items.some((i) => !selectedIds.includes(i.id))))
        throw fail("Distribuição de clientes inválida.", 502);
      return {
        groups: Array.from({ length: options.peopleCount }, (_, i) => ({
          name: options.names[i]?.trim() || `Responsável ${i + 1}`,
          items: items.slice(i * options.clientsPerPerson, (i + 1) * options.clientsPerPerson),
        })),
        query: sql.q,
        includeNotes: options.includeNotes,
        selected: Boolean(selectedIds),
        referenceDate: today,
        queriedAt: this.now().toISOString(),
      };
    }, signal);
  }
}
