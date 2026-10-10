import { IxcReadDatabase } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { db } from "../../repositories/database.js";
import { RetentionRiskEngine } from "./RetentionRiskEngine.js";
import { directRiskQueries, riskWindow } from "./DirectRiskQueries.js";
import type { RiskContext, RiskResult } from "../../types/retention.js";
import { dateOnly } from "../upgrades/UpgradeService.js";
import { churnSettings } from "../settings/ChurnSettingsService.js";
import type { RiskThresholds } from "../../config/risk.js";
import { randomUUID } from "node:crypto";

type Row = Record<string, any>;
type Filters = Parameters<import("../../repositories/RetentionRepository.js").RetentionRepository["listCustomers"]>[0] & {
  snapshotId?: string;
};
type Scored = { row: Row; context: RiskContext; risk: RiskResult; concentrators: string[] };
type Snapshot = { id: string; items: Scored[]; queriedAt: string; sources: { key: string; label: string; status: "ok"; count: number }[] };
export const churnNavigationLifetimeMs = 30_000;
const number = (value: unknown) => Number(value ?? 0);
const text = (value: unknown) => String(value ?? "").trim();
const day = (value: unknown) => {
  const parsed = dateOnly(text(value));
  return parsed ? Date.parse(`${parsed}T00:00:00Z`) : NaN;
};
const fail = (message: string, statusCode = 502) => Object.assign(new Error(message), { statusCode });
const labels: Record<string, string> = {
  contracts: "Cadastro, satisfação e contratos",
  financial: "Títulos a receber",
  tickets: "Atendimentos",
  recurring: "Assuntos recorrentes",
  orders: "Ordens de serviço",
  logins: "Logins e conexão",
  sessions: "Sessões Radius · últimos 35 dias",
  usage: "Consumo · mês atual e 3 anteriores",
};

