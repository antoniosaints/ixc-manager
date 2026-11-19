import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../../repositories/database.js";
import { mapDate } from "../../integrations/ixc/database/maps/valueMappers.js";
import { orderAiReport } from "../ai/OrderAiService.js";
import { aiProvider, aiModel } from "../ai/AiProviderClient.js";
import type { OrderAnalysisService } from "./OrderAnalysisService.js";

const day = z.string().refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && mapDate(s) === s);
const count = z.number().int().nonnegative().safe();
export const orderAnalysisSnapshot = z.object({
  filters: z.object({ subjectId: z.number().int().positive().safe(), from: day, to: day }),
  subject: z.object({ id: z.number().int().positive().safe(), name: z.string().min(1).max(512) }),
  queriedAt: z.string().datetime(),
  totals: z.object({
    orders: count,
    customers: count,
    recurringCustomers: count,
    closed: count,
    missingCustomer: count,
    missingCity: count,
    missingNetworkBranch: count,
    withoutText: count,
    cities: count,
  }),
  messageCount: count,
  warnings: z.array(z.string().max(2000)).max(30),
  ai: z.object({ provider: aiProvider, model: aiModel, batches: count, report: orderAiReport }),
});
export type OrderAnalysisSnapshot = z.infer<typeof orderAnalysisSnapshot>;
export const orderAnalysisHistoryQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce
      .number()
      .refine((n) => n === 10 || n === 25)
      .default(10),
    subjectId: z.coerce.number().int().nonnegative().safe().default(0),
    from: z.union([day, z.literal("")]).default(""),
    to: z.union([day, z.literal("")]).default(""),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, "Período inválido.");
