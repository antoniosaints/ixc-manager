import { z } from "zod";
import { IxcReadDatabase, type IxcReadQuery, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { mapDate } from "../../integrations/ixc/database/maps/valueMappers.js";

const openStatuses = ["A", "AN", "EN", "AS", "AG", "EX", "RAG", "DS"] as const;
const openSql = `t.status IN ('${openStatuses.join("','")}')`;
const optionalId = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0);
const optionalDate = z
  .string()
  .refine((s) => s === "" || mapDate(s) === s)
  .default("");
export const supportOrdersQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce
      .number()
      .refine((n) => n === 10 || n === 25)
      .default(10),
    status: z.enum(["open", "all", "F", ...openStatuses]).default("open"),
    priority: z.enum(["all", "B", "N", "A", "C"]).default("all"),
    subjectId: optionalId,
    technicianId: optionalId,
    branchId: optionalId,
    searchBy: z.enum(["id", "protocol", "customer", "customerId", "contractId", "login"]).default("customer"),
    search: z.string().trim().max(120).default(""),
    dateBy: z.enum(["opened", "scheduled", "closed"]).default("opened"),
    from: optionalDate,
    to: optionalDate,
    order: z.enum(["newest", "oldest", "scheduled"]).default("newest"),
    overdue: z.enum(["all", "yes"]).default("all"),
  })
  .superRefine((q, ctx) => {
    if (q.from && q.to && q.from > q.to) ctx.addIssue({ code: "custom", message: "Período inválido", path: ["to"] });
    if (
      q.search &&
      ["id", "customerId", "contractId"].includes(q.searchBy) &&
      (!/^[1-9]\d*$/.test(q.search) || !Number.isSafeInteger(Number(q.search)))
    )
      ctx.addIssue({ code: "custom", message: "Informe um ID válido", path: ["search"] });
  });
