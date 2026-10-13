import { IxcReadDatabase, type IxcReadQuery, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { mapDate, decimalToUnits } from "../../integrations/ixc/database/maps/valueMappers.js";
import { referenceDate, addDays } from "../upgrades/UpgradeService.js";
import { connectedLoginSql } from "../network/LoginConnection.js";

type Row = Record<string, unknown>;
export type GraphArea = "contracts" | "logins" | "orders" | "tickets" | "financial" | "equipment";
export interface GraphAccess {
  contracts: boolean;
  logins: boolean;
  orders: boolean;
  tickets: boolean;
  equipment: boolean;
  financial: "none" | "summary" | "full";
}
interface Reader {
  withSnapshot<T>(read: (session: IxcReadSession) => Promise<T>, signal?: AbortSignal): Promise<T>;
  close?(): Promise<void>;
}
const text = (v: unknown) => String(v ?? "").trim() || null;
const id = (v: unknown) => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const count = (v: unknown) => Number(v ?? 0);
const money = (v: unknown) => {
  const cents = decimalToUnits(String(v ?? "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER))
    throw new Error("Valor excede a precisão disponível");
  return Number(cents) / 100;
};
const date = (v: unknown) => mapDate(text(v));
const timestamp = (v: unknown) => (date(v) ? text(v) : null);
const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const openOrders = "t.status IN ('A','AN','EN','AS','AG','EX','RAG','DS')";
const openTickets = "t.su_status IN ('N','P','EP')";
const eligibleFinancial = "COALESCE(t.estornado,'') IN ('','N') AND COALESCE(t.titulo_renegociado,'') IN ('','N')";
const openFinancial = "t.status IN ('A','P') AND t.valor_aberto>0";
const previewLimit = 12;
export interface GraphRecord {
  key: string;
  kind: GraphArea;
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  tone: "danger" | "warning" | "success" | "neutral";
  contractId: number | null;
  loginId: number | null;
  ticketId: number | null;
  date: string | null;
  facts: { label: string; value: string }[];
}
export interface GraphGroup {
  state: "ok" | "restricted" | "unavailable";
  total: number | null;
  metrics: Record<string, number | null>;
  records: GraphRecord[];
  detailsRestricted: boolean;
}
function record(kind: GraphArea, r: Row, today: string): GraphRecord {
  const contractId = kind === "contracts" ? id(r.id) : id(r.contractId);
  const base = {
    key: `${kind}:${r.id}`,
    kind,
    id: String(r.id),
    contractId,
    loginId: id(r.loginId),
    ticketId: id(r.ticketId),
    date: timestamp(r.date),
    subtitle: text(r.subtitle),
    status: text(r.status),
    facts: [] as GraphRecord["facts"],
  };
  if (kind === "contracts")
    return {
      ...base,
      title: text(r.name) ?? `Contrato #${r.id}`,
      tone: r.status === "A" && ["CA", "CM"].includes(String(r.internetStatus)) ? "danger" : r.status === "A" ? "success" : "neutral",
      facts: [
        { label: "Acesso", value: String(r.internetStatus ?? "—") },
        { label: "Permanência até", value: date(r.expiresAt) ?? "Não informada" },
      ],
    };
  if (kind === "logins")
    return {
      ...base,
      title: text(r.name) ?? `Login #${r.id}`,
      tone: r.active === "S" ? (count(r.connected) ? "success" : "danger") : "neutral",
      status: r.active === "S" ? (count(r.connected) ? "online" : "offline") : "inactive",
      facts: [
        { label: "IP cadastrado", value: text(r.ip) ?? "Não informado" },
        { label: "Caixa / porta", value: `${text(r.boxName) ?? "Não informada"} · ${id(r.port) ?? "—"}` },
      ],
    };
  if (kind === "financial") {
    const overdue = count(r.isOpen) && date(r.date) != null && date(r.date)! < today;
    return {
      ...base,
      title: `Título #${r.id}`,
      tone: overdue ? "danger" : count(r.isOpen) ? "warning" : r.status === "R" ? "success" : "neutral",
      facts: [
        { label: "Valor original", value: money(r.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
        { label: "Saldo aberto", value: money(r.balance).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
      ],
    };
  }
  if (kind === "equipment")
    return {
      ...base,
      title: text(r.name) ?? `Equipamento #${r.id}`,
      tone: "neutral",
      facts: [
        { label: "Número de série", value: text(r.serial) ?? "Não informado" },
        { label: "Quantidade", value: String(r.quantity ?? "—") },
      ],
    };
  return {
    ...base,
    title: text(r.name) ?? `${kind === "orders" ? "OS" : "Atendimento"} #${r.id}`,
    tone: count(r.isOpen)
      ? ["A", "C"].includes(String(r.priority))
        ? "danger"
        : "warning"
      : ["F", "S"].includes(String(r.status))
        ? "success"
        : "neutral",
    facts: [
      { label: "Protocolo", value: text(r.protocol) ?? "Não informado" },
      { label: "Prioridade", value: text(r.priority) ?? "Não informada" },
    ],
  };
}

export class CustomerGraphService {
  constructor(
    private readonly db: Reader = new IxcReadDatabase(),
    private readonly now = () => new Date()
  ) {}
  async close() {
    await this.db.close?.();
  }
  async get(customerId: number, access: GraphAccess, signal?: AbortSignal) {
    if (!id(customerId)) throw fail("Informe um ID de cliente válido.", 400);
    const today = referenceDate(this.now());
    return this.db.withSnapshot(async (session) => {
      const select = <T extends object>(name: string, sql: string, params: IxcReadQuery["params"] = [customerId]) =>
        session.select<T>({ name: `customer-graph-${name}`, sql, params, timeoutSeconds: 3 });
      const [c] = await select<Row>(
        "customer",
        `SELECT c.id,c.razao,c.ativo,city.nome city,c.bairro,c.grau_satisfacao,c.data_cadastro
        FROM cliente c LEFT JOIN cidade city ON city.id=c.cidade WHERE c.id=? LIMIT 1`
      );
      if (!c) throw fail("Cliente não encontrado no IXC.", 404);
      const groups = {} as Record<GraphArea, GraphGroup>;
      const read = async (
        area: GraphArea,
        allowed: boolean,
        summarySql: string,
        listSql: string,
        summaryParams?: IxcReadQuery["params"]
      ) => {
        if (!allowed) {
          groups[area] = { state: "restricted", total: null, metrics: {}, records: [], detailsRestricted: false };
          return;
        }
        try {
          const [summary] = await select<Row>(`${area}-summary`, summarySql, summaryParams);
          const restricted = area === "financial" && access.financial !== "full";
          const rows = restricted ? [] : await select<Row>(`${area}-records`, `${listSql} LIMIT ${previewLimit}`);
          const metrics = Object.fromEntries(
            Object.entries(summary ?? {})
              .filter(([key]) => key !== "total")
              .map(([key, value]) => [key, key.endsWith("Balance") ? money(value) : value == null ? null : count(value)])
          );
          groups[area] = {
            state: "ok",
            total: count(summary?.total),
            metrics,
            records: rows.map((r) => record(area, r, today)),
            detailsRestricted: restricted,
          };
        } catch {
          if (signal?.aborted) throw fail("Consulta interrompida.", 499);
          groups[area] = { state: "unavailable", total: null, metrics: {}, records: [], detailsRestricted: false };
        }
      };
      await read(
        "contracts",
        access.contracts,
        `SELECT COUNT(*) total,SUM(t.status='A') active,SUM(t.status='A' AND t.status_internet IN ('CA','CM')) blocked,
        SUM(t.status='A' AND t.data_expiracao>=? AND t.data_expiracao<=?) expiring FROM cliente_contrato t WHERE t.id_cliente=?`,
        `SELECT t.id,t.contrato name,t.status,t.status_internet internetStatus,t.data_ativacao date,t.data_expiracao expiresAt
        FROM cliente_contrato t WHERE t.id_cliente=? ORDER BY (t.status='A') DESC,t.id DESC`,
        [today, addDays(today, 30), customerId]
      );
      await read(
        "logins",
        access.logins,
        `SELECT COUNT(*) total,SUM(r.ativo='S') active,SUM(r.ativo='S' AND ${connectedLoginSql}) online,
        SUM(r.ativo='S' AND NOT (${connectedLoginSql})) offline FROM radusuarios r WHERE r.id_cliente=?`,
        `SELECT r.id,r.login name,r.ativo active,${connectedLoginSql} connected,r.ip,ct.id contractId,b.descricao boxName,r.ftth_porta port,r.ultima_conexao_inicial date
        FROM radusuarios r LEFT JOIN cliente_contrato ct ON ct.id=r.id_contrato AND ct.id_cliente=r.id_cliente
        LEFT JOIN rad_caixa_ftth b ON b.id=r.id_caixa_ftth WHERE r.id_cliente=? ORDER BY (r.ativo='S') DESC,${connectedLoginSql} ASC,r.id DESC`
      );
      for (const area of ["orders", "tickets"] as const) {
        const os = area === "orders",
          open = os ? openOrders : openTickets,
          from = os ? "su_oss_chamado" : "su_ticket";
        await read(
          area,
          access[area],
          `SELECT COUNT(*) total,SUM(${open}) open,SUM(${open} AND t.prioridade IN ('A','C')) urgent FROM ${from} t WHERE t.id_cliente=?`,
          `SELECT t.id,${os ? "a.assunto" : "COALESCE(NULLIF(t.titulo,''),a.assunto)"} name,t.${os ? "status" : "su_status"} status,t.prioridade priority,
          t.protocolo protocol,t.${os ? "data_abertura" : "data_criacao"} date,ct.id contractId,r.id loginId,${os ? "st.id" : "NULL"} ticketId,${open} isOpen
          FROM ${from} t LEFT JOIN su_oss_assunto a ON a.id=t.id_assunto
          LEFT JOIN cliente_contrato ct ON ct.id=t.${os ? "id_contrato_kit" : "id_contrato"} AND ct.id_cliente=t.id_cliente
          LEFT JOIN radusuarios r ON r.id=t.id_login AND r.id_cliente=t.id_cliente
          ${os ? "LEFT JOIN su_ticket st ON st.id=t.id_ticket AND st.id_cliente=t.id_cliente" : ""}
          WHERE t.id_cliente=? ORDER BY (${open}) DESC,t.${os ? "data_abertura" : "data_criacao"} DESC,t.id DESC`
        );
      }
      await read(
        "financial",
        access.financial !== "none",
        `SELECT COUNT(*) total,SUM(${openFinancial}) open,SUM(${openFinancial} AND t.data_vencimento>='1000-01-01' AND t.data_vencimento<?) overdue,
        COALESCE(SUM(CASE WHEN ${openFinancial} THEN t.valor_aberto ELSE 0 END),0) openBalance,
        COALESCE(SUM(CASE WHEN ${openFinancial} AND t.data_vencimento>='1000-01-01' AND t.data_vencimento<? THEN t.valor_aberto ELSE 0 END),0) overdueBalance
        FROM fn_areceber t WHERE t.id_cliente=? AND ${eligibleFinancial}`,
        `SELECT t.id,t.documento subtitle,t.status,t.data_vencimento date,t.valor amount,t.valor_aberto balance,ct.id contractId,${openFinancial} isOpen
        FROM fn_areceber t LEFT JOIN cliente_contrato ct ON ct.id=t.id_contrato AND ct.id_cliente=t.id_cliente
        WHERE t.id_cliente=? AND ${eligibleFinancial} ORDER BY (${openFinancial} AND t.data_vencimento>='1000-01-01') DESC,(${openFinancial}) DESC,t.data_vencimento ASC,t.id DESC`,
        [today, today, customerId]
      );
      const equipmentFrom =
        "FROM movimento_produtos t JOIN cliente_contrato ct ON ct.id=t.id_contrato LEFT JOIN radusuarios r ON r.id=t.id_login AND r.id_cliente=ct.id_cliente WHERE ct.id_cliente=? AND t.status_comodato='E'";
      await read(
        "equipment",
        access.equipment,
        `SELECT COUNT(*) total ${equipmentFrom}`,
        `SELECT t.id,t.descricao name,t.status_comodato status,t.numero_serie serial,t.quantidade quantity,t.data date,ct.id contractId,r.id loginId ${equipmentFrom} ORDER BY t.id DESC`
      );
      return {
        customer: {
          id: customerId,
          name: text(c.razao) ?? `Cliente #${customerId}`,
          active: c.ativo === "S" ? true : c.ativo === "N" ? false : null,
          city: text(c.city),
          neighborhood: text(c.bairro),
          satisfaction:
            text(c.grau_satisfacao) && count(c.grau_satisfacao) >= 1 && count(c.grau_satisfacao) <= 5 ? count(c.grau_satisfacao) : null,
          registeredAt: date(c.data_cadastro),
        },
        groups,
        previewLimit,
        queriedAt: this.now().toISOString(),
        referenceDate: today,
        partial: Object.values(groups).some((g) => g.state === "unavailable"),
      };
    }, signal);
  }
}
