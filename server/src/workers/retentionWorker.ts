import { Worker } from "bullmq";
import { env, redisConnection } from "../config/env.js";
import { SyncService } from "../services/retention/SyncService.js";
import { RetentionScoreService } from "../services/retention/RetentionScoreService.js";

const sync = new SyncService();
const scores = new RetentionScoreService();
// The raw Radius accounting endpoint is intentionally not part of the normal
// cycle. This IXC installation ignores its date filter when sent in the wrong
// format and can otherwise expose 33M rows. Current login state is enough for
// the first risk result; session history can be run separately after an IXC
// report/query with a guaranteed server-side window is available.
const coreSyncResources = [
  "cancellation-reasons",
  "cities",
  "customers",
  "contracts",
  "contract-history",
  "financial",
  "tickets",
  "service-orders",
  "subjects",
  "radius-users",
] as const;
const enrichmentSyncResources = ["usage"] as const;
const fullSyncTotal = coreSyncResources.length + enrichmentSyncResources.length;
const errorSummary = (error: unknown) => {
  if (!(error instanceof Error)) return { message: String(error) };
  const httpError = error as Error & { code?: string; status?: number; response?: { status?: number } };
  return { name: error.name, message: error.message, code: httpError.code, status: httpError.status ?? httpError.response?.status };
};
export const retentionWorker = new Worker(
  "retention",
  async (job) => {
    if (job.name === "sync") {
      await job.updateProgress({ phase: "syncing", currentResource: job.data.resource, completed: 0, total: 1 });
      const result = await sync.sync(job.data.resource);
      await job.updateProgress({ phase: "completed", currentResource: job.data.resource, completed: 1, total: 1 });
      return result;
    }
    if (job.name === "full-sync") {
      const affectedCustomerIds = new Set<number>();
      for (const [index, resource] of coreSyncResources.entries()) {
        await job.updateProgress({ phase: "syncing", currentResource: resource, completed: index, total: fullSyncTotal });
        const result = await sync.sync(resource, async ({ processed, total }) => {
          await job.updateProgress({
            phase: "syncing",
            currentResource: resource,
            completed: index,
            total: fullSyncTotal,
            resourceProcessed: processed,
            resourceTotal: total,
          });
        });
        result.affectedCustomerIds.forEach((customerId) => affectedCustomerIds.add(customerId));
      }

      // Publish useful customers as soon as core financial, support, contract
      // and current-network data is ready. Consumption enrichment continues
      // afterwards without holding the dashboard empty.
      await job.updateProgress({
        phase: "calculating",
        currentResource: null,
        completed: coreSyncResources.length,
        total: fullSyncTotal,
      });
      const coreResult = await scores.recalculateMany([...affectedCustomerIds]);

      const enrichmentCustomerIds = new Set<number>();
      for (const [offset, resource] of enrichmentSyncResources.entries()) {
        const index = coreSyncResources.length + offset;
        await job.updateProgress({ phase: "syncing", currentResource: resource, completed: index, total: fullSyncTotal });
        const result = await sync.sync(resource, async ({ processed, total }) => {
          await job.updateProgress({
            phase: "syncing",
            currentResource: resource,
            completed: index,
            total: fullSyncTotal,
            resourceProcessed: processed,
            resourceTotal: total,
          });
        });
        result.affectedCustomerIds.forEach((customerId) => enrichmentCustomerIds.add(customerId));
      }
      // Consumption was persisted; the remaining writes are score snapshots.
      // Report that state explicitly so the dashboard never appears stuck on
      // the last source counter while the worker is still active.
      await job.updateProgress({
        phase: "calculating",
        currentResource: null,
        completed: coreSyncResources.length,
        total: fullSyncTotal,
      });
      const enrichmentResult = await scores.recalculateMany([...enrichmentCustomerIds]);
      await job.updateProgress({
        phase: "completed",
        currentResource: null,
        completed: fullSyncTotal,
        total: fullSyncTotal,
      });
      return { calculated: coreResult.calculated + enrichmentResult.calculated };
    }
    if (job.name === "recalculate") {
      await job.updateProgress({ phase: "calculating", currentResource: null, completed: 0, total: 1 });
      const result = await scores.recalculate(job.data.customerId);
      await job.updateProgress({ phase: "completed", currentResource: null, completed: 1, total: 1 });
      return result;
    }
    throw new Error(`Unknown retention job ${job.name}`);
  },
  // Serial processing prevents overlapping full synchronizations from
  // overloading IXC, MySQL, or the local worker.
  { connection: redisConnection, prefix: env.REDIS_PREFIX, concurrency: 1 }
);
retentionWorker.on("failed", (job, error) => console.error({ jobId: job?.id, error: errorSummary(error) }, "Retention job failed"));
retentionWorker.on("error", (error) => console.error({ error: errorSummary(error) }, "Retention worker connection error"));
retentionWorker.on("completed", (job) => console.info({ jobId: job.id, name: job.name }, "Retention job completed"));
