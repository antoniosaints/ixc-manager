import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertReadQuery, type IxcReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { IxcApiService } from "../src/integrations/ixc/IxcApiService.js";
import { LoginSignalService, loginSignalQuery, opticalSignalDto } from "../src/services/upgrades/LoginSignalService.js";
import { UpgradeService } from "../src/services/upgrades/UpgradeService.js";
import { NetworkService } from "../src/services/network/NetworkService.js";
import { upgradeRoutes } from "../src/controllers/upgradeController.js";
import { supportRoutes } from "../src/controllers/supportController.js";
import { networkRoutes } from "../src/controllers/networkController.js";
import { AuthService } from "../src/services/AuthService.js";

afterEach(() => vi.restoreAllMocks());
const scope = { loginId: 20, customerId: 3, contractId: 10 };
const raw = {
  id: 1,
  id_login: 20,
  id_contrato: 10,
  sinal_rx: "-21.42",
  sinal_tx: "2.15",
  data_sinal: "2026-10-07 16:47:56",
  temperatura: "34.16",
  voltagem: "3.31",
  status_potencia: "regular",
  status_autorizado: "A",
  mac: "SERIAL-DEMO",
  ponid: "1/2/3",
};
const current = { id: 20, id_cliente: 3, id_contrato: 10, id_caixa_ftth: 25 };
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE radusuarios (id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,id_caixa_ftth INTEGER,onu_mac TEXT);
    CREATE TABLE cliente_contrato (id INTEGER PRIMARY KEY,id_cliente INTEGER);
    CREATE TABLE radpop_radio_cliente_fibra (id INTEGER PRIMARY KEY,id_login INTEGER,id_contrato INTEGER,onu_tipo TEXT,mac TEXT,serial_number TEXT,ponid TEXT,sinal_rx TEXT,sinal_tx TEXT,data_sinal TEXT,temperatura TEXT,voltagem TEXT,status_potencia TEXT,status_autorizado TEXT,senha_onu_cliente TEXT);
    INSERT INTO radusuarios VALUES(20,3,10,25,'SERIAL-DEMO'),(21,4,11,26,'OTHER');
    INSERT INTO cliente_contrato VALUES(10,3),(11,4),(12,3);
    INSERT INTO radpop_radio_cliente_fibra (id,id_login,id_contrato,sinal_rx,sinal_tx,data_sinal,status_potencia,senha_onu_cliente)
    VALUES (1,20,10,'-21.42','2.15','2026-10-07 16:47:56','regular','PRIVATE_PASSWORD'),
      (2,20,11,'-30.00','2.15','2026-10-07 17:00:00','irregular','PRIVATE_PASSWORD'),
      (3,21,11,'-31.00','2.15','2026-10-07 17:00:00','irregular','PRIVATE_PASSWORD'),
      (4,20,0,'-22.00','2.00','2026-10-06 12:00:00','regular','PRIVATE_PASSWORD');`);
  const select = vi.fn(async <T extends object>(q: IxcReadQuery) => {
    assertReadQuery(q);
    return db.prepare(q.sql).all(...q.params) as T[];
  });
  const listPage = vi.fn();
  const service = new LoginSignalService({ select }, { listPage } as never, () => new Date("2026-10-07T20:00:00Z"));
  return { db, select, listPage, service };
}
describe("Leitura de potência óptica por login", () => {
  it("usa apenas SELECT limitado pelo índice do login, valida cliente/contrato/caixa e não retorna credenciais", async () => {
    const { db, select, listPage, service } = fixture();
    try {
      const result = await service.read({ ...scope, boxId: 25 });
      expect(result.readings.map((r) => r.onuId)).toEqual([4, 1]);
      expect(result).toMatchObject({ source: "ixc-database", truncated: false, queriedAt: "2026-10-07T20:00:00.000Z" });
      expect(result.readings[1]).toMatchObject({ rxDbm: -21.42, txDbm: 2.15, measuredAt: "2026-10-07 16:47:56", powerStatus: "regular" });
      expect(JSON.stringify(result)).not.toContain("PRIVATE_PASSWORD");
      expect(select.mock.calls[0]?.[0]).toMatchObject({ params: [20, 3, 10, 25], timeoutSeconds: 5 });
      expect((await service.read({ ...scope, customerId: 4 })).readings).toEqual([]);
      expect((await service.read({ ...scope, contractId: 11 })).readings).toEqual([]);
      expect((await service.read({ ...scope, boxId: 26 })).readings).toEqual([]);
      expect(listPage).not.toHaveBeenCalled();
      expect(() => assertReadQuery(loginSignalQuery(scope))).not.toThrow();
      expect(loginSignalQuery(scope).sql).toContain("LIMIT 11");
      for (const loginId of [0, -1, Number.MAX_SAFE_INTEGER + 1, NaN]) expect(() => loginSignalQuery({ ...scope, loginId })).toThrow();
    } finally {
      db.close();
    }
  });
  it("preserva múltiplas ONUs identificadas, limita a 10 e relê sem cache", async () => {
    const { db, service, select } = fixture();
    try {
      for (let i = 5; i <= 17; i++) db.exec(`INSERT INTO radpop_radio_cliente_fibra (id,id_login,id_contrato) VALUES(${i},20,10)`);
      const result = await service.read(scope);
      expect(result.readings).toHaveLength(10);
      expect(result.truncated).toBe(true);
      db.exec("UPDATE radpop_radio_cliente_fibra SET sinal_rx='-25.00',sinal_tx='2.00',data_sinal='2026-10-07 17:00:00' WHERE id=17");
      expect((await service.read(scope)).readings[0]?.rxDbm).toBe(-25);
      expect(select).toHaveBeenCalledTimes(2);
    } finally {
      db.close();
    }
  });
  it("recupera ONU de contrato antigo do mesmo cliente apenas com serial coincidente", async () => {
    const { db, service } = fixture();
    try {
      db.exec(`INSERT INTO radpop_radio_cliente_fibra (id,id_login,id_contrato,mac,sinal_rx,sinal_tx,data_sinal)
        VALUES(5,20,12,'serial-demo','-20.31','2.61','2026-10-07 04:03:50'),
        (6,20,12,'WRONG-SERIAL','-30','2','2026-10-07 04:03:50'),
        (7,20,11,'SERIAL-DEMO','-31','2','2026-10-07 04:03:50');`);
      const result = await service.read(scope);
      expect(result.readings.map((r) => r.onuId)).toEqual([5, 4, 1]);
      expect(result.readings[0]).toMatchObject({ rxDbm: -20.31, linkedContractId: 12, contractMismatch: true });
      expect(result.readings[2]?.contractMismatch).toBe(false);
    } finally {
      db.close();
    }
  });
  it("não transforma placeholders, datas inválidas ou números ausentes em potência real", () => {
    for (const row of [
      { ...raw, sinal_rx: "0.00", sinal_tx: "0.00" },
      { ...raw, data_sinal: "0000-00-00 00:00:00" },
      { ...raw, data_sinal: "2026-02-31 10:00:00" },
      { ...raw, sinal_rx: "", sinal_tx: null },
    ])
      expect(opticalSignalDto(row)).toMatchObject({ rxDbm: null, txDbm: null, temperatureC: null, voltageV: null });
    expect(opticalSignalDto({ ...raw, sinal_tx: "0.00" })).toMatchObject({ rxDbm: -21.42, txDbm: 0 });
    expect(opticalSignalDto({ ...raw, status_potencia: "", status_autorizado: "", sinal_rx: "INVALID" })).toMatchObject({
      rxDbm: null,
      txDbm: 2.15,
      powerStatus: null,
      authorization: null,
    });
    expect(Object.keys(opticalSignalDto({ ...raw, senha: "SECRET", senha_onu_cliente: "SECRET" }))).not.toContain("senha_onu_cliente");
  });
  it("usa somente listagem da API como fallback, revalida o login e descarta ONUs alheias ou de contrato incompatível", async () => {
    const select = vi.fn().mockRejectedValue(new Error("PRIVATE_DATABASE_PASSWORD"));
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({ rows: [current], total: 1 })
      .mockResolvedValueOnce({
        rows: [raw, { ...raw, id: 2, id_login: 21 }, { ...raw, id: 3, id_contrato: 11 }, { ...raw, id: 4, id_contrato: "invalid" }],
        total: 4,
      })
      .mockResolvedValueOnce({ rows: [{ id: 11, id_cliente: 4 }], total: 1 });
    const service = new LoginSignalService({ select }, { listPage } as never);
    const result = await service.read({ ...scope, boxId: 25 });
    expect(result.source).toBe("ixc-api");
    expect(result.readings.map((r) => r.onuId)).toEqual([1]);
    expect(listPage.mock.calls.map((c) => c[0])).toEqual(["radusuarios", "radpop_radio_cliente_fibra", "cliente_contrato"]);
    expect(listPage.mock.calls[1]?.[1]).toMatchObject({ qtype: "radpop_radio_cliente_fibra.id_login", query: "20", oper: "=", rp: 11 });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_DATABASE_PASSWORD");
    listPage.mockResolvedValueOnce({ rows: [{ ...current, id_cliente: 4 }], total: 1 });
    await expect(service.read(scope)).rejects.toMatchObject({ statusCode: 502 });
    expect(listPage).toHaveBeenCalledTimes(4);
    listPage.mockRejectedValueOnce(new Error("PRIVATE_API_TOKEN"));
    await expect(service.read(scope)).rejects.toThrow("Não foi possível consultar o sinal no IXC. Tente novamente.");
  });
  it("valida por API o cliente do contrato antigo e o serial antes de aceitar a ONU", async () => {
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ ...current, onu_mac: "serial-demo" }], total: 1 })
      .mockResolvedValueOnce({
        rows: [
          { ...raw, id_contrato: 12 },
          { ...raw, id: 2, id_contrato: 12, mac: "OTHER" },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({ rows: [{ id: 12, id_cliente: 3 }], total: 1 });
    const service = new LoginSignalService({ select: vi.fn().mockRejectedValue(new Error("unavailable")) }, { listPage } as never);
    const result = await service.read(scope);
    expect(result.readings).toHaveLength(1);
    expect(result.readings[0]).toMatchObject({ onuId: 1, contractMismatch: true, linkedContractId: 12 });
    expect(listPage.mock.calls[2]?.[1]).toMatchObject({ qtype: "cliente_contrato.id", oper: "IN", query: "12" });
  });
  it("valida o vínculo do contrato antes de buscar o sinal", async () => {
    const listPage = vi.fn(async (endpoint: string) => ({
      rows: endpoint === "cliente_contrato" ? [{ id: 10, id_cliente: 3, status: "A" }] : [{ ...current, id_contrato: 11 }],
      total: 1,
    }));
    const read = vi.fn();
    const service = new UpgradeService({ listPage } as never, undefined, {}, undefined, { read, close: vi.fn() } as never);
    await expect(service.loginSignal(10, 20)).rejects.toMatchObject({ statusCode: 404 });
    expect(read).not.toHaveBeenCalled();
    listPage.mockImplementation(async (endpoint: string) => ({
      rows: endpoint === "cliente_contrato" ? [{ id: 10, id_cliente: 3, status: "A" }] : [current],
      total: 1,
    }));
    await service.loginSignal(10, 20);
    expect(read).toHaveBeenCalledWith(scope);
  });
});

describe("Permissões das rotas de sinal", () => {
  for (const [module, routes, url, required] of [
    ["upgrades", upgradeRoutes, "/api/upgrades/contracts/10/logins/20/signal", ["upgrades.contract.view", "upgrades.logins.view"]],
    ["support", supportRoutes, "/api/support/contracts/10/logins/20/signal", ["support.contract.view", "support.logins.view"]],
    ["network", networkRoutes, "/api/network/boxes/25/logins/20/signal", ["network.boxes.view", "network.logins.view"]],
  ] as const)
    it(`${module}: exige autenticação e todas as permissões de leitura, sem exigir senhas/acesso ao equipamento`, async () => {
      let permissions: string[] = [];
      vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async (req) =>
        req.headers.authorization ? { id: 1, name: "Operador", email: "example@example.test", role: "OPERATOR", permissions } : null
      );
      const read = vi.spyOn(LoginSignalService.prototype, "read").mockResolvedValue({
        readings: [{ ...opticalSignalDto(raw), linkedContractId: 10, contractMismatch: false }],
        truncated: false,
        source: "ixc-database",
        queriedAt: "2026-10-07T20:00:00Z",
      });
      const ixc = vi.spyOn(IxcApiService.prototype, "listPage").mockImplementation(async (endpoint) => ({
        rows: endpoint === "cliente_contrato" ? [{ id: 10, id_cliente: 3, status: "A" }] : [current],
        total: 1,
      }));
      const network = vi
        .spyOn(NetworkService.prototype, "login")
        .mockResolvedValue({ login: { id: 20, customerId: 3, contractId: 10 }, source: "ixc-database", queriedAt: "" } as never);
      const app = Fastify();
      await app.register(routes, { prefix: `/api/${module}` });
      const headers = { authorization: "test" };
      try {
        expect((await app.inject({ url })).statusCode).toBe(401);
        for (const missing of required) {
          permissions = required.filter((p) => p !== missing);
          expect((await app.inject({ url, headers })).statusCode).toBe(403);
        }
        expect(ixc).not.toHaveBeenCalled();
        expect(read).not.toHaveBeenCalled();
        expect(network).not.toHaveBeenCalled();
        permissions = [...required];
        const response = await app.inject({ url, headers });
        expect(response.statusCode).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.json().readings[0].rxDbm).toBe(-21.42);
        const before = read.mock.calls.length;
        expect((await app.inject({ url: url.replace("/20/signal", "/0/signal"), headers })).statusCode).toBe(400);
        expect(read).toHaveBeenCalledTimes(before);
        expect((await app.inject({ method: "POST", url, headers })).statusCode).toBe(404);
      } finally {
        await app.close();
      }
    });
});
