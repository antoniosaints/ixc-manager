import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import axios from "axios";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IxcOnuApi, OnuCommandError, pendingOnuDto, type OnuRow } from "../src/integrations/ixc/IxcOnuApi.js";
import { assertReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { OnuService, onuListQuery, onuPlanRequest } from "../src/services/network/OnuService.js";
import { OnuBusyError, type OnuOperation, type OperationStore } from "../src/services/network/OnuOperationStore.js";
import { onuRoutes } from "../src/controllers/onuController.js";
import { AuthService } from "../src/services/AuthService.js";
import { accessPresets, effectivePermissions } from "../src/config/permissions.js";
afterEach(() => vi.restoreAllMocks());
function pendingRow(overrides: OnuRow = {}) {
  const fields = { ID: "1", CHASSI: 1, SLOT: 2, PON: 3, MAC: "DEMO12345678", MODELO: "Modelo fictício", PONID: "1-2-3", ...overrides };
  const scalar = (v: unknown) => (typeof v === "number" ? `i:${v};` : `s:${Buffer.byteLength(String(v))}:"${v}";`);
  return {
    id: Buffer.from(
      `a:7:{${Object.entries(fields)
        .map(([k, v]) => scalar(k) + scalar(v))
        .join("")}}`
    ).toString("base64"),
    cell: ["OLT demonstração", "999", "1", "2", "3", "Modelo", "DEMO12345678"],
  };
}
class MemoryStore implements OperationStore {
  ops = new Map<string, OnuOperation>();
  locks = new Map<string, string>();
  async prepare(op: OnuOperation) {
    const token = randomUUID();
    this.ops.set(token, structuredClone(op));
    return token;
  }
  async get(token: string, userId: number) {
    const op = this.ops.get(token);
    if (!op || op.userId !== userId) throw Object.assign(new Error("Revisão indisponível"), { statusCode: 409 });
    return structuredClone(op);
  }
  async claim(token: string, userId: number, keys: string[]) {
    const op = await this.get(token, userId);
    if (op.state !== "prepared") return { operation: op, claimed: false };
    const busy = await this.blockage(keys, userId);
    if (busy) throw new OnuBusyError(busy);
    for (const k of keys) this.locks.set(k, token);
    op.state = "processing";
    this.ops.set(token, structuredClone(op));
    return { operation: op, claimed: true };
  }
  async blockage(keys: string[], userId: number) {
    for (const key of keys) {
      const holder = this.locks.get(key);
      if (holder) {
        const op = this.ops.get(holder);
        return {
          scope: key.startsWith("olt:") ? ("olt" as const) : ("login" as const),
          retryAfterSeconds: 180,
          state: op?.state ?? ("unavailable" as const),
          ...(op?.userId === userId ? { operationToken: holder } : {}),
        };
      }
    }
    return null;
  }
  async finish(token: string, op: OnuOperation) {
    this.ops.set(token, structuredClone(op));
  }
  async renew(token: string, keys: string[]) {
    if (keys.some((k) => this.locks.get(k) !== token)) throw new Error("Lock perdido");
  }
  async release(token: string, keys: string[]) {
    for (const k of keys) if (this.locks.get(k) === token) this.locks.delete(k);
  }
  async close() {}
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE radpop_radio(id INTEGER PRIMARY KEY,descricao TEXT,ativo TEXT,conexao TEXT,fabricante_modelo TEXT,perfil_fibra_padrao INTEGER);
 CREATE TABLE radpop_radio_cliente_fibra_perfil(id INTEGER PRIMARY KEY,nome TEXT,fabricante_modelo TEXT);
 CREATE TABLE rad_hardware(id INTEGER PRIMARY KEY,hardware TEXT,ativo TEXT,tipo TEXT);
 CREATE TABLE df_projeto(id INTEGER PRIMARY KEY,nome TEXT,status TEXT);
 CREATE TABLE rad_caixa_ftth(id INTEGER PRIMARY KEY,descricao TEXT,status TEXT,id_transmissor INTEGER,id_projeto INTEGER,capacidade INTEGER);
 CREATE TABLE cliente(id INTEGER PRIMARY KEY,razao TEXT,cnpj_cpf TEXT);
 CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER,contrato TEXT,status TEXT);
 CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,login TEXT,id_cliente INTEGER,id_contrato INTEGER,ativo TEXT,id_caixa_ftth INTEGER,ftth_porta INTEGER);
 CREATE TABLE radpop_radio_cliente_fibra(id INTEGER PRIMARY KEY,id_transmissor INTEGER,nome TEXT,mac TEXT,ponid TEXT,onu_tipo TEXT,status_autorizado TEXT,onu_compartilhada TEXT,id_login INTEGER,id_contrato INTEGER,id_perfil INTEGER,id_hardware INTEGER,id_projeto INTEGER,id_caixa_ftth INTEGER,porta_ftth INTEGER,vlan INTEGER);
 INSERT INTO radpop_radio VALUES(1,'OLT demonstração','S','58','FH',5),(2,'Roteador','S','58','M',0),(3,'OLT inativa','N','58','FH',5);
 INSERT INTO radpop_radio_cliente_fibra_perfil VALUES(5,'Bridge demo','FH'),(6,'Outro fabricante','NK');
 INSERT INTO rad_hardware VALUES(7,'Hardware demo','S','F'),(8,'Hardware inativo','N','F');
 INSERT INTO df_projeto VALUES(10,'Zona demonstração','A'),(11,'Zona antiga','I');
 INSERT INTO rad_caixa_ftth VALUES(20,'CTO demonstração','A',1,10,8),(21,'CTO de outra OLT','A',3,10,8);
 INSERT INTO cliente VALUES(40,'Cliente demonstração','123.456.789-01');
 INSERT INTO cliente_contrato VALUES(50,40,'Plano demo','A'),(51,40,'Contrato cancelado','I'),(52,99,'Outro cliente','A');
 INSERT INTO radusuarios VALUES(60,'demo@example.test',40,50,'S',20,1),(61,'outro@example.test',40,50,'S',20,2),(62,'inativo@example.test',40,51,'N',20,3);
 INSERT INTO radpop_radio_cliente_fibra VALUES(90,1,'ONU anterior','PREVIOUS123','1-2-4','DEMO','A','N',61,50,5,7,10,20,2,100);
 `);
  const reads = vi.fn(async (q: any) => {
    assertReadQuery(q);
    return db.prepare(q.sql).all(...q.params);
  });
  const records = new Map<string, OnuRow>();
  records.set("radpop_radio:1", { id: "1", descricao: "OLT demonstração", ativo: "S", conexao: "58", fabricante_modelo: "FH" });
  records.set("radpop_radio:3", { id: "3", descricao: "OLT inativa", ativo: "N", conexao: "58", fabricante_modelo: "FH" });
  records.set("radpop_radio_cliente_fibra_perfil:5", {
    id: "5",
    nome: "Bridge demo",
    fabricante_modelo: "FH",
    comando: "profile demo_script SECRET_NOT_EXPOSED",
  });
  records.set("radpop_radio_cliente_fibra_perfil:6", { id: "6", nome: "Perfil incompatível", fabricante_modelo: "NK", comando: "other" });
  for (const n of [50, 51, 52])
    records.set("cliente_contrato:" + n, {
      id: String(n),
      id_cliente: n === 52 ? "99" : "40",
      status: n === 51 ? "I" : "A",
      contrato: "Plano demo",
    });
  for (const n of [60, 61, 62])
    records.set("radusuarios:" + n, {
      id: String(n),
      id_cliente: "40",
      id_contrato: n === 62 ? "51" : "50",
      ativo: n === 62 ? "N" : "S",
      login: "demo@example.test",
    });
  records.set("radpop_radio_cliente_fibra:90", {
    id: "90",
    id_transmissor: "1",
    nome: "ONU anterior",
    mac: "PREVIOUS123",
    ponid: "1-2-4",
    id_login: "61",
    id_contrato: "50",
    id_perfil: "5",
    id_hardware: "7",
    id_projeto: "10",
    id_caixa_ftth: "20",
    porta_ftth: "2",
    vlan: "100",
  });
  const pending = vi.fn(async () => [pendingRow()]);
  const api = {
    pending,
    record: vi.fn(async (table: string, n: number) => {
      const r = records.get(table + ":" + n);
      if (!r) throw Object.assign(new Error("Registro ausente"), { statusCode: 404 });
      return { ...r };
    }),
    create: vi.fn(async () => {
      const r = {
        id: "100",
        id_transmissor: "1",
        nome: "Nova ONU",
        mac: "DEMO12345678",
        ponid: "1-2-3",
        id_login: "0",
        id_contrato: "0",
        id_perfil: "0",
        id_hardware: "0",
        id_projeto: "0",
        id_caixa_ftth: "0",
        porta_ftth: "0",
        vlan: "0",
        senha_onu_cliente: "PASSWORD_PRIVATE",
        script_onu_cliente: "SCRIPT_PRIVATE",
      };
      records.set("radpop_radio_cliente_fibra:100", r);
      db.exec(
        "INSERT INTO radpop_radio_cliente_fibra(id,id_transmissor,mac,ponid,status_autorizado,onu_compartilhada,id_login,id_caixa_ftth,porta_ftth) VALUES(100,1,'DEMO12345678','1-2-3','NA','N',0,0,0)"
      );
      return 100;
    }),
    update: vi.fn(async (n: number, fields: OnuRow) => {
      records.set("radpop_radio_cliente_fibra:" + n, { ...records.get("radpop_radio_cliente_fibra:" + n), ...fields });
      for (const k of [
        "id_transmissor",
        "id_login",
        "id_contrato",
        "id_perfil",
        "id_hardware",
        "id_projeto",
        "id_caixa_ftth",
        "porta_ftth",
        "vlan",
        "nome",
      ])
        db.prepare(`UPDATE radpop_radio_cliente_fibra SET ${k}=? WHERE id=?`).run(fields[k] ?? "", n);
      return { type: "success" };
    }),
    provision: vi.fn(async (n: number) => {
      db.prepare("UPDATE radpop_radio_cliente_fibra SET status_autorizado='A' WHERE id=?").run(n);
      return { type: "success" };
    }),
    deauthorize: vi.fn(async (n: number) => {
      db.prepare("UPDATE radpop_radio_cliente_fibra SET status_autorizado='NA' WHERE id=?").run(n);
      return { type: "success" };
    }),
  };
  const store = new MemoryStore(),
    service = new OnuService({ withSnapshot: async (callback) => callback({ select: reads }) } as never, api as never, store);
  const input = onuPlanRequest.parse({
    action: "authorize",
    oltId: 1,
    pendingId: pendingRow().id,
    configuration: {
      profileId: 5,
      hardwareId: 7,
      projectId: 10,
      boxId: 20,
      port: 1,
      loginId: 60,
      contractId: 50,
      vlan: 100,
      name: "demo@example.test",
    },
  });
  return { db, reads, records, api, store, service, input };
}
describe("Fluxo de ONUs via IXC", () => {
  it("extrai OLT do identificador PHP escalar, não da coluna da grade; rejeita objetos e campos inválidos", () => {
    expect(pendingOnuDto(pendingRow())).toMatchObject({
      oltId: 1,
      chassis: 1,
      slot: 2,
      ponNumber: 3,
      serial: "DEMO12345678",
      model: "Modelo fictício",
    });
    for (const row of [
      { id: "1" },
      { id: Buffer.from('O:1:"x":0:{}').toString("base64") },
      pendingRow({ ID: "0" }),
      pendingRow({ PONID: "invalid" }),
      pendingRow({ SLOT: -1 }),
    ])
      expect(() => pendingOnuDto(row)).toThrow();
    const decoded = Buffer.from(pendingRow().id, "base64").toString();
    expect(() => pendingOnuDto({ id: Buffer.from(decoded.replace('s:2:"ID"', 's:9:"ID"')).toString("base64") })).toThrow();
  });
  it("lista OLTs por vínculos/perfis, consulta só SELECT e não expõe scripts ou credenciais", async () => {
    const f = fixture();
    try {
      expect((await f.service.options(1)).olts.map((r) => r.id)).toEqual([1]);
      expect((await f.service.pending(onuListQuery.parse({ oltId: 1 }))).items[0]).toMatchObject({ oltId: 1, canAuthorize: true });
      expect(f.api.pending).toHaveBeenCalledWith(1);
      expect((await f.service.registered(onuListQuery.parse({ status: "A" }))).total).toBe(1);
      expect((await f.service.detail(90)).onu.authorization).toBe("A");
      expect(JSON.stringify(await f.service.detail(90))).not.toMatch(/senha|comandos|script/);
      expect((await f.service.logins("60", "loginId")).items).toHaveLength(1);
      expect((await f.service.logins("12345678901", "document")).items).toHaveLength(2);
      expect((await f.service.ports(20, 60)).ports.slice(0, 3)).toEqual([
        { port: 1, occupied: false },
        { port: 2, occupied: true },
        { port: 3, occupied: false },
      ]);
      expect(f.api.create).not.toHaveBeenCalled();
      expect(f.api.update).not.toHaveBeenCalled();
      expect(f.api.provision).not.toHaveBeenCalled();
      expect(f.api.deauthorize).not.toHaveBeenCalled();
    } finally {
      f.db.close();
    }
  });
  it("busca contratos ativos por ID/cliente/documento e limita logins ao contrato e ao cliente correto", async () => {
    const f = fixture();
    try {
      f.db.exec("INSERT INTO cliente VALUES(41,'Sem documento',''); INSERT INTO cliente_contrato VALUES(55,41,'Plano diferente','A')");
      expect((await f.service.contracts("50")).items.map((c) => c.id)).toEqual([50]);
      expect((await f.service.contracts("demonstração")).items.map((c) => c.id)).toEqual([50]);
      expect((await f.service.contracts("12345678901")).items.map((c) => c.id)).toEqual([50]);
      expect((await f.service.contracts("51")).items).toEqual([]);
      await expect(f.service.contracts("ab")).rejects.toThrow("3 caracteres");
      expect((await f.service.contractLogins(50, "")).items.map((l) => l.id)).toEqual([61, 60]);
      expect((await f.service.contractLogins(50, "60")).items.map((l) => l.id)).toEqual([60]);
      expect((await f.service.contractLogins(51, "")).items).toEqual([]);
      f.db.exec("INSERT INTO radusuarios VALUES(63,'mismatch@example.test',40,52,'S',20,4)");
      expect((await f.service.contractLogins(52, "")).items).toEqual([]);
      expect((await f.service.contractLogins(50, "%")).items).toEqual([]);
      expect(f.api.create).not.toHaveBeenCalled();
    } finally {
      f.db.close();
    }
  });
  it("expõe somente o template do perfil compatível e o mantém fora dos planos persistidos", async () => {
    const f = fixture();
    try {
      const template = await f.service.profile(5, 1);
      expect(template).toEqual({ id: 5, name: "Bridge demo", script: "profile demo_script SECRET_NOT_EXPOSED" });
      await expect(f.service.profile(6, 1)).rejects.toThrow("incompatível");
      await expect(f.service.profile(5, 3)).rejects.toThrow("incompatível");
      const review = await f.service.prepare(1, f.input);
      expect(review.profileScript).toBe(template.script);
      expect(review.review).toMatchObject({
        profileId: 5,
        hardwareId: 7,
        projectId: 10,
        boxId: 20,
        loginId: 60,
        contractId: 50,
        vlan: 100,
        port: 1,
      });
      expect(JSON.stringify(f.store.ops.get(review.token))).not.toContain(template.script);
      expect(JSON.stringify(review)).not.toMatch(/PASSWORD_PRIVATE|SCRIPT_PRIVATE/);
      expect(f.api.create).not.toHaveBeenCalled();
    } finally {
      f.db.close();
    }
  });
  it.each([0, undefined])("permite revisar e autorizar sem hardware (%s), mantendo a validação dos demais campos", async (hardwareId) => {
    const f = fixture();
    try {
      const input = structuredClone(f.input);
      if (input.action !== "authorize") throw new Error();
      const parsed = onuPlanRequest.parse({ ...input, configuration: { ...input.configuration, hardwareId } });
      const review = await f.service.prepare(1, parsed);
      expect(review.review).toMatchObject({ hardwareId: null, hardwareName: "Não selecionado", profileId: 5 });
      expect(f.reads.mock.calls.some(([q]) => q.sql.includes("FROM rad_hardware WHERE id="))).toBe(false);
      const result = await f.service.execute(1, review.token, async () => {});
      expect(result.state).toBe("success");
      expect(f.api.update).toHaveBeenCalledWith(100, expect.objectContaining({ id_hardware: "0", id_perfil: "5" }));
      expect(f.api.provision).toHaveBeenCalledOnce();
    } finally {
      f.db.close();
    }
  });
  it.each([
    [{ profileId: 6 }, "Perfil incompatível"],
    [{ hardwareId: 8 }, "hardware"],
    [{ projectId: 11 }, "projeto"],
    [{ boxId: 21 }, "caixa"],
    [{ port: 9 }, "capacidade"],
    [{ port: 2 }, "ocupada"],
    [{ loginId: 62, contractId: 51 }, "ativos"],
    [{ contractId: 52 }, "mesmo cliente"],
    [{ loginId: 61, port: 4 }, "outra ONU autorizada"],
  ])("bloqueia seleção inválida %j antes de criar ou gravar", async (patch, message) => {
    const f = fixture();
    try {
      const input = structuredClone(f.input);
      if (input.action !== "authorize") throw new Error();
      Object.assign(input.configuration, patch);
      await expect(f.service.prepare(1, input)).rejects.toThrow(message);
      expect(f.api.create).not.toHaveBeenCalled();
      expect(f.store.ops.size).toBe(0);
    } finally {
      f.db.close();
    }
  });
  it("revisa, cria, preserva campos privados no PUT e grava só após reler os vínculos; duplicata não repete", async () => {
    const f = fixture();
    try {
      const review = await f.service.prepare(1, f.input);
      expect(JSON.stringify(f.store.ops.get(review.token))).not.toMatch(/SECRET_NOT_EXPOSED|PASSWORD_PRIVATE|SCRIPT_PRIVATE/);
      expect(f.api.create).not.toHaveBeenCalled();
      const access = vi.fn(async () => {}),
        result = await f.service.execute(1, review.token, access);
      expect(result.state).toBe("success");
      expect(f.api.create).toHaveBeenCalledTimes(1);
      expect(f.api.update).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          id_perfil: "5",
          vlan: "100",
          id_login: "60",
          id_contrato: "50",
          senha_onu_cliente: "PASSWORD_PRIVATE",
          script_onu_cliente: "SCRIPT_PRIVATE",
          comandos: "profile demo_script SECRET_NOT_EXPOSED",
        })
      );
      expect(f.api.update.mock.calls[0]![1]).not.toHaveProperty("status_autorizado");
      expect(f.api.provision).toHaveBeenCalledWith(100);
      expect(access).toHaveBeenCalledTimes(3);
      expect(f.api.create.mock.invocationCallOrder[0]).toBeLessThan(f.api.update.mock.invocationCallOrder[0]!);
      expect(f.api.update.mock.invocationCallOrder[0]).toBeLessThan(f.api.provision.mock.invocationCallOrder[0]!);
      expect((await f.service.detail(100)).onu.authorization).toBe("A");
      expect((await f.service.execute(1, review.token, access)).state).toBe("success");
      expect(f.api.provision).toHaveBeenCalledTimes(1);
      expect(f.store.locks.size).toBe(0);
    } finally {
      f.db.close();
    }
  });
  it("identifica bloqueio antes de enviar comandos e permite consultar a operação anterior só ao proprietário", async () => {
    const f = fixture();
    try {
      const first = await f.service.prepare(1, f.input),
        second = await f.service.prepare(1, f.input),
        otherUser = await f.service.prepare(2, f.input);
      await f.store.claim(first.token, 1, ["olt:1", "login:60"]);
      await expect(f.service.execute(1, second.token, async () => {})).rejects.toMatchObject({
        code: "ONU_OPERATION_BUSY",
        blockage: { scope: "olt", retryAfterSeconds: 180, state: "processing", operationToken: first.token },
      });
      expect(await f.service.status(1, second.token)).toMatchObject({ state: "prepared", blockage: { operationToken: first.token } });
      expect((await f.service.status(2, otherUser.token)).blockage).not.toHaveProperty("operationToken");
      expect(f.api.create).not.toHaveBeenCalled();
      await f.store.release(first.token, ["olt:1", "login:60"]);
      expect(await f.service.status(1, second.token)).not.toHaveProperty("blockage");
      expect((await f.service.execute(1, second.token, async () => {})).state).toBe("success");
    } finally {
      f.db.close();
    }
  });
  it("rejeita revisão de outro usuário, expirada, ONU removida ou perfil alterado", async () => {
    const f = fixture();
    try {
      const review = await f.service.prepare(1, f.input);
      await expect(f.service.execute(2, review.token, async () => {})).rejects.toMatchObject({ statusCode: 409 });
      f.records.get("radpop_radio_cliente_fibra_perfil:5")!.comando = "script mudou";
      expect((await f.service.execute(1, review.token, async () => {})).state).toBe("rejected");
      expect(f.api.create).not.toHaveBeenCalled();
      const second = await f.service.prepare(1, f.input);
      f.api.pending.mockResolvedValueOnce([]);
      expect((await f.service.execute(1, second.token, async () => {})).state).toBe("rejected");
      f.store.ops.delete(second.token);
      await expect(f.service.status(1, second.token)).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      f.db.close();
    }
  });
  it("não repete nem reverte um comando sem confirmação; mantém a trava de segurança", async () => {
    const f = fixture();
    try {
      const review = await f.service.prepare(1, f.input);
      f.api.provision.mockRejectedValueOnce(new OnuCommandError(true));
      const r = await f.service.execute(1, review.token, async () => {});
      expect(r).toMatchObject({ state: "unknown", result: { onuId: 100, step: "provisioning" } });
      expect(f.store.locks.size).toBe(2);
      await f.service.execute(1, review.token, async () => {});
      expect(f.api.provision).toHaveBeenCalledTimes(1);
      expect(f.api.deauthorize).not.toHaveBeenCalled();
      expect((await f.service.status(1, review.token)).state).toBe("unknown");
    } finally {
      f.db.close();
    }
  });
  it("confere o resultado do PUT antes de gravar e identifica operação incompleta", async () => {
    const f = fixture();
    try {
      const review = await f.service.prepare(1, f.input);
      f.api.update.mockImplementationOnce(async () => ({ type: "success" }));
      const r = await f.service.execute(1, review.token, async () => {});
      expect(r).toMatchObject({ state: "partial", result: { onuId: 100, step: "configuration" } });
      expect(f.api.provision).not.toHaveBeenCalled();
    } finally {
      f.db.close();
    }
  });
  it("revalida acesso em cada comando e para se for revogado durante a autorização", async () => {
    const f = fixture();
    try {
      const review = await f.service.prepare(1, f.input);
      let calls = 0;
      const r = await f.service.execute(1, review.token, async () => {
        if (++calls === 2) throw Object.assign(new Error("Permissão revogada"), { statusCode: 403 });
      });
      expect(r.state).toBe("partial");
      expect(f.api.create).toHaveBeenCalledTimes(1);
      expect(f.api.update).not.toHaveBeenCalled();
      expect(f.api.provision).not.toHaveBeenCalled();
    } finally {
      f.db.close();
    }
  });
  it("desautoriza somente ONU autorizada e não compartilhada, preservando o cadastro", async () => {
    const f = fixture();
    try {
      const input = onuPlanRequest.parse({ action: "deauthorize", onuId: 90 });
      f.db.exec("UPDATE radpop_radio_cliente_fibra SET onu_compartilhada='S' WHERE id=90");
      await expect(f.service.prepare(1, input)).rejects.toThrow("compartilhada");
      f.db.exec("UPDATE radpop_radio_cliente_fibra SET onu_compartilhada='N' WHERE id=90");
      const p = await f.service.prepare(1, input);
      expect((await f.service.execute(1, p.token, async () => {})).state).toBe("success");
      expect(f.api.deauthorize).toHaveBeenCalledWith(90);
      expect(f.db.prepare("SELECT COUNT(*) n FROM radpop_radio_cliente_fibra WHERE id=90").get()!.n).toBe(1);
      await expect(f.service.prepare(1, input)).rejects.toThrow("autorizada");
    } finally {
      f.db.close();
    }
  });
  it("não concede escrita aos modelos de consulta e exige leitura + autorização no servidor", async () => {
    for (const p of accessPresets) expect(p.permissions).not.toContain("network.equipment.authorize");
    expect(effectivePermissions("ADMIN", [])).toContain("network.equipment.authorize");
    let permissions: any[] = [];
    vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async () => ({
      id: 1,
      name: "Demo",
      email: "demo@example.test",
      role: "USER",
      permissions,
    }));
    const prepare = vi
      .spyOn(OnuService.prototype, "prepare")
      .mockResolvedValue({ token: randomUUID(), review: { action: "authorize" }, expiresInSeconds: 300 });
    const execute = vi
      .spyOn(OnuService.prototype, "execute")
      .mockResolvedValue({ state: "success", result: { state: "success", message: "Fictício", onuId: 1, step: "provisioning" } });
    const app = Fastify();
    await app.register(onuRoutes, { prefix: "/api/network/onus" });
    const f = fixture();
    try {
      for (const route of ["/pending", "/registered", "/options", "/1", "/logins?search=demo", "/boxes/1/ports"])
        expect((await app.inject("/api/network/onus" + route)).statusCode).toBe(403);
      for (const perms of [[], ["network.onus.view"], ["network.equipment.authorize"]]) {
        permissions = perms;
        for (const route of ["/contracts?search=50", "/contracts/50/logins", "/profiles/5?oltId=1"])
          expect((await app.inject("/api/network/onus" + route)).statusCode).toBe(403);
        expect((await app.inject({ method: "POST", url: "/api/network/onus/plans", payload: f.input })).statusCode).toBe(403);
      }
      expect(prepare).not.toHaveBeenCalled();
      permissions = ["network.onus.view", "network.equipment.authorize"];
      const plan = await app.inject({ method: "POST", url: "/api/network/onus/plans", payload: f.input });
      expect(plan.statusCode).toBe(200);
      expect(plan.headers["cache-control"]).toBe("no-store");
      const url = "/api/network/onus/operations/" + plan.json().token + "/execute";
      for (const payload of [{}, { confirmed: false }, { confirmed: true, path: "/arbitrary" }])
        expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(400);
      expect(execute).not.toHaveBeenCalled();
      execute.mockRejectedValueOnce(new OnuBusyError({ scope: "olt", retryAfterSeconds: 42, state: "processing" }));
      const busy = await app.inject({ method: "POST", url, payload: { confirmed: true } });
      expect(busy.statusCode).toBe(409);
      expect(busy.headers["retry-after"]).toBe("42");
      expect(busy.json()).toMatchObject({
        code: "ONU_OPERATION_BUSY",
        blockage: { scope: "olt", retryAfterSeconds: 42, state: "processing" },
      });
      expect((await app.inject({ method: "POST", url, payload: { confirmed: true } })).statusCode).toBe(200);
      expect((await app.inject({ method: "DELETE", url: "/api/network/onus/90" })).statusCode).toBe(404);
    } finally {
      await app.close();
      f.db.close();
    }
  });
});
describe("Fronteira de comandos de ONU", () => {
  it("usa somente os endpoints documentados, sem listar nos writes, redirecionamento ou repetição", async () => {
    const requests = vi.fn(async () => ({ data: { type: "success", id: "100" } })),
      get = vi.fn(async () => ({ data: { rows: [], total: "0", page: "1" } }));
    const configs: any[] = [];
    vi.spyOn(axios, "create").mockImplementation((config: any) => {
      configs.push({ ...config, headers: { ...config?.headers, Authorization: "<redacted>" } });
      return { request: requests, get } as never;
    });
    const api = new IxcOnuApi();
    await api.pending(1);
    expect(get).toHaveBeenCalledWith(
      "/fh_onu_nao_autorizadas",
      expect.objectContaining({ headers: { ixcsoft: "listar" }, data: { grid_param: '[{"TB":"id_olt","OP":"=","P":"1"}]' } })
    );
    expect(await api.create("opaque")).toBe(100);
    await api.update(100, { nome: "Demo" });
    await api.provision(100);
    await api.deauthorize(100);
    expect(requests.mock.calls.map((c) => (c[0] as any).url)).toEqual([
      "/fh_onu_nao_autorizadas_22396",
      "/radpop_radio_cliente_fibra/100",
      "/botao_gravar_dispositivo_22408",
      "/botao_excluir_dispositivo_22434",
    ]);
    expect(configs.find((c) => c.maxRedirects === 0)?.headers).not.toHaveProperty("ixcsoft");
    expect(configs.find((c) => c.maxRedirects === 0)?.timeout).toBe(30000);
    requests.mockRejectedValueOnce(new Error("private upstream error"));
    await expect(api.provision(100)).rejects.toMatchObject({ uncertain: true });
    expect(requests).toHaveBeenCalledTimes(5);
    requests.mockResolvedValueOnce({ data: { type: "error", id: "100" } });
    await expect(api.deauthorize(100)).rejects.toMatchObject({ uncertain: false });
    requests.mockResolvedValueOnce({ data: { type: "success", id: "0" } });
    await expect(api.create("opaque")).rejects.toMatchObject({ uncertain: true });
  });
  it("aceita apenas o envelope vazio observado do IXC", async () => {
    const get = vi.fn();
    vi.spyOn(axios, "create").mockReturnValue({ get } as never);
    const api = new IxcOnuApi();
    for (const data of [
      { page: 1, total: 0, type: "error", message: "Nenhuma onu disponivel" },
      { page: 1, total: "0" },
    ]) {
      get.mockResolvedValueOnce({ data });
      expect(await api.pending(1)).toEqual([]);
    }
    get.mockResolvedValueOnce({ data: { page: 1, total: 0, type: "error", message: "Falha ao comunicar com a OLT" } });
    await expect(api.pending(1)).rejects.toThrow();
  });
  it("aceita estado ainda não preenchido apenas no cadastro criado pela operação, sem assumir que está autorizado", async () => {
    const f = fixture();
    try {
      const create = f.api.create.getMockImplementation()!;
      f.api.create.mockImplementationOnce(async () => {
        const id = await create();
        f.db.exec("UPDATE radpop_radio_cliente_fibra SET status_autorizado=NULL WHERE id=100");
        return id;
      });
      const plan = await f.service.prepare(1, f.input);
      expect((await f.service.execute(1, plan.token, async () => {})).state).toBe("success");
    } finally {
      f.db.close();
    }
  });
  it("rejeita resultados de pendências incompletos e erros, sem interpretar como lista vazia", async () => {
    const get = vi.fn();
    vi.spyOn(axios, "create").mockReturnValue({ get } as never);
    const api = new IxcOnuApi();
    for (const data of [
      { type: "error", total: "0", rows: [] },
      { total: 2, rows: [pendingRow()] },
      { total: "bad", rows: [] },
    ]) {
      get.mockResolvedValueOnce({ data });
      await expect(api.pending()).rejects.toThrow();
    }
  });
});
