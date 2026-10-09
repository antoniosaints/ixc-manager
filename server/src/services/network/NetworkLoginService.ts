import { z } from "zod";
import { IxcReadDatabase, type IxcReadQuery } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { networkLoginDto } from "./NetworkService.js";
import { connectedLoginSql } from "./LoginConnection.js";
import { compatibleOnuSql } from "../upgrades/LoginOnuLink.js";

const id = z.coerce.number().int().positive().safe();
export const loginListQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce
      .number()
      .refine((n) => n === 10 || n === 25)
      .default(10),
    registration: z.enum(["active", "inactive", "all"]).default("active"),
    connection: z.enum(["online", "offline", "all"]).default("all"),
    access: z.enum(["all", "released"]).default("all"),
    searchBy: z.enum(["login", "box", "document", "customer", "contractId", "loginId", "city", "branch"]).default("login"),
    search: z.string().trim().max(120).default(""),
    cityId: id.optional(),
    branchId: id.optional(),
  })
  .superRefine((q, ctx) => {
    if (!q.search) return;
    if (["contractId", "loginId"].includes(q.searchBy) && !id.safeParse(q.search).success)
      ctx.addIssue({ code: "custom", message: "Informe um ID positivo." });
    if (q.searchBy === "document" && (!/^[\d.\-/\s]+$/.test(q.search) || ![11, 14].includes(q.search.replace(/\D/g, "").length)))
      ctx.addIssue({ code: "custom", message: "Informe o CPF ou CNPJ completo." });
  });
type Query = z.infer<typeof loginListQuery>;
type Row = Record<string, unknown>;
const positive = (value: unknown) => (Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null);
const text = (value: unknown) => String(value ?? "").trim() || null;
const like = (value: string) => `%${value.replace(/[!%_]/g, (c) => `!${c}`)}%`;
const onuFrom = `FROM radpop_radio_cliente_fibra f LEFT JOIN cliente_contrato onc ON onc.id=f.id_contrato
 WHERE f.id_login=r.id AND f.id_caixa_ftth>0
 AND (COALESCE(f.id_contrato,0)=0 OR onc.id_cliente=r.id_cliente) AND ${compatibleOnuSql}`;
const boxId = `COALESCE(NULLIF(r.id_caixa_ftth,0),(SELECT CASE WHEN COUNT(DISTINCT f.id_caixa_ftth)=1 THEN MAX(f.id_caixa_ftth) END ${onuFrom}))`;
const port = `CASE WHEN r.id_caixa_ftth>0 THEN NULLIF(r.ftth_porta,0) ELSE
 (SELECT CASE WHEN COUNT(DISTINCT f.id_caixa_ftth)=1 AND COUNT(DISTINCT f.porta_ftth)=1 AND MIN(COALESCE(f.porta_ftth,0))>0
 THEN MAX(f.porta_ftth) END ${onuFrom}) END`;
const cityId = `CASE WHEN r.endereco_padrao_cliente IN ('S','C') THEN NULLIF(c.cidade,0)
 ELSE COALESCE(NULLIF(r.cidade,0),NULLIF(ct.cidade,0),NULLIF(c.cidade,0)) END`;
const branchId = `COALESCE(NULLIF(r.id_filial,0),NULLIF(ct.id_filial,0),NULLIF(c.filial_id,0))`;
const base = `FROM radusuarios r LEFT JOIN cliente c ON c.id=r.id_cliente
 LEFT JOIN cliente_contrato ct ON ct.id=r.id_contrato AND ct.id_cliente=r.id_cliente
 LEFT JOIN cidade city ON city.id=${cityId} LEFT JOIN filial branch ON branch.id=${branchId}`;
