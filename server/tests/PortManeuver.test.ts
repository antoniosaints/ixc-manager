import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortManeuverService, portManeuverInput } from "../src/services/network/PortManeuverService.js";
import { OnuBusyError, type OperationStore, type OnuOperation } from "../src/services/network/OnuOperationStore.js";
import { OnuCommandError } from "../src/integrations/ixc/IxcOnuApi.js";
import { assertReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { portManeuverRoutes } from "../src/controllers/portManeuverController.js";
import { AuthService } from "../src/services/AuthService.js";
import { permissionKeys, rolePermissions, accessPresets } from "../src/config/permissions.js";

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
    return keys.some((key) => this.locks.has(key))
      ? { scope: "login" as const, retryAfterSeconds: 180, state: "processing" as const }
      : null;
  }
  async claim(token: string, userId: number, keys: string[]) {
    const op = await this.get(token, userId);
    if (op.state !== "prepared") return { operation: op, claimed: false };
    const busy = await this.blockage(keys);
    if (busy) throw new OnuBusyError(busy);
    keys.forEach((key) => this.locks.set(key, token));
    op.state = "processing";
    this.operations.set(token, op);
    return { operation: op, claimed: true };
  }
  async finish(token: string, op: OnuOperation) {
    this.operations.set(token, structuredClone(op));
  }
  async renew(token: string, keys: string[]) {
    if (keys.some((key) => this.locks.get(key) !== token)) throw new Error("Reserva perdida");
  }
  async release(token: string, keys: string[]) {
    for (const key of keys) if (this.locks.get(key) === token) this.locks.delete(key);
  }
  async close() {}
}
function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(`CREATE TABLE rad_caixa_ftth(id INTEGER PRIMARY KEY,descricao TEXT,status TEXT,capacidade INTEGER,id_transmissor INTEGER);
    CREATE TABLE cliente(id INTEGER PRIMARY KEY,razao TEXT);
    CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER);
    CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,login TEXT,id_cliente INTEGER,id_contrato INTEGER,id_caixa_ftth INTEGER,ftth_porta INTEGER,ativo TEXT,tipo_conexao_mapa TEXT,onu_mac TEXT,id_reserva_rede_neutra INTEGER,senha TEXT,autenticacao TEXT,mac TEXT,id_grupo INTEGER);
    CREATE TABLE radpop_radio_cliente_fibra(id INTEGER PRIMARY KEY,id_login INTEGER,id_contrato INTEGER,id_caixa_ftth INTEGER,porta_ftth INTEGER,id_transmissor INTEGER,mac TEXT,serial_number TEXT,onu_compartilhada TEXT,onu_rede_neutra TEXT,status_autorizado TEXT,ponid TEXT,id_perfil INTEGER,vlan INTEGER);
    CREATE TABLE reserva_rede_neutra(id INTEGER PRIMARY KEY,caixa_ftth TEXT,porta_ftth INTEGER,data_cancelamento TEXT);
    INSERT INTO rad_caixa_ftth VALUES(20,'CTO A','A',8,1),(21,'CTO B','A',8,1);
    INSERT INTO cliente VALUES(40,'Cliente A'),(41,'Cliente B');
    INSERT INTO cliente_contrato VALUES(50,40),(51,41);
    INSERT INTO radusuarios VALUES(60,'a@example.test',40,50,20,1,'S','F','SERIAL60',0,'PRIVATE_PASSWORD','L','MAC60',7),(61,'b@example.test',41,51,20,2,'S','F','SERIAL61',0,'PRIVATE_PASSWORD','L','MAC61',7),(62,'c@example.test',41,51,21,1,'S','F',NULL,0,'PRIVATE_PASSWORD','L','MAC62',7);
    INSERT INTO radpop_radio_cliente_fibra VALUES(90,60,50,20,1,1,'SERIAL60','SERIAL60','N','N','A','1-2-3',7,10),(91,61,51,20,2,1,'SERIAL61','SERIAL61','N','N','A','1-2-4',7,10);`);
  const select = vi.fn(async (q: any) => {
    assertReadQuery(q);
    return sql.prepare(q.sql).all(...q.params);
  });
  const db = { withSnapshot: vi.fn(async (read: any) => read({ select })), close: vi.fn(async () => {}) };
  const api = {
    record: vi.fn(async (table: string, id: number) => ({
      ...sql.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id),
      database_only: "OMIT",
      online: "S",
      senha_router1: "PRIVATE_ROUTER_PASSWORD",
      tempo_conectado: "999",
    })),
    updateLogin: vi.fn(async (id: number, payload: Record<string, unknown>) => {
      sql
        .prepare("UPDATE radusuarios SET id_caixa_ftth=?,ftth_porta=? WHERE id=?")
        .run(Number(payload.id_caixa_ftth), Number(payload.ftth_porta), id);
      return { type: "success" };
    }),
    update: vi.fn(async (id: number, payload: Record<string, unknown>) => {
      sql
        .prepare("UPDATE radpop_radio_cliente_fibra SET id_caixa_ftth=?,porta_ftth=? WHERE id=?")
        .run(Number(payload.id_caixa_ftth), Number(payload.porta_ftth), id);
      return { type: "success" };
    }),
  };
  const store = new Store(),
    service = new PortManeuverService(db as any, api as any, store);
  const ports = () => [
    sql.prepare("SELECT ftth_porta port FROM radusuarios WHERE id=60").get()!.port,
    sql.prepare("SELECT ftth_porta port FROM radusuarios WHERE id=61").get()!.port,
    sql.prepare("SELECT porta_ftth port FROM radpop_radio_cliente_fibra WHERE id=90").get()!.port,
    sql.prepare("SELECT porta_ftth port FROM radpop_radio_cliente_fibra WHERE id=91").get()?.port,
  ];
  return { sql, db, select, api, store, service, ports };
}
const access = async () => {};
describe("Manobra de portas na mesma CTO", () => {
  it("move para porta livre, preserva formulário, confere ONU e não repete token", async () => {
    const { sql, service, api, store, ports } = fixture();
    try {
      const prepared = await service.prepare(2, 20, { loginId: 60, targetPort: 3 });
      expect(prepared.review).toMatchObject({ mode: "move", logins: [{ id: 60, fromPort: 1, toPort: 3, onuId: 90 }] });
      expect(JSON.stringify([prepared, [...store.operations.values()]])).not.toContain("PRIVATE");
      expect((await service.execute(2, prepared.token, 20, access)).state).toBe("success");
      expect(ports()).toEqual([3, 2, 3, 2]);
      expect((await service.execute(2, prepared.token, 20, access)).state).toBe("success");
      expect(api.updateLogin).toHaveBeenCalledTimes(1);
      expect(api.update).toHaveBeenCalledTimes(1);
      expect(api.updateLogin.mock.calls[0][1]).toMatchObject({
        senha: "PRIVATE_PASSWORD",
        senha_router1: "PRIVATE_ROUTER_PASSWORD",
        mac: "MAC60",
        id_contrato: 50,
        ftth_porta: "3",
      });
      expect(api.updateLogin.mock.calls[0][1]).not.toHaveProperty("database_only");
      expect(api.updateLogin.mock.calls[0][1]).toMatchObject({ online: "S", tempo_conectado: "999" });
      expect(store.locks.size).toBe(0);
    } finally {
      sql.close();
    }
  });
  it("troca duas portas sem excluir registros, liberando a origem antes da troca", async () => {
    const { sql, service, api, ports } = fixture();
    try {
      const prepared = await service.prepare(2, 20, { loginId: 60, targetPort: 2, swapLoginId: 61 });
      expect((await service.execute(2, prepared.token, 20, access)).state).toBe("success");
      expect(api.updateLogin.mock.calls.map(([id, p]) => [id, p.ftth_porta])).toEqual([
        [60, "0"],
        [61, "1"],
        [60, "2"],
      ]);
      expect(api.update.mock.calls.map(([id, p]) => [id, p.porta_ftth])).toEqual([
        [90, "0"],
        [91, "1"],
        [90, "2"],
      ]);
      expect(ports()).toEqual([2, 1, 2, 1]);
      expect(sql.prepare("SELECT COUNT(*) total FROM radusuarios").get()!.total).toBe(3);
    } finally {
      sql.close();
    }
  });
  it("aceita campos opcionais da ONU omitidos pela API, como na CTO do erro informado", async () => {
    const { sql, service, api, ports } = fixture();
    const read = api.record.getMockImplementation()!;
    api.record.mockImplementation(async (table, id) => {
      const row: Record<string, unknown> = await read(table, id);
      if (table === "radpop_radio_cliente_fibra") for (const key of ["onu_compartilhada", "serial_number"]) delete row[key];
      return row as any;
    });
    try {
      const move = await service.prepare(2, 20, { loginId: 60, targetPort: 3 });
      expect((await service.execute(2, move.token, 20, access)).state).toBe("success");
      expect(ports()).toEqual([3, 2, 3, 2]);
      const swap = await service.prepare(2, 20, { loginId: 60, targetPort: 2, swapLoginId: 61 });
      expect((await service.execute(2, swap.token, 20, access)).state).toBe("success");
      expect(ports()).toEqual([2, 3, 2, 3]);
    } finally {
      sql.close();
    }
  });
  it.each(["onu_compartilhada", "onu_rede_neutra"])("revalida %s pelo banco quando a API omite o campo", async (flag) => {
    const { sql, service, api } = fixture();
    const read = api.record.getMockImplementation()!;
    api.record.mockImplementation(async (table, id) => {
      const row: Record<string, unknown> = await read(table, id);
      if (table === "radpop_radio_cliente_fibra") delete row[flag];
      return row as any;
    });
    try {
      const plan = await service.prepare(2, 20, { loginId: 60, targetPort: 3 });
      sql.exec(`UPDATE radpop_radio_cliente_fibra SET ${flag}='S' WHERE id=90`);
      const result = await service.execute(2, plan.token, 20, access);
      expect(result.state).toBe("rejected");
      expect(result.result?.message).toContain("compartilhada ou de rede neutra");
      expect(api.updateLogin).not.toHaveBeenCalled();
      expect(api.update).not.toHaveBeenCalled();
    } finally {
      sql.close();
    }
  });
  it("não ignora uma divergência quando o campo opcional está presente na API", async () => {
    const { sql, service, api } = fixture();
    const read = api.record.getMockImplementation()!;
    api.record.mockImplementation(async (table, id) => ({
      ...(await read(table, id)),
      ...(table === "radpop_radio_cliente_fibra" ? { onu_compartilhada: "S" } : {}),
    }));
    try {
      await expect(service.prepare(2, 20, { loginId: 60, targetPort: 3 })).rejects.toThrow("O vínculo da ONU mudou");
      expect(api.updateLogin).not.toHaveBeenCalled();
      expect(api.update).not.toHaveBeenCalled();
    } finally {
      sql.close();
    }
  });
  it("interrompe antes de salvar a ONU se a flag omitida mudar depois da gravação do login", async () => {
    const { sql, service, api, ports } = fixture();
    const read = api.record.getMockImplementation()!;
    api.record.mockImplementation(async (table, id) => {
      const row: Record<string, unknown> = await read(table, id);
      if (table === "radpop_radio_cliente_fibra") delete row.onu_compartilhada;
      return row as any;
    });
    const update = api.updateLogin.getMockImplementation()!;
    api.updateLogin.mockImplementationOnce(async (id, payload) => {
      const result = await update(id, payload);
      sql.exec("UPDATE radpop_radio_cliente_fibra SET onu_compartilhada='S' WHERE id=90");
      return result;
    });
    try {
      const plan = await service.prepare(2, 20, { loginId: 60, targetPort: 3 });
      expect((await service.execute(2, plan.token, 20, access)).state).toBe("partial");
      expect(api.updateLogin).toHaveBeenCalledTimes(1);
      expect(api.update).not.toHaveBeenCalled();
      expect(ports()).toEqual([3, 2, 1, 2]);
    } finally {
      sql.close();
    }
  });
  it("move login sem ONU e aceita espelhamento automático da porta pelo IXC", async () => {
    const { sql, service, api, ports } = fixture();
    try {
      sql.exec("DELETE FROM radpop_radio_cliente_fibra WHERE id=91");
      const simple = await service.prepare(2, 20, { loginId: 61, targetPort: 3 });
      expect((await service.execute(2, simple.token, 20, access)).state).toBe("success");
      expect(api.update).not.toHaveBeenCalled();
      api.updateLogin.mockImplementationOnce(async (id, p) => {
        sql.prepare("UPDATE radusuarios SET ftth_porta=? WHERE id=?").run(Number(p.ftth_porta), id);
        sql.prepare("UPDATE radpop_radio_cliente_fibra SET porta_ftth=? WHERE id_login=?").run(Number(p.ftth_porta), id);
        return { type: "success" };
      });
      const mirrored = await service.prepare(2, 20, { loginId: 60, targetPort: 4 });
      expect((await service.execute(2, mirrored.token, 20, access)).state).toBe("success");
      expect(ports().slice(0, 3)).toEqual([4, 3, 4]);
      expect(api.update).not.toHaveBeenCalled();
    } finally {
      sql.close();
    }
  });
  it("recusa outra CTO, mesma porta, fora da capacidade e troca sem ocupante confirmado", async () => {
    const { sql, service, api } = fixture();
    try {
      for (const input of [
        { loginId: 62, targetPort: 3 },
        { loginId: 60, targetPort: 1 },
        { loginId: 60, targetPort: 9 },
        { loginId: 60, targetPort: 2 },
        { loginId: 60, targetPort: 2, swapLoginId: 62 },
        { loginId: 60, targetPort: 3, swapLoginId: 61 },
      ])
        await expect(service.prepare(2, 20, input)).rejects.toThrow();
      expect(api.updateLogin).not.toHaveBeenCalled();
      expect(portManeuverInput.safeParse({ loginId: 60, targetPort: 3, senha: "tamper" }).success).toBe(false);
    } finally {
      sql.close();
    }
  });
  it("bloqueia duplicidades, ONU órfã, reservas, rede neutra e cadastros inativos ocupando porta", async () => {
    const { sql, service } = fixture();
    try {
      sql.exec("UPDATE radusuarios SET ativo='N' WHERE id=61");
      expect((await service.options(20)).ports.find((p) => p.port === 2)?.status).toBe("occupied");
      sql.exec("INSERT INTO radusuarios(id,id_caixa_ftth,ftth_porta) VALUES(63,20,1)");
      await expect(service.prepare(2, 20, { loginId: 60, targetPort: 3 })).rejects.toThrow("Mais de um login");
      sql.exec("DELETE FROM radusuarios WHERE id=63; INSERT INTO reserva_rede_neutra VALUES(1,'20',3,NULL)");
      await expect(service.prepare(2, 20, { loginId: 60, targetPort: 3 })).rejects.toThrow("Reserva");
      sql.exec("INSERT INTO radpop_radio_cliente_fibra(id,id_caixa_ftth,porta_ftth,id_login) VALUES(92,20,4,0)");
      await expect(service.prepare(2, 20, { loginId: 60, targetPort: 4 })).rejects.toThrow("ONU sem vínculo");
      sql.exec("UPDATE radpop_radio_cliente_fibra SET onu_compartilhada='S' WHERE id=90");
      await expect(service.prepare(2, 20, { loginId: 60, targetPort: 5 })).rejects.toThrow("compartilhada");
    } finally {
      sql.close();
    }
  });
  it("confere novamente ocupação, usuário, CTO e cadastro antes da primeira gravação", async () => {
    const { sql, service, api } = fixture();
    try {
      const p = await service.prepare(2, 20, { loginId: 60, targetPort: 3 });
      await expect(service.execute(3, p.token, 20, access)).rejects.toThrow("Revisão");
      await expect(service.execute(2, p.token, 21, access)).rejects.toThrow("CTO");
      sql.exec("INSERT INTO radusuarios(id,id_caixa_ftth,ftth_porta) VALUES(63,20,3)");
      const result = await service.execute(2, p.token, 20, access);
      expect(result.state).toBe("rejected");
      expect(result.result?.message).toContain("ocupada");
      expect(api.updateLogin).not.toHaveBeenCalled();
      sql.exec("DELETE FROM radusuarios WHERE id=63");
      const changed = await service.prepare(2, 20, { loginId: 60, targetPort: 3 });
      sql.exec("UPDATE radusuarios SET id_contrato=51 WHERE id=60");
      expect((await service.execute(2, changed.token, 20, access)).state).toBe("rejected");
      expect(api.updateLogin).not.toHaveBeenCalled();
    } finally {
      sql.close();
    }
  });
  it("interrompe uma troca rejeitada no segundo login e restaura explicitamente os originais", async () => {
    const { sql, service, api, ports } = fixture();
    try {
      const update = api.updateLogin.getMockImplementation()!;
      api.updateLogin.mockImplementation(async (id, p) => {
        if (id === 61) throw new OnuCommandError(false);
        return update(id, p);
      });
      const p = await service.prepare(2, 20, { loginId: 60, targetPort: 2, swapLoginId: 61 });
      const result = await service.execute(2, p.token, 20, access);
      expect(result.state).toBe("partial");
      expect(ports()).toEqual([0, 2, 0, 2]);
      api.updateLogin.mockImplementation(update);
      const recovery = await service.prepareRecovery(2, p.token, 20);
      expect(recovery.review.mode).toBe("restore");
      expect(recovery.review.logins.map((r) => r.toPort)).toEqual([1, 2]);
      expect((await service.execute(2, recovery.token, 20, access)).state).toBe("success");
      expect(ports()).toEqual([1, 2, 1, 2]);
    } finally {
      sql.close();
    }
  });
  it("não confunde sucesso HTTP com porta gravada e confirma uma resposta perdida sem repetir PUT", async () => {
    const { sql, service, api, store } = fixture();
    try {
      api.updateLogin.mockResolvedValueOnce({ type: "success" });
      const p = await service.prepare(2, 20, { loginId: 60, targetPort: 3 });
      expect((await service.execute(2, p.token, 20, access)).state).toBe("unknown");
      expect(api.update).not.toHaveBeenCalled();
      expect((await service.status(2, p.token, 20)).state).toBe("unknown");
      sql.exec("UPDATE radusuarios SET ftth_porta=3 WHERE id=60; UPDATE radpop_radio_cliente_fibra SET porta_ftth=3 WHERE id=90");
      expect((await service.status(2, p.token, 20)).state).toBe("success");
      expect(api.updateLogin).toHaveBeenCalledTimes(1);
      expect(api.update).not.toHaveBeenCalled();
      expect(store.locks.size).toBe(0);
    } finally {
      sql.close();
    }
  });
  it("não repete gravação incerta, mantém reserva e recupera após nova validação", async () => {
    const { sql, service, api, store, ports } = fixture();
    try {
      api.updateLogin.mockImplementationOnce(async (id, p) => {
        sql.prepare("UPDATE radusuarios SET ftth_porta=? WHERE id=?").run(Number(p.ftth_porta), id);
        throw new OnuCommandError(true);
      });
      const p = await service.prepare(2, 20, { loginId: 60, targetPort: 3 });
      expect((await service.execute(2, p.token, 20, access)).state).toBe("unknown");
      expect((await service.execute(2, p.token, 20, access)).state).toBe("unknown");
      expect(api.updateLogin).toHaveBeenCalledTimes(1);
      await expect(service.prepareRecovery(2, p.token, 20)).rejects.toThrow("reservada");
      store.locks.clear();
      const recovery = await service.prepareRecovery(2, p.token, 20);
      expect((await service.execute(2, recovery.token, 20, access)).state).toBe("success");
      expect(ports()).toEqual([1, 2, 1, 2]);
    } finally {
      sql.close();
    }
  });
  it("interrompe após revogação de permissão e não usa backups alterados pelo cliente", async () => {
    const { sql, service, api, ports } = fixture();
    try {
      const p = await service.prepare(2, 20, { loginId: 60, targetPort: 3 });
      const check = vi.fn(async () => {
        if (check.mock.calls.length >= 4) throw Object.assign(new Error("Permissão revogada"), { statusCode: 403 });
      });
      expect((await service.execute(2, p.token, 20, check)).state).toBe("partial");
      expect(api.updateLogin).toHaveBeenCalledTimes(1);
      expect(api.update).not.toHaveBeenCalled();
      expect(ports()).toEqual([3, 2, 1, 2]);
      await expect(service.prepareRecovery(3, p.token, 20)).rejects.toThrow("Revisão");
    } finally {
      sql.close();
    }
  });
  it("rejeita coordenação concorrente, preserva resultado e recusa recuperação sobre terceiros", async () => {
    const { sql, service, store, api } = fixture();
    try {
      const p = await service.prepare(2, 20, { loginId: 60, targetPort: 3 });
      store.locks.set("olt:1", randomUUID());
      await expect(service.execute(2, p.token, 20, access)).rejects.toBeInstanceOf(OnuBusyError);
      expect(api.updateLogin).not.toHaveBeenCalled();
      store.locks.clear();
      api.updateLogin.mockRejectedValueOnce(new OnuCommandError(true));
      await service.execute(2, p.token, 20, access);
      store.locks.clear();
      sql.exec("INSERT INTO radusuarios(id,id_caixa_ftth,ftth_porta) VALUES(63,20,1)");
      await expect(service.prepareRecovery(2, p.token, 20)).rejects.toThrow("ocupada");
    } finally {
      sql.close();
    }
  });
});
it("rotas exigem permissão específica e confirmação literal antes de acessar o serviço", async () => {
  const app = Fastify();
  const user = { id: 2, role: "USER", permissions: ["network.boxes.view", "network.logins.view"] };
  vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async () => user as any);
  const options = vi.spyOn(PortManeuverService.prototype, "options").mockResolvedValue({} as any);
  const execute = vi.spyOn(PortManeuverService.prototype, "execute").mockResolvedValue({} as any);
  const prepare = vi.spyOn(PortManeuverService.prototype, "prepare").mockResolvedValue({} as any);
  await app.register(portManeuverRoutes);
  try {
    const token = randomUUID();
    for (const route of [
      { method: "GET", url: "/boxes/20" },
      { method: "POST", url: "/boxes/20/plans", payload: { loginId: 60, targetPort: 3 } },
      { method: "GET", url: `/boxes/20/operations/${token}` },
      { method: "POST", url: `/boxes/20/operations/${token}/execute`, payload: { confirmed: true } },
      { method: "POST", url: `/boxes/20/operations/${token}/recovery`, payload: {} },
    ])
      expect((await app.inject(route as any)).statusCode).toBe(403);
    expect(options).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    user.permissions.push("network.ports.manage");
    expect(
      (await app.inject({ method: "POST", url: `/boxes/20/operations/${token}/execute`, payload: { confirmed: false } })).statusCode
    ).toBe(400);
    expect(
      (await app.inject({ method: "POST", url: "/boxes/20/plans", payload: { loginId: 60, targetPort: 3, original: { senha: "tamper" } } }))
        .statusCode
    ).toBe(400);
    expect(execute).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(
      (await app.inject({ method: "POST", url: `/boxes/20/operations/${token}/execute`, payload: { confirmed: true } })).statusCode
    ).toBe(200);
  } finally {
    await app.close();
  }
  expect(permissionKeys).toContain("network.ports.manage");
  expect(rolePermissions.ADMIN).toContain("network.ports.manage");
  expect(rolePermissions.OPERATOR).not.toContain("network.ports.manage");
  expect(accessPresets.find((p) => p.key === "NETWORK_PORTS")?.permissions).toContain("network.ports.manage");
});
