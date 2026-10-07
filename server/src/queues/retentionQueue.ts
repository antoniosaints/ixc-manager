import { Queue } from "bullmq";
import { env, redisConnection } from "../config/env.js";

export type RetentionResource =
  | "customers"
  | "customer-contacts"
  | "cities"
  | "contracts"
  | "contract-history"
  | "financial"
  | "tickets"
  | "service-orders"
  | "subjects"
  | "cancellation-reasons"
  | "radius-users"
  | "radius-history"
  | "usage";
export type RetentionJob =
  | { name: "sync"; data: { resource: RetentionResource } }
  | { name: "full-sync"; data: Record<string, never> }
  | { name: "recalculate"; data: { customerId?: number } };
export const retentionQueue = new Queue("retention", { connection: redisConnection, prefix: env.REDIS_PREFIX });
let scheduleTimer: NodeJS.Timeout | undefined;

type QueueJobState = "active" | "waiting" | "delayed" | "completed" | "failed";
const queueStates: QueueJobState[] = ["active", "waiting", "delayed", "completed", "failed"];

export async function getRetentionQueueStatus() {
  const jobsByState = await Promise.all(
    queueStates.map(async (state) => {
      const jobs = await retentionQueue.getJobs([state], 0, 19, true);
      return [
        state,
        jobs.map((job) => ({
          id: String(job.id),
          name: job.name,
          state,
          progress: job.progress,
          createdAt: new Date(job.timestamp).toISOString(),
          processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
          finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          failedReason: job.failedReason ?? null,
        })),
      ] as const;
    })
  );
  const counts = await retentionQueue.getJobCounts(...queueStates);
  return { counts, jobs: Object.fromEntries(jobsByState) };
}

export async function getRetentionJobStatus(jobId: string) {
  const job = await retentionQueue.getJob(jobId);
  if (!job) return null;
  return {
    id: String(job.id),
    name: job.name,
    state: await job.getState(),
    progress: job.progress,
    createdAt: new Date(job.timestamp).toISOString(),
    processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    failedReason: job.failedReason ?? null,
  };
}

export async function enqueueCustomerRecalculate(customerId: number): Promise<{ jobId: string; created: boolean }> {
  const jobs = await retentionQueue.getJobs(["active", "waiting", "delayed"], 0, 100, true);
  const existing = jobs.find((job) => job.name === "recalculate" && job.data.customerId === customerId);
  if (existing?.id) return { jobId: String(existing.id), created: false };
  const job = await retentionQueue.add("recalculate", { customerId });
  return { jobId: String(job.id), created: true };
}

export async function enqueueFullSync(): Promise<{ jobId: string; created: boolean }> {
  // Full loads, notably Radius history, can be expensive. Do not stack manual
  // syncs while a full run is currently executing or waiting for the worker.
  const jobs = await retentionQueue.getJobs(["active", "waiting"], 0, 100, true);
  const existing = jobs.find((job) => job.name === "full-sync");
  if (existing?.id) return { jobId: String(existing.id), created: false };

  const job = await retentionQueue.add("full-sync", {});
  return { jobId: String(job.id), created: true };
}
export async function scheduleRetentionJobs() {
  // A BullMQ repeat job creates the next item even while the previous full
  // load is running. Use a guarded timer instead so a long load never builds
  // a backlog of synchronizations.
  await retentionQueue.removeJobScheduler("retention-30-minutes");
  if (scheduleTimer) return;
  scheduleTimer = setInterval(
    () => {
      void enqueueFullSync().catch((error: unknown) => console.error({ error }, "Retention scheduler failed"));
    },
    30 * 60 * 1000
  );
  scheduleTimer.unref();
}
