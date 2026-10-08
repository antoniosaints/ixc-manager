import { z } from "zod";
import { IxcReadDatabase, type IxcReadQuery, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { dateOnly } from "../upgrades/UpgradeService.js";
import { connectedIpSql, connectionIp, connectionStatus } from "./LoginConnection.js";

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((n) => n === 10 || n === 25)
    .default(10),
});
export const boxesQuery = pageQuery
  .extend({
    status: z.enum(["active", "inactive", "all"]).default("active"),
    searchBy: z.enum(["name", "id", "address", "login", "ip", "customer"]).default("name"),
    search: z.string().trim().max(120).default(""),
  })
  .superRefine((q, ctx) => {
    if (q.search && q.searchBy === "id" && (!/^[1-9]\d*$/.test(q.search) || !Number.isSafeInteger(Number(q.search))))
      ctx.addIssue({ code: "custom", message: "Informe um ID positivo." });
  });
export const boxLoginsQuery = pageQuery.extend({
  registration: z.enum(["active", "inactive", "all"]).default("all"),
  connection: z.enum(["online", "offline", "unknown", "all"]).default("all"),
  search: z.string().trim().max(120).default(""),
});
type BoxQuery = z.infer<typeof boxesQuery>;
type LoginQuery = z.infer<typeof boxLoginsQuery>;
type Row = Record<string, unknown>;
const text = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const number = (v: unknown) => Number(v) || 0;
const positive = (v: unknown) => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const flag = (v: unknown) => (v === "S" || v === "A" ? true : v === "N" || v === "I" ? false : null);
const like = (v: string) => `%${v.replace(/[!%_]/g, (c) => `!${c}`)}%`;
const fail = () => Object.assign(new Error("Caixa de atendimento não encontrada no IXC."), { statusCode: 404 });
const stats = `SELECT r.id_caixa_ftth,COUNT(*) totalLogins,
 SUM(r.ativo='S') activeLogins,SUM(r.ativo='N') inactiveLogins,
 SUM(r.ativo='S' AND ${connectedIpSql}) onlineLogins,SUM(r.ativo='S' AND NOT (${connectedIpSql})) offlineLogins,
 0 unknownLogins,
 COUNT(DISTINCT CASE WHEN r.ativo='S' AND r.ftth_porta>0 AND (COALESCE(b2.capacidade,0)<=0 OR r.ftth_porta<=b2.capacidade) THEN r.ftth_porta END) occupiedPorts,
 SUM(r.ativo='S' AND r.ftth_porta>0 AND (COALESCE(b2.capacidade,0)<=0 OR r.ftth_porta<=b2.capacidade)) validPortLogins,
 SUM(r.ativo='S' AND (COALESCE(r.ftth_porta,0)<=0 OR (b2.capacidade>0 AND r.ftth_porta>b2.capacidade))) invalidPorts
 FROM radusuarios r JOIN rad_caixa_ftth b2 ON b2.id=r.id_caixa_ftth GROUP BY r.id_caixa_ftth`;
const base = `FROM rad_caixa_ftth b LEFT JOIN cidade c ON c.id=b.id_cidade
 LEFT JOIN radpop_radio t ON t.id=b.id_transmissor LEFT JOIN (${stats}) s ON s.id_caixa_ftth=b.id`;
const boxColumns = `b.id,b.descricao,b.status,b.capacidade,b.endereco,b.numero,b.bairro,b.cep,b.latitude,b.longitude,
 b.id_projeto,b.id_transmissor,b.id_interface,b.obs_caixa_ftth,b.ultima_atualizacao,c.nome city,t.descricao transmitter,
 COALESCE(s.totalLogins,0) totalLogins,COALESCE(s.activeLogins,0) activeLogins,COALESCE(s.inactiveLogins,0) inactiveLogins,
 COALESCE(s.onlineLogins,0) onlineLogins,COALESCE(s.offlineLogins,0) offlineLogins,COALESCE(s.unknownLogins,0) unknownLogins,
 COALESCE(s.occupiedPorts,0) occupiedPorts,COALESCE(s.validPortLogins,0)-COALESCE(s.occupiedPorts,0) duplicatePorts,COALESCE(s.invalidPorts,0) invalidPorts`;