/** Fresh reads by default; explicit list navigation can reuse one bounded in-memory snapshot. */
export class DirectRetentionService {
  private pending = new Map<string, { promise: Promise<Snapshot>; controller: AbortController; subscribers: number }>();
  private navigationSnapshot?: { key: string; snapshot: Snapshot };
  constructor(
    private readonly reader: Pick<IxcReadDatabase, "withSnapshot" | "close"> = new IxcReadDatabase(),
    private readonly now = () => new Date(),
    private readonly engine = new RetentionRiskEngine()
  ) {}
  async close() {
    this.navigationSnapshot = undefined;
    for (const entry of this.pending.values()) entry.controller.abort();
    await this.reader.close();
  }
  private async snapshot(customerId?: number, signal?: AbortSignal, reuseId?: string): Promise<Snapshot> {
    if (signal?.aborted) throw fail("Consulta interrompida.", 499);
    const thresholds = await churnSettings.read();
    if (signal?.aborted) throw fail("Consulta interrompida.", 499);
    const key = `${customerId ?? "all"}:${JSON.stringify(thresholds)}`;
    const navigation = this.navigationSnapshot;
    const age = navigation ? this.now().getTime() - Date.parse(navigation.snapshot.queriedAt) : 0;
    if (navigation && (age < 0 || age >= churnNavigationLifetimeMs)) this.navigationSnapshot = undefined;
    if (customerId === undefined && reuseId && this.navigationSnapshot?.key === key && this.navigationSnapshot.snapshot.id === reuseId)
      return this.navigationSnapshot.snapshot;
    let entry = this.pending.get(key);
    if (!entry) {
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 45_000);
      deadline.unref();
      entry = {
        promise: this.readSnapshot(thresholds, customerId, controller.signal).then((snapshot) => {
          if (customerId === undefined && !controller.signal.aborted) this.navigationSnapshot = { key, snapshot };
          return snapshot;
        }),
        controller,
        subscribers: 0,
      };
      this.pending.set(key, entry);
      const current = entry;
      void current.promise
        .finally(() => {
          clearTimeout(deadline);
          if (this.pending.get(key) === current) this.pending.delete(key);
        })
        .catch(() => {});
    }
    entry.subscribers++;
    let aborted: (() => void) | undefined;
    try {
      return await Promise.race([
        entry.promise,
        new Promise<never>((_resolve, reject) => {
          aborted = () => reject(fail("Consulta interrompida.", 499));
          signal?.addEventListener("abort", aborted, { once: true });
          if (signal?.aborted) aborted();
        }),
      ]);
    } finally {
      if (aborted) signal?.removeEventListener("abort", aborted);
      entry.subscribers--;
      if (!entry.subscribers && signal?.aborted) {
        entry.controller.abort();
        if (this.pending.get(key) === entry) this.pending.delete(key);
      }
    }
  }
  private async readSnapshot(thresholds: RiskThresholds, customerId?: number, signal?: AbortSignal): Promise<Snapshot> {
    const started = this.now(),
      w = riskWindow(started),
      queries = directRiskQueries(started, customerId);
    try {
      return await this.reader.withSnapshot(async (session) => {
        const data: Record<string, Row[]> = {},
          sources: Snapshot["sources"] = [];
        // One connection and read view; aggregate each source once, not once per contract.
        for (const [key, query] of Object.entries(queries)) {
          if (key !== "contracts" && !data.contracts?.length) break;
          data[key] = await session.select<Row>(query);
          const measure = {
            financial: "overdue",
            tickets: "records",
            recurring: "total",
            orders: "total",
            logins: "total",
            sessions: "records",
            usage: "records",
          }[key];
          sources.push({
            key,
            label: labels[key]!,
            status: "ok",
            count: measure ? data[key]!.reduce((sum, row) => sum + number(row[measure]), 0) : data[key]!.length,
          });
          if (key === "tickets")
            sources.push({
              key: "recurring",
              label: labels.recurring!,
              status: "ok",
              count: data[key]!.reduce((sum, row) => sum + number(row.recurring), 0),
            });
        }
        const maps = Object.fromEntries(
          Object.entries(data)
            .filter(([key]) => key !== "contracts")
            .map(([key, rows]) => [
              key,
              new Map(rows.map((row) => [number(row[key === "financial" ? "contract_id" : "customer_id"]), row])),
            ])
        );
        const recent = (value: unknown) => {
          const raw = text(value);
          return Number.isFinite(day(raw)) && raw > w.recentStart && raw <= w.timestamp;
        };
        const items = (data.contracts ?? []).map((row) => {
          const customerId = number(row.customer_id),
            contractId = number(row.contract_id);
          const f = maps.financial?.get(contractId) ?? {},
            t = maps.tickets?.get(customerId) ?? {},
            n = maps.sessions?.get(customerId) ?? {},
            l = maps.logins?.get(customerId) ?? {},
            u = maps.usage?.get(customerId) ?? {};
          const satisfaction = Number(row.satisfaction);
          const recentBlock = recent(row.last_auto_block_at) || recent(row.last_manual_block_at);
          const context: RiskContext = {
            customerId,
            contractId,
            satisfaction: [1, 2, 3, 4, 5].includes(satisfaction) ? satisfaction : null,
            financial: {
              overdueInvoices: number(f.overdue),
              maxOverdueDays: number(f.max_days),
              recentBlock,
              recentTrustUnlock: recent(row.last_trust_unlock_at),
            },
            support: {
              tickets30d: number(t.tickets30),
              recurringSubjects: number(t.recurring),
              criticalTickets: number(t.critical),
              pendingTickets: number(t.pending),
              slaProblems: number(t.sla),
              serviceOrders30d: number(maps.orders?.get(customerId)?.total),
            },
            network: {
              disconnects7d: number(n.disconnects7),
              baselineDisconnects7d: number(n.baseline),
              shortSessions7d: number(n.shorts7),
              offlineDays: number(n.disconnects7) || number(l.online_now) ? 0 : number(l.offline_days),
              consumptionDropPercent:
                number(u.baseline_use) > 0 ? Math.max(0, (1 - number(u.current_use) / number(u.baseline_use)) * 100) : undefined,
              recurringTerminateCause: number(n.disconnects7) > 0 && number(n.cause) > 0,
            },
            contract: {
              fidelityDaysRemaining: Number.isFinite(day(row.expires_at)) ? (day(row.expires_at) - day(w.today)) / 86400000 : undefined,
              recentBlock,
              recentSuspension: row.suspended === "S" || recent(row.suspension_started_at),
            },
          };
          return {
            row: {
              ...row,
              satisfaction: context.satisfaction,
              open_orders: number(maps.orders?.get(customerId)?.open_orders),
              open_tickets: number(t.open_tickets),
            },
            context,
            risk: this.engine.calculate(context, thresholds),
            concentrators: text(l.concentrators).split("\n").filter(Boolean),
          };
        });
        return { id: randomUUID(), items, queriedAt: started.toISOString(), sources };
      }, signal);
    } catch (error) {
      if (signal?.aborted) throw fail("Consulta interrompida.", 499);
      if ((error as any).statusCode === 499) throw error;
      throw fail(
        "Não foi possível consultar todas as fontes do churn no IXC. Tente novamente; nenhum score parcial foi apresentado como baixo risco."
      );
    }
  }
  private async localState(customerId?: number) {
    const [workflow] = await db.query<any[]>(
      `SELECT customer_id,status,resolved_at resolvedAt,resolved_by_user_id resolvedByUserId,updated_at updatedAt FROM retention_customer_workflow${customerId ? " WHERE customer_id=?" : ""}`,
      customerId ? [customerId] : []
    );
    const [attention] = await db.query<any[]>(
      `SELECT contract_id,customer_id,marked_at attentionMarkedAt FROM retention_contract_attention${customerId ? " WHERE customer_id=?" : ""}`,
      customerId ? [customerId] : []
    );
    return {
      workflow: new Map(workflow.map((row) => [number(row.customer_id), row])),
      attention: new Map(attention.map((row) => [number(row.contract_id), row])),
    };
  }
  async listCustomers(filters: Filters, signal?: AbortSignal) {
    const [snapshot, state] = await Promise.all([this.snapshot(undefined, signal, filters.snapshotId), this.localState()]);
    const search = text(filters.search).toLocaleLowerCase("pt-BR");
    const eligible = snapshot.items
      .filter(({ row, risk, context }) => {
        const workflow = state.workflow.get(context.customerId)?.status ?? "OPEN";
        return (
          (!filters.riskLevel || risk.level === filters.riskLevel) &&
          (!filters.city || text(row.city_id) === filters.city) &&
          (filters.minScore === undefined || risk.score >= filters.minScore) &&
          (filters.maxScore === undefined || risk.score <= filters.maxScore) &&
          (!search || text(row.name).toLocaleLowerCase("pt-BR").includes(search) || String(context.customerId).includes(search)) &&
          (filters.blocked === undefined || ["CA", "CM"].includes(row.internet_status) === filters.blocked) &&
          (!filters.overdue || context.financial.overdueInvoices > 0) &&
          (!filters.openSupport || number(row.open_tickets) > 0 || number(row.open_orders) > 0) &&
          (!filters.attentionOnly || state.attention.has(context.contractId)) &&
          (filters.workflowStatus === "ALL" || workflow === (filters.workflowStatus ?? "OPEN"))
        );
      })
      .sort(
        (a, b) =>
          Number(state.attention.has(b.context.contractId)) - Number(state.attention.has(a.context.contractId)) ||
          b.risk.score - a.risk.score ||
          a.context.contractId - b.context.contractId
      );
    return {
      items: eligible
        .slice((filters.page - 1) * filters.limit, filters.page * filters.limit)
        .map((item) => this.listRow(item, snapshot.queriedAt, state)),
      total: eligible.length,
      source: "database",
      queriedAt: snapshot.queriedAt,
      snapshotId: snapshot.id,
      reuseUntil: new Date(Date.parse(snapshot.queriedAt) + churnNavigationLifetimeMs).toISOString(),
    };
  }
  private listRow(item: Scored, queriedAt: string, state: Awaited<ReturnType<DirectRetentionService["localState"]>>) {
    const { row, risk, context } = item;
    return {
      customer_id: context.customerId,
      contract_id: context.contractId,
      name: row.name,
      city: row.city,
      neighborhood: row.neighborhood,
      plan_name: row.plan_name,
      branch_id: row.branch_id,
      score: risk.score,
      risk_level: risk.level,
      financial_score: risk.factors.financial,
      support_score: risk.factors.support,
      network_score: risk.factors.network,
      contract_score: risk.factors.contract,
      satisfaction_score: risk.factors.satisfaction,
      satisfaction: row.satisfaction,
      calculated_at: queriedAt,
      workflow_status: state.workflow.get(context.customerId)?.status ?? "OPEN",
      attention_critical: state.attention.has(context.contractId),
    };
  }
  async getSummary(signal?: AbortSignal) {
    const [snapshot, state] = await Promise.all([this.snapshot(undefined, signal), this.localState()]);
    const counts = { lowRisk: 0, attention: 0, medium: 0, highRisk: 0, critical: 0 };
    const keys = { LOW: "lowRisk", ATTENTION: "attention", MEDIUM: "medium", HIGH: "highRisk" } as const;
    const critical = new Set<number>(),
      rated = new Set<number>(),
      customers = new Set<number>();
    for (const item of snapshot.items) {
      customers.add(item.context.customerId);
      if (item.row.satisfaction !== null) rated.add(item.context.customerId);
      if (item.risk.level !== "CRITICAL") counts[keys[item.risk.level]]++;
      if (item.risk.level === "CRITICAL" || state.attention.has(item.context.contractId)) critical.add(item.context.customerId);
    }
    counts.critical = critical.size;
    return {
      ...counts,
      riskCalculatedAt: snapshot.queriedAt,
      source: "database",
      satisfactionCoverage: { rated: rated.size, total: customers.size, missing: customers.size - rated.size },
    };
  }
  async getSnapshot(customerId: number, contractId?: number, signal?: AbortSignal) {
    const snapshot = await this.snapshot(customerId, signal);
    const item = snapshot.items
      .filter((item) => !contractId || item.context.contractId === contractId)
      .sort((a, b) => b.risk.score - a.risk.score || a.context.contractId - b.context.contractId)[0];
    if (!item) return null;
    const state = await this.localState(customerId);
    const customer = {
      ...this.listRow(item, snapshot.queriedAt, state),
      id: customerId,
      phone: item.row.phone,
      mobile_phone: item.row.mobile_phone,
      commercial_phone: item.row.commercial_phone,
      whatsapp: item.row.whatsapp,
      activated_at: item.row.activated_at,
      contract_status: item.row.contract_status,
      internet_status: item.row.internet_status,
    };
    return {
      customer,
      reasons: item.risk.reasons.map((reason) => ({ ...reason, metadata: reason.metadata ?? {} })),
      source: "database",
      warnings:
        customer.satisfaction === null
          ? ["Satisfação não informada no cadastro do IXC. A categoria não recebeu pontos; isso não indica cliente satisfeito."]
          : [],
    };
  }
  async analyze(customerId: number, signal?: AbortSignal) {
    const snapshot = await this.snapshot(customerId, signal);
    const item = snapshot.items[0];
    if (!item) {
      const [customer] = await this.reader.withSnapshot(
        (s) =>
          s.select<Row>({
            name: "churn-direct-customer-eligibility",
            sql: "SELECT id,razao,ativo FROM cliente WHERE id=?",
            params: [customerId],
            timeoutSeconds: 5,
          }),
        signal
      );
      if (!customer) throw fail("Cliente não encontrado no IXC.", 404);
      return {
        customer: { id: customerId, name: customer.razao },
        queriedAt: snapshot.queriedAt,
        partial: false,
        sources: snapshot.sources,
        warnings: [],
        contracts: [],
        message:
          customer.ativo !== "S"
            ? "O Churn analisa apenas clientes ativos. Este cadastro não está ativo no IXC."
            : "Nenhum contrato elegível para análise. Contratos inativos não entram no Churn.",
      };
    }
    const warnings =
      item.row.satisfaction === null ? ["Satisfação não informada no cadastro do IXC. Essa categoria não recebeu pontos."] : [];
    return {
      customer: { id: customerId, name: item.row.name, satisfaction: item.row.satisfaction },
      queriedAt: snapshot.queriedAt,
      source: "database",
      partial: false,
      sources: snapshot.sources,
      warnings,
      contracts: snapshot.items
        .map(({ context, row, risk }) => ({
          id: context.contractId,
          name: row.plan_name || "Plano não informado",
          ...risk,
          reasons: [...risk.reasons].sort((a, b) => b.points - a.points),
        }))
        .sort((a, b) => b.score - a.score),
      message: null,
    };
  }
  async customerDetails(customerId: number, contractId?: number, signal?: AbortSignal) {
    const snapshot = await this.getSnapshot(customerId, contractId, signal);
    if (!snapshot) return null;
    const w = riskWindow(this.now());
    const data = await this.reader.withSnapshot(async (s) => {
      const select = (name: string, sql: string, params: (string | number)[]) =>
        s.select<Row>({ name: `churn-direct-detail-${name}`, sql, params, timeoutSeconds: 10 });
      const financial = await select(
        "financial",
        `SELECT t.id,t.data_vencimento due_at,t.status,t.valor amount,t.valor_aberto open_amount,t.pagamento_data paid_at
        FROM fn_areceber t WHERE t.id_cliente=? AND t.id_contrato=? ORDER BY t.data_vencimento DESC,t.id DESC LIMIT 20`,
        [customerId, snapshot.customer.contract_id]
      );
      const tickets = await select(
        "tickets",
        `SELECT id,titulo title,id_assunto subject_id,prioridade priority,su_status ticket_status,status_sla sla_status,data_criacao created_at_ixc FROM su_ticket WHERE id_cliente=? ORDER BY data_criacao DESC,id DESC LIMIT 20`,
        [customerId]
      );
      const serviceOrders = await select(
        "orders",
        `SELECT id,id_assunto subject_id,prioridade priority,status,status_sla sla_status,data_abertura opened_at,data_fechamento closed_at FROM su_oss_chamado WHERE id_cliente=? ORDER BY data_abertura DESC,id DESC LIMIT 20`,
        [customerId]
      );
      const connection = await select(
        "sessions",
        `SELECT DATE(a.acctstarttime) date,COUNT(*) disconnects,SUM(COALESCE(a.acctsessiontime,0)<300) short_sessions,AVG(a.acctsessiontime) avg_session_seconds,MAX(a.acctterminatecause) main_terminate_cause
        FROM radacct a WHERE a.username IN (SELECT r.login FROM radusuarios r WHERE r.id_cliente=? AND r.ativo='S')
        AND a.acctstarttime>=? AND a.acctstarttime<=? GROUP BY DATE(a.acctstarttime) ORDER BY date`,
        [customerId, w.recentStart, w.timestamp]
      );
      const usage = await select(
        "usage",
        `SELECT u.date,SUM(u.download) download_consumption,SUM(u.upload) upload_consumption FROM (
        SELECT t.data date,t.consumo download,t.consumo_upload upload,ROW_NUMBER() OVER (PARTITION BY t.id_login,t.data ORDER BY t.id DESC) latest
        FROM radusuarios_consumo_m t JOIN radusuarios r ON r.id=t.id_login WHERE r.id_cliente=? AND r.ativo='S' AND t.data>=? AND t.data<=?
        ) u WHERE u.latest=1 GROUP BY u.date ORDER BY u.date DESC LIMIT 6`,
        [customerId, `${w.usageStart.slice(0, 7)}-01`, w.today]
      );
      return { financial, tickets, serviceOrders, connection, usage: usage.reverse() };
    }, signal);
    const [notes] = await db.query<any[]>(
      "SELECT id,content,created_at FROM retention_customer_notes WHERE customer_id=? ORDER BY created_at DESC,id DESC",
      [customerId]
    );
    const state = await this.localState(customerId),
      attention = state.attention.get(snapshot.customer.contract_id);
    return {
      ...snapshot,
      ...data,
      notes,
      workflow: {
        ...(state.workflow.get(customerId) ?? { status: "OPEN", resolvedAt: null }),
        attentionCritical: !!attention,
        attentionMarkedAt: attention?.attentionMarkedAt ?? null,
      },
    };
  }
  async timeline(customerId: number, signal?: AbortSignal) {
    const w = riskWindow(this.now()),
      from = new Date(day(w.today) - 90 * 86400000).toISOString().slice(0, 10);
    const events = await this.reader.withSnapshot(
      (s) =>
        s.select<Row>({
          name: "churn-direct-timeline",
          timeoutSeconds: 10,
          params: [
            customerId,
            from,
            w.timestamp,
            customerId,
            from,
            w.timestamp,
            customerId,
            from,
            w.today,
            customerId,
            from,
            w.timestamp,
            customerId,
            from,
            w.today,
            customerId,
            from,
            w.today,
          ],
          sql: `SELECT * FROM (
        SELECT data_criacao at,'TICKET' type,CONCAT('Atendimento ',CHAR(35),id,': ',COALESCE(titulo,'')) description,id recordId,NULL status FROM su_ticket WHERE id_cliente=? AND data_criacao>=? AND data_criacao<=?
        UNION ALL SELECT data_abertura,'SERVICE_ORDER',CONCAT('OS ',CHAR(35),id),id,NULL FROM su_oss_chamado WHERE id_cliente=? AND data_abertura>=? AND data_abertura<=?
        UNION ALL SELECT data_vencimento,'FINANCIAL',CONCAT('Título ',CHAR(35),id),id,status FROM fn_areceber WHERE id_cliente=? AND data_vencimento>=? AND data_vencimento<=?
        UNION ALL SELECT DATE(a.acctstarttime),'CONNECTION',CONCAT(COUNT(*),' sessões Radius'),NULL,NULL FROM radacct a WHERE a.username IN (SELECT login FROM radusuarios WHERE id_cliente=? AND ativo='S') AND a.acctstarttime>=? AND a.acctstarttime<=? GROUP BY DATE(a.acctstarttime)
        UNION ALL SELECT data_ativacao,'CONTRACT',CONCAT('Ativação do contrato ',CHAR(35),id),id,NULL FROM cliente_contrato WHERE id_cliente=? AND data_ativacao>=? AND data_ativacao<=?
        UNION ALL SELECT data_cancelamento,'CONTRACT',CONCAT('Cancelamento do contrato ',CHAR(35),id),id,NULL FROM cliente_contrato WHERE id_cliente=? AND data_cancelamento>=? AND data_cancelamento<=?
      ) events ORDER BY at DESC LIMIT 300`,
        }),
      signal
    );
    return {
      events: events.map((event) => ({
        at: String(event.at),
        type: String(event.type),
        description: String(event.description),
        recordId: Number.isSafeInteger(Number(event.recordId)) && Number(event.recordId) > 0 ? Number(event.recordId) : null,
        status: event.status == null ? null : String(event.status).trim().toUpperCase(),
      })),
    };
  }
  async analytics(dimension: string, signal?: AbortSignal) {
    if (dimension === "cancellation-reasons") {
      const rows = await this.reader.withSnapshot(
        (s) =>
          s.select<Row>({
            name: "churn-direct-cancellation-reasons",
            sql: `SELECT ct.motivo_cancelamento reason_id,r.motivo reason_name,COUNT(*) total FROM cliente_contrato ct LEFT JOIN fn_areceber_mot_cancelamento r ON r.id=ct.motivo_cancelamento WHERE ct.status='I' GROUP BY ct.motivo_cancelamento,r.motivo ORDER BY total DESC`,
            params: [],
            timeoutSeconds: 5,
          }),
        signal
      );
      // Build labels here: IXC text columns and connection literals can use different collations.
      return {
        items: rows.map((row) => ({
          label: `${text(row.reason_name) || "Motivo não identificado"} (ID ${number(row.reason_id)})`,
          total: number(row.total),
        })),
      };
    }
    const snapshot = await this.snapshot(undefined, signal),
      groups = new Map<string, { label: string; customers: Set<number>; contracts: Set<number> }>();
    for (const item of snapshot.items) {
      const labels =
        dimension === "cities"
          ? [text(item.row.city) || "Não informado"]
          : dimension === "plans"
            ? [text(item.row.plan_name) || "Não informado"]
            : item.concentrators.length
              ? item.concentrators
              : ["Não informado"];
      for (const label of labels) {
        let group = groups.get(label);
        if (!group) {
          group = { label, customers: new Set(), contracts: new Set() };
          groups.set(label, group);
        }
        group.customers.add(item.context.customerId);
        if (["HIGH", "CRITICAL"].includes(item.risk.level)) group.contracts.add(item.context.contractId);
      }
    }
    return {
      items: [...groups.values()]
        .map((g) => ({ label: g.label, customers: g.customers.size, highRisk: g.contracts.size }))
        .sort((a, b) => b.highRisk - a.highRisk),
    };
  }
}
// One completed snapshot is retained only for explicit short-lived list navigation.
export const directRetention = new DirectRetentionService();
