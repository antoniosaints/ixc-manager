import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../repositories/database.js";
import { RetentionRepository } from "../repositories/RetentionRepository.js";
import {
  enqueueCustomerRecalculate,
  enqueueFullSync,
  getRetentionJobStatus,
  getRetentionQueueStatus,
  retentionQueue,
} from "../queues/retentionQueue.js";
import { AuthService } from "../services/AuthService.js";
import { RetentionSummaryService } from "../services/retention/RetentionSummaryService.js";

import { getCustomerRiskSnapshot } from "../services/retention/CustomerRiskSnapshot.js";
import { createCustomerRiskPdf } from "../services/retention/CustomerRiskPdf.js";

const repo = new RetentionRepository();
const auth = new AuthService();
const listQuery = z.object({
  riskLevel: z.enum(["LOW", "ATTENTION", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  city: z.string().min(1).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxScore: z.coerce.number().min(0).max(100).optional(),
  search: z.string().max(120).optional(),
  blocked: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  overdue: z
    .literal("true")
    .transform(() => true)
    .optional(),
  openSupport: z
    .literal("true")
    .transform(() => true)
    .optional(),
  attentionOnly: z
    .literal("true")
    .transform(() => true)
    .optional(),
  workflowStatus: z.enum(["OPEN", "RESOLVED", "ALL"]).default("OPEN"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export async function retentionRoutes(app: FastifyInstance) {
  const summary = new RetentionSummaryService();
  app.addHook("onClose", () => summary.close());
  app.addHook("preHandler", async (request) => {
    await auth.requireUser(request);
  });
  app.get("/summary", async (request, reply) => {
    await auth.requirePermission(request, "churn.dashboard");
    reply.header("Cache-Control", "no-store");
    return summary.getSummary();
  });
  app.get("/customers", async (request) => {
    const filter = listQuery.parse(request.query);
    if (filter.attentionOnly) await auth.requirePermission(request, "churn.attention.view");
    else if (filter.workflowStatus === "RESOLVED") await auth.requireAnyPermission(request, "churn.dashboard", "churn.resolved.view");
    else await auth.requirePermission(request, "churn.dashboard");
    return repo.listCustomers(filter);
  });
  app.get("/customers/:customerId", async (request, reply) => {
    await auth.requirePermission(request, "churn.customer.view");
    const { customerId } = z.object({ customerId: z.coerce.number().int().positive() }).parse(request.params);
    const { contractId } = z.object({ contractId: z.coerce.number().int().positive().optional() }).parse(request.query);
    const snapshot = await getCustomerRiskSnapshot(customerId, contractId);
    if (!snapshot) return reply.code(404).send({ message: "Cliente ativo não encontrado" });
    const { customer: data, reasons } = snapshot;
    const [financial] = await db.query<any[]>(
      "SELECT id,due_at,status,amount,open_amount,paid_at FROM retention_financial_events WHERE customer_id=? ORDER BY due_at DESC LIMIT 20",
      [customerId]
    );
    const [tickets] = await db.query<any[]>(
      "SELECT id,title,subject_id,priority,ticket_status,sla_status,created_at_ixc FROM retention_tickets WHERE customer_id=? ORDER BY created_at_ixc DESC LIMIT 20",
      [customerId]
    );
    const [orders] = await db.query<any[]>(
      "SELECT id,subject_id,priority,status,sla_status,opened_at,closed_at FROM retention_service_orders WHERE customer_id=? ORDER BY opened_at DESC LIMIT 20",
      [customerId]
    );
    const [connection] = await db.query<any[]>(
      "SELECT date,disconnects,short_sessions,avg_session_seconds,main_terminate_cause FROM retention_connections_daily WHERE customer_id=? AND date>=CURDATE()-INTERVAL 30 DAY ORDER BY date",
      [customerId]
    );
    const [usage] = await db.query<any[]>(
      "SELECT date,download_consumption,upload_consumption FROM retention_usage_monthly WHERE customer_id=? ORDER BY date DESC LIMIT 6",
      [customerId]
    );
    const [notes] = await db.query<any[]>(
      "SELECT id,content,created_at FROM retention_customer_notes WHERE customer_id=? ORDER BY created_at DESC,id DESC",
      [customerId]
    );
    const [workflow] = await db.query<any[]>(
      "SELECT status,resolved_at resolvedAt,resolved_by_user_id resolvedByUserId,updated_at updatedAt FROM retention_customer_workflow WHERE customer_id=?",
      [customerId]
    );
    const [attention] = await db.query<any[]>("SELECT marked_at attentionMarkedAt FROM retention_contract_attention WHERE contract_id=?", [
      data.contract_id,
    ]);
    return {
      customer: data,
      reasons,
      financial,
      tickets,
      serviceOrders: orders,
      connection,
      usage: usage.reverse(),
      notes,
      workflow: {
        ...(workflow[0] ?? { status: "OPEN", resolvedAt: null }),
        attentionCritical: Boolean(attention[0]),
        attentionMarkedAt: attention[0]?.attentionMarkedAt ?? null,
      },
    };
  });
  app.get("/customers/:customerId/pdf", { logLevel: "silent" }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await auth.requirePermission(request, "churn.customer.view", "churn.customer.export");
    try {
      const { customerId } = z.object({ customerId: z.coerce.number().int().positive() }).parse(request.params);
      const { contractId } = z.object({ contractId: z.coerce.number().int().positive().optional() }).parse(request.query);
      const snapshot = await getCustomerRiskSnapshot(customerId, contractId);
      if (!snapshot) return reply.code(404).send({ message: "Cliente ativo não encontrado" });
      const pdf = await createCustomerRiskPdf(snapshot);
      return reply
        .type("application/pdf")
        .header(
          "Content-Disposition",
          `attachment; filename="churn-cliente-${customerId}-contrato-${Number(snapshot.customer.contract_id)}.pdf"`
        )
        .send(pdf);
    } catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ message: "Cliente ou contrato inválido." });
      return reply.code(500).send({ message: "Não foi possível exportar o relatório do cliente. Tente novamente." });
    }
  });
  app.post("/customers/:customerId/notes", async (request) => {
    await auth.requirePermission(request, "churn.customer.view", "churn.notes.create");
    const { customerId } = z.object({ customerId: z.coerce.number().int().positive() }).parse(request.params);
    const { content } = z.object({ content: z.string().trim().min(1).max(2_000) }).parse(request.body);
    const [result] = await db.execute<any>("INSERT INTO retention_customer_notes (customer_id,content) VALUES (?,?)", [
      customerId,
      content,
    ]);
    return { id: result.insertId, content };
  });
  app.patch("/customers/:customerId/workflow", async (request) => {
    const user = await auth.requirePermission(request, "churn.customer.view");
    const { customerId } = z.object({ customerId: z.coerce.number().int().positive() }).parse(request.params);
    const { status } = z.object({ status: z.enum(["OPEN", "RESOLVED"]) }).parse(request.body);
    await auth.requirePermission(request, status === "RESOLVED" ? "churn.workflow.resolve" : "churn.workflow.reopen");
    if (status === "OPEN" && user.role !== "ADMIN") {
      const [workflow] = await db.query<any[]>("SELECT resolved_by_user_id FROM retention_customer_workflow WHERE customer_id=?", [
        customerId,
      ]);
      if (!workflow[0] || Number(workflow[0].resolved_by_user_id) !== user.id) {
        throw Object.assign(new Error("Somente quem resolveu a tratativa pode reabri-la"), { statusCode: 403 });
      }
    }
    await db.execute(
      "INSERT INTO retention_customer_workflow (customer_id,status,resolved_at,resolved_by_user_id) VALUES (?,?,IF(?='RESOLVED',NOW(),NULL),IF(?='RESOLVED',?,NULL)) ON DUPLICATE KEY UPDATE status=VALUES(status),resolved_at=VALUES(resolved_at),resolved_by_user_id=VALUES(resolved_by_user_id),attention_critical=IF(VALUES(status)='RESOLVED',0,attention_critical),attention_marked_at=IF(VALUES(status)='RESOLVED',NULL,attention_marked_at),attention_marked_by_user_id=IF(VALUES(status)='RESOLVED',NULL,attention_marked_by_user_id)",
      [customerId, status, status, status, user.id]
    );
    if (status === "RESOLVED") await db.execute("DELETE FROM retention_contract_attention WHERE customer_id=?", [customerId]);
    return { status };
  });
  app.patch("/customers/:customerId/attention", async (request) => {
    const user = await auth.requirePermission(request, "churn.attention.manage");
    const { customerId } = z.object({ customerId: z.coerce.number().int().positive() }).parse(request.params);
    const { contractId, critical } = z
      .object({ contractId: z.coerce.number().int().positive(), critical: z.boolean() })
      .parse(request.body);
    const [contracts] = await db.query<any[]>(
      "SELECT ct.id,COALESCE(workflow.status,'OPEN') workflow_status FROM retention_contracts ct LEFT JOIN retention_customer_workflow workflow ON workflow.customer_id=ct.customer_id WHERE ct.id=? AND ct.customer_id=? AND ct.status <> 'I'",
      [contractId, customerId]
    );
    if (!contracts[0]) throw Object.assign(new Error("Contrato ativo não encontrado para este cliente"), { statusCode: 404 });
    if (critical && contracts[0].workflow_status === "RESOLVED")
      throw Object.assign(new Error("Clientes resolvidos não podem ser marcados como críticos"), { statusCode: 409 });
    if (critical)
      await db.execute(
        "INSERT INTO retention_contract_attention (contract_id,customer_id,marked_at,marked_by_user_id) VALUES (?,?,NOW(),?) ON DUPLICATE KEY UPDATE marked_at=VALUES(marked_at),marked_by_user_id=VALUES(marked_by_user_id)",
        [contractId, customerId, user.id]
      );
    else await db.execute("DELETE FROM retention_contract_attention WHERE contract_id=?", [contractId]);
    return { critical };
  });
  app.get("/customers/:customerId/timeline", async (request) => {
    await auth.requirePermission(request, "churn.customer.view");
    const { customerId } = z.object({ customerId: z.coerce.number().int().positive() }).parse(request.params);
    const [events] = await db.query<any[]>(
      `SELECT * FROM (SELECT created_at_ixc at, 'TICKET' type, title description FROM retention_tickets WHERE customer_id=? AND created_at_ixc>=CURDATE()-INTERVAL 90 DAY UNION ALL SELECT opened_at, 'SERVICE_ORDER', CONCAT('OS #',id) FROM retention_service_orders WHERE customer_id=? AND opened_at>=CURDATE()-INTERVAL 90 DAY UNION ALL SELECT due_at, 'FINANCIAL', CONCAT('Fatura vencida: ',status) FROM retention_financial_events WHERE customer_id=? AND due_at>=CURDATE()-INTERVAL 90 DAY UNION ALL SELECT date, 'CONNECTION', CONCAT(disconnects,' desconexões Radius') FROM retention_connections_daily WHERE customer_id=? AND date>=CURDATE()-INTERVAL 90 DAY UNION ALL SELECT event_at, 'CONTRACT', description FROM retention_contract_history WHERE customer_id=? AND event_at>=CURDATE()-INTERVAL 90 DAY) timeline WHERE at IS NOT NULL ORDER BY at DESC`,
      [customerId, customerId, customerId, customerId, customerId]
    );
    return { events };
  });
  app.post("/recalculate", async (request) => {
    await auth.requirePermission(request, "churn.recalculate");
    const job = await retentionQueue.add("recalculate", {});
    return { jobId: job.id, status: "queued" };
  });
  app.post("/customers/:customerId/recalculate", async (request) => {
    await auth.requirePermission(request, "churn.recalculate");
    const { customerId } = z.object({ customerId: z.coerce.number().int().positive() }).parse(request.params);
    const result = await enqueueCustomerRecalculate(customerId);
    return { jobId: result.jobId, status: result.created ? "queued" : "already_running" };
  });
  app.post("/sync", async (request) => {
    await auth.requirePermission(request, "churn.sync");
    const result = await enqueueFullSync();
    return { status: result.created ? "queued" : "already_running", jobId: result.jobId };
  });
  app.get("/sync/status", async (request) => {
    await auth.requirePermission(request, "churn.processes.view");
    return getRetentionQueueStatus();
  });
  app.get("/jobs/:jobId", async (request, reply) => {
    await auth.requirePermission(request, "churn.jobs.view");
    const { jobId } = z.object({ jobId: z.string().min(1).max(64) }).parse(request.params);
    const job = await getRetentionJobStatus(jobId);
    if (!job) return reply.code(404).send({ message: "Processo não encontrado" });
    return job;
  });
  app.get("/analytics/:dimension", async (request) => {
    await auth.requirePermission(request, "churn.analytics");
    const { dimension } = z
      .object({ dimension: z.enum(["cities", "plans", "network-regions", "cancellation-reasons"]) })
      .parse(request.params);
    if (dimension === "cancellation-reasons") {
      const [rows] = await db.query<any[]>(
        `SELECT COALESCE(CONCAT(r.label, ' (ID ', c.cancellation_reason_id, ')'), CONCAT('Motivo não identificado (ID ', c.cancellation_reason_id, ')')) label,
                COUNT(*) total
           FROM retention_cancellations c
           LEFT JOIN retention_cancellation_reasons r ON r.id=c.cancellation_reason_id
          GROUP BY c.cancellation_reason_id,r.label
          ORDER BY total DESC`
      );
      return { items: rows };
    }
    const column =
      dimension === "cities"
        ? "COALESCE(city.label,c.city,'Não informado')"
        : dimension === "plans"
          ? "ct.plan_name"
          : "COALESCE(l.concentrator,'Não informado')";
    const join = `${dimension === "network-regions" ? "LEFT JOIN retention_logins l ON l.customer_id=c.id" : ""} ${dimension === "cities" ? "LEFT JOIN retention_cities city ON city.id=c.city" : ""}`;
    const [rows] = await db.query<any[]>(
      `SELECT ${column} label,COUNT(DISTINCT c.id) customers,SUM(rs.risk_level IN ('HIGH','CRITICAL')) highRisk FROM retention_customers c JOIN retention_contracts ct ON ct.customer_id=c.id AND ct.status <> 'I' ${join} JOIN retention_risk_scores rs ON rs.id=(SELECT id FROM retention_risk_scores x WHERE x.contract_id=ct.id ORDER BY calculated_at DESC,id DESC LIMIT 1) WHERE c.active='S' GROUP BY ${column} ORDER BY highRisk DESC`
    );
    return { items: rows };
  });
}