function whereBoxes(q: BoxQuery) {
  let sql = "WHERE 1=1";
  const params: (string | number)[] = [];
  if (q.status !== "all") {
    sql += " AND b.status=?";
    params.push(q.status === "active" ? "A" : "I");
  }
  if (q.search) {
    if (q.searchBy === "id") {
      sql += " AND b.id=?";
      params.push(Number(q.search));
    } else if (["login", "ip", "customer"].includes(q.searchBy)) {
      sql += ` AND EXISTS (SELECT 1 FROM radusuarios found LEFT JOIN cliente fc ON fc.id=found.id_cliente
        WHERE found.id_caixa_ftth=b.id AND ${q.searchBy === "customer" ? "fc.razao" : q.searchBy === "ip" ? "found.ip" : "found.login"} LIKE ? ESCAPE '!')`;
      params.push(like(q.search));
    } else {
      const fields = q.searchBy === "address" ? ["b.endereco", "b.bairro", "c.nome"] : ["b.descricao"];
      sql += ` AND (${fields.map((f) => `${f} LIKE ? ESCAPE '!'`).join(" OR ")})`;
      params.push(...fields.map(() => like(q.search)));
    }
  }
  return { sql, params };
}
export function networkBoxesSql(q: BoxQuery): { summary: IxcReadQuery; list: IxcReadQuery } {
  const where = whereBoxes(q);
  return {
    summary: {
      name: "network-box-summary",
      sql: `SELECT COUNT(*) boxes,COALESCE(SUM(s.activeLogins),0) activeLogins,
      COALESCE(SUM(s.onlineLogins),0) onlineLogins,COALESCE(SUM(s.offlineLogins),0) offlineLogins,
      COALESCE(SUM(s.unknownLogins),0) unknownLogins ${base} ${where.sql}`,
      params: where.params,
      timeoutSeconds: 5,
    },
    list: {
      name: "network-box-list",
      sql: `SELECT ${boxColumns} ${base} ${where.sql} ORDER BY b.id DESC LIMIT ? OFFSET ?`,
      params: [...where.params, q.limit, (q.page - 1) * q.limit],
      timeoutSeconds: 5,
    },
  };
}
export function networkLoginsSql(boxId: number, q: LoginQuery, loginId?: number) {
  let where = "WHERE r.id_caixa_ftth=?";
  const params: (string | number)[] = [boxId];
  if (loginId !== undefined) {
    where += " AND r.id=?";
    params.push(loginId);
  }
  if (q.registration !== "all") {
    where += " AND r.ativo=?";
    params.push(q.registration === "active" ? "S" : "N");
  }
  if (q.connection === "unknown") where += " AND 1=0";
  else if (q.connection !== "all") {
    where += ` AND ${q.connection === "online" ? connectedIpSql : `NOT (${connectedIpSql})`}`;
  }
  if (q.search) {
    where += " AND (r.login LIKE ? ESCAPE '!' OR c.razao LIKE ? ESCAPE '!' OR r.ip LIKE ? ESCAPE '!')";
    params.push(...Array(3).fill(like(q.search)));
  }
  const from = `FROM radusuarios r LEFT JOIN cliente c ON c.id=r.id_cliente
   LEFT JOIN cliente_contrato ct ON ct.id=r.id_contrato AND ct.id_cliente=r.id_cliente ${where}`;
  return {
    count: { name: "network-login-count", sql: `SELECT COUNT(*) total ${from}`, params, timeoutSeconds: 5 } as IxcReadQuery,
    list: {
      name: "network-login-list",
      sql: `SELECT r.id,r.login,r.ativo,r.online,r.ftth_porta,r.id_cliente,r.id_contrato,r.ip,r.mac,r.onu_mac,
      r.ultima_conexao_inicial,r.ultima_conexao_final,r.motivo_desconexao,r.sinal_ultimo_atendimento,r.concentrador,
      c.razao customerName,c.ativo customerActive,ct.id validContractId,ct.contrato contractName,ct.status contractStatus
      ${from} ORDER BY CASE WHEN r.ftth_porta>0 THEN 0 ELSE 1 END,r.ftth_porta,r.id LIMIT ? OFFSET ?`,
      params: [...params, q.limit, (q.page - 1) * q.limit],
      timeoutSeconds: 5,
    } as IxcReadQuery,
  };
}
export function networkBoxDto(row: Row) {
  const capacity = positive(row.capacidade),
    occupiedPorts = number(row.occupiedPorts);
  const lat = Number(text(row.latitude)?.replace(",", ".")),
    lon = Number(text(row.longitude)?.replace(",", "."));
  return {
    id: number(row.id),
    name: text(row.descricao) ?? `Caixa #${row.id}`,
    active: flag(row.status),
    capacity,
    address: [text(row.endereco), text(row.numero)].filter(Boolean).join(", ") || null,
    neighborhood: text(row.bairro),
    city: text(row.city),
    zip: text(row.cep),
    coordinates:
      text(row.latitude) &&
      text(row.longitude) &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180 &&
      (lat !== 0 || lon !== 0)
        ? { latitude: lat, longitude: lon }
        : null,
    projectId: positive(row.id_projeto),
    transmitterId: positive(row.id_transmissor),
    transmitter: text(row.transmitter),
    interfaceId: positive(row.id_interface),
    notes: text(row.obs_caixa_ftth),
    updatedAt: text(row.ultima_atualizacao),
    totalLogins: number(row.totalLogins),
    activeLogins: number(row.activeLogins),
    inactiveLogins: number(row.inactiveLogins),
    onlineLogins: number(row.onlineLogins),
    offlineLogins: number(row.offlineLogins),
    unknownLogins: number(row.unknownLogins),
    occupiedPorts,
    freePorts: capacity === null ? null : Math.max(0, capacity - occupiedPorts),
    duplicatePorts: number(row.duplicatePorts),
    invalidPorts: number(row.invalidPorts),
  };
}
export function networkLoginDto(row: Row) {
  return {
    id: number(row.id),
    login: text(row.login),
    active: flag(row.ativo),
    status: connectionStatus(row.ip),
    port: positive(row.ftth_porta),
    customerId: positive(row.id_cliente),
    customerName: text(row.customerName),
    customerActive: flag(row.customerActive),
    contractId: positive(row.validContractId),
    contractName: text(row.contractName),
    contractStatus: text(row.contractStatus),
    ip: connectionIp(row.ip),
    mac: text(row.mac),
    onuMac: text(row.onu_mac),
    lastConnectedAt: dateOnly(row.ultima_conexao_inicial) ? text(row.ultima_conexao_inicial) : null,
    lastDisconnectedAt: dateOnly(row.ultima_conexao_final) ? text(row.ultima_conexao_final) : null,
    disconnectReason: text(row.motivo_desconexao),
    lastServiceSignal: text(row.sinal_ultimo_atendimento),
    concentrator: text(row.concentrador),
  };
}
export class NetworkService {
  constructor(
    private readonly db: Pick<IxcReadDatabase, "withSnapshot"> = new IxcReadDatabase(),
    private readonly now = () => new Date()
  ) {}
  async boxes(q: BoxQuery, signal?: AbortSignal) {
    return this.db.withSnapshot(async (session) => {
      const queries = networkBoxesSql(q),
        [summary] = await session.select<Row>(queries.summary),
        rows = await session.select<Row>(queries.list);
      return {
        items: rows.map(networkBoxDto),
        total: number(summary?.boxes),
        summary: {
          boxes: number(summary?.boxes),
          activeLogins: number(summary?.activeLogins),
          onlineLogins: number(summary?.onlineLogins),
          offlineLogins: number(summary?.offlineLogins),
          unknownLogins: number(summary?.unknownLogins),
        },
        page: q.page,
        limit: q.limit,
        queriedAt: this.now().toISOString(),
        source: "ixc-database" as const,
      };
    }, signal);
  }
  private async box(session: IxcReadSession, boxId: number) {
    const [row] = await session.select<Row>({
      name: "network-box-detail",
      sql: `SELECT ${boxColumns} ${base} WHERE b.id=?`,
      params: [boxId],
      timeoutSeconds: 5,
    });
    if (!row) throw fail();
    return networkBoxDto(row);
  }
  async detail(boxId: number, signal?: AbortSignal) {
    return this.db.withSnapshot(async (session) => ({ box: await this.box(session, boxId), queriedAt: this.now().toISOString() }), signal);
  }
  async logins(boxId: number, q: LoginQuery, signal?: AbortSignal) {
    return this.db.withSnapshot(async (session) => {
      const box = await this.box(session, boxId),
        queries = networkLoginsSql(boxId, q),
        [count] = await session.select<Row>(queries.count),
        rows = await session.select<Row>(queries.list);
      return {
        box,
        items: rows.map(networkLoginDto),
        total: number(count?.total),
        page: q.page,
        limit: q.limit,
        queriedAt: this.now().toISOString(),
        source: "ixc-database" as const,
      };
    }, signal);
  }
  async login(boxId: number, loginId: number, signal?: AbortSignal) {
    return this.db.withSnapshot(async (session) => {
      const query = networkLoginsSql(boxId, boxLoginsQuery.parse({}), loginId).list;
      const [row] = await session.select<Row>(query);
      if (!row) throw Object.assign(new Error("Login não encontrado nesta caixa no IXC."), { statusCode: 404 });
      return { login: networkLoginDto(row), queriedAt: this.now().toISOString(), source: "ixc-database" as const };
    }, signal);
  }
}
