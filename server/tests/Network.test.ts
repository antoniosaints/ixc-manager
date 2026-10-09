import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NetworkService,
  networkBoxesSql,
  networkLoginsSql,
  networkBoxDto,
  boxesQuery,
  boxLoginsQuery,
} from "../src/services/network/NetworkService.js";
import { assertReadQuery, IxcReadDatabase, type IxcReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { networkRoutes } from "../src/controllers/networkController.js";
import { AuthService } from "../src/services/AuthService.js";
import { appearanceSchema, defaultAppearance } from "../src/services/settings/SettingsService.js";
import { applyThemePreset, themePresets } from "../../client/src/appearancePresets.js";
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE rad_caixa_ftth (id INTEGER PRIMARY KEY,descricao TEXT,status TEXT,capacidade INTEGER,endereco TEXT,numero TEXT,bairro TEXT,cep TEXT,latitude TEXT,longitude TEXT,id_projeto INTEGER,id_transmissor INTEGER,id_interface INTEGER,obs_caixa_ftth TEXT,ultima_atualizacao TEXT,id_cidade INTEGER);
 CREATE TABLE cidade (id INTEGER PRIMARY KEY,nome TEXT);CREATE TABLE radpop_radio (id INTEGER PRIMARY KEY,descricao TEXT);
 CREATE TABLE cliente (id INTEGER PRIMARY KEY,razao TEXT,ativo TEXT);CREATE TABLE cliente_contrato (id INTEGER PRIMARY KEY,id_cliente INTEGER,contrato TEXT,status TEXT);
 CREATE TABLE radusuarios (id INTEGER PRIMARY KEY,id_caixa_ftth INTEGER,ativo TEXT,online TEXT,ftth_porta INTEGER,login TEXT,id_cliente INTEGER,id_contrato INTEGER,ip TEXT,mac TEXT,onu_mac TEXT,ultima_conexao_inicial TEXT,ultima_conexao_final TEXT,motivo_desconexao TEXT,sinal_ultimo_atendimento TEXT,concentrador TEXT,tipo_conexao_mapa TEXT);
 INSERT INTO cidade VALUES (1,'Cidade Teste');INSERT INTO radpop_radio VALUES(1,'OLT Teste');INSERT INTO cliente VALUES(1,'Cliente Teste','S'),(2,'Cliente Inativo','N');INSERT INTO cliente_contrato VALUES (1,1,'Plano Teste','A'),(2,2,'Plano Antigo','I');
 INSERT INTO rad_caixa_ftth(id,descricao,status,capacidade,id_cidade,id_transmissor,latitude,longitude) VALUES (1,'Caixa Centro','A',4,1,1,'-4,1','-44.1'),(2,'Caixa Antiga','I',8,1,1,NULL,NULL),(3,'Caixa Sem Capacidade','A',0,1,1,NULL,NULL),(4,'Caixa % Teste','A',8,1,1,NULL,NULL);
 INSERT INTO radusuarios (id,id_caixa_ftth,ativo,online,ftth_porta,login,id_cliente,id_contrato,ip) VALUES
 (1,1,'S','S',1,'online',1,1,'100.64.0.1'),(2,1,'S','N',2,'offline',1,1,'100.64.0.2'),(3,1,'S','SS',2,'sem-status',1,1,'100.64.0.3'),(4,1,'S','I',5,'status-i',1,1,NULL),(5,1,'S','N',0,'sem-porta',1,1,NULL),(6,1,'N','N',3,'inativo',2,2,NULL),(7,2,'S','S',1,'outra-caixa',1,1,NULL),(8,999,'S','S',1,'orfao',1,1,NULL),(9,1,'S',NULL,4,'status-null',1,2,NULL);`);
  const session = {
    select: async <T extends object>(q: IxcReadQuery) => {
      assertReadQuery(q);
      return db.prepare(q.sql).all(...q.params) as T[];
    },
  };
  const service = new NetworkService(
    { withSnapshot: async (read: Parameters<IxcReadDatabase["withSnapshot"]>[0]) => read(session) } as never,
    () => new Date("2026-10-07T12:00:00Z")
  );
  return { db, service };
}
afterEach(() => vi.restoreAllMocks());
describe("Rede: contagens e vínculos somente de leitura", () => {
  it("separa online, offline e sem status dos ativos, mantendo inativos identificados", async () => {
    const { db, service } = fixture();
    try {
      const result = await service.boxes(boxesQuery.parse({}));
      expect(result.total).toBe(3);
      expect(result.summary).toEqual({ boxes: 3, activeLogins: 6, onlineLogins: 1, offlineLogins: 5, unknownLogins: 0 });
      const box = result.items.find((b) => b.id === 1)!;
      expect((await service.detail(1)).box).toEqual(box);
      await expect(service.detail(99)).rejects.toMatchObject({ statusCode: 404 });
      expect(box).toMatchObject({
        totalLogins: 7,
        activeLogins: 6,
        inactiveLogins: 1,
        occupiedPorts: 3,
        freePorts: 1,
        duplicatePorts: 1,
        invalidPorts: 2,
        coordinates: { latitude: -4.1, longitude: -44.1 },
      });
      expect(result.items.find((b) => b.id === 3)?.freePorts).toBeNull();
      expect((await service.boxes(boxesQuery.parse({ status: "all" }))).total).toBe(4);
      db.exec("INSERT INTO radusuarios(id,id_caixa_ftth,ativo,online,ftth_porta) VALUES(10,3,'S','S',7)");
      const unknownCapacity = (await service.boxes(boxesQuery.parse({ searchBy: "id", search: "3" }))).items[0];
      expect(unknownCapacity).toMatchObject({ occupiedPorts: 1, freePorts: null });
    } finally {
      db.close();
    }
  });
  it("prioriza o estado IXC mesmo com IP preenchido, e valida os contratos", async () => {
    const { db, service } = fixture();
    try {
      expect(
        (await service.logins(1, boxLoginsQuery.parse({ registration: "active", connection: "unknown" }))).items.map((l) => l.id).sort()
      ).toEqual([]);
      expect(
        (await service.logins(1, boxLoginsQuery.parse({ connection: "online", registration: "active" }))).items.map((l) => l.id).sort()
      ).toEqual([1]);
      expect(
        (await service.logins(1, boxLoginsQuery.parse({ connection: "offline", registration: "active" }))).items.map((l) => l.id).sort()
      ).toEqual([2, 3, 4, 5, 9]);
      expect((await service.login(1, 2)).login).toMatchObject({ status: "offline", ip: "100.64.0.2" });
      const all = await service.logins(1, boxLoginsQuery.parse({}));
      expect(all.total).toBe(7);
      expect(all.items.find((l) => l.id === 9)?.contractStatus).toBeNull();
      expect(all.items.find((l) => l.id === 9)?.contractId).toBeNull();
      expect((await service.login(1, 1)).login).toMatchObject({ id: 1, status: "online", port: 1 });
      await expect(service.login(2, 1)).rejects.toMatchObject({ statusCode: 404 });
      expect((await service.logins(1, boxLoginsQuery.parse({ registration: "inactive" }))).items.map((l) => l.id)).toEqual([6]);
      await expect(service.logins(99, boxLoginsQuery.parse({}))).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      db.close();
    }
  });
  it("busca login, IP, cliente e endereço usando parâmetros e literais de LIKE", async () => {
    const { db, service } = fixture();
    try {
      for (const query of [
        { searchBy: "login", search: "online" },
        { searchBy: "ip", search: "100.64.0.1" },
        { searchBy: "customer", search: "Cliente Teste" },
        { searchBy: "id", search: "1" },
      ]) {
        expect((await service.boxes(boxesQuery.parse(query))).items.map((b) => b.id)).toEqual([1]);
      }
      expect((await service.boxes(boxesQuery.parse({ search: "%" }))).items.map((b) => b.id)).toEqual([4]);
      expect((await service.boxes(boxesQuery.parse({ search: "' OR 1=1" }))).total).toBe(0);
      expect((await service.boxes(boxesQuery.parse({ searchBy: "address", search: "Cidade Teste", page: 2, limit: 10 }))).items).toEqual(
        []
      );
      expect(boxesQuery.safeParse({ searchBy: "id", search: "1 OR 1=1" }).success).toBe(false);
      expect(boxesQuery.safeParse({ searchBy: "id", search: "9007199254740993" }).success).toBe(false);
    } finally {
      db.close();
    }
  });
  it("não seleciona credenciais e mantém todas as consultas limitadas e somente de leitura", () => {
    const queries = [
      ...Object.values(networkBoxesSql(boxesQuery.parse({}))),
      ...Object.values(networkLoginsSql(1, boxLoginsQuery.parse({}))),
    ];
    for (const q of queries) {
      expect(() => assertReadQuery(q)).not.toThrow();
      expect(q.timeoutSeconds).toBe(5);
      expect(q.sql).not.toMatch(/senha|SELECT\s+\*/i);
    }
    expect(networkBoxDto({ id: 1, latitude: "javascript:1", longitude: "2" }).coordinates).toBeNull();
    expect(networkBoxDto({ id: 1, latitude: "0.000000", longitude: "0" }).coordinates).toBeNull();
  });
});
describe("Rede: permissões e compatibilidade de aparência", () => {
  it("exige as permissões próprias antes de consultar o banco", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({
      id: 1,
      name: "Teste",
      email: "teste@example.test",
      role: "OPERATOR",
      permissions: ["network.boxes.view"],
    });
    const db = vi.spyOn(IxcReadDatabase.prototype, "withSnapshot");
    const app = Fastify();
    await app.register(networkRoutes, { prefix: "/api/network" });
    for (const url of ["/api/network/boxes/1/logins", "/api/network/boxes?searchBy=login&search=cliente"]) {
      const response = await app.inject({ url });
      expect(response.statusCode).toBe(403);
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    expect(db).not.toHaveBeenCalled();
    expect((await app.inject({ method: "POST", url: "/api/network/boxes" })).statusCode).toBe(404);
    await app.close();
  });
  it("consulta a caixa sem expor logins e impede acesso sem a permissão de Rede", async () => {
    const authenticate = vi
      .spyOn(AuthService.prototype, "authenticate")
      .mockResolvedValue({ id: 1, name: "Teste", email: "teste@example.test", role: "OPERATOR", permissions: ["network.boxes.view"] });
    const detail = vi
      .spyOn(NetworkService.prototype, "detail")
      .mockResolvedValue({ box: networkBoxDto({ id: 1, descricao: "Caixa" }), queriedAt: "2026-10-07T12:00:00Z" });
    const db = vi.spyOn(IxcReadDatabase.prototype, "withSnapshot");
    const app = Fastify();
    await app.register(networkRoutes, { prefix: "/api/network" });
    try {
      const response = await app.inject({ url: "/api/network/boxes/1" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).not.toHaveProperty("items");
      expect(detail).toHaveBeenCalledTimes(1);
      expect(db).not.toHaveBeenCalled();
      expect((await app.inject({ url: "/api/network/boxes/1/logins" })).statusCode).toBe(403);
      authenticate.mockResolvedValue({
        id: 1,
        name: "Teste",
        email: "teste@example.test",
        role: "OPERATOR",
        permissions: ["support.logins.view"],
      });
      expect((await app.inject({ url: "/api/network/boxes/1" })).statusCode).toBe(403);
      authenticate.mockResolvedValue(null);
      expect((await app.inject({ url: "/api/network/boxes/1" })).statusCode).toBe(401);
      expect(detail).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
  it("retorna erros sanitizados e no-store", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ id: 1, name: "Teste", email: "teste@example.test", role: "ADMIN" });
    vi.spyOn(NetworkService.prototype, "boxes").mockRejectedValue(new Error("Senha do banco: SECRET"));
    const app = Fastify();
    await app.register(networkRoutes, { prefix: "/api/network" });
    const response = await app.inject({ url: "/api/network/boxes" });
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain("SECRET");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect((await app.inject({ url: "/api/network/boxes?status=invalid" })).statusCode).toBe(400);
    await app.close();
  });
  it("atualiza paletas antigas em memória e preserva a cor de Rede nos presets", () => {
    const old = structuredClone(defaultAppearance);
    delete (old.light as Partial<typeof old.light>).network;
    delete (old.dark as Partial<typeof old.dark>).network;
    expect(appearanceSchema.parse(old).dark.network).toBe(defaultAppearance.dark.network);
    const custom = structuredClone(defaultAppearance);
    custom.light.network = "#123456";
    custom.dark.network = "#abcdef";
    for (const preset of themePresets)
      expect(applyThemePreset(custom, preset)).toMatchObject({ light: { network: "#123456" }, dark: { network: "#abcdef" } });
  });
});
