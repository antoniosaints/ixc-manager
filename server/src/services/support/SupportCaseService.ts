import { z } from "zod";
import { IxcReadDatabase, type IxcReadSession, type IxcReadQuery } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { mapDate, mapIdentifier } from "../../integrations/ixc/database/maps/valueMappers.js";
export const casePageQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((n) => n === 10 || n === 25)
    .default(10),
  order: z.enum(["newest", "oldest"]).default("newest"),
});
export type CaseKind = "orders" | "tickets";
interface Reader {
  withSnapshot<T>(read: (session: IxcReadSession) => Promise<T>, signal?: AbortSignal): Promise<T>;
  close?(): Promise<void>;
}
type Row = Record<string, unknown>;
const text = (v: unknown) => (v === null || v === undefined ? null : String(v).trim() || null);
const id = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);
const date = (v: unknown) => {
  const raw = text(v);
  return raw && mapDate(raw) ? raw : null;
};
const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
export function caseDetailQuery(customerId: number, kind: CaseKind, caseId: number): IxcReadQuery {
  const os = kind === "orders",
    table = os ? "su_oss_chamado" : "su_ticket";
  return {
    name: "support-case-detail",
    timeoutSeconds: 5,
    params: [caseId, customerId],
    sql: `SELECT t.id,t.id_cliente customerId,t.protocolo protocol,
 t.${os ? "id_contrato_kit" : "id_contrato"} contractId,t.id_login loginId,t.id_assunto subjectId,a.assunto subjectName,
 ${os ? "NULL" : "t.titulo"} title,t.${os ? "status" : "su_status"} status,t.status flowStatus,t.prioridade priority,
 t.${os ? "data_abertura" : "data_criacao"} openedAt,t.${os ? "ultima_atualizacao" : "data_ultima_alteracao"} updatedAt,
 ${os ? "t.data_agenda" : "NULL"} scheduledAt,${os ? "t.data_fechamento" : "NULL"} closedAt,
 LEFT(t.${os ? "mensagem" : "menssagem"},16000) message,CHAR_LENGTH(t.${os ? "mensagem" : "menssagem"})>16000 messageTruncated,
 ${os ? "LEFT(t.mensagem_resposta,16000)" : "NULL"} response,
 t.id_filial branchId,t.endereco address,s.setor sector,f.funcionario technician,d.descricao diagnosis,
 ${os ? "t.id_ticket" : "NULL"} ticketId,${os ? "t.data_hora_analise" : "NULL"} analyzedAt,
 ${os ? "t.data_hora_encaminhado" : "NULL"} forwardedAt,${os ? "t.data_hora_assumido" : "NULL"} assumedAt,
 ${os ? "t.data_hora_execucao" : "t.data_hora_execucao"} executionAt,${os ? "t.data_reabertura" : "NULL"} reopenedAt,
 ${os ? "t.motivo_reabertura" : "NULL"} reopenReason
 FROM ${table} t LEFT JOIN su_oss_assunto a ON a.id=t.id_assunto
 LEFT JOIN su_ticket_setor s ON s.id=t.${os ? "setor" : "id_ticket_setor"}
 LEFT JOIN funcionarios f ON f.id=t.${os ? "id_tecnico" : "id_responsavel_tecnico"}
 LEFT JOIN su_diagnostico d ON d.id=t.id_su_diagnostico
 WHERE t.id=? AND t.id_cliente=? LIMIT 1`,
  };
}
export function caseHistoryQueries(
  kind: CaseKind,
  caseId: number,
  section: "messages" | "movements",
  input: z.input<typeof casePageQuery>
) {
  const q = casePageQuery.parse(input),
    os = kind === "orders",
    stock = os && section === "movements";
  const table = stock ? "su_oss_chamado_historico" : os ? "su_oss_chamado_mensagem" : "su_mensagens";
  const field = stock ? "su_oss_chamado_id" : os ? "id_chamado" : "id_ticket";
  const params = [caseId],
    direction = q.order === "oldest" ? "ASC" : "DESC";
  const summary: IxcReadQuery = {
    name: `support-case-${section}-count`,
    timeoutSeconds: 5,
    sql: `SELECT COUNT(*) total FROM ${table} WHERE ${field}=?`,
    params,
  };
  const details: IxcReadQuery = {
    name: `support-case-${section}`,
    timeoutSeconds: 5,
    params: [...params, q.limit, (q.page - 1) * q.limit],
    sql: `SELECT m.id,m.${stock ? "data_movimentacao" : "data"} date,
 u.nome operator,${stock ? "NULL" : "f.funcionario"} technician,
 ${stock ? "NULL" : os ? "m.status" : "m.su_status"} status,
 ${stock ? "m.acao" : os ? "m.historico" : "m.titulo"} title,
 ${stock ? "m.tipo" : "NULL"} type,${stock ? "NULL" : os ? "COALESCE(e.descricao,oe.descricao)" : "e.descricao"} event,
 LEFT(m.${stock ? "descricao" : "mensagem"},16000) body,(CHAR_LENGTH(m.${stock ? "descricao" : "mensagem"})>16000${!os ? " OR COALESCE(CHAR_LENGTH(m.observacao),0)>16000" : ""}) truncated,
 ${stock ? "NULL" : os ? "NULL" : "LEFT(m.observacao,16000)"} observation,
 ${stock ? "NULL" : os ? "NULL" : "m.visibilidade_mensagens"} visibility,
 ${stock ? "NULL" : "m.data_inicio"} startedAt,${stock ? "NULL" : "m.data_final"} finishedAt,
 ${stock ? "NULL" : "d.descricao"} diagnosis,
 ${stock ? "m.quantidade" : "NULL"} quantity,${stock ? "m.valor_total" : "NULL"} totalValue,
 ${stock ? "m.numero_serie" : "NULL"} serial,${stock ? "m.mac" : "NULL"} mac
 FROM ${table} m LEFT JOIN usuarios u ON u.id=m.${stock ? "operador_id" : os ? "id_operador" : "operador"}
 ${
   stock
     ? ""
     : `LEFT JOIN funcionarios f ON f.id=${os ? "m.id_tecnico" : "u.funcionario"}
 LEFT JOIN su_evento_status e ON e.id=m.id_evento_status
 ${os ? "LEFT JOIN su_oss_evento oe ON oe.id=m.id_evento" : ""}
 LEFT JOIN su_diagnostico d ON d.id=m.id_su_diagnostico`
 }
 WHERE m.${field}=? ORDER BY m.${stock ? "data_movimentacao" : "data"} ${direction},m.id ${direction} LIMIT ? OFFSET ?`,
  };
  return { q, summary, details, source: stock ? "inventory" : os ? "order-interactions" : "ticket-interactions" };
}
export class SupportCaseService {
  constructor(
    private readonly db: Reader = new IxcReadDatabase(),
    private readonly now = () => new Date()
  ) {}
  async close() {
    await this.db.close?.();
  }
  private async parent(session: IxcReadSession, customerId: number, kind: CaseKind, caseId: number) {
    const rows = await session.select<Row>(caseDetailQuery(customerId, kind, caseId));
    const row = rows[0];
    if (!row || Number(row.customerId) !== customerId || Number(row.id) !== caseId)
      throw fail("Registro não encontrado para este cliente.", 404);
    return row;
  }
  async detail(customerId: number, kind: CaseKind, caseId: number, signal?: AbortSignal) {
    return this.db.withSnapshot(async (session) => {
      const r = await this.parent(session, customerId, kind, caseId);
      return {
        record: {
          id: caseId,
          customerId,
          kind,
          protocol: text(r.protocol),
          contractId: id(r.contractId),
          loginId: id(r.loginId),
          subjectId: id(r.subjectId),
          subjectName: text(r.subjectName),
          title: text(r.title),
          status: text(r.status) ?? "",
          flowStatus: text(r.flowStatus),
          priority: text(r.priority),
          openedAt: date(r.openedAt),
          updatedAt: date(r.updatedAt),
          scheduledAt: date(r.scheduledAt),
          closedAt: date(r.closedAt),
          message: text(r.message),
          messageTruncated: String(r.messageTruncated) === "1",
          response: text(r.response),
          branchId: id(r.branchId),
          address: text(r.address),
          sector: text(r.sector),
          technician: text(r.technician),
          diagnosis: text(r.diagnosis),
          ticketId: id(r.ticketId),
          reopenReason: text(r.reopenReason),
          stages: [
            { label: "Abertura", date: date(r.openedAt) },
            { label: "Análise", date: date(r.analyzedAt) },
            { label: "Encaminhamento", date: date(r.forwardedAt) },
            { label: "Assumida", date: date(r.assumedAt) },
            { label: "Agendamento", date: date(r.scheduledAt) },
            { label: "Execução", date: date(r.executionAt) },
            { label: "Encerramento", date: date(r.closedAt) },
            { label: "Reabertura", date: date(r.reopenedAt) },
          ].filter((s) => s.date),
        },
        queriedAt: this.now().toISOString(),
      };
    }, signal);
  }
  async history(
    customerId: number,
    kind: CaseKind,
    caseId: number,
    section: "messages" | "movements",
    input: z.input<typeof casePageQuery>,
    signal?: AbortSignal
  ) {
    const { q, summary, details, source } = caseHistoryQueries(kind, caseId, section, input);
    return this.db.withSnapshot(async (session) => {
      await this.parent(session, customerId, kind, caseId);
      const totals = await session.select<{ total: string }>(summary),
        rows = await session.select<Row>(details);
      const total = Number(totals[0]?.total ?? 0);
      if (!Number.isSafeInteger(total) || total < 0) throw fail("Contagem de histórico inválida.", 502);
      return {
        items: rows.map((r) => ({
          id: mapIdentifier(r.id as string | number),
          date: date(r.date),
          operator: text(r.operator),
          technician: text(r.technician),
          status: text(r.status),
          title: text(r.title),
          type: text(r.type),
          event: text(r.event),
          body: text(r.body),
          observation: text(r.observation),
          visibility: text(r.visibility),
          startedAt: date(r.startedAt),
          finishedAt: date(r.finishedAt),
          diagnosis: text(r.diagnosis),
          quantity: text(r.quantity),
          totalValue: text(r.totalValue),
          serial: text(r.serial),
          mac: text(r.mac),
          truncated: String(r.truncated) === "1",
        })),
        total,
        page: q.page,
        limit: q.limit,
        source,
        queriedAt: this.now().toISOString(),
      };
    }, signal);
  }
}