const boxJoin = ` LEFT JOIN rad_caixa_ftth b ON b.id=${boxId}`;
function where(q: Query) {
  let sql = "WHERE 1=1";
  const params: (string | number)[] = [];
  if (q.registration !== "all") {
    sql += " AND r.ativo=?";
    params.push(q.registration === "active" ? "S" : "N");
  }
  if (q.connection !== "all") sql += ` AND ${q.connection === "online" ? connectedLoginSql : `NOT (${connectedLoginSql})`}`;
  if (q.access === "released") sql += " AND c.ativo='S' AND ct.status='A' AND ct.status_internet='A'";
  if (q.cityId) {
    sql += " AND city.id=?";
    params.push(q.cityId);
  }
  if (q.branchId) {
    sql += " AND branch.id=?";
    params.push(q.branchId);
  }
  if (q.search) {
    if (q.searchBy === "loginId" || q.searchBy === "contractId") {
      sql += ` AND ${q.searchBy === "loginId" ? "r.id" : "ct.id"}=?`;
      params.push(Number(q.search));
    } else if (q.searchBy === "document") {
      sql += " AND REPLACE(REPLACE(REPLACE(REPLACE(c.cnpj_cpf,'.',''),'-',''),'/',''),' ','')=?";
      params.push(q.search.replace(/\D/g, ""));
    } else if (q.searchBy === "box" && /^[1-9]\d*$/.test(q.search) && Number.isSafeInteger(Number(q.search))) {
      sql += ` AND ${boxId}=?`;
      params.push(Number(q.search));
    } else {
      const fields = {
        login: ["r.login"],
        box: ["b.descricao"],
        customer: ["c.razao"],
        city: ["city.nome"],
        branch: ["branch.fantasia", "branch.razao"],
      }[q.searchBy as "login" | "box" | "customer" | "city" | "branch"];
      sql += ` AND (${fields.map((f) => `${f} LIKE ? ESCAPE '!'`).join(" OR ")})`;
      params.push(...fields.map(() => like(q.search)));
    }
  }
  return { sql, params };
}
export function loginListSql(q: Query) {
  const filter = where(q);
  return {
    summary: {
      name: "network-direct-login-summary",
      sql: `SELECT COUNT(*) total,
      COALESCE(SUM(r.ativo='S'),0) activeLogins,COALESCE(SUM(r.ativo='N'),0) inactiveLogins,
      COALESCE(SUM(${connectedLoginSql}),0) onlineLogins,COALESCE(SUM(NOT (${connectedLoginSql})),0) offlineLogins
      ${base}${q.search && q.searchBy === "box" ? boxJoin : ""} ${filter.sql}`,
      params: filter.params,
      timeoutSeconds: 5,
    },
    list: {
      name: "network-direct-login-list",
      sql: `SELECT r.id,r.login,r.tipo_conexao_mapa,r.ativo,r.online,r.ip,r.mac,r.onu_mac,r.id_cliente,r.id_contrato,
      ${port} ftth_porta,r.ultima_conexao_inicial,r.ultima_conexao_final,r.motivo_desconexao,r.sinal_ultimo_atendimento,r.concentrador,
      c.razao customerName,c.ativo customerActive,c.cnpj_cpf customerDocument,
      ct.id validContractId,ct.contrato contractName,ct.status contractStatus,
      ${boxId} ftthBoxId,b.descricao ftthBoxName,CASE WHEN r.id_caixa_ftth>0 THEN 'login' ELSE 'onu' END ftthBoxSource,
      city.id cityId,city.nome city,branch.id branchId,COALESCE(NULLIF(branch.fantasia,''),branch.razao) branch
      ${base}${boxJoin} ${filter.sql} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      params: [...filter.params, q.limit, (q.page - 1) * q.limit],
      timeoutSeconds: 5,
    },
  } satisfies Record<string, IxcReadQuery>;
}
function dto(row: Row) {
  return {
    ...networkLoginDto(row),
    customerDocument: text(row.customerDocument),
    ftthBoxId: positive(row.ftthBoxId),
    ftthBoxName: text(row.ftthBoxName),
    ftthBoxSource: row.ftthBoxSource === "login" ? ("login" as const) : ("onu" as const),
    cityId: positive(row.cityId),
    city: text(row.city),
    branchId: positive(row.branchId),
    branch: text(row.branch),
  };
}
export class NetworkLoginService {
  constructor(private readonly db: Pick<IxcReadDatabase, "withSnapshot"> = new IxcReadDatabase()) {}
  async list(q: Query, signal?: AbortSignal) {
    return this.db.withSnapshot(async (session) => {
      const queries = loginListSql(q),
        [summary] = await session.select<Row>(queries.summary),
        rows = await session.select<Row>(queries.list);
      const counts = {
        total: Number(summary?.total ?? 0),
        activeLogins: Number(summary?.activeLogins ?? 0),
        inactiveLogins: Number(summary?.inactiveLogins ?? 0),
        onlineLogins: Number(summary?.onlineLogins ?? 0),
        offlineLogins: Number(summary?.offlineLogins ?? 0),
      };
      return {
        items: rows.map(dto),
        page: q.page,
        limit: q.limit,
        total: counts.total,
        summary: counts,
        queriedAt: new Date().toISOString(),
        source: "ixc-database" as const,
      };
    }, signal);
  }
  async detail(loginId: number, signal?: AbortSignal) {
    const result = await this.list(loginListQuery.parse({ registration: "all", searchBy: "loginId", search: String(loginId) }), signal);
    const login = result.items.find((row) => row.id === loginId);
    if (!login) throw Object.assign(new Error("Login não encontrado no IXC."), { statusCode: 404 });
    return { login, queriedAt: result.queriedAt };
  }
  async filters(signal?: AbortSignal) {
    return this.db.withSnapshot(
      async (session) => ({
        cities: (
          await session.select<Row>({
            name: "network-login-cities",
            sql: `SELECT DISTINCT city.id,city.nome name ${base} WHERE city.id>0 AND city.nome<>'' ORDER BY city.nome,city.id LIMIT 1000`,
            params: [],
            timeoutSeconds: 5,
          })
        ).map((row) => ({ id: Number(row.id), name: text(row.name) ?? `Cidade ${row.id}` })),
        branches: (
          await session.select<Row>({
            name: "network-login-branches",
            sql: "SELECT id,COALESCE(NULLIF(fantasia,''),razao) name FROM filial ORDER BY name,id LIMIT 1000",
            params: [],
            timeoutSeconds: 5,
          })
        ).map((row) => ({ id: Number(row.id), name: text(row.name) ?? `Filial ${row.id}` })),
      }),
      signal
    );
  }
}