type Reader = { withSnapshot<T>(read: (session: IxcReadSession) => Promise<T>, signal?: AbortSignal): Promise<T>; close?(): Promise<void> };
type Row = Record<string, unknown>;
const text = (v: unknown) => (v == null ? null : String(v).trim() || null);
const id = (v: unknown) => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const date = (v: unknown) => {
  const s = text(v);
  return s && mapDate(s) ? s : null;
};
function localTime(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
export function supportOrdersSql(input: z.input<typeof supportOrdersQuery>, now = new Date()) {
  const q = supportOrdersQuery.parse(input);
  const filters: string[] = [],
    params: IxcReadQuery["params"] = [];
  const join = `FROM su_oss_chamado t
    LEFT JOIN cliente c ON c.id=t.id_cliente
    LEFT JOIN cliente_contrato cc ON cc.id=t.id_contrato_kit AND cc.id_cliente=t.id_cliente
    LEFT JOIN radusuarios l ON l.id=t.id_login AND l.id_cliente=t.id_cliente
    LEFT JOIN su_oss_assunto a ON a.id=t.id_assunto
    LEFT JOIN funcionarios f ON f.id=t.id_tecnico
    LEFT JOIN filial b ON b.id=t.id_filial`;
  const lateSql = `${openSql} AND t.data_agenda>'0000-00-00 00:00:00' AND t.data_agenda<?`;
  const currentTime = localTime(now);
  if (q.status === "open") filters.push(openSql);
  else if (q.status !== "all") {
    filters.push("t.status=?");
    params.push(q.status);
  }
  if (q.priority !== "all") {
    filters.push("t.prioridade=?");
    params.push(q.priority);
  }
  for (const [value, column] of [
    [q.subjectId, "t.id_assunto"],
    [q.technicianId, "t.id_tecnico"],
    [q.branchId, "t.id_filial"],
  ] as const)
    if (value) {
      filters.push(`${column}=?`);
      params.push(value);
    }
  if (q.overdue === "yes") {
    filters.push(`(${lateSql})`);
    params.push(currentTime);
  }
  const dateColumn = { opened: "t.data_abertura", scheduled: "t.data_agenda", closed: "t.data_fechamento" }[q.dateBy];
  if (q.from) {
    filters.push(`${dateColumn}>=?`);
    params.push(`${q.from} 00:00:00`);
  }
  if (q.to) {
    filters.push(`${dateColumn}<=?`);
    params.push(`${q.to} 23:59:59`);
  }
  if (q.search) {
    const exactColumn = { id: "t.id", customerId: "t.id_cliente", contractId: "t.id_contrato_kit" }[
      q.searchBy as "id" | "customerId" | "contractId"
    ];
    if (exactColumn) {
      filters.push(`${exactColumn}=?`);
      params.push(Number(q.search));
    } else {
      filters.push(
        `${{ protocol: "t.protocolo", customer: "c.razao", login: "l.login" }[q.searchBy as "protocol" | "customer" | "login"]} LIKE ? ESCAPE '!'`
      );
      params.push(`%${q.search.replace(/[!%_]/g, (s) => `!${s}`)}%`);
    }
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const order =
    q.order === "scheduled"
      ? "CASE WHEN t.data_agenda IS NULL OR t.data_agenda<='0000-00-00 00:00:00' THEN 1 ELSE 0 END,t.data_agenda ASC,t.id ASC"
      : `t.data_abertura ${q.order === "oldest" ? "ASC" : "DESC"},t.id ${q.order === "oldest" ? "ASC" : "DESC"}`;
  const summary: IxcReadQuery = {
    name: "support-orders-summary",
    timeoutSeconds: 8,
    params: [currentTime, ...params],
    sql: `SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN ${openSql} THEN 1 ELSE 0 END),0) open,
    COALESCE(SUM(CASE WHEN (${lateSql}) THEN 1 ELSE 0 END),0) overdue,
    COALESCE(SUM(CASE WHEN ${openSql} AND t.prioridade IN ('A','C') THEN 1 ELSE 0 END),0) urgent ${join} ${where}`,
  };
  const list: IxcReadQuery = {
    name: "support-orders-list",
    timeoutSeconds: 8,
    params: [currentTime, ...params, q.limit, (q.page - 1) * q.limit],
    sql: `SELECT t.id,c.id customerId,c.razao customerName,c.ativo customerActive,t.protocolo protocol,
    cc.id contractId,cc.contrato contractName,l.id loginId,l.login login,
    t.id_assunto subjectId,a.assunto subjectName,t.status status,t.prioridade priority,
    t.data_abertura openedAt,t.data_agenda scheduledAt,t.data_fechamento closedAt,
    f.id technicianId,f.funcionario technician,b.id branchId,COALESCE(NULLIF(b.fantasia,''),b.razao) branch,
    CASE WHEN (${lateSql}) THEN 1 ELSE 0 END overdue ${join} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
  };
  return { q, summary, list };
}
export class SupportOrdersService {
  constructor(
    private readonly db: Reader = new IxcReadDatabase(),
    private readonly now = () => new Date()
  ) {}
  async close() {
    await this.db.close?.();
  }
  async list(input: z.input<typeof supportOrdersQuery>, signal?: AbortSignal) {
    const now = this.now(),
      { q, summary, list } = supportOrdersSql(input, now);
    return this.db.withSnapshot(async (session) => {
      const totals = (await session.select<Row>(summary))[0] ?? {};
      const counts = Object.fromEntries(
        ["total", "open", "overdue", "urgent"].map((key) => {
          const n = Number(totals[key] ?? 0);
          if (!Number.isSafeInteger(n) || n < 0) throw new Error("Contagem de OS inválida.");
          return [key, n];
        })
      );
      const rows = await session.select<Row>(list);
      return {
        items: rows.map((r) => ({
          id: id(r.id)!,
          customerId: id(r.customerId),
          customerName: text(r.customerName),
          customerActive: r.customerActive === "S" ? true : r.customerActive === "N" ? false : null,
          protocol: text(r.protocol),
          contractId: id(r.contractId),
          contractName: text(r.contractName),
          loginId: id(r.loginId),
          login: text(r.login),
          subjectId: id(r.subjectId),
          subjectName: text(r.subjectName),
          status: text(r.status) ?? "",
          priority: text(r.priority),
          openedAt: date(r.openedAt),
          scheduledAt: date(r.scheduledAt),
          closedAt: date(r.closedAt),
          technicianId: id(r.technicianId),
          technician: text(r.technician),
          branchId: id(r.branchId),
          branch: text(r.branch),
          overdue: Number(r.overdue) === 1,
        })),
        total: counts.total!,
        summary: counts,
        page: q.page,
        limit: q.limit,
        queriedAt: now.toISOString(),
      };
    }, signal);
  }
  async filters(signal?: AbortSignal) {
    return this.db.withSnapshot(async (session) => {
      const lookup = async (name: string, sql: string) =>
        (await session.select<Row>({ name, sql, params: [], timeoutSeconds: 8 })).map((r) => ({
          id: id(r.id)!,
          name: text(r.name) ?? `#${r.id}`,
        }));
      return {
        subjects: await lookup("support-orders-subjects", "SELECT id,assunto name FROM su_oss_assunto ORDER BY assunto,id"),
        technicians: await lookup(
          "support-orders-technicians",
          "SELECT f.id,f.funcionario name FROM funcionarios f WHERE EXISTS (SELECT 1 FROM su_oss_chamado t WHERE t.id_tecnico=f.id) ORDER BY f.funcionario,f.id"
        ),
        branches: await lookup(
          "support-orders-branches",
          "SELECT id,COALESCE(NULLIF(fantasia,''),razao) name FROM filial ORDER BY name,id"
        ),
      };
    }, signal);
  }
}
