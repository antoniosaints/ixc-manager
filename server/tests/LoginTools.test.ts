import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LoginToolsService,
  consumptionRange,
  loginReadPermissions,
  loginToolScope,
  loginActionPermissions,
} from "../src/services/network/LoginToolsService.js";
import { OnuBusyError, type OperationStore, type OnuOperation } from "../src/services/network/OnuOperationStore.js";
import { IxcOnuApi, OnuCommandError } from "../src/integrations/ixc/IxcOnuApi.js";
import { assertReadQuery, IxcReadDatabase } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { loginToolsRoutes } from "../src/controllers/loginToolsController.js";
import { AuthService, type AuthUser } from "../src/services/AuthService.js";
import { loginTechnology } from "../src/services/network/LoginTechnology.js";
import { accessPresets, rolePermissions, permissionKeys } from "../src/config/permissions.js";

afterEach(() => vi.restoreAllMocks());
class Store implements OperationStore {
  operations = new Map<string, OnuOperation>();
  locks = new Map<string, string>();
  async prepare(op: OnuOperation) {
    const token = randomUUID();
    this.operations.set(token, structuredClone(op));
    return token;
  }
  async get(token: string, userId: number) {
    const op = this.operations.get(token);
    if (!op || op.userId !== userId) throw Object.assign(new Error("Revisão indisponível"), { statusCode: 409 });
    return structuredClone(op);
  }
  async blockage(keys: string[]) {
    return keys.some((k) => this.locks.has(k)) ? { scope: "login" as const, retryAfterSeconds: 180, state: "processing" as const } : null;
  }
  async claim(token: string, userId: number, keys: string[]) {
    const op = await this.get(token, userId);
    if (op.state !== "prepared") return { operation: op, claimed: false };
    const blockage = await this.blockage(keys);
    if (blockage) throw new OnuBusyError(blockage);
    keys.forEach((k) => this.locks.set(k, token));
    op.state = "processing";
    this.operations.set(token, op);
    return { operation: structuredClone(op), claimed: true };
  }
  async finish(token: string, op: OnuOperation) {
    this.operations.set(token, structuredClone(op));
  }
  async renew(token: string, keys: string[]) {
    if (keys.some((k) => this.locks.get(k) !== token)) throw new Error("Lock perdido");
  }
  async release(token: string, keys: string[]) {
    keys.forEach((k) => {
      if (this.locks.get(k) === token) this.locks.delete(k);
    });
  }
  async close() {}
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,login TEXT,id_cliente INTEGER,id_contrato INTEGER,id_caixa_ftth INTEGER,ip TEXT,mac TEXT,onu_mac TEXT);
 CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER);
 CREATE TABLE radpop_radio_cliente_fibra(id INTEGER PRIMARY KEY,id_login INTEGER,id_contrato INTEGER,id_transmissor INTEGER,mac TEXT,serial_number TEXT,ponid TEXT,status_autorizado TEXT,onu_compartilhada TEXT);
 CREATE TABLE radusuarios_consumo_d(id INTEGER PRIMARY KEY,id_login INTEGER,data TEXT,consumo TEXT,consumo_upload TEXT);
 CREATE TABLE radusuarios_consumo_m(id INTEGER PRIMARY KEY,id_login INTEGER,data TEXT,consumo TEXT,consumo_upload TEXT);
 INSERT INTO cliente_contrato VALUES(50,40),(51,40),(52,99);
 INSERT INTO radusuarios VALUES(60,'demo@example.test',40,50,20,'192.0.2.60','00:11:22:33:44:55','SERIAL60'),(61,'radio@example.test',40,50,0,'192.0.2.61','AA:BB:CC:DD:EE:FF',NULL);
 INSERT INTO radpop_radio_cliente_fibra VALUES(90,60,50,1,'SERIAL60','SERIAL60','1-2-3','A','N');
 INSERT INTO radusuarios_consumo_d VALUES(1,60,'2026-10-01 00:00:00','9007199254740993','100'),(2,60,'2026-10-02 00:00:00','7','200'),(3,61,'2026-10-01 00:00:00','999','999'),(4,60,'2026-09-30 00:00:00','999','999'),(5,60,'2026-10-03 00:00:00','999','999');
 INSERT INTO radusuarios_consumo_m VALUES(1,60,'2026-09-01 00:00:00','100000000000','50000000000'),(2,60,'2026-10-01 00:00:00','200000000000','60000000000'),(3,61,'2026-10-01 00:00:00','999','999');`);
  db.exec("ALTER TABLE radusuarios ADD COLUMN online TEXT");
  const select = vi.fn(async (q: any) => {
    assertReadQuery(q);
    return db.prepare(q.sql).all(...q.params);
  });
  const api = {
    record: vi.fn(async (table: string, id: number) => ({
      ...db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id),
      senha: "DO_NOT_EXPOSE",
    })),
    disconnectLogin: vi.fn().mockResolvedValue({ type: "success" }),
    clearLoginMac: vi.fn().mockResolvedValue({ type: "success" }),
    rebootOnu: vi.fn().mockResolvedValue({ type: "success" }),
  };
  const store = new Store(),
    service = new LoginToolsService({ select }, api, store, () => new Date("2026-10-09T12:00:00Z"));
  return { db, select, api, store, service };
}
const scope = { module: "support" as const, contractId: 50 };
describe("Ações do login", () => {
  it("confirma comandos individuais com IDs de login/ONU, isola usuário e não repete token", async () => {
    const { db, api, store, service } = fixture();
    const access = vi.fn().mockResolvedValue(undefined);
    try {
      for (const action of ["disconnect", "clearMac", "reboot"] as const) {
        const plan = await service.prepare(2, 60, scope, action);
        expect(JSON.stringify(plan)).not.toContain("DO_NOT_EXPOSE");
        await expect(service.execute(3, plan.token, access)).rejects.toThrow("Revisão");
        expect((await service.execute(2, plan.token, access)).state).toBe("success");
        expect((await service.execute(2, plan.token, access)).state).toBe("success");
      }
      expect(api.disconnectLogin).toHaveBeenCalledExactlyOnceWith(60);
      expect(api.clearLoginMac).toHaveBeenCalledExactlyOnceWith(60);
      expect(api.rebootOnu).toHaveBeenCalledExactlyOnceWith(90);
      expect(store.locks.size).toBe(0);
    } finally {
      db.close();
    }
  });
  it("recusa desconectar login que IXC já marcou offline, mesmo mantendo IP", async () => {
    const { db, service, api } = fixture();
    try {
      db.exec("UPDATE radusuarios SET online='N' WHERE id=60");
      await expect(service.prepare(2, 60, scope, "disconnect")).rejects.toThrow("offline no IXC");
      db.exec("UPDATE radusuarios SET online='S' WHERE id=60");
      const plan = await service.prepare(2, 60, scope, "disconnect");
      api.record.mockImplementationOnce(async () => ({
        ...db.prepare("SELECT * FROM radusuarios WHERE id=60").get(),
        online: "N",
        senha: "DO_NOT_EXPOSE",
      }));
      const result = await service.execute(2, plan.token, async () => {});
      expect(result.state).toBe("rejected");
      expect(api.disconnectLogin).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
  it("desconecta/limpa MAC de rádio sem ONU, recusa reboot sem ONU e contratos/caixas alheios", async () => {
    const { db, api, service } = fixture();
    try {
      for (const action of ["disconnect", "clearMac"] as const) {
        const p = await service.prepare(2, 61, scope, action);
        expect((await service.execute(2, p.token, async () => {})).state).toBe("success");
      }
      await expect(service.prepare(2, 61, scope, "reboot")).rejects.toThrow("ONU única");
      await expect(service.prepare(2, 60, { module: "support", contractId: 52 }, "disconnect")).rejects.toThrow("contexto");
      await expect(service.prepare(2, 60, { module: "network", boxId: 99 }, "disconnect")).rejects.toThrow("contexto");
      expect(api.rebootOnu).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
  it("impede reboot de ONU compartilhada, não autorizada, ambígua ou com cliente incompatível", async () => {
    const { db, service } = fixture();
    try {
      db.exec("UPDATE radpop_radio_cliente_fibra SET onu_compartilhada='S'");
      await expect(service.prepare(2, 60, scope, "reboot")).rejects.toThrow("compartilhada");
      db.exec("UPDATE radpop_radio_cliente_fibra SET onu_compartilhada='N',status_autorizado='NA'");
      await expect(service.prepare(2, 60, scope, "reboot")).rejects.toThrow("autorizada");
      db.exec(
        "UPDATE radpop_radio_cliente_fibra SET status_autorizado='A';INSERT INTO radpop_radio_cliente_fibra SELECT 91,id_login,id_contrato,id_transmissor,mac,serial_number,ponid,status_autorizado,onu_compartilhada FROM radpop_radio_cliente_fibra WHERE id=90"
      );
      await expect(service.prepare(2, 60, scope, "reboot")).rejects.toThrow("ONU única");
      db.exec("DELETE FROM radpop_radio_cliente_fibra WHERE id=91;UPDATE radpop_radio_cliente_fibra SET id_contrato=52");
      await expect(service.prepare(2, 60, scope, "reboot")).rejects.toThrow("ONU única");
      db.exec("UPDATE radpop_radio_cliente_fibra SET id_contrato=51");
      expect((await service.prepare(2, 60, scope, "reboot")).review.onuId).toBe(90);
    } finally {
      db.close();
    }
  });
  it("revalida vínculos e permissões antes de enviar e bloqueia comandos concorrentes", async () => {
    const { db, api, service, store } = fixture();
    try {
      const p = await service.prepare(2, 60, scope, "clearMac");
      db.exec("UPDATE radusuarios SET mac='NEW'");
      expect((await service.execute(2, p.token, async () => {})).state).toBe("rejected");
      expect(api.clearLoginMac).not.toHaveBeenCalled();
      const fresh = await service.prepare(2, 60, scope, "clearMac");
      const access = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(Object.assign(new Error("Revogada"), { statusCode: 403 }));
      expect((await service.execute(2, fresh.token, access)).state).toBe("rejected");
      expect(api.clearLoginMac).not.toHaveBeenCalled();
      const concurrent = await service.prepare(2, 60, scope, "clearMac");
      store.locks.set("login:60", "another");
      await expect(service.execute(2, concurrent.token, async () => {})).rejects.toBeInstanceOf(OnuBusyError);
      expect(api.clearLoginMac).not.toHaveBeenCalled();
    } finally {
      db.close();
    }
  });
  it("confere cadastro atual da API e trata timeout como incerto sem reenvio", async () => {
    const { db, api, service, store } = fixture();
    try {
      const original = api.record.getMockImplementation()!;
      api.record.mockImplementation(async (t, id) => ({ ...(await original(t, id)), ...(t === "radusuarios" ? { id_cliente: 99 } : {}) }));
      const bad = await service.prepare(2, 60, scope, "disconnect");
      expect((await service.execute(2, bad.token, async () => {})).state).toBe("rejected");
      expect(api.disconnectLogin).not.toHaveBeenCalled();
      api.record.mockImplementation(original);
      api.disconnectLogin.mockRejectedValue(new OnuCommandError(true));
      const p = await service.prepare(2, 60, scope, "disconnect");
      expect((await service.execute(2, p.token, async () => {})).state).toBe("unknown");
      expect((await service.execute(2, p.token, async () => {})).state).toBe("unknown");
      expect(api.disconnectLogin).toHaveBeenCalledTimes(1);
      expect(store.locks.get("login:60")).toBe(p.token);
    } finally {
      db.close();
    }
  });
  it("usa os endpoints exatos da coleção e parâmetros fixos, sem redirects/retries", async () => {
    const request = vi.fn().mockResolvedValue({ data: { type: "success" } });
    const create = vi.spyOn(axios, "create").mockReturnValue({ request } as never);
    const api = new IxcOnuApi();
    await api.disconnectLogin(60);
    await api.clearLoginMac(60);
    await api.rebootOnu(90);
    expect(request.mock.calls.map((c) => c[0])).toEqual([
      { method: "post", url: "/desconectar_clientes", data: { id: "60" } },
      { method: "post", url: "/radusuarios_25452", data: { get_id: "60" } },
      { method: "post", url: "/radpop_radio_cliente_fibra_26379", data: { id: "90" } },
    ]);
    expect(create.mock.calls.some(([c]) => c?.maxRedirects === 0)).toBe(true);
  });
});

describe("Consumo do login", () => {
  it("isola login/período, soma bytes com precisão e mantém bases diária/mensal separadas", async () => {
    const { db, service, select } = fixture();
    try {
      const data = await service.consumption(60, scope, { from: "2026-10-01", to: "2026-10-02" });
      expect(data.daily).toHaveLength(2);
      expect(data.monthly).toHaveLength(2);
      expect(data.totals).toEqual({ downloadBytes: "9007199254741000", uploadBytes: "300" });
      expect(select.mock.calls.every(([q]) => q.sql.startsWith("SELECT"))).toBe(true);
      await expect(
        service.consumption(60, { module: "support", contractId: 52 }, { from: "2026-10-01", to: "2026-10-02" })
      ).rejects.toThrow("contexto");
    } finally {
      db.close();
    }
  });
  it("não duplica consolidados, não transforma valores ausentes em zero e valida calendário/limites", async () => {
    const { db, service } = fixture();
    try {
      db.exec(
        "INSERT INTO radusuarios_consumo_d VALUES(6,60,'2026-10-01 00:00:00','7','1');UPDATE radusuarios_consumo_d SET consumo_upload=NULL WHERE id=2"
      );
      const data = await service.consumption(60, scope, { from: "2026-10-01", to: "2026-10-02" });
      expect(data.duplicatePeriods).toBe(1);
      expect(data.totals.downloadBytes).toBeNull();
      expect(data.totals.uploadBytes).toBeNull();
      expect(consumptionRange.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success).toBe(false);
      expect(consumptionRange.safeParse({ from: "2026-01-01", to: "2026-10-01" }).success).toBe(false);
      await expect(service.consumption(60, scope, { from: "2026-10-10", to: "2026-10-11" })).rejects.toThrow("futuro");
    } finally {
      db.close();
    }
  });
});

it("mapeia Fibra/Rádio pelo campo do IXC e exige concessão explícita para comandos", () => {
  expect(loginTechnology("F")).toMatchObject({ label: "Fibra", kind: "fiber" });
  expect(loginTechnology("58")).toMatchObject({ label: "Rádio 5.8 GHz", kind: "radio" });
  expect(loginTechnology("24").kind).toBe("radio");
  expect(loginTechnology(null).kind).toBe("unknown");
  expect(loginTechnology("Ethernet").kind).toBe("unknown");
  for (const permission of Object.values(loginActionPermissions)) {
    expect(permissionKeys).toContain(permission);
    expect(rolePermissions.ADMIN).toContain(permission);
    expect(rolePermissions.OPERATOR).not.toContain(permission);
    expect(rolePermissions.MANAGER).not.toContain(permission);
    expect(accessPresets.find((p) => p.key === "SUPPORT")?.permissions).not.toContain(permission);
  }
  expect(loginReadPermissions(loginToolScope.parse({ module: "network", boxId: 20 }))).toEqual([
    "network.boxes.view",
    "network.logins.view",
  ]);
});

it("protege consumo e cada comando antes do banco e exige confirmação explícita na execução", async () => {
  const authenticated = vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue(null);
  const select = vi.spyOn(IxcReadDatabase.prototype, "select");
  const prepare = vi
    .spyOn(LoginToolsService.prototype, "prepare")
    .mockResolvedValue({ token: randomUUID(), review: {} as never, expiresInSeconds: 300 });
  const consumption = vi.spyOn(LoginToolsService.prototype, "consumption").mockResolvedValue({} as never);
  const execute = vi.spyOn(LoginToolsService.prototype, "execute").mockResolvedValue({ state: "success", result: {} as never });
  const app = Fastify();
  await app.register(loginToolsRoutes, { prefix: "/api/login-tools" });
  const user: AuthUser = {
    id: 2,
    name: "Demo",
    email: "demo@example.test",
    role: "USER",
    permissions: ["support.logins.view", "support.contract.view"],
  };
  try {
    const url = "/api/login-tools/60/consumption?module=support&contractId=50&from=2026-10-01&to=2026-10-02";
    expect((await app.inject({ url })).statusCode).toBe(401);
    authenticated.mockResolvedValue({ ...user, permissions: [] });
    expect((await app.inject({ url })).statusCode).toBe(403);
    authenticated.mockResolvedValue(user);
    expect((await app.inject({ url })).statusCode).toBe(200);
    for (const action of ["disconnect", "clearMac", "reboot"] as const) {
      expect((await app.inject({ method: "POST", url: "/api/login-tools/60/plans", payload: { scope, action } })).statusCode).toBe(403);
      authenticated.mockResolvedValue({ ...user, permissions: [...user.permissions!, loginActionPermissions[action]] });
      expect((await app.inject({ method: "POST", url: "/api/login-tools/60/plans", payload: { scope, action } })).statusCode).toBe(200);
      authenticated.mockResolvedValue(user);
    }
    expect(select).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(consumption).toHaveBeenCalledTimes(1);
    expect(
      (await app.inject({ method: "POST", url: `/api/login-tools/operations/${randomUUID()}/execute`, payload: { confirmed: false } }))
        .statusCode
    ).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
