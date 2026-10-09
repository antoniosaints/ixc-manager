import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { db } from "../repositories/database.js";
import { directRetention } from "../services/retention/DirectRetentionService.js";
import { AuthService } from "../services/AuthService.js";
import { RetentionSummaryService } from "../services/retention/RetentionSummaryService.js";

import { createCustomerRiskPdf } from "../services/retention/CustomerRiskPdf.js";

const auth = new AuthService();
const listQuery = z.object({
  snapshotId: z.string().uuid().optional(),
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
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof z.ZodError ? 400 : ((error as { statusCode?: number }).statusCode ?? 502);
    reply.code(status).send({
      message:
        status === 400
          ? "Revise os filtros informados."
          : status < 500
            ? (error as Error).message
            : "Não foi possível consultar os dados do Churn. Tente novamente.",
    });
  });
  app.addHook("preHandler", async (request) => {
    await auth.requireUser(request);
  });
  app.get("/summary", async (request, reply) => {
    await auth.requirePermission(request, "churn.dashboard");
    reply.header("Cache-Control", "no-store");
    return summary.getSummary(requestSignal(request, reply));
  });
  app.get("/customers", async (request, reply) => {
    const filter = listQuery.parse(request.query);
    if (filter.attentionOnly) await auth.requirePermission(request, "churn.attention.view");
    else if (filter.workflowStatus === "RESOLVED") await auth.requireAnyPermission(request, "churn.dashboard", "churn.resolved.view");
    else await auth.requirePermission(request, "churn.dashboard");
    return directRetention.listCustomers(filter, requestSignal(request, reply));
  });
  app.get("/customers/:customerId", async (request, reply) => {
    await auth.requirePermission(request, "churn.customer.view");
    const { customerId } = z.object({ customerId: z.coerce.number().int().positive() }).parse(request.params);
    const { contractId } = z.object({ contractId: z.coerce.number().int().positive().optional() }).parse(request.query);
    const details = await directRetention.customerDetails(customerId, contractId, requestSignal(request, reply));
    if (!details) return reply.code(404).send({ message: "Cliente ou contrato elegível não encontrado" });
    return details;
  });
  app.get("/customers/:customerId/pdf", { logLevel: "silent" }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await auth.requirePermission(request, "churn.customer.view", "churn.customer.export");
    try {
      const { customerId } = z.object({ customerId: z.coerce.number().int().positive() }).parse(request.params);
      const { contractId } = z.object({ contractId: z.coerce.number().int().positive().optional() }).parse(request.query);
      const snapshot = await directRetention.getSnapshot(customerId, contractId, requestSignal(request, reply));
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
    const snapshot = await directRetention.getSnapshot(customerId, contractId);
    if (!snapshot) throw Object.assign(new Error("Contrato elegível não encontrado para este cliente"), { statusCode: 404 });
    const [workflow] = await db.query<any[]>("SELECT status FROM retention_customer_workflow WHERE customer_id=?", [customerId]);
    if (critical && workflow[0]?.status === "RESOLVED")
      throw Object.assign(new Error("Clientes resolvidos não podem ser marcados como críticos"), { statusCode: 409 });
    if (critical) {
      // Preserve the FK without syncing the portfolio: only this explicitly marked,
      // IXC-validated contract needs a local reference for the manual priority.
      await db.execute(
        "INSERT INTO retention_contracts (id,customer_id,status,plan_name,internet_status,synced_at) VALUES (?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE customer_id=VALUES(customer_id),status=VALUES(status),plan_name=VALUES(plan_name),internet_status=VALUES(internet_status),synced_at=VALUES(synced_at)",
        [contractId, customerId, snapshot.customer.contract_status, snapshot.customer.plan_name, snapshot.customer.internet_status]
      );
      await db.execute(
        "INSERT INTO retention_contract_attention (contract_id,customer_id,marked_at,marked_by_user_id) VALUES (?,?,NOW(),?) ON DUPLICATE KEY UPDATE marked_at=VALUES(marked_at),marked_by_user_id=VALUES(marked_by_user_id)",
        [contractId, customerId, user.id]
      );
    } else await db.execute("DELETE FROM retention_contract_attention WHERE contract_id=?", [contractId]);
    return { critical };
  });
  app.get("/customers/:customerId/timeline", async (request, reply) => {
    await auth.requirePermission(request, "churn.customer.view");
    const { customerId } = z.object({ customerId: z.coerce.number().int().positive() }).parse(request.params);
    return directRetention.timeline(customerId, requestSignal(request, reply));
  });
  // Compatibility endpoints complete within the request; they never enqueue a job.
  app.post("/recalculate", async (request, reply) => {
    await auth.requirePermission(request, "churn.recalculate");
    await directRetention.getSummary(requestSignal(request, reply));
    return { status: "completed", source: "database" };
  });
  app.post("/customers/:customerId/recalculate", async (request, reply) => {
    await auth.requirePermission(request, "churn.recalculate");
    const { customerId } = z.object({ customerId: z.coerce.number().int().positive() }).parse(request.params);
    if (!(await directRetention.getSnapshot(customerId, undefined, requestSignal(request, reply))))
      return reply.code(404).send({ message: "Cliente elegível não encontrado" });
    return { status: "completed", source: "database" };
  });
  app.post("/sync", async (request, reply) => {
    await auth.requirePermission(request, "churn.sync");
    await directRetention.getSummary(requestSignal(request, reply));
    return { status: "completed", source: "database", message: "O Churn consulta o IXC diretamente; não é necessária sincronização." };
  });
  app.get("/sync/status", async (request) => {
    await auth.requirePermission(request, "churn.processes.view");
    return {
      source: "database",
      mode: "direct",
      counts: { active: 0, waiting: 0, delayed: 0, completed: 0, failed: 0 },
      jobs: { active: [], waiting: [], delayed: [], completed: [], failed: [] },
    };
  });
  app.get("/jobs/:jobId", async (request, reply) => {
    await auth.requirePermission(request, "churn.jobs.view");
    return reply.code(410).send({ message: "O Churn usa consulta direta. Atualize a análise; não há tarefas em segundo plano." });
  });
  app.get("/analytics/:dimension", async (request, reply) => {
    await auth.requirePermission(request, "churn.analytics");
    const { dimension } = z
      .object({ dimension: z.enum(["cities", "plans", "network-regions", "cancellation-reasons"]) })
      .parse(request.params);
    return directRetention.analytics(dimension, requestSignal(request, reply));
  });
}

function requestSignal(_request: FastifyRequest, reply: FastifyReply) {
  const controller = new AbortController();
  reply.raw.once("close", () => {
    if (!reply.raw.writableEnded) controller.abort();
  });
  return controller.signal;
}
