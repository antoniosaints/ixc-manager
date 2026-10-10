import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { DirectRetentionService, directRetention, churnNavigationLifetimeMs } from "../src/services/retention/DirectRetentionService.js";
import { directRiskQueries, riskWindow } from "../src/services/retention/DirectRiskQueries.js";
import { assertReadQuery, type IxcReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { db } from "../src/repositories/database.js";
import { RetentionRiskEngine } from "../src/services/retention/RetentionRiskEngine.js";
import { retentionRoutes } from "../src/controllers/retentionController.js";
import { AuthService } from "../src/services/AuthService.js";
import fs from "node:fs";

const now = () => new Date("2026-10-06T15:00:00Z");
afterEach(() => vi.restoreAllMocks());
function fixture(clock: () => Date = now) {
  const sql = new DatabaseSync(":memory:");
  sql.function("DATEDIFF", (a: any, b: any) =>
    Math.floor((Date.parse(String(a).slice(0, 10)) - Date.parse(String(b).slice(0, 10))) / 86400000)
  );
  sql.function("LEAST", { varargs: true }, (...args: any[]) => Math.min(...args.map(Number)));
  sql.function("GREATEST", { varargs: true }, (...args: any[]) => Math.max(...args.map(Number)));
  sql.function("CONCAT", { varargs: true }, (...args: any[]) => args.map(String).join(""));
  sql.exec(`CREATE TABLE retention_churn_settings(id INTEGER PRIMARY KEY,configuration TEXT);
    CREATE TABLE cliente(id INTEGER PRIMARY KEY,ativo TEXT,razao TEXT,cidade INTEGER,bairro TEXT,grau_satisfacao TEXT,fone TEXT,telefone_celular TEXT,telefone_comercial TEXT,whatsapp TEXT,senha TEXT);
    CREATE TABLE cidade(id INTEGER PRIMARY KEY,nome TEXT);
    CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER,contrato TEXT,id_filial INTEGER,status TEXT,status_internet TEXT,data_ativacao TEXT,data_expiracao TEXT,dt_ult_bloq_auto TEXT,dt_ult_bloq_manual TEXT,dt_ult_des_bloq_conf TEXT,contrato_suspenso TEXT,data_inicial_suspensao TEXT,motivo_cancelamento INTEGER,data_cancelamento TEXT);
    CREATE TABLE fn_areceber(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,status TEXT,valor_aberto REAL,estornado TEXT,titulo_renegociado TEXT,data_vencimento TEXT,valor REAL,pagamento_data TEXT);
    CREATE TABLE su_ticket(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_assunto INTEGER,data_criacao TEXT,prioridade TEXT,su_status TEXT,status TEXT,status_sla TEXT,titulo TEXT);
    CREATE TABLE su_oss_chamado(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_assunto INTEGER,data_abertura TEXT,prioridade TEXT,status TEXT,status_sla TEXT,data_fechamento TEXT);
    CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,ativo TEXT,login TEXT,online TEXT,ip TEXT,ultima_conexao_final TEXT,ultima_conexao_inicial TEXT,concentrador TEXT,senha TEXT);
    CREATE TABLE radacct(radacctid INTEGER PRIMARY KEY,username TEXT,acctstarttime TEXT,acctsessiontime INTEGER,acctterminatecause TEXT);
    CREATE TABLE radusuarios_consumo_m(id INTEGER PRIMARY KEY,id_login INTEGER,data TEXT,consumo REAL,consumo_upload REAL);
    CREATE TABLE fn_areceber_mot_cancelamento(id INTEGER PRIMARY KEY,motivo TEXT);
    CREATE TABLE retention_customer_workflow(customer_id INTEGER,status TEXT,resolved_at TEXT,resolved_by_user_id INTEGER,updated_at TEXT);
    CREATE TABLE retention_contract_attention(contract_id INTEGER,customer_id INTEGER,marked_at TEXT);
    CREATE TABLE retention_customer_notes(id INTEGER,customer_id INTEGER,content TEXT,created_at TEXT);
    INSERT INTO cidade VALUES(1,'Cidade A'),(2,'Cidade B');
    INSERT INTO cliente(id,ativo,razao,cidade,grau_satisfacao,senha) VALUES(1,'S','Cliente A',1,'1','PRIVATE'),(2,'S','Cliente B',2,'5','PRIVATE'),(3,'N','Inativo',1,'1','PRIVATE'),(4,'S','Cancelado',1,'1','PRIVATE'),(5,'S','Sem nota',1,'','PRIVATE'),(6,'S','Sem contrato',1,'1','PRIVATE');
    INSERT INTO cliente_contrato(id,id_cliente,contrato,status,status_internet,data_ativacao,data_expiracao,dt_ult_bloq_auto,dt_ult_des_bloq_conf,contrato_suspenso) VALUES
    (101,1,'Plano A','A','CA','2025-01-01','2026-10-20','2026-09-20 09:00:00','2026-09-25 09:00:00','S'),
    (102,1,'Plano B','A','A','2025-01-01','2027-01-01',NULL,NULL,'N'),(201,2,'Plano C','A','A','2025-01-01',NULL,NULL,NULL,'N'),
    (301,3,'Plano A','A','A',NULL,NULL,NULL,NULL,NULL),(401,4,'Plano A','I','D',NULL,NULL,NULL,NULL,NULL),(501,5,'Plano A','A','A',NULL,NULL,NULL,NULL,NULL);
    INSERT INTO fn_areceber VALUES(1,1,101,'A',100,'N','N','2026-08-01',100,NULL),(2,1,101,'P',40,'N','N','2026-09-01',100,NULL),
    (3,1,101,'A',0,'N','N','2026-08-01',100,NULL),(4,1,101,'A',100,'S','N','2026-08-01',100,NULL),(5,1,101,'A',100,'N','S','2026-08-01',100,NULL),
    (6,1,101,'R',100,'N','N','2026-08-01',100,NULL),(7,1,101,'A',100,'N','N','2026-11-01',100,NULL),(8,2,101,'A',100,'N','N','2026-08-01',100,NULL),
    (9,4,401,'A',100,'N','N','2026-08-01',100,NULL),(10,1,101,'A',100,'N','N','0000-00-00',100,NULL);
    INSERT INTO radusuarios VALUES(11,1,101,'S','demo','N','100.0.0.1','2026-10-01',NULL,'Região A','PRIVATE'),(12,2,201,'S','other','S',NULL,'2026-10-01',NULL,'Região B','PRIVATE'),(13,1,101,'N','inactive','S',NULL,NULL,NULL,'Região A','PRIVATE');
    INSERT INTO radusuarios_consumo_m VALUES(1,11,'2026-09-01',100,10),(2,11,'2026-10-01',1000,10),(3,11,'2026-10-01',25,5),(4,13,'2026-10-01',9999,1),(5,11,'2026-11-01',9999,1);
    INSERT INTO retention_customer_workflow VALUES(2,'RESOLVED','2026-10-01',1,'2026-10-01');
    INSERT INTO retention_contract_attention VALUES(101,1,'2026-10-01');
    INSERT INTO fn_areceber_mot_cancelamento VALUES(1,'Desistência');
    UPDATE cliente_contrato SET motivo_cancelamento=1,data_cancelamento='2026-10-01' WHERE id=401;`);
  for (let i = 1; i <= 4; i++)
    sql.prepare(`INSERT INTO su_ticket VALUES(?,1,7,'2026-10-01 09:00:00','C','N','T','ATRASADO','Suporte')`).run(i);
  for (let i = 1; i <= 2; i++) sql.prepare(`INSERT INTO su_oss_chamado VALUES(?,1,7,'2026-10-02 09:00:00','N','A',NULL,NULL)`).run(i);
  for (let i = 1; i <= 24; i++)
    sql
      .prepare(`INSERT INTO radacct VALUES(?,'demo',?,120,'Lost-Carrier')`)
      .run(i, i <= 20 ? "2026-10-01 09:00:00" : "2026-09-10 09:00:00");
  sql.exec(
    `INSERT INTO radacct VALUES(25,'inactive','2026-10-01 09:00:00',1,'Lost-Carrier'),(26,'demo','2026-10-07 09:00:00',1,'Lost-Carrier');`
  );
  const select = vi.fn(async (q: IxcReadQuery) => {
    assertReadQuery(q);
    const statement = q.sql.replace(
      /GROUP_CONCAT\(DISTINCT NULLIF\(r\.concentrador,''\) SEPARATOR '[\s\S]*?'\)/g,
      "GROUP_CONCAT(DISTINCT NULLIF(r.concentrador,''))"
    );
    return sql.prepare(statement).all(...q.params) as any[];
  });
  const reader = { withSnapshot: vi.fn(async (read: any) => read({ select })), close: vi.fn(async () => {}) };
  vi.spyOn(db, "query").mockImplementation(async (query: any, params: any = []) => [sql.prepare(query).all(...params), []] as any);
  return { sql, select, reader, service: new DirectRetentionService(reader, clock) };
}
describe("Churn direto sem processamento em segundo plano", () => {
  it("reutiliza somente a navegação explícita por até 30s, relê tratativas e não reaproveita detalhes individuais", async () => {
    let time = now().getTime();
    const { sql, reader, service } = fixture(() => new Date(time));
    const filters = { workflowStatus: "ALL" as const, page: 1, limit: 10 };
    try {
      const first = await service.listCustomers(filters);
      expect(first.snapshotId).toMatch(/^[0-9a-f-]{36}$/);
      sql.exec("DELETE FROM retention_contract_attention");
      const page = await service.listCustomers({ ...filters, snapshotId: first.snapshotId, page: 2 });
      expect(reader.withSnapshot).toHaveBeenCalledOnce();
      expect(page.queriedAt).toBe(first.queriedAt);
      expect(page.snapshotId).toBe(first.snapshotId);
      const updatedAttention = await service.listCustomers({ ...filters, attentionOnly: true, snapshotId: first.snapshotId });
      expect(updatedAttention.total).toBe(0);
      expect(reader.withSnapshot).toHaveBeenCalledOnce();
      await service.getSnapshot(1, 102);
      expect(reader.withSnapshot).toHaveBeenCalledTimes(2);
      time += churnNavigationLifetimeMs;
      const expired = await service.listCustomers({ ...filters, snapshotId: first.snapshotId });
      expect(reader.withSnapshot).toHaveBeenCalledTimes(3);
      expect(expired.snapshotId).not.toBe(first.snapshotId);
      expect(expired.queriedAt).not.toBe(first.queriedAt);
      const fresh = await service.listCustomers(filters);
      expect(reader.withSnapshot).toHaveBeenCalledTimes(4);
      expect(fresh.snapshotId).not.toBe(expired.snapshotId);
    } finally {
      await service.close();
      sql.close();
    }
  });
  it("descarta a navegação anterior quando as faixas mudam e não usa tokens desconhecidos", async () => {
    const { sql, reader, service } = fixture();
    const filters = { workflowStatus: "ALL" as const, page: 1, limit: 10 };
    try {
      const first = await service.listCustomers(filters);
      sql
        .prepare("INSERT INTO retention_churn_settings VALUES(1,?)")
        .run(JSON.stringify({ low: 0, attention: 45, medium: 65, high: 75, critical: 95 }));
      const changed = await service.listCustomers({ ...filters, snapshotId: first.snapshotId });
      expect(changed.items.find((row) => row.contract_id === 102)?.risk_level).toBe("ATTENTION");
      expect(changed.snapshotId).not.toBe(first.snapshotId);
      expect(reader.withSnapshot).toHaveBeenCalledTimes(2);
      await service.listCustomers({ ...filters, snapshotId: "00000000-0000-4000-8000-000000000000" });
      expect(reader.withSnapshot).toHaveBeenCalledTimes(3);
    } finally {
      await service.close();
      sql.close();
    }
  });
  it("reclassifica análise, detalhes, filtros, cards e agrupamentos com as faixas salvas, sem alterar pontos", async () => {
    const { sql, service } = fixture();
    try {
      const before = await service.analyze(1);
      const changed = { low: 0, attention: 45, medium: 65, high: 75, critical: 95 };
      sql.prepare("INSERT INTO retention_churn_settings VALUES(1,?)").run(JSON.stringify(changed));
      const after = await service.analyze(1);
      const previous = before.contracts.find((c) => c.id === 102)!;
      const current = after.contracts.find((c) => c.id === 102)!;
      expect(previous.level).toBe("HIGH");
      expect(current).toMatchObject({ score: 60, level: "ATTENTION", factors: previous.factors, reasons: previous.reasons });
      expect((await service.getSnapshot(1, 102))?.customer.risk_level).toBe("ATTENTION");
      expect(await service.getSummary()).toMatchObject({ highRisk: 0, attention: 1, critical: 1 });
      expect((await service.listCustomers({ riskLevel: "HIGH", workflowStatus: "ALL", page: 1, limit: 10 })).total).toBe(0);
      expect(
        (await service.listCustomers({ riskLevel: "ATTENTION", workflowStatus: "ALL", page: 1, limit: 10 })).items[0]?.contract_id
      ).toBe(102);
      expect((await service.analytics("cities")).items.find((row) => row.label === "Cidade A")?.highRisk).toBe(1);
    } finally {
      sql.close();
    }
  });
  it("executa os agregados reais, preserva as regras do motor e lê satisfação e histórico sem espelho", async () => {
    const { sql, service, select } = fixture();
    try {
      const analysis = await service.analyze(1);
      expect(analysis.partial).toBe(false);
      expect(analysis.customer.satisfaction).toBe(1);
      expect(analysis.contracts.find((c) => c.id === 101)).toMatchObject({
        score: 100,
        level: "CRITICAL",
        factors: { financial: 30, support: 25, network: 25, contract: 10, satisfaction: 10 },
      });
      expect(analysis.contracts.find((c) => c.id === 102)).toMatchObject({ score: 60, level: "HIGH" });
      const context = {
        customerId: 1,
        contractId: 101,
        satisfaction: 1,
        financial: { overdueInvoices: 2, maxOverdueDays: 66, recentBlock: true, recentTrustUnlock: true },
        support: { tickets30d: 4, recurringSubjects: 1, criticalTickets: 4, pendingTickets: 4, slaProblems: 4, serviceOrders30d: 2 },
        network: {
          disconnects7d: 20,
          baselineDisconnects7d: 1,
          shortSessions7d: 20,
          offlineDays: 0,
          consumptionDropPercent: 75,
          recurringTerminateCause: true,
        },
        contract: { fidelityDaysRemaining: 14, recentBlock: true, recentSuspension: true },
      };
      expect(analysis.contracts.find((c) => c.id === 101)?.reasons).toEqual(
        new RetentionRiskEngine().calculate(context).reasons.sort((a, b) => b.points - a.points)
      );
      expect(select.mock.calls.every(([q]) => !q.sql.includes("retention_"))).toBe(true);
      expect(JSON.stringify(analysis)).not.toContain("PRIVATE");
    } finally {
      sql.close();
    }
  });
  it("cards, Alto >=60, filtros, tratativas e agrupamentos compartilham os mesmos scores", async () => {
    const { sql, service } = fixture();
    try {
      const summary = await service.getSummary();
      expect(summary).toMatchObject({ lowRisk: 2, highRisk: 1, critical: 1, satisfactionCoverage: { rated: 2, total: 3, missing: 1 } });
      const list = await service.listCustomers({ riskLevel: "HIGH", workflowStatus: "ALL", page: 1, limit: 10 });
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({ contract_id: 102, score: 60, risk_level: "HIGH" });
      expect((await service.listCustomers({ workflowStatus: "RESOLVED", page: 1, limit: 10 })).items.map((r) => r.customer_id)).toEqual([
        2,
      ]);
      expect(
        (await service.listCustomers({ attentionOnly: true, workflowStatus: "ALL", page: 1, limit: 10 })).items.map((r) => r.contract_id)
      ).toEqual([101]);
      expect(
        (await service.listCustomers({ overdue: true, workflowStatus: "ALL", page: 1, limit: 10 })).items.map((r) => r.contract_id)
      ).toEqual([101]);
      expect((await service.listCustomers({ openSupport: true, workflowStatus: "ALL", page: 1, limit: 10 })).total).toBe(2);
      expect((await service.listCustomers({ blocked: true, workflowStatus: "ALL", page: 1, limit: 10 })).total).toBe(1);
      expect((await service.listCustomers({ city: "2", search: "CLIENTE", workflowStatus: "ALL", page: 1, limit: 10 })).total).toBe(1);
      expect((await service.analytics("cities")).items[0]).toMatchObject({ label: "Cidade A", customers: 2, highRisk: 2 });
      expect((await service.analytics("network-regions")).items.find((r) => r.label === "Região A")).toMatchObject({
        customers: 1,
        highRisk: 2,
      });
      expect((await service.analytics("cancellation-reasons")).items).toEqual([{ label: "Desistência (ID 1)", total: 1 }]);
    } finally {
      sql.close();
    }
  });
  it("agrupa cancelamentos por ID e monta rótulos fora do SQL, sem misturar collations", async () => {
    const { sql, select, service } = fixture();
    try {
      sql.exec(`INSERT INTO fn_areceber_mot_cancelamento VALUES(2,'Desistência'),(3,''),(4,NULL);
        INSERT INTO cliente_contrato(id,status,motivo_cancelamento) VALUES
        (402,'I',1),(403,'I',2),(404,'I',3),(405,'I',4),(406,'I',99),(407,'I',NULL),(408,'A',1);`);
      const { items } = await service.analytics("cancellation-reasons");
      expect(items).toHaveLength(6);
      expect(items).toEqual(
        expect.arrayContaining([
          { label: "Desistência (ID 1)", total: 2 },
          { label: "Desistência (ID 2)", total: 1 },
          { label: "Motivo não identificado (ID 3)", total: 1 },
          { label: "Motivo não identificado (ID 4)", total: 1 },
          { label: "Motivo não identificado (ID 99)", total: 1 },
          { label: "Motivo não identificado (ID 0)", total: 1 },
        ])
      );
      expect(items.reduce((sum, item) => sum + item.total!, 0)).toBe(7);
      expect(select.mock.calls[0][0].sql).not.toMatch(/CONCAT|COALESCE/);
    } finally {
      sql.close();
    }
  });
  it("diferencia nota ausente de satisfação alta e recusa vínculo de outro cliente", async () => {
    const { sql, service } = fixture();
    try {
      expect(await service.getSnapshot(1, 201)).toBeNull();
      expect(await service.getSnapshot(3, 301)).toBeNull();
      expect(await service.getSnapshot(4, 401)).toBeNull();
      const missing = await service.getSnapshot(5, 501);
      expect(missing?.customer).toMatchObject({ satisfaction: null, satisfaction_score: 0 });
      expect(missing?.warnings[0]).toContain("não indica cliente satisfeito");
      const high = await service.getSnapshot(2, 201);
      expect(high?.customer).toMatchObject({ satisfaction: 5, satisfaction_score: 0 });
      expect(high?.warnings).toEqual([]);
      expect((await service.analyze(3)).contracts).toEqual([]);
      expect((await service.analyze(4)).message).toContain("Nenhum contrato");
    } finally {
      sql.close();
    }
  });
  it("detalhes e PDF usam o mesmo cálculo; histórico, consumo e notas são consultados sem sincronização", async () => {
    const { sql, service } = fixture();
    try {
      const profile = await service.customerDetails(1, 101);
      expect(profile?.customer.score).toBe(100);
      expect(profile?.workflow.attentionCritical).toBe(true);
      expect(profile?.connection.find((row) => row.date === "2026-10-01")?.disconnects).toBe(20);
      expect(profile?.usage[1]?.download_consumption).toBe(25);
      expect(profile?.notes).toEqual([]);
      const history = (await service.timeline(1)).events;
      expect(history.find((e) => e.type === "CONNECTION")).toMatchObject({ recordId: null, status: null });
      expect(history.find((e) => e.type === "FINANCIAL" && e.recordId === 6)).toMatchObject({ description: "Título #6", status: "R" });
      expect(history.find((e) => e.type === "SERVICE_ORDER")).toMatchObject({ recordId: expect.any(Number), status: null });
      expect(history.find((e) => e.type === "TICKET")).toMatchObject({ recordId: expect.any(Number), status: null });
    } finally {
      sql.close();
    }
  });
  it("respeita o online do IXC mesmo com IP retido e sem ONU", async () => {
    const { sql, service } = fixture();
    try {
      sql.exec("DELETE FROM radacct; DELETE FROM radusuarios_consumo_m;");
      const offline = await service.analyze(1);
      expect(offline.contracts[0]?.reasons.some((r) => r.code === "ABNORMAL_OFFLINE")).toBe(true);
      sql.exec("UPDATE radusuarios SET online='S' WHERE id=11");
      expect((await service.analyze(1)).contracts[0]?.reasons.some((r) => r.code === "ABNORMAL_OFFLINE")).toBe(false);
    } finally {
      sql.close();
    }
  });
  it("falha em uma fonte não vira risco baixo e não expõe SQL", async () => {
    const { sql, service, select } = fixture();
    try {
      select.mockRejectedValueOnce(new Error("PRIVATE_SQL_ERROR"));
      await expect(service.listCustomers({ workflowStatus: "ALL", page: 1, limit: 10 })).rejects.toThrow(
        "Não foi possível consultar todas"
      );
      select.mockImplementation(async (q) => {
        if (q.name.endsWith("sessions")) throw new Error("PRIVATE_SQL_ERROR");
        return sql
          .prepare(
            q.sql.replace(
              /GROUP_CONCAT\(DISTINCT NULLIF\(r\.concentrador,''\) SEPARATOR '[\s\S]*?'\)/g,
              "GROUP_CONCAT(DISTINCT NULLIF(r.concentrador,''))"
            )
          )
          .all(...q.params) as any[];
      });
      await expect(service.analyze(1)).rejects.not.toThrow("PRIVATE_SQL_ERROR");
    } finally {
      sql.close();
    }
  });
  it("junta consultas simultâneas, sem guardar resultado concluído nem gerar escrita", async () => {
    const { sql, service, reader } = fixture();
    const execute = vi.spyOn(db, "execute");
    try {
      await Promise.all([
        service.getSummary(),
        service.listCustomers({ page: 1, limit: 10, workflowStatus: "ALL" }),
        service.analytics("plans"),
      ]);
      expect(reader.withSnapshot).toHaveBeenCalledOnce();
      await service.getSummary();
      expect(reader.withSnapshot).toHaveBeenCalledTimes(2);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      sql.close();
    }
  });
  it("interrompe consulta fechada e não inicia operação para sinal já cancelado", async () => {
    const { sql, service, reader } = fixture();
    try {
      const controller = new AbortController();
      controller.abort();
      await expect(service.analyze(1, controller.signal)).rejects.toMatchObject({ statusCode: 499 });
      expect(reader.withSnapshot).not.toHaveBeenCalled();
    } finally {
      sql.close();
    }
  });
  it("usa datas de Brasília e limita as janelas de Radius e consumo", () => {
    expect(riskWindow(new Date("2026-10-01T02:30:00Z"))).toMatchObject({
      today: "2026-09-30",
      weekStart: "2026-09-23",
      historyStart: "2026-08-26",
      monthStart: "2026-09-01",
      usageStart: "2026-06-01",
    });
    for (const q of Object.values(directRiskQueries(now(), 1))) assertReadQuery(q);
  });
  it("as rotas de atualização concluem sem fila e o backend não inicia scheduler/worker", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ id: 1, role: "ADMIN", permissions: [] } as any);
    vi.spyOn(directRetention, "getSnapshot").mockResolvedValue({ customer: { id: 1, contract_id: 101 } } as any);
    vi.spyOn(directRetention, "getSummary").mockResolvedValue({} as any);
    const app = Fastify();
    await app.register(retentionRoutes, { prefix: "/api/retention" });
    try {
      for (const path of ["/recalculate", "/customers/1/recalculate", "/sync"]) {
        const result = await app.inject({ method: "POST", url: `/api/retention${path}` });
        expect(result.statusCode).toBe(200);
        expect(result.json()).toMatchObject({ status: "completed", source: "database" });
        expect(result.json().jobId).toBeUndefined();
      }
      expect((await app.inject("/api/retention/sync/status")).json().counts.active).toBe(0);
      const entry = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
      expect(entry).not.toContain("retentionWorker");
      expect(entry).not.toContain("scheduleRetentionJobs");
    } finally {
      await app.close();
    }
  });
  it("marca um contrato validado sem sincronização, preservando a referência exigida pela FK e as permissões", async () => {
    const { sql, service } = fixture();
    const authenticated = vi
      .spyOn(AuthService.prototype, "authenticate")
      .mockResolvedValue({ id: 1, role: "OPERATOR", permissions: ["churn.attention.manage"] } as any);
    vi.spyOn(directRetention, "getSnapshot").mockImplementation((customerId, contractId) => service.getSnapshot(customerId, contractId));
    const execute = vi.spyOn(db, "execute").mockResolvedValue([{ insertId: 1 }, []] as any);
    const app = Fastify();
    await app.register(retentionRoutes, { prefix: "/api/retention" });
    try {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/retention/customers/1/attention",
        payload: { contractId: 102, critical: true },
      });
      expect(response.statusCode).toBe(200);
      expect(execute.mock.calls[0]?.[0]).toContain("INSERT INTO retention_contracts");
      expect(execute.mock.calls[0]?.[1]).toEqual([102, 1, "A", "Plano B", "A"]);
      expect(execute.mock.calls[1]?.[0]).toContain("INSERT INTO retention_contract_attention");
      execute.mockClear();
      expect(
        (await app.inject({ method: "PATCH", url: "/api/retention/customers/1/attention", payload: { contractId: 201, critical: true } }))
          .statusCode
      ).toBe(404);
      expect(execute).not.toHaveBeenCalled();
      expect(
        (await app.inject({ method: "PATCH", url: "/api/retention/customers/2/attention", payload: { contractId: 201, critical: true } }))
          .statusCode
      ).toBe(409);
      expect(execute).not.toHaveBeenCalled();
      authenticated.mockResolvedValue({ id: 1, role: "OPERATOR", permissions: [] } as any);
      expect(
        (await app.inject({ method: "PATCH", url: "/api/retention/customers/1/attention", payload: { contractId: 102, critical: true } }))
          .statusCode
      ).toBe(403);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      await app.close();
      sql.close();
    }
  });
});
