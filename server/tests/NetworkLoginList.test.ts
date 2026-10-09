import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkLoginService, loginListQuery, loginListSql } from "../src/services/network/NetworkLoginService.js";
import { IxcReadDatabase, assertReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { networkRoutes } from "../src/controllers/networkController.js";
import { AuthService } from "../src/services/AuthService.js";
import { accessPresets, permissionKeys, effectivePermissions, rolePermissions } from "../src/config/permissions.js";
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE cliente(id INTEGER PRIMARY KEY,razao TEXT,ativo TEXT,cnpj_cpf TEXT,cidade INTEGER,filial_id INTEGER);
 CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER,contrato TEXT,status TEXT,cidade INTEGER,id_filial INTEGER);
 CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,login TEXT,tipo_conexao_mapa TEXT,ativo TEXT,ip TEXT,mac TEXT,onu_mac TEXT,id_cliente INTEGER,id_contrato INTEGER,id_caixa_ftth INTEGER,ftth_porta INTEGER,ultima_conexao_inicial TEXT,ultima_conexao_final TEXT,motivo_desconexao TEXT,sinal_ultimo_atendimento TEXT,concentrador TEXT,endereco_padrao_cliente TEXT,cidade INTEGER,id_filial INTEGER);
 CREATE TABLE rad_caixa_ftth(id INTEGER PRIMARY KEY,descricao TEXT);
 CREATE TABLE radpop_radio_cliente_fibra(id INTEGER PRIMARY KEY,id_login INTEGER,id_contrato INTEGER,id_caixa_ftth INTEGER,porta_ftth INTEGER,mac TEXT,serial_number TEXT);
 CREATE TABLE cidade(id INTEGER PRIMARY KEY,nome TEXT);CREATE TABLE filial(id INTEGER PRIMARY KEY,fantasia TEXT,razao TEXT);
 INSERT INTO cidade VALUES(1,'Cidade Cliente'),(2,'Cidade Login'),(3,'Cidade Contrato'),(4,'Cidade Sem Logins');
 INSERT INTO filial VALUES(1,'Filial Cliente','Razão Cliente'),(2,'Filial Login','Razão Login'),(3,'Filial Contrato','Razão Contrato');
 INSERT INTO cliente VALUES(1,'Ana Teste','S','123.456.789-01',1,1),(2,'Beto Teste','N','12345678000190',1,1);
 INSERT INTO cliente_contrato VALUES(10,1,'Plano atual','A',3,3),(11,1,'Plano anterior','I',3,3),(20,2,'Plano B','I',1,1);
 INSERT INTO rad_caixa_ftth VALUES(40,'CTO Centro'),(50,'CTO Norte'),(60,'CTO Sul');
 INSERT INTO radusuarios(id,login,ativo,ip,id_cliente,id_contrato,id_caixa_ftth,ftth_porta,endereco_padrao_cliente,cidade,id_filial,onu_mac) VALUES
 (1,'ana.login','S','192.0.2.1',1,10,40,1,'S',2,2,'SERIAL1'),
 (2,'ana.antigo','N',NULL,1,11,0,0,'N',0,0,'SERIAL2'),
 (3,'beto.login','S',NULL,2,20,0,0,'N',2,2,NULL),
 (4,'ana.%_teste','S','0.0.0.0',1,20,0,0,'S',0,0,'SERIAL4'),
 (5,'ana.movido','S','2001:db8::1',1,10,0,0,'N',2,0,'SERIAL5');
 INSERT INTO radpop_radio_cliente_fibra VALUES
 (1,1,10,50,4,'SERIAL1',NULL),(2,2,11,50,2,'SERIAL2',NULL),
 (3,3,20,50,3,'B',NULL),(4,3,20,60,4,'B',NULL),
 (5,5,11,60,5,'SERIAL5',NULL),(6,5,11,60,5,'SERIAL5',NULL),
 (7,4,20,50,6,'SERIAL4',NULL);
 `);
  db.exec("ALTER TABLE radusuarios ADD COLUMN online TEXT");
  const read = vi.fn(async (q: any) => {
    assertReadQuery(q);
    return db.prepare(q.sql).all(...q.params);
  });
  const service = new NetworkLoginService({ withSnapshot: async (callback) => callback({ select: read }) } as never);
  return { db, service, read };
}
describe("Lista geral de logins", () => {
  it("lista ativos por padrão, conta por IP, inclui sem ONU e evita caixa/contrato incompatíveis", async () => {
    const { db, service } = fixture();
    try {
      const result = await service.list(loginListQuery.parse({}));
      expect(result.total).toBe(4);
      expect(result.summary).toEqual({ total: 4, activeLogins: 4, inactiveLogins: 0, onlineLogins: 2, offlineLogins: 2 });
      expect(result.items.map((r) => r.id)).toEqual([5, 4, 3, 1]);
      expect(result.items.find((r) => r.id === 1)).toMatchObject({
        ftthBoxId: 40,
        ftthBoxSource: "login",
        port: 1,
        city: "Cidade Cliente",
        branch: "Filial Login",
      });
      expect(result.items.find((r) => r.id === 5)).toMatchObject({
        ftthBoxId: 60,
        ftthBoxSource: "onu",
        port: 5,
        city: "Cidade Login",
        branch: "Filial Contrato",
      });
      expect(result.items.find((r) => r.id === 3)).toMatchObject({ ftthBoxId: null, port: null, status: "offline" });
      expect(result.items.find((r) => r.id === 4)).toMatchObject({ contractId: null, ftthBoxId: null });
      expect((await service.detail(2)).login).toMatchObject({ active: false, ftthBoxId: 50, city: "Cidade Contrato" });
      await expect(service.detail(999)).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      db.close();
    }
  });
  it("mantém detalhe, filtro e contagens offline após IXC marcar N sem apagar o IP", async () => {
    const { db, service } = fixture();
    try {
      db.exec("UPDATE radusuarios SET online='N' WHERE id=1");
      expect((await service.detail(1)).login).toMatchObject({ status: "offline", ip: "192.0.2.1" });
      const offline = await service.list(loginListQuery.parse({ connection: "offline" }));
      expect(offline.items.map((r) => r.id)).toEqual([4, 3, 1]);
      expect(offline.summary).toMatchObject({ onlineLogins: 0, offlineLogins: 3 });
      expect((await service.list(loginListQuery.parse({}))).summary).toMatchObject({ onlineLogins: 1, offlineLogins: 3 });
      db.exec("UPDATE radusuarios SET online='S' WHERE id=1");
      expect((await service.detail(1)).login.status).toBe("online");
    } finally {
      db.close();
    }
  });
  it("filtra os offline liberados do Analytics com cliente/contrato ativos e vínculo válido", async () => {
    const { db, service } = fixture();
    try {
      db.exec(`ALTER TABLE cliente_contrato ADD COLUMN status_internet TEXT;
        UPDATE cliente_contrato SET status_internet='A';
        UPDATE cliente_contrato SET status='A' WHERE id=20;
        INSERT INTO radusuarios(id,login,ativo,ip,id_cliente,id_contrato,id_caixa_ftth,ftth_porta,endereco_padrao_cliente,cidade,id_filial) VALUES
          (6,'ana.offline','S',NULL,1,10,40,2,'S',2,2);`);
      const result = await service.list(loginListQuery.parse({ access: "released", connection: "offline" }));
      expect(result.items.map((row) => row.id)).toEqual([6]);
      expect(result.summary).toMatchObject({ total: 1, onlineLogins: 0, offlineLogins: 1 });
      expect((await service.list(loginListQuery.parse({ access: "released" }))).items.map((row) => row.id)).toEqual([6, 5, 1]);
      // All keeps the existing default, including inactive clients and mismatched contracts.
      expect((await service.list(loginListQuery.parse({}))).total).toBe(5);
    } finally {
      db.close();
    }
  });
  it("combina filtros de caixa, documento, cliente, contrato, login, cidade e filial sem duplicar ONUs", async () => {
    const { db, service } = fixture();
    try {
      for (const [searchBy, search, ids] of [
        ["login", "ana.", [5, 4, 2, 1]],
        ["box", "40", [1]],
        ["box", "CTO Sul", [5]],
        ["box", "50", [2]],
        ["document", "12345678901", [5, 4, 2, 1]],
        ["document", "12.345.678/0001-90", [3]],
        ["customer", "Ana Teste", [5, 4, 2, 1]],
        ["contractId", "10", [5, 1]],
        ["loginId", "2", [2]],
        ["city", "Cidade Login", [5, 3]],
        ["branch", "Filial Contrato", [5, 2]],
      ] as const) {
        expect((await service.list(loginListQuery.parse({ registration: "all", searchBy, search }))).items.map((r) => r.id)).toEqual(ids);
      }
      expect((await service.list(loginListQuery.parse({ cityId: 2, branchId: 3, connection: "online" }))).items.map((r) => r.id)).toEqual([
        5,
      ]);
      expect((await service.list(loginListQuery.parse({ connection: "offline" }))).items.map((r) => r.id)).toEqual([4, 3]);
      expect((await service.list(loginListQuery.parse({ page: 2 }))).items).toEqual([]);
      expect((await service.filters()).cities.map((c) => c.id)).toEqual([1, 3, 2]);
      expect((await service.filters()).branches).toHaveLength(3);
    } finally {
      db.close();
    }
  });
  it("escapa LIKE, valida IDs/documentos e seleciona só campos autorizados em consultas limitadas", async () => {
    const { db, service } = fixture();
    try {
      expect((await service.list(loginListQuery.parse({ search: "%_" }))).items.map((r) => r.id)).toEqual([4]);
      expect((await service.list(loginListQuery.parse({ search: "' OR 1=1" }))).total).toBe(0);
      for (const value of [
        { limit: 100 },
        { cityId: 0 },
        { branchId: "1 OR 1=1" },
        { searchBy: "loginId", search: "abc" },
        { searchBy: "contractId", search: "9007199254740993" },
        { searchBy: "document", search: "123" },
        { searchBy: "document", search: "abc12345678901" },
      ])
        expect(loginListQuery.safeParse(value).success).toBe(false);
      for (const q of Object.values(loginListSql(loginListQuery.parse({})))) {
        assertReadQuery(q);
        expect(q.timeoutSeconds).toBe(5);
        expect(q.sql).not.toMatch(/senha|password|SELECT\s+\*/i);
      }
    } finally {
      db.close();
    }
  });
  it("protege lista, filtros e detalhes com permissões próprias antes de consultar o IXC", async () => {
    const { db, read } = fixture();
    let permissions: any[] = [];
    vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async () => ({
      id: 1,
      name: "Teste",
      email: "teste@example.test",
      role: "USER",
      permissions,
    }));
    const snapshot = vi.spyOn(IxcReadDatabase.prototype, "withSnapshot").mockImplementation(async (callback) => callback({ select: read }));
    const app = Fastify();
    await app.register(networkRoutes, { prefix: "/api/network" });
    try {
      for (const url of ["/api/network/logins", "/api/network/logins/filters", "/api/network/logins/1", "/api/network/logins/1/signal"])
        expect((await app.inject({ url })).statusCode).toBe(403);
      expect(snapshot).not.toHaveBeenCalled();
      permissions = ["network.logins.list"];
      expect((await app.inject({ url: "/api/network/logins" })).statusCode).toBe(200);
      expect((await app.inject({ url: "/api/network/logins/filters" })).statusCode).toBe(200);
      snapshot.mockClear();
      for (const url of ["/api/network/logins/1", "/api/network/logins/1/signal"]) expect((await app.inject({ url })).statusCode).toBe(403);
      expect(snapshot).not.toHaveBeenCalled();
      permissions.push("network.logins.view");
      const response = await app.inject({ url: "/api/network/logins/1" });
      expect(response.statusCode).toBe(200);
      expect(response.json().login.id).toBe(1);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect((await app.inject({ method: "POST", url: "/api/network/logins", payload: {} })).statusCode).toBe(404);
    } finally {
      await app.close();
      db.close();
    }
  });
  it("organiza modelos por área sem conceder senhas, alterar perfis personalizados ou abrir Configurações", () => {
    expect(accessPresets.map((p) => p.key)).toEqual([
      "USER",
      "OPERATOR",
      "MANAGER",
      "SUPPORT",
      "NETWORK",
      "COMMERCIAL",
      "FINANCE",
      "COLLECTIONS",
    ]);
    for (const preset of accessPresets) {
      expect(new Set(preset.permissions).size).toBe(preset.permissions.length);
      expect(preset.permissions.every((p) => permissionKeys.includes(p))).toBe(true);
      expect(preset.permissions.some((p) => /credentials|equipment\.access/.test(p))).toBe(false);
    }
    expect(accessPresets.find((p) => p.key === "NETWORK")?.permissions).toContain("network.logins.list");
    expect(effectivePermissions("OPERATOR", ["upgrades.plans.view"])).toEqual(["upgrades.plans.view"]);
    expect(rolePermissions.USER).toEqual(["churn.analytics"]);
    expect(effectivePermissions("ADMIN", [])).toContain("network.logins.list");
  });
});
