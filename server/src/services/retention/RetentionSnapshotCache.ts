import { createHash, randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { env, redisConnection } from "../../config/env.js";
import type { RiskThresholds } from "../../config/risk.js";
import type { RetentionSnapshot } from "./DirectRetentionService.js";

export const churnCacheLifetimeMs = 12 * 60 * 60 * 1000;
const lockLifetimeMs = 60000;
const listColumns = [
  "customer_id",
  "contract_id",
  "name",
  "city",
  "city_id",
  "neighborhood",
  "plan_name",
  "branch_id",
  "satisfaction",
  "open_orders",
  "open_tickets",
  "internet_status",
];
function cacheItem(item: RetentionSnapshot["items"][number], calculatedAt: string) {
  return { ...item, row: Object.fromEntries(listColumns.map((key) => [key, item.row[key]])), calculatedAt };
}
export interface RetentionSnapshotCache {
  load(
    thresholds: RiskThresholds,
    read: () => Promise<RetentionSnapshot>,
    signal?: AbortSignal,
    force?: boolean
  ): Promise<RetentionSnapshot>;
  updateCustomer(thresholds: RiskThresholds, customerId: number, snapshot: RetentionSnapshot, signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}
const unavailable = () =>
  Object.assign(new Error("O cache compartilhado do Churn está indisponível. Tente novamente."), { statusCode: 503 });
const interrupted = () => Object.assign(new Error("Consulta interrompida."), { statusCode: 499 });
export function retentionCacheKey(thresholds: RiskThresholds, prefix = env.REDIS_PREFIX) {
  const hash = createHash("sha256").update(JSON.stringify(thresholds)).digest("hex");
  return `${prefix}:churn:scores:v1:{${hash}}`;
}
const releaseScript = `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`;
const renewScript = `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) end return 0`;
const publishScript = `
  if redis.call('GET',KEYS[2])~=ARGV[1] then return 0 end
  redis.call('HSET',KEYS[3],'_building','1')
  redis.call('PEXPIRE',KEYS[3],60000)
  for i=3,#ARGV,2 do redis.call('HSET',KEYS[3],ARGV[i],ARGV[i+1]) end
  redis.call('HDEL',KEYS[3],'_building')
  redis.call('PEXPIRE',KEYS[3],ARGV[2])
  redis.call('RENAME',KEYS[3],KEYS[1])
  return 1`;
const patchScript = `
  if redis.call('GET',KEYS[2])~=ARGV[1] then return {-1} end
  local raw=redis.call('HGET',KEYS[1],'meta')
  if not raw then return {0} end
  local meta=cjson.decode(raw)
  local current=redis.call('HGET',KEYS[1],ARGV[2])
  local at=meta.queriedAt
  if current then at=cjson.decode(current).queriedAt end
  if at>ARGV[3] then return {0} end
  redis.call('HSET',KEYS[1],ARGV[2],ARGV[4])
  meta.cacheRevision=(meta.cacheRevision or 0)+1
  redis.call('HSET',KEYS[1],'meta',cjson.encode(meta))
  return {meta.cacheRevision,meta.id}`;

/** One Redis hash per score configuration; customer updates preserve its original expiry. */
export class RedisRetentionSnapshotCache implements RetentionSnapshotCache {
  private readonly redis: Redis;
  private connecting?: Promise<void>;
  private memo?: { key: string; snapshot: RetentionSnapshot };
  constructor(options: { redis?: Redis; prefix?: string; now?: () => number } = {}) {
    this.redis =
      options.redis ??
      new Redis({
        ...redisConnection,
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        connectTimeout: 3000,
        commandTimeout: 5000,
      });
    this.redis.on("error", () => {
      /* Connection errors are returned without exposing credentials. */
    });
    this.prefix = options.prefix ?? env.REDIS_PREFIX;
    this.now = options.now ?? Date.now;
  }
  private readonly prefix: string;
  private readonly now: () => number;
  async close() {
    this.memo = undefined;
    this.redis.disconnect();
  }
  private check(signal?: AbortSignal) {
    if (signal?.aborted) throw interrupted();
  }
  private async ready() {
    if (this.redis.status === "ready") return;
    if (!this.connecting)
      this.connecting = this.redis.connect().finally(() => {
        this.connecting = undefined;
      });
    try {
      await this.connecting;
    } catch {
      throw unavailable();
    }
  }
  private async read(key: string): Promise<RetentionSnapshot | null> {
    const marker = await this.redis.hget(key, "meta");
    if (!marker) {
      this.memo = undefined;
      return null;
    }
    const latest = JSON.parse(marker) as Omit<RetentionSnapshot, "items">;
    if (!latest.expiresAt || Date.parse(latest.expiresAt) <= this.now()) return null;
    if (
      this.memo?.key === key &&
      this.memo.snapshot.id === latest.id &&
      (this.memo.snapshot.cacheRevision ?? 0) === (latest.cacheRevision ?? 0)
    )
      return this.memo.snapshot;
    const fields = await this.redis.hgetall(key);
    if (!fields.meta) return null;
    const meta = JSON.parse(fields.meta) as Omit<RetentionSnapshot, "items">;
    if (!meta.expiresAt || Date.parse(meta.expiresAt) <= this.now()) return null;
    const items = Object.entries(fields)
      .filter(([field]) => field !== "meta")
      .flatMap(([, raw]) => {
        const customer = JSON.parse(raw) as { items: RetentionSnapshot["items"]; queriedAt: string };
        return customer.items;
      });
    const snapshot = { ...meta, items };
    this.memo = { key, snapshot };
    return snapshot;
  }
  private async pause(signal?: AbortSignal) {
    this.check(signal);
    await new Promise<void>((resolve, reject) => {
      const aborted = () => {
        clearTimeout(timer);
        reject(interrupted());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", aborted);
        resolve();
      }, 150);
      signal?.addEventListener("abort", aborted, { once: true });
      if (signal?.aborted) aborted();
    });
  }
  private async locked<T>(key: string, work: (owner: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const owner = randomUUID(),
      start = Date.now();
    while (true) {
      this.check(signal);
      if (await this.redis.set(`${key}:lock`, owner, "PX", lockLifetimeMs, "NX")) break;
      if (Date.now() - start > lockLifetimeMs) throw unavailable();
      await this.pause(signal);
    }
    let lost = false;
    const timer = setInterval(() => {
      void this.redis
        .eval(renewScript, 1, `${key}:lock`, owner, lockLifetimeMs)
        .then((result) => {
          if (Number(result) !== 1) lost = true;
        })
        .catch(() => {
          lost = true;
        });
    }, 10000);
    timer.unref();
    try {
      const result = await work(owner);
      this.check(signal);
      if (lost) throw unavailable();
      return result;
    } finally {
      clearInterval(timer);
      await this.redis.eval(releaseScript, 1, `${key}:lock`, owner).catch(() => {});
    }
  }
  async load(thresholds: RiskThresholds, read: () => Promise<RetentionSnapshot>, signal?: AbortSignal, force = false) {
    this.check(signal);
    await this.ready();
    const key = retentionCacheKey(thresholds, this.prefix);
    try {
      const previous = await this.read(key);
      this.check(signal);
      if (previous && !force) return previous;
      return await this.locked(
        key,
        async (owner) => {
          const current = await this.read(key);
          this.check(signal);
          if (current && (!force || current.id !== previous?.id)) return current;
          const snapshot = await read();
          this.check(signal);
          const expiresAt = new Date(this.now() + churnCacheLifetimeMs).toISOString();
          const { items, ...metadata } = snapshot;
          const groups = new Map<number, RetentionSnapshot["items"]>();
          for (const item of items) {
            const id = item.context.customerId;
            if (!groups.has(id)) groups.set(id, []);
            groups.get(id)!.push(cacheItem(item, item.calculatedAt ?? snapshot.queriedAt));
          }
          const fields: string[] = ["meta", JSON.stringify({ ...metadata, expiresAt, cacheRevision: 1 })];
          for (const [id, customer] of groups) fields.push(String(id), JSON.stringify({ items: customer, queriedAt: snapshot.queriedAt }));
          if (
            Number(
              await this.redis.eval(
                publishScript,
                3,
                key,
                `${key}:lock`,
                `${key}:building:${owner}`,
                owner,
                churnCacheLifetimeMs,
                ...fields
              )
            ) !== 1
          )
            throw unavailable();
          const cached = { ...snapshot, items: [...groups.values()].flat(), expiresAt, cacheRevision: 1 };
          this.memo = { key, snapshot: cached };
          return cached;
        },
        signal
      );
    } catch (e) {
      if (signal?.aborted) throw interrupted();
      if ((e as { statusCode?: number }).statusCode) throw e;
      throw unavailable();
    }
  }
  async updateCustomer(thresholds: RiskThresholds, customerId: number, snapshot: RetentionSnapshot, signal?: AbortSignal) {
    this.check(signal);
    await this.ready();
    const key = retentionCacheKey(thresholds, this.prefix);
    try {
      if (!(await this.redis.hget(key, "meta"))) return;
      await this.locked(
        key,
        async (owner) => {
          const items = snapshot.items.map((item) => cacheItem(item, snapshot.queriedAt));
          const result = await this.redis.eval(
            patchScript,
            2,
            key,
            `${key}:lock`,
            owner,
            String(customerId),
            snapshot.queriedAt,
            JSON.stringify({ items, queriedAt: snapshot.queriedAt })
          );
          const [revision, id] = result as [number, string?];
          if (revision < 0) throw unavailable();
          const memo = this.memo?.key === key ? this.memo.snapshot : null;
          if (memo && memo.id === id && (memo.cacheRevision ?? 0) === revision - 1) {
            this.memo = {
              key,
              snapshot: {
                ...memo,
                cacheRevision: revision,
                items: [...memo.items.filter((item) => item.context.customerId !== customerId), ...items],
              },
            };
          } else this.memo = undefined;
        },
        signal
      );
    } catch (e) {
      if (signal?.aborted) throw interrupted();
      if ((e as { statusCode?: number }).statusCode) throw e;
      throw unavailable();
    }
  }
}
