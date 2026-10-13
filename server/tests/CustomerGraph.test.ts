import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerGraphService, type GraphAccess } from "../src/services/support/CustomerGraphService.js";
import {
  IxcReadDatabase,
  assertReadQuery,
  type IxcReadSession,
  type IxcReadQuery,
} from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { supportRoutes } from "../src/controllers/supportController.js";
import { AuthService } from "../src/services/AuthService.js";
import { graphInsights, graphRelations, recordTarget, type CustomerGraph } from "../../client/src/customerGraph/model.js";
import { writeFileSync } from "node:fs";

const all: GraphAccess = { contracts: true, logins: true, orders: true, tickets: true, equipment: true, financial: "full" };
const now = () => new Date("2026-10-13T19:00:00Z");
afterEach(() => vi.restoreAllMocks());
function fixture(failedArea?: string) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE cidade(id INTEGER PRIMARY KEY,nome TEXT);
    CREATE TABLE cliente(id INTEGER PRIMARY KEY,razao TEXT,ativo TEXT,cidade INTEGER,bairro TEXT,grau_satisfacao TEXT,data_cadastro TEXT,senha TEXT);
    CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER,contrato TEXT,status TEXT,status_internet TEXT,data_ativacao TEXT,data_expiracao TEXT);
    CREATE TABLE rad_caixa_ftth(id INTEGER PRIMARY KEY,descricao TEXT);
    CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,login TEXT,ativo TEXT,online TEXT,ip TEXT,id_caixa_ftth INTEGER,ftth_porta INTEGER,ultima_conexao_inicial TEXT,senha TEXT);
    CREATE TABLE su_oss_assunto(id INTEGER PRIMARY KEY,assunto TEXT);
    CREATE TABLE su_ticket(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,id_login INTEGER,id_assunto INTEGER,titulo TEXT,su_status TEXT,prioridade TEXT,protocolo TEXT,data_criacao TEXT);
    CREATE TABLE su_oss_chamado(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato_kit INTEGER,id_login INTEGER,id_ticket INTEGER,id_assunto INTEGER,status TEXT,prioridade TEXT,protocolo TEXT,data_abertura TEXT);
    CREATE TABLE fn_areceber(id TEXT PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,status TEXT,data_vencimento TEXT,valor NUMERIC,valor_aberto NUMERIC,documento TEXT,estornado TEXT,titulo_renegociado TEXT);
    CREATE TABLE movimento_produtos(id INTEGER PRIMARY KEY,id_contrato INTEGER,id_login INTEGER,descricao TEXT,status_comodato TEXT,numero_serie TEXT,quantidade NUMERIC,data TEXT);
    INSERT INTO cidade VALUES(1,'Bacabal');
    INSERT INTO cliente VALUES(1,'Marina Costa','S',1,'Centro','2','2023-02-18','PRIVATE_CUSTOMER_PASSWORD'),(2,'Outro cliente','S',1,'Centro','5','2024-01-01','PRIVATE');
    INSERT INTO cliente_contrato VALUES(10,1,'Fibra 600 Mega','A','CA','2023-02-20','2026-11-01'),(11,1,'Plano anterior','I','D','2021-01-01','2022-01-01'),(20,2,'Contrato de terceiro','A','A','2024-01-01','2027-01-01');
    INSERT INTO rad_caixa_ftth VALUES(1,'CTO Centro 03');
    INSERT INTO radusuarios VALUES(100,1,10,'marina.fibra','S','N','100.64.0.10',1,4,'2026-10-12','PRIVATE_LOGIN_PASSWORD'),
      (101,1,10,'marina.casa','S','S','100.64.0.11',1,5,'2026-10-13','PRIVATE'),(102,1,20,'vinculo-invalido','N','N',NULL,NULL,NULL,NULL,'PRIVATE'),(200,2,20,'terceiro','S','S','100.64.0.12',1,6,'2026-10-13','PRIVATE');
    INSERT INTO su_oss_assunto VALUES(1,'Oscilação de conexão'),(2,'Instalação de roteador');
    INSERT INTO su_ticket VALUES(300,1,10,100,1,'Internet intermitente','EP','A','20261013001','2026-10-12'),(301,1,10,101,2,'Visita de instalação','S','N','20261001002','2026-10-01'),(399,2,20,200,1,'Atendimento de terceiro','N','N','P','2026-10-12');
    INSERT INTO su_oss_chamado VALUES(400,1,10,100,300,1,'AG','A','OS-400','2026-10-13'),(401,1,20,200,399,2,'F','N','OS-401','2026-09-01');
    INSERT INTO fn_areceber VALUES('500',1,10,'P','2026-10-05',129.90,79.90,'Mensalidade Outubro','N','N'),
      ('501',1,10,'A','2026-11-05',129.90,129.90,'Mensalidade Novembro','N','N'),
      ('9007199254740993',1,10,'R','2026-09-05',129.90,0,'Mensalidade Setembro','N','N'),
      ('503',1,10,'A','2026-01-01',100,100,'Estornado','S','N'),('504',1,10,'A','2026-01-01',100,100,'Renegociado','N','S'),
      ('505',1,10,'A','0000-00-00',10,10,'Sem vencimento','N','N'),('599',2,20,'A','2026-01-01',1000,1000,'Terceiro','N','N');
    INSERT INTO movimento_produtos VALUES(600,10,100,'ONU Wi-Fi 6','E','DEMO-SERIE',1,'2023-02-20'),(601,10,100,'Roteador devolvido','D','DEVOLVIDO',1,'2022-01-01'),(699,20,200,'Equipamento terceiro','E','TERCEIRO',1,'2024-01-01');`);
  for (let i = 0; i < 15; i++)
    db.prepare("INSERT INTO su_oss_chamado VALUES(?,1,10,101,NULL,2,'F','N',?,'2025-01-01')").run(410 + i, `OS-${410 + i}`);
  const select = vi.fn(async <T extends object>(q: IxcReadQuery): Promise<T[]> => {
    assertReadQuery(q);
    if (failedArea && q.name.includes(`-${failedArea}-`)) throw new Error("PRIVATE_DATABASE_ERROR");
    return db.prepare(q.sql).all(...q.params) as T[];
  });
  const reader = {
    withSnapshot: async <T>(read: (s: IxcReadSession) => Promise<T>, signal?: AbortSignal) => {
      if (signal?.aborted) throw Object.assign(new Error("Consulta interrompida"), { statusCode: 499 });
      return read({ select });
    },
    close: async () => {},
  };
  return { db, select, reader, service: new CustomerGraphService(reader, now) };
}

describe("Mapa 360° do cliente", () => {
  it("agrega todo o histórico, prioriza pendências na amostra e só relaciona registros do mesmo cliente", async () => {
    const { db, service, select } = fixture();
    try {
      const data = await service.get(1, all);
      expect(data.partial).toBe(false);
      expect(data.customer).toMatchObject({ id: 1, name: "Marina Costa", satisfaction: 2 });
      expect(data.groups.orders.total).toBe(17);
      expect(data.groups.orders.records).toHaveLength(12);
      expect(data.groups.orders.records[0]).toMatchObject({ id: "400", contractId: 10, loginId: 100, ticketId: 300, tone: "danger" });
      expect(data.groups.orders.records.find((r) => r.id === "401")).toMatchObject({ contractId: null, loginId: null, ticketId: null });
      expect(data.groups.logins.metrics).toMatchObject({ active: 2, online: 1, offline: 1 });
      expect(data.groups.logins.records.find((r) => r.id === "102")?.contractId).toBeNull();
      expect(data.groups.financial.metrics).toMatchObject({ open: 3, overdue: 1, openBalance: 219.8, overdueBalance: 79.9 });
      expect(data.groups.financial.records.find((r) => r.id === "9007199254740993")?.id).toBe("9007199254740993");
      expect(data.groups.financial.records.find((r) => r.id === "505")?.tone).toBe("warning");
      expect(data.groups.equipment.records.map((r) => r.id)).toEqual(["600"]);
      expect(JSON.stringify(data)).not.toMatch(/PRIVATE|Terceiro|terceiro|senha/);
      expect(select.mock.calls.every(([q]) => q.timeoutSeconds === 3)).toBe(true);
      const clientData = data as CustomerGraph;
      expect(graphRelations(Object.values(data.groups).flatMap((g) => g.records))).toContainEqual({
        from: "orders:400",
        to: "tickets:300",
        label: "Atendimento vinculado",
      });
      expect(graphInsights(clientData).map((i) => i.key)).toEqual(
        expect.arrayContaining(["overdue", "offline", "urgent", "blocked", "expiring", "cross"])
      );
      if (process.env.CUSTOMER_GRAPH_PREVIEW) writeFileSync(process.env.CUSTOMER_GRAPH_PREVIEW, JSON.stringify(data));
    } finally {
      db.close();
    }
  });
  it("não consulta fontes sem permissão e mostra só indicadores financeiros quando autorizado à análise", async () => {
    const { db, service, select } = fixture();
    try {
      const summary = await service.get(1, { ...all, financial: "summary" });
      expect(summary.groups.financial).toMatchObject({ state: "ok", total: 4, detailsRestricted: true, records: [] });
      expect(select.mock.calls.some(([q]) => q.name === "customer-graph-financial-records")).toBe(false);
      select.mockClear();
      const limited = await service.get(1, {
        contracts: false,
        logins: false,
        orders: false,
        tickets: false,
        equipment: false,
        financial: "none",
      });
      expect(select).toHaveBeenCalledOnce();
      expect(Object.values(limited.groups).every((g) => g.state === "restricted" && g.total === null && g.records.length === 0)).toBe(true);
      expect(graphInsights(limited as CustomerGraph)).toEqual([]);
    } finally {
      db.close();
    }
  });
  it("isola falha de uma fonte, não divulga o erro e não transforma indisponibilidade em zero", async () => {
    const { db, service } = fixture("financial");
    try {
      const data = await service.get(1, all);
      expect(data.partial).toBe(true);
      expect(data.groups.financial).toMatchObject({ state: "unavailable", total: null, metrics: {}, records: [] });
      expect(data.groups.logins.state).toBe("ok");
      expect(graphInsights(data as CustomerGraph).some((i) => i.key === "overdue")).toBe(false);
      expect(JSON.stringify(data)).not.toContain("PRIVATE_DATABASE_ERROR");
      await expect(service.get(999, all)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.get(0, all)).rejects.toMatchObject({ statusCode: 400 });
      const controller = new AbortController();
      controller.abort();
      await expect(service.get(1, all, controller.signal)).rejects.toMatchObject({ statusCode: 499 });
    } finally {
      db.close();
    }
  });
  it("a rota exige cadastro, respeita permissões por área, valida ID e devolve no-store", async () => {
    const { db, reader, select } = fixture();
    vi.spyOn(IxcReadDatabase.prototype, "withSnapshot").mockImplementation(reader.withSnapshot);
    let permissions = ["support.customer.view", "support.customer.analyze"];
    vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async (request) =>
      request.headers.authorization ? { id: 1, name: "Operador", email: "test@example.test", role: "OPERATOR", permissions } : null
    );
    const app = Fastify();
    await app.register(supportRoutes, { prefix: "/api/support" });
    try {
      expect((await app.inject({ url: "/api/support/customers/1/graph" })).statusCode).toBe(401);
      permissions = [];
      expect((await app.inject({ url: "/api/support/customers/1/graph", headers: { authorization: "test" } })).statusCode).toBe(403);
      expect(select).not.toHaveBeenCalled();
      permissions = ["support.customer.view", "support.customer.analyze"];
      const response = await app.inject({ url: "/api/support/customers/1/graph", headers: { authorization: "test" } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json().groups.financial.detailsRestricted).toBe(true);
      expect(response.json().groups.orders.state).toBe("restricted");
      expect((await app.inject({ url: "/api/support/customers/0/graph", headers: { authorization: "test" } })).statusCode).toBe(400);
      expect((await app.inject({ url: "/api/support/customers/999/graph", headers: { authorization: "test" } })).statusCode).toBe(404);
    } finally {
      await app.close();
      db.close();
    }
  });
  it("não inventa relações ausentes nem atalhos para IDs financeiros além da precisão numérica", () => {
    const record = {
      key: "orders:1",
      kind: "orders" as const,
      id: "1",
      title: "OS",
      subtitle: null,
      status: "A",
      tone: "warning" as const,
      contractId: 10,
      loginId: 5,
      ticketId: 99,
      date: null,
      facts: [],
    };
    expect(graphRelations([record])).toEqual([]);
    expect(recordTarget({ ...record, kind: "financial", id: "9007199254740993" }, 1)).toBeNull();
    expect(recordTarget(record, 1)).toEqual({ kind: "orders", id: 1, customerId: 1 });
    expect(recordTarget({ ...record, kind: "logins", id: "13621", contractId: null }, 6263)).toEqual({
      kind: "login",
      id: 13621,
      customerId: 6263,
    });
  });
});
