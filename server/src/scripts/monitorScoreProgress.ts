import type { RowDataPacket } from "mysql2";
import { retentionQueue } from "../queues/retentionQueue.js";
import { db } from "../repositories/database.js";

const suppliedJobId = process.argv[2];
if (!suppliedJobId) throw new Error("Informe o id do job a monitorar.");
const jobId: string = suppliedJobId;
type ScoreProgress = {
  phase?: string;
  currentResource?: string | null;
  completed?: number;
  total?: number;
  resourceProcessed?: number;
  resourceTotal?: number;
  scoreProcessed?: number;
  scoreTotal?: number;
};

const asMysqlLocal = (date: Date, offsetSeconds: number) =>
  new Date(date.getTime() + offsetSeconds * 1_000).toISOString().slice(0, 19).replace("T", " ");

async function update() {
  const job = await retentionQueue.getJob(jobId);
  if (!job || (await job.getState()) !== "active") return false;
  const progress: ScoreProgress = typeof job.progress === "object" ? (job.progress as ScoreProgress) : {};
  if (progress.phase !== "calculating") return false;

  const [[clock]] = await db.query<RowDataPacket[]>(
    "SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) offset_seconds"
  );
  const jobStartedAt = asMysqlLocal(new Date(job.processedOn ?? job.timestamp), Number(clock?.offset_seconds ?? 0));
  // A full sync calculates scores twice: once for the core sources and once
  // after monthly consumption is persisted. Use the latter timestamp when it
  // belongs to this job so the visible counter restarts for that second pass.
  const [[usageState]] = await db.query<RowDataPacket[]>(
    "SELECT DATE_FORMAT(last_success_at, '%Y-%m-%d %H:%i:%s') value FROM retention_sync_state WHERE resource_name='usage'"
  );
  const usageCompletedAt = usageState?.value ? String(usageState.value) : null;
  const startedAt = usageCompletedAt && usageCompletedAt >= jobStartedAt ? usageCompletedAt : jobStartedAt;
  const [[processed]] = await db.query<RowDataPacket[]>(
    "SELECT COUNT(*) total FROM retention_risk_scores WHERE calculated_at >= ?",
    [startedAt]
  );
  const [[total]] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) total
       FROM retention_contracts ct
       JOIN retention_customers c ON c.id=ct.customer_id AND c.active='S'
      WHERE ct.status <> 'I'`
  );
  const scoreTotal = Number(total?.total ?? 0);
  const scoreProcessed = Math.min(Number(processed?.total ?? 0), scoreTotal);
  await job.updateProgress({ ...progress, scoreProcessed, scoreTotal });
  console.info({ jobId, scoreProcessed, scoreTotal }, "Retention score progress updated");
  return true;
}

const timer = setInterval(() => {
  void update().then((active) => {
    if (!active) {
      clearInterval(timer);
      void retentionQueue.close();
      void db.end();
    }
  });
}, 3_000);
void update();
