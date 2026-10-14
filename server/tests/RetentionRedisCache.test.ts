import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { redisConnection, env } from "../src/config/env.js";
import { defaultChurnSettings } from "../src/services/settings/ChurnSettingsService.js";
import { churnCacheLifetimeMs, RedisRetentionSnapshotCache, retentionCacheKey } from "../src/services/retention/RetentionSnapshotCache.js";
import type { RetentionSnapshot } from "../src/services/retention/DirectRetentionService.js";

const enabled = process.env.CHURN_REDIS_INTEGRATION === "1";
describe.skipIf(!enabled)("Cache de Churn no Redis real (namespace isolado)", () => {
  let control: Redis;
  const clients: RedisRetentionSnapshotCache[] = [],
    keys = new Set<string>();
  const scope = `${env.REDIS_PREFIX}:test:churn:${randomUUID()}`;
  function setup(now?: () => number) {
    const prefix = `${scope}:${randomUUID()}`,
      key = retentionCacheKey(defaultChurnSettings, prefix);
    keys.add(key);
    keys.add(`${key}:lock`);
    const first = new RedisRetentionSnapshotCache({ prefix, now }),
      second = new RedisRetentionSnapshotCache({ prefix, now });
    clients.push(first, second);
    return { first, second, key, prefix };
  }
  function snapshot(at = new Date().toISOString(), customers = [1, 2]): RetentionSnapshot {
    return {
      id: randomUUID(),
      queriedAt: at,
      sources: [],
      items: customers.map((id) => ({
        row: { name: `Exemplo ${id}`, phone: "PRIVATE_CONTACT", password: "PRIVATE_SECRET" },
        context: { customerId: id, contractId: id * 100 },
        risk: { score: id, level: "LOW", reasons: [], factors: { financial: 0, support: 0, network: 0, contract: 0, satisfaction: 0 } },
        concentrators: [],
      })),
    } as RetentionSnapshot;
  }
  beforeAll(async () => {
    control = new Redis({
      ...redisConnection,
      lazyConnect: true,
      retryStrategy: () => null,
      enableOfflineQueue: false,
      connectTimeout: 3000,
    });
    control.on("error", () => {});
    await control.connect();
  });
  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close()));
    if (control?.status === "ready") await control.del(...keys);
    control?.disconnect();
  });
  it("compartilha o primeiro cálculo entre processos e estabelece TTL real de 12 horas", async () => {
    const { first, second, key } = setup();
    let release!: (value: RetentionSnapshot) => void;
    const read = vi.fn(
      () =>
        new Promise<RetentionSnapshot>((resolve) => {
          release = resolve;
        })
    );
    const one = first.load(defaultChurnSettings, read);
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    const readSecond = vi.fn(async () => snapshot()),
      two = second.load(defaultChurnSettings, readSecond);
    release(snapshot());
    const [a, b] = await Promise.all([one, two]);
    expect(a.id).toBe(b.id);
    expect(readSecond).not.toHaveBeenCalled();
    const ttl = await control.pttl(key);
    expect(JSON.stringify(await control.hgetall(key))).not.toMatch(/PRIVATE_CONTACT|PRIVATE_SECRET/);
    expect(ttl).toBeGreaterThan(churnCacheLifetimeMs - 3000);
    expect(ttl).toBeLessThanOrEqual(churnCacheLifetimeMs);
    await first.load(defaultChurnSettings, readSecond);
    expect(readSecond).not.toHaveBeenCalled();
  });
  it("substitui apenas o cliente alterado sem prolongar o TTL nem tocar os demais scores", async () => {
    const { first, second, key } = setup(),
      original = await first.load(defaultChurnSettings, async () => snapshot());
    const others = await control.hget(key, "2"),
      ttl = await control.pttl(key);
    const update = snapshot(new Date(Date.parse(original.queriedAt) + 1000).toISOString(), [1]);
    update.items[0]!.risk.score = 90;
    await second.updateCustomer(defaultChurnSettings, 1, update);
    const result = await first.load(defaultChurnSettings, async () => {
      throw new Error("Recalculou carteira");
    });
    expect(result.items.find((item) => item.context.customerId === 1)?.risk.score).toBe(90);
    expect(await control.hget(key, "2")).toBe(others);
    expect(await control.pttl(key)).toBeLessThanOrEqual(ttl);
    expect(result.expiresAt).toBe(original.expiresAt);
    await first.updateCustomer(defaultChurnSettings, 1, snapshot(update.queriedAt, []));
    expect((await second.load(defaultChurnSettings, async () => snapshot())).items.map((item) => item.context.customerId)).toEqual([2]);
  });
  it("não permite que um recálculo antigo sobrescreva um score mais recente", async () => {
    const { first, second } = setup(),
      original = await first.load(defaultChurnSettings, async () => snapshot());
    const fresh = snapshot(new Date(Date.parse(original.queriedAt) + 2000).toISOString(), [1]);
    fresh.items[0]!.risk.score = 91;
    await first.updateCustomer(defaultChurnSettings, 1, fresh);
    const stale = snapshot(original.queriedAt, [1]);
    stale.items[0]!.risk.score = 2;
    await second.updateCustomer(defaultChurnSettings, 1, stale);
    expect(
      (await second.load(defaultChurnSettings, async () => snapshot())).items.find((item) => item.context.customerId === 1)?.risk.score
    ).toBe(91);
  });
  it("preserva a atualização individual que ocorre durante uma atualização geral", async () => {
    const { first, second } = setup(),
      base = Date.now();
    await first.load(defaultChurnSettings, async () => snapshot(new Date(base).toISOString()));
    let release!: (value: RetentionSnapshot) => void;
    const read = vi.fn(
      () =>
        new Promise<RetentionSnapshot>((resolve) => {
          release = resolve;
        })
    );
    const refresh = first.load(defaultChurnSettings, read, undefined, true);
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    const update = snapshot(new Date(base + 2000).toISOString(), [1]);
    update.items[0]!.risk.score = 99;
    const patch = second.updateCustomer(defaultChurnSettings, 1, update);
    release(snapshot(new Date(base + 1000).toISOString()));
    await Promise.all([refresh, patch]);
    expect(
      (await first.load(defaultChurnSettings, async () => snapshot())).items.find((item) => item.context.customerId === 1)?.risk.score
    ).toBe(99);
  });
  it("renova a carteira expirada e mantém configurações diferentes em chaves separadas", async () => {
    let time = Date.now();
    const { first, key, prefix } = setup(() => time),
      read = vi.fn(async () => snapshot(new Date(time).toISOString()));
    const initial = await first.load(defaultChurnSettings, read);
    time += churnCacheLifetimeMs;
    const newer = await first.load(defaultChurnSettings, read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(newer.id).not.toBe(initial.id);
    const changed = { ...defaultChurnSettings, critical: 95 },
      changedKey = retentionCacheKey(changed, prefix);
    keys.add(changedKey);
    keys.add(`${changedKey}:lock`);
    await first.load(changed, read);
    expect(read).toHaveBeenCalledTimes(3);
    expect(await control.exists(key, changedKey)).toBe(2);
  });
  it("uma falha de leitura não publica cache parcial e não apaga a carteira válida", async () => {
    const { first, key } = setup();
    const initial = await first.load(defaultChurnSettings, async () => snapshot());
    await expect(
      first.load(
        defaultChurnSettings,
        async () => {
          throw new Error("PRIVATE_SQL_DETAIL");
        },
        undefined,
        true
      )
    ).rejects.toMatchObject({ statusCode: 503 });
    expect((await first.load(defaultChurnSettings, async () => snapshot())).id).toBe(initial.id);
    expect(await control.exists(`${key}:lock`)).toBe(0);
    const other = setup(),
      controller = new AbortController();
    controller.abort();
    await expect(other.first.load(defaultChurnSettings, async () => snapshot(), controller.signal)).rejects.toMatchObject({
      statusCode: 499,
    });
    expect(await control.exists(other.key)).toBe(0);
  });
  it("um recálculo individual não cria uma carteira incompleta se o cache ainda não existe", async () => {
    const { first, key } = setup();
    await first.updateCustomer(defaultChurnSettings, 1, snapshot());
    expect(await control.exists(key)).toBe(0);
  });
});