export const historyId = z.object({ historyId: z.string().uuid() });
type Summary = Omit<OrderAnalysisSnapshot, "ai"> & { ai: Omit<OrderAnalysisSnapshot["ai"], "report"> };
export interface HistoryEntry {
  id: string;
  subject: Summary["subject"];
  filters: Summary["filters"];
  createdAt: string;
  generatedAt: string;
  provider: string;
  model: string;
  totalOrders: number;
  summary: string;
}
export interface HistoryStore {
  insert(id: string, snapshot: OrderAnalysisSnapshot, userId: number, createdAt: Date): Promise<void>;
  list(
    query: z.infer<typeof orderAnalysisHistoryQuery>
  ): Promise<{ items: HistoryEntry[]; total: number; subjects: { id: number; name: string }[] }>;
  detail(id: string): Promise<{ id: string; createdAt: string; snapshot: OrderAnalysisSnapshot } | null>;
}
const missing = (error: unknown) => (error as { code?: string }).code === "ER_NO_SUCH_TABLE";
const fail = (message: string, statusCode = 404) => Object.assign(new Error(message), { statusCode });
const iso = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  const text = String(value).replace(" ", "T");
  return new Date(/Z$|[+-]\d{2}:\d{2}$/.test(text) ? text : `${text}Z`).toISOString();
};
const date = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
export class OrderAnalysisHistoryRepository implements HistoryStore {
  async insert(id: string, snapshot: OrderAnalysisSnapshot, userId: number, createdAt: Date) {
    const insert = () =>
      db.execute(
        `INSERT INTO retention_order_analysis_history
      (id,subject_id,subject_name,period_from,period_to,provider,model,total_orders,summary,snapshot,generated_at,created_at,created_by_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,
        [
          id,
          snapshot.subject.id,
          snapshot.subject.name,
          snapshot.filters.from,
          snapshot.filters.to,
          snapshot.ai.provider,
          snapshot.ai.model,
          snapshot.totals.orders,
          snapshot.ai.report.summary,
          JSON.stringify(snapshot),
          new Date(snapshot.queriedAt),
          createdAt,
          userId,
        ]
      );
    try {
      await insert();
    } catch (error) {
      if (!missing(error)) throw error;
      await db.query(`CREATE TABLE IF NOT EXISTS retention_order_analysis_history (
        id CHAR(36) PRIMARY KEY,subject_id BIGINT NOT NULL,subject_name VARCHAR(512) NOT NULL,period_from DATE NOT NULL,period_to DATE NOT NULL,
        provider VARCHAR(16) NOT NULL,model VARCHAR(200) NOT NULL,total_orders INT NOT NULL,summary TEXT NOT NULL,snapshot JSON NOT NULL,
        generated_at DATETIME(3) NOT NULL,created_at DATETIME(3) NOT NULL,created_by_user_id BIGINT NULL,
        INDEX idx_order_analysis_history_date (created_at,id),INDEX idx_order_analysis_history_subject (subject_id,created_at))`);
      await insert();
    }
  }
  async list(q: z.infer<typeof orderAnalysisHistoryQuery>) {
    const filters: string[] = [],
      params: (string | number)[] = [];
    if (q.subjectId) {
      filters.push("subject_id=?");
      params.push(q.subjectId);
    }
    if (q.from) {
      filters.push("period_from>=?");
      params.push(q.from);
    }
    if (q.to) {
      filters.push("period_to<=?");
      params.push(q.to);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    try {
      const [totals] = await db.query<any[]>(`SELECT COUNT(*) total FROM retention_order_analysis_history ${where}`, params);
      const [rows] = await db.query<any[]>(
        `SELECT id,subject_id,subject_name,period_from,period_to,provider,model,total_orders,
        LEFT(summary,240) summary,generated_at,created_at FROM retention_order_analysis_history ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
        [...params, q.limit, (q.page - 1) * q.limit]
      );
      const [subjects] = await db.query<any[]>(
        "SELECT subject_id id,MAX(subject_name) name FROM retention_order_analysis_history GROUP BY subject_id ORDER BY name,id LIMIT 5000"
      );
      return {
        items: rows.map((r): HistoryEntry => ({
          id: String(r.id),
          subject: { id: Number(r.subject_id), name: String(r.subject_name) },
          filters: { subjectId: Number(r.subject_id), from: date(r.period_from), to: date(r.period_to) },
          provider: r.provider,
          model: r.model,
          totalOrders: Number(r.total_orders),
          summary: r.summary,
          generatedAt: iso(r.generated_at),
          createdAt: iso(r.created_at),
        })),
        total: count.parse(Number(totals[0]?.total ?? 0)),
        subjects: subjects.map((r) => ({ id: Number(r.id), name: String(r.name) })),
      };
    } catch (error) {
      if (missing(error)) return { items: [], total: 0, subjects: [] };
      throw error;
    }
  }
  async detail(id: string) {
    try {
      const [rows] = await db.query<any[]>("SELECT id,created_at,snapshot FROM retention_order_analysis_history WHERE id=? LIMIT 1", [id]);
      const row = rows[0];
      return row
        ? {
            id: String(row.id),
            createdAt: iso(row.created_at),
            snapshot: orderAnalysisSnapshot.parse(typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot),
          }
        : null;
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }
}
export interface HistorySave {
  id: string;
  saved: boolean;
  createdAt: string;
  message: string | null;
}
export class OrderAnalysisHistoryService {
  private pending = new Map<string, { snapshot: OrderAnalysisSnapshot; userId: number; createdAt: Date }>();
  constructor(
    private readonly store: HistoryStore = new OrderAnalysisHistoryRepository(),
    private readonly now = () => new Date()
  ) {}
  private prune() {
    for (const [id, value] of this.pending) if (this.now().getTime() - value.createdAt.getTime() > 30 * 60000) this.pending.delete(id);
  }
  async capture(result: Awaited<ReturnType<OrderAnalysisService["analyze"]>>, userId: number): Promise<HistorySave | null> {
    if (result.ai.status !== "completed" || !result.ai.report) return null;
    const snapshot = orderAnalysisSnapshot.parse({
      filters: result.filters,
      subject: result.subject,
      queriedAt: result.queriedAt,
      totals: { ...result.totals, cities: result.clusters.filter((c) => !c.networkBranch).length },
      messageCount: result.messageCount,
      warnings: result.warnings,
      ai: { provider: result.ai.provider, model: result.ai.model, batches: result.ai.batches, report: result.ai.report },
    });
    this.prune();
    if (this.pending.size >= 20) this.pending.delete(this.pending.keys().next().value!);
    const id = randomUUID(),
      createdAt = this.now();
    this.pending.set(id, { snapshot, userId, createdAt });
    return this.save(id, snapshot, userId, createdAt);
  }
  private async save(id: string, snapshot: OrderAnalysisSnapshot, userId: number, createdAt: Date): Promise<HistorySave> {
    try {
      await this.store.insert(id, snapshot, userId, createdAt);
      this.pending.delete(id);
      return { id, saved: true, createdAt: createdAt.toISOString(), message: null };
    } catch {
      return {
        id,
        saved: false,
        createdAt: createdAt.toISOString(),
        message:
          "O resumo foi gerado, mas não foi salvo no histórico. Tente salvar novamente nesta tela em até 30 minutos, sem gerar outra análise.",
      };
    }
  }
  async retry(id: string, userId: number) {
    this.prune();
    const value = this.pending.get(id);
    if (!value || value.userId !== userId) throw fail("A tentativa de gravação não está disponível nesta sessão.");
    return this.save(id, value.snapshot, userId, value.createdAt);
  }
  async list(input: unknown) {
    return {
      ...(await this.store.list(orderAnalysisHistoryQuery.parse(input))),
      ...orderAnalysisHistoryQuery.parse(input),
      queriedAt: this.now().toISOString(),
    };
  }
  async detail(id: string) {
    const row = await this.store.detail(id);
    if (!row) throw fail("Análise salva não encontrada.");
    return row;
  }
}
