import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./database.js";
import type { RiskContext, RiskResult } from "../types/retention.js";

export interface CustomerRow extends RowDataPacket {
  customer_id: number;
  name: string;
  city: string | null;
  neighborhood: string | null;
  plan_name: string | null;
  branch_id: number | null;
  contract_id: number;
  score: number;
  risk_level: string;
  financial_score: number;
  support_score: number;
  network_score: number;
  contract_score: number;
  satisfaction_score: number;
  calculated_at: string;
  workflow_status: "OPEN" | "RESOLVED";
  attention_critical: boolean;
}
const dateDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19).replace("T", " ");

export class RetentionRepository {
  async listCustomers(filters: {
    riskLevel?: string;
    city?: string;
    minScore?: number;
    maxScore?: number;
    search?: string;
    blocked?: boolean;
    overdue?: boolean;
    openSupport?: boolean;
    attentionOnly?: boolean;
    workflowStatus: "OPEN" | "RESOLVED" | "ALL";
    page: number;
    limit: number;
  }): Promise<{ items: CustomerRow[]; total: number }> {
    const clauses = [
      "c.active = 'S'",
      "ct.status <> 'I'",
      "rs.id = (SELECT id FROM retention_risk_scores current_rs WHERE current_rs.contract_id = ct.id ORDER BY calculated_at DESC, id DESC LIMIT 1)",
    ];
    const params: unknown[] = [];
    if (filters.riskLevel) {
      clauses.push("rs.risk_level = ?");
      params.push(filters.riskLevel);
    }
    if (filters.city) {
      clauses.push("c.city = ?");
      params.push(filters.city);
    }
    if (filters.minScore !== undefined) {
      clauses.push("rs.score >= ?");
      params.push(filters.minScore);
    }
    if (filters.maxScore !== undefined) {
      clauses.push("rs.score <= ?");
      params.push(filters.maxScore);
    }
    if (filters.search) {
      clauses.push("(c.name LIKE ? OR CAST(c.id AS CHAR) LIKE ?)");
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.blocked !== undefined) {
      clauses.push(filters.blocked ? "ct.internet_status IN ('CA','CM')" : "COALESCE(ct.internet_status,'') NOT IN ('CA','CM')");
    }
    const joins = [
      "FROM retention_customers c",
      "LEFT JOIN retention_cities city ON city.id=c.city",
      "JOIN retention_contracts ct ON ct.customer_id=c.id",
      "JOIN retention_risk_scores rs ON rs.contract_id=ct.id",
      "LEFT JOIN retention_customer_workflow workflow ON workflow.customer_id=c.id",
      "LEFT JOIN retention_contract_attention attention ON attention.contract_id=ct.id",
    ];
    if (filters.overdue) {
      joins.push("JOIN (SELECT DISTINCT contract_id FROM retention_financial_events WHERE status IN ('A','P') AND due_at<CURDATE()) overdue_contract ON overdue_contract.contract_id=ct.id");
    }
    if (filters.openSupport) {
      joins.push("JOIN (SELECT customer_id FROM retention_tickets WHERE ticket_status IN ('N','EP','P') UNION SELECT customer_id FROM retention_service_orders WHERE status IN ('A','EN','AG')) open_support ON open_support.customer_id=c.id");
    }
    if (filters.attentionOnly) {
      clauses.push("attention.contract_id IS NOT NULL");
    }
    if (filters.workflowStatus !== "ALL") {
      clauses.push(filters.workflowStatus === "RESOLVED" ? "workflow.status='RESOLVED'" : "COALESCE(workflow.status,'OPEN')='OPEN'");
    }
    const from = `${joins.join(" ")} WHERE ${clauses.join(" AND ")}`;
    const [count] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) total ${from}`, params);
    const [rows] = await db.query<CustomerRow[]>(
      `SELECT c.id customer_id, c.name, COALESCE(city.label,c.city) city, c.neighborhood, ct.plan_name, ct.branch_id, ct.id contract_id, rs.score, rs.risk_level, rs.financial_score, rs.support_score, rs.network_score, rs.contract_score, rs.satisfaction_score, rs.calculated_at, COALESCE(workflow.status,'OPEN') workflow_status, (attention.contract_id IS NOT NULL) attention_critical ${from} ORDER BY attention.contract_id IS NOT NULL DESC, rs.score DESC, rs.calculated_at DESC LIMIT ? OFFSET ?`,
      [...params, filters.limit, (filters.page - 1) * filters.limit]
    );
    return { items: rows, total: Number(count[0]?.total ?? 0) };
  }

  async getSummary() {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT c.id) activeCustomers, SUM(rs.risk_level = 'LOW') lowRisk, SUM(rs.risk_level = 'ATTENTION') attention, SUM(rs.risk_level = 'MEDIUM') medium, SUM(rs.risk_level = 'HIGH') highRisk, COUNT(DISTINCT CASE WHEN rs.risk_level = 'CRITICAL' OR attention.contract_id IS NOT NULL THEN c.id END) critical, SUM(ct.internet_status IN ('CA','CM')) blocked FROM retention_customers c JOIN retention_contracts ct ON ct.customer_id=c.id AND ct.status <> 'I' JOIN retention_risk_scores rs ON rs.id=(SELECT id FROM retention_risk_scores x WHERE x.contract_id=ct.id ORDER BY calculated_at DESC,id DESC LIMIT 1) LEFT JOIN retention_contract_attention attention ON attention.contract_id=ct.id WHERE c.active='S'`
    );
    const [cancellations] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) total FROM retention_cancellations WHERE cancellation_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')"
    );
    return { ...rows[0], cancellationsThisMonth: Number(cancellations[0]?.total ?? 0) };
  }

  async buildRiskContext(customerId: number, contractId: number): Promise<RiskContext | null> {
    const [customer] = await db.query<RowDataPacket[]>(
      "SELECT c.id customer_id, c.satisfaction, ct.id contract_id, DATEDIFF(ct.expires_at, CURDATE()) fidelity_days, ct.last_auto_block_at, ct.last_manual_block_at, ct.last_trust_unlock_at, ct.suspended, ct.suspension_started_at FROM retention_customers c JOIN retention_contracts ct ON ct.customer_id=c.id WHERE c.id=? AND ct.id=? AND c.active='S' AND ct.status <> 'I'",
      [customerId, contractId]
    );
    const row = customer[0];
    if (!row) return null;
    const [financial] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) overdue, COALESCE(MAX(DATEDIFF(CURDATE(), due_at)),0) max_days FROM retention_financial_events WHERE contract_id=? AND status IN ('A','P') AND due_at < CURDATE()",
      [contractId]
    );
    const [support] = await db.query<RowDataPacket[]>(
      `SELECT SUM(created_at_ixc >= ?) tickets30, COUNT(DISTINCT CASE WHEN created_at_ixc >= ? THEN subject_id END) subjects30, SUM(priority IN ('C','CRITICO','CRÍTICO')) critical, SUM(ticket_status IN ('N','P')) pending, SUM(sla_status NOT IN ('','OK','S')) sla FROM retention_tickets WHERE customer_id=?`,
      [dateDaysAgo(30), dateDaysAgo(30), customerId]
    );
    const [recurring] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) total FROM (SELECT subject_id FROM retention_tickets WHERE customer_id=? AND created_at_ixc >= ? GROUP BY subject_id HAVING COUNT(*) >= 2) x",
      [customerId, dateDaysAgo(30)]
    );
    const [orders] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) total FROM retention_service_orders WHERE customer_id=? AND opened_at >= ?",
      [customerId, dateDaysAgo(30)]
    );
    const [network] = await db.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(date >= CURDATE() - INTERVAL 7 DAY),0) days7, COALESCE(SUM(CASE WHEN date >= CURDATE() - INTERVAL 7 DAY THEN disconnects END),0) disconnects7, COALESCE(SUM(CASE WHEN date >= CURDATE() - INTERVAL 7 DAY THEN short_sessions END),0) shorts7, COALESCE(SUM(CASE WHEN date < CURDATE() - INTERVAL 7 DAY AND date >= CURDATE() - INTERVAL 35 DAY THEN disconnects END) / 4,0) baseline, MAX(main_terminate_cause) cause FROM retention_connections_daily WHERE customer_id=?`,
      [customerId]
    );
    const n = network[0] ?? ({} as RowDataPacket);
    const [loginNetwork] = await db.query<RowDataPacket[]>(
      `SELECT
        MAX(online IN ('S','SS')) online_now,
        MIN(CASE
          WHEN online IN ('S','SS') THEN 0
          WHEN last_connection_ended_at >= '2000-01-01' THEN LEAST(GREATEST(DATEDIFF(CURDATE(), last_connection_ended_at), 0), 7)
          WHEN last_connection_started_at >= '2000-01-01' THEN LEAST(GREATEST(DATEDIFF(CURDATE(), last_connection_started_at), 0), 7)
          ELSE NULL
        END) offline_days
      FROM retention_logins WHERE customer_id=? AND active='S'`,
      [customerId]
    );
    const liveNetwork = loginNetwork[0] ?? ({} as RowDataPacket);
    const hasRadiusHistory = Number(n.days7 ?? 0) > 0;
    const [usage] = await db.query<RowDataPacket[]>(
      `SELECT MAX(CASE WHEN date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN download_consumption ELSE 0 END) current_use, AVG(CASE WHEN date < DATE_FORMAT(CURDATE(), '%Y-%m-01') AND date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 3 MONTH) THEN download_consumption END) baseline_use FROM retention_usage_monthly WHERE customer_id=?`,
      [customerId]
    );
    const currentUse = Number(usage[0]?.current_use ?? 0),
      baselineUse = Number(usage[0]?.baseline_use ?? 0);
    return {
      customerId,
      contractId,
      satisfaction: row.satisfaction,
      financial: {
        overdueInvoices: Number(financial[0]?.overdue ?? 0),
        maxOverdueDays: Number(financial[0]?.max_days ?? 0),
        recentBlock: this.recent(row.last_auto_block_at) || this.recent(row.last_manual_block_at),
        recentTrustUnlock: this.recent(row.last_trust_unlock_at),
      },
      support: {
        tickets30d: Number(support[0]?.tickets30 ?? 0),
        recurringSubjects: Number(recurring[0]?.total ?? 0),
        criticalTickets: Number(support[0]?.critical ?? 0),
        pendingTickets: Number(support[0]?.pending ?? 0),
        slaProblems: Number(support[0]?.sla ?? 0),
        serviceOrders30d: Number(orders[0]?.total ?? 0),
      },
      network: {
        // Use detailed counters only when a bounded session history exists.
        // Otherwise, do not treat missing history as seven offline days.
        disconnects7d: hasRadiusHistory ? Number(n.disconnects7 ?? 0) : 0,
        baselineDisconnects7d: hasRadiusHistory ? Number(n.baseline ?? 0) : 0,
        shortSessions7d: hasRadiusHistory ? Number(n.shorts7 ?? 0) : 0,
        offlineDays: hasRadiusHistory
          ? Number(n.days7 ?? 0) === 0 ? 7 : 0
          : Number(liveNetwork.online_now ?? 0) > 0 ? 0 : Number(liveNetwork.offline_days ?? 0),
        consumptionDropPercent: baselineUse > 0 ? Math.max(0, (1 - currentUse / baselineUse) * 100) : undefined,
        recurringTerminateCause: hasRadiusHistory && Boolean(n.cause),
      },
      contract: {
        fidelityDaysRemaining: row.fidelity_days === null ? undefined : Number(row.fidelity_days),
        recentBlock: this.recent(row.last_auto_block_at) || this.recent(row.last_manual_block_at),
        recentSuspension: row.suspended === "S" || this.recent(row.suspension_started_at),
      },
    };
  }

  async saveScore(customerId: number, contractId: number, result: RiskResult): Promise<void> {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [insert] = await connection.execute<ResultSetHeader>(
        "INSERT INTO retention_risk_scores (customer_id,contract_id,score,financial_score,support_score,network_score,contract_score,satisfaction_score,risk_level,calculated_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())",
        [
          customerId,
          contractId,
          result.score,
          result.factors.financial,
          result.factors.support,
          result.factors.network,
          result.factors.contract,
          result.factors.satisfaction,
          result.level,
        ]
      );
      for (const reason of result.reasons)
        await connection.execute(
          "INSERT INTO retention_risk_factors (risk_score_id,category,code,description,points,metadata_json) VALUES (?,?,?,?,?,?)",
          [insert.insertId, reason.category, reason.code, reason.description, reason.points, JSON.stringify(reason.metadata ?? {})]
        );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  async activeContracts(customerId?: number): Promise<Array<{ customerId: number; contractId: number }>> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT c.id customerId, ct.id contractId FROM retention_customers c JOIN retention_contracts ct ON ct.customer_id=c.id WHERE c.active='S' AND ct.status <> 'I' ${customerId ? "AND c.id=?" : ""}`,
      customerId ? [customerId] : []
    );
    return rows.map((r) => ({ customerId: Number(r.customerId), contractId: Number(r.contractId) }));
  }
  private recent(value: unknown): boolean {
    return !!value && new Date(String(value)).getTime() > Date.now() - 30 * 86_400_000;
  }
}
