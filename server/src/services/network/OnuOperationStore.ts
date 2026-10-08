import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { env, redisConnection } from "../../config/env.js";
export interface OnuOperation {
  userId: number;
  state: "prepared" | "processing" | "success" | "rejected" | "partial" | "unknown";
  plan: Record<string, unknown>;
  result?: { state: string; message: string; onuId: number | null; step: string };
}
export interface OnuBlockage {
  scope: "olt" | "login";
  retryAfterSeconds: number | null;
  state: OnuOperation["state"] | "unavailable";
  operationToken?: string;
}
export class OnuBusyError extends Error {
  readonly statusCode = 409;
  readonly code = "ONU_OPERATION_BUSY";
  constructor(readonly blockage: OnuBlockage) {
    super("A OLT ou o login está reservado por outra operação. Esta tentativa ainda não enviou comandos.");
  }
}
const busyLua = `
 local function blockage()
   for i=2,#KEYS do
     local holder=redis.call('GET',KEYS[i])
     if holder then
       local ttl=redis.call('PTTL',KEYS[i])
       local info={scope=string.find(KEYS[i],'lock:olt:',1,true) and 'olt' or 'login',retryAfterSeconds=ttl>=0 and math.ceil(ttl/1000) or cjson.null,state='unavailable'}
       local otherRaw=redis.call('GET',ARGV[3]..holder)
       if otherRaw then
         local other=cjson.decode(otherRaw); info.state=other.state
         if other.userId==tonumber(ARGV[1]) then info.operationToken=holder end
       end
       return info
     end
   end
   return nil
 end
`;
export interface OperationStore {
  prepare(operation: OnuOperation): Promise<string>;
  get(token: string, userId: number): Promise<OnuOperation>;
  claim(token: string, userId: number, keys: string[]): Promise<{ operation: OnuOperation; claimed: boolean }>;
  blockage(keys: string[], userId: number): Promise<OnuBlockage | null>;
  finish(token: string, operation: OnuOperation): Promise<void>;
  release(token: string, keys: string[]): Promise<void>;
  renew(token: string, keys: string[]): Promise<void>;
  close(): Promise<void>;
}
const forbidden = () =>
  Object.assign(new Error("Revisão expirada ou indisponível para este usuário. Prepare novamente."), {
    statusCode: 409,
    code: "ONU_REVIEW_UNAVAILABLE",
  });
/** Short-lived plans/results and distributed locks; no credentials or ONU scripts in Redis. */
export class OnuOperationStore implements OperationStore {
  private redis?: Redis;
  private connecting?: Promise<void>;
  private readonly prefix = `${env.REDIS_PREFIX}onu_`;
  private client() {
    if (!this.redis || this.redis.status === "end") {
      this.redis = new Redis({
        ...redisConnection,
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        connectTimeout: 5000,
        retryStrategy: () => null,
      });
      this.redis.on("error", () => {});
    }
    return this.redis;
  }
  private async connected() {
    const c = this.client();
    if (c.status === "wait")
      this.connecting = c.connect().finally(() => {
        this.connecting = undefined;
      });
    if (this.connecting) await this.connecting;
    if (c.status !== "ready") throw new Error("Coordenação de operações indisponível.");
    return c;
  }
  private key(token: string) {
    return `${this.prefix}operation:${token}`;
  }
  private locks(keys: string[]) {
    return keys.map((k) => `${this.prefix}lock:${k}`);
  }
  async prepare(operation: OnuOperation) {
    const token = randomUUID(),
      c = await this.connected();
    if ((await c.set(this.key(token), JSON.stringify(operation), "PX", 300000, "NX")) !== "OK")
      throw new Error("Não foi possível preparar a revisão.");
    return token;
  }
  async get(token: string, userId: number) {
    const data = await (await this.connected()).get(this.key(token));
    if (!data) throw forbidden();
    const operation = JSON.parse(data) as OnuOperation;
    if (operation.userId !== userId) throw forbidden();
    return operation;
  }
  async claim(token: string, userId: number, keys: string[]) {
    const data = await (
      await this.connected()
    ).eval(
      `${busyLua}
      local raw=redis.call('GET',KEYS[1]); if not raw then return 'expired' end
      local op=cjson.decode(raw); if op.userId~=tonumber(ARGV[1]) then return 'expired' end
      if op.state~='prepared' then return raw end
      local busy=blockage(); if busy then return cjson.encode({busy=busy}) end
      for i=2,#KEYS do redis.call('SET',KEYS[i],ARGV[2],'PX',180000) end
      op.state='processing'; redis.call('SET',KEYS[1],cjson.encode(op),'PX',3600000)
      return 'claimed'
    `,
      1 + keys.length,
      this.key(token),
      ...this.locks(keys),
      String(userId),
      token,
      `${this.prefix}operation:`
    );
    if (data === "expired") throw forbidden();
    const decoded = data === "claimed" ? null : JSON.parse(String(data));
    if (decoded?.busy) throw new OnuBusyError(decoded.busy as OnuBlockage);
    return {
      operation: data === "claimed" ? await this.get(token, userId) : (JSON.parse(String(data)) as OnuOperation),
      claimed: data === "claimed",
    };
  }
  async blockage(keys: string[], userId: number): Promise<OnuBlockage | null> {
    const data = await (
      await this.connected()
    ).eval(
      `${busyLua}
local busy=blockage(); return busy and cjson.encode(busy) or ''`,
      keys.length + 1,
      `${this.prefix}unused`,
      ...this.locks(keys),
      String(userId),
      "",
      `${this.prefix}operation:`
    );
    return data ? (JSON.parse(String(data)) as OnuBlockage) : null;
  }
  async finish(token: string, operation: OnuOperation) {
    await (await this.connected()).set(this.key(token), JSON.stringify(operation), "PX", 3600000);
  }
  async release(token: string, keys: string[]) {
    for (const key of this.locks(keys))
      await (
        await this.connected()
      ).eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, key, token);
  }
  async renew(token: string, keys: string[]) {
    for (const key of this.locks(keys)) {
      const n = await (
        await this.connected()
      ).eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('PEXPIRE',KEYS[1],180000) end return 0", 1, key, token);
      if (n !== 1) throw new Error("Coordenação de operação perdida.");
    }
  }
  async close() {
    this.redis?.disconnect();
  }
}
