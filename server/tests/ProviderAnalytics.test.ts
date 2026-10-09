import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {
  ProviderAnalyticsService,
  providerAnalyticsSql,
  providerAnalyticsQuery,
  portfolioEvolutionQuery,
} from "../src/services/providerAnalytics/ProviderAnalyticsService.js";
import { IxcReadDatabase, assertReadQuery, type IxcReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { AuthService } from "../src/services/AuthService.js";
import { providerAnalyticsRoutes } from "../src/controllers/providerAnalyticsController.js";
import { defaultActivationSettings } from "../src/services/settings/AnalyticsSettingsService.js";
import { effectivePermissions, rolePermissions } from "../src/config/permissions.js";
const period = { from: "2026-10-01", to: "2026-10-09" };
const now = () => new Date("2026-10-09T15:00:00Z");
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE cliente(id INTEGER PRIMARY KEY,ativo TEXT,cidade INTEGER,razao TEXT);
    CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER,status TEXT,status_internet TEXT,data_ativacao TEXT,data_cancelamento TEXT,data_expiracao TEXT,cidade INTEGER);
    CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,ativo TEXT,ip TEXT,endereco_padrao_cliente TEXT,cidade INTEGER);
    CREATE TABLE cidade(id INTEGER PRIMARY KEY,nome TEXT);
    CREATE TABLE su_oss_chamado(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_assunto INTEGER,status TEXT,prioridade TEXT,data_abertura TEXT,data_agenda TEXT,data_fechamento TEXT);
    CREATE TABLE su_oss_assunto(id INTEGER PRIMARY KEY,assunto TEXT);
    CREATE TABLE su_ticket(id INTEGER PRIMARY KEY,su_status TEXT,status TEXT,mensagens_nao_lida_sup INTEGER,data_criacao TEXT);
    INSERT INTO cliente VALUES(1,'S',1,'Cliente A'),(2,'S',1,'Cliente B'),(3,'N',2,'Cliente C'),(4,'S',NULL,'Sem contrato');
    INSERT INTO cidade VALUES(1,'Cidade A'),(2,'Cidade B');
    INSERT INTO cliente_contrato VALUES
      (1,1,'A','CA','2026-10-01',NULL,'2026-10-10',1),
      (2,1,'A','CM','2026-09-01',NULL,'2026-10-20',1),
      (3,2,'A','A','2026-10-09',NULL,'2026-10-08',1),
      (4,3,'A','CA','2026-10-01',NULL,'2026-10-20',2),
      (5,3,'I','D','2026-09-01','2026-10-01','2026-10-20',2),
      (6,3,'I','D','2026-10-01','2026-10-09','2026-10-20',2),
      (7,3,'I','D','0000-00-00','2026-10-10','2026-10-20',2),
      (8,2,'A','A','2026-10-10',NULL,'0000-00-00',1),
      (9,2,'A','A','2026-09-01',NULL,'2026-11-09',1);
    INSERT INTO radusuarios VALUES
      (1,1,1,'S','100.1.1.1','S',NULL),(2,1,1,'S','0.0.0.0','S',NULL),
      (3,2,3,'S','  ','S',NULL),(4,2,3,'S','::','S',NULL),
      (5,3,5,'S',NULL,'S',NULL),(6,2,1,'S',NULL,'S',NULL),
      (7,2,3,'N',NULL,'S',NULL),(8,2,3,'S','0','S',NULL);
    INSERT INTO su_oss_assunto VALUES(1,'Suporte técnico');
    INSERT INTO su_oss_chamado VALUES
      (1,1,1,'A','C','2026-10-07 11:59:59','2026-10-09 11:59:59',NULL),
      (2,2,1,'AG','N','2026-10-07 12:00:00','2026-10-09 12:00:00',NULL),
      (3,1,1,'F','A','2026-10-01 12:00:00','2026-10-01 12:00:00','2026-10-09 16:00:00'),
      (4,1,1,'F','N','2026-10-01 12:00:00',NULL,'2026-10-10 12:00:00'),
      (5,1,1,'','N','0000-00-00',NULL,NULL);
    INSERT INTO su_ticket VALUES
      (1,'N','F',2,'2026-10-07 11:59:59'),
      (2,'S','T',3,'2026-10-01 12:00:00'),
      (3,'EP','EX',0,'2026-10-07 12:00:00'),
      (4,'C','T',2,'2026-10-01 12:00:00');`);
  sqlite.exec("ALTER TABLE radusuarios ADD COLUMN online TEXT");
  sqlite.exec(`ALTER TABLE cliente_contrato ADD COLUMN data_cadastro_sistema TEXT;
    ALTER TABLE cliente_contrato ADD COLUMN data_acesso_desativado TEXT;
    ALTER TABLE cliente_contrato ADD COLUMN motivo_cancelamento INTEGER;
    CREATE TABLE fn_areceber_mot_cancelamento(id INTEGER PRIMARY KEY,considerar_churn TEXT);
    INSERT INTO fn_areceber_mot_cancelamento VALUES(1,'S'),(2,'N'),(3,NULL);
    UPDATE cliente_contrato SET data_acesso_desativado=data_cancelamento,motivo_cancelamento=1;`);
  const read = vi.fn(async (q: IxcReadQuery) => {
    assertReadQuery(q);
    return sqlite.prepare(q.sql).all(...q.params);
  });
  const database = {
    withSnapshot: vi.fn(async (readSnapshot: any) => readSnapshot({ select: read })),
    close: vi.fn(async () => sqlite.close()),
  };
  const finance = {
    dashboard: vi.fn(async () => {
      throw new Error("PRIVATE_FINANCE_ERROR");
    }),
  };
  const risk = {
    getSummary: vi.fn(async () => ({
      lowRisk: 1,
      attention: 2,
      medium: 3,
      highRisk: 4,
      critical: 5,
      riskCalculatedAt: new Date("2026-10-01T12:00:00Z"),
    })),
  };
  const activationSettings = { read: vi.fn(async () => structuredClone(defaultActivationSettings)) };
  return {
    sqlite,
    read,
    database,
    finance,
    risk,
    activationSettings,
    service: new ProviderAnalyticsService(database as never, finance as never, risk, now, activationSettings),
  };
}
describe("Analytics do provedor", () => {
  it("conta eventos, clientes únicos bloqueados e contratos elegíveis sem depender de scores", async () => {
    const f = fixture();
    try {
      const result = await f.service.dashboard(period, () => true);
      expect(result.portfolio).toMatchObject({
        status: "ready",
        data: {
          activeCustomers: 3,
          activeContracts: 5,
          blockedCustomers: 1,
          activations: 4,
          cancellations: 2,
          eventBalance: 2,
          customersWithoutActiveContract: 1,
        },
      });
      if (result.portfolio.status === "ready") {
        expect(result.portfolio.data.series).toHaveLength(9);
        expect(result.portfolio.data.series[0]).toEqual({ date: "2026-10-01", activations: 3, cancellations: 1 });
        expect(result.portfolio.data.series.reduce((sum, d) => sum + d.activations, 0)).toBe(result.portfolio.data.activations);
      }
      expect(result.upgrades).toMatchObject({
        status: "ready",
        data: { eligibleContracts: 3, expired: 1, next30: 0, missingExpiration: 1 },
      });
      expect(result.asOf).toBe("2026-10-09");
    } finally {
      await f.service.close();
    }
  });
  it("valida fallback por IP quando IXC não informa estado, distingue offline liberado e impede vínculo de contrato de outro cliente", async () => {
    const f = fixture();
    try {
      const result = await f.service.dashboard(period, (p) => p === "network.logins.list");
      expect(result.network).toMatchObject({
        status: "ready",
        data: {
          activeLogins: 7,
          online: 1,
          offline: 6,
          releasedOffline: 3,
          cities: [
            { cityId: 1, total: 6, offline: 5 },
            { cityId: 2, total: 1, offline: 1 },
          ],
        },
      });
      expect(f.read).toHaveBeenCalledTimes(2);
      expect(f.finance.dashboard).not.toHaveBeenCalled();
      expect(f.risk.getSummary).not.toHaveBeenCalled();
      expect(result.finance).toEqual({ status: "restricted" });
      expect(result.portfolio).toEqual({ status: "restricted" });
    } finally {
      await f.service.close();
    }
  });
  it("inclui desconectados com IP retido nos avisos e totais de rede", async () => {
    const f = fixture();
    try {
      f.sqlite.exec("UPDATE radusuarios SET online='N' WHERE id=1");
      const result = await f.service.dashboard(period, (p) => p === "network.logins.list");
      expect(result.network).toMatchObject({ status: "ready", data: { online: 0, offline: 7 } });
    } finally {
      await f.service.close();
    }
  });
  it("usa os status próprios de OS/atendimento e 48h exatas no horário de Brasília", async () => {
    const f = fixture();
    try {
      const result = await f.service.dashboard(period, (p) => p.startsWith("support."));
      expect(result.orders).toMatchObject({
        status: "ready",
        data: {
          open: 2,
          older48h: 1,
          overdueAppointments: 1,
          urgent: 1,
          completed: 1,
          created: 4,
          subjects: [{ name: "Suporte técnico", total: 2 }],
          oldest: [{ id: 1 }, { id: 2 }],
        },
      });
      expect(result.tickets).toEqual({ status: "ready", data: { open: 2, unread: 1, older48h: 1, created: 4 } });
    } finally {
      await f.service.close();
    }
  });
  it("mantém fontes independentes, não inventa zeros e não expõe detalhes internos de erros", async () => {
    const f = fixture();
    try {
      const result = await f.service.dashboard(period, () => true);
      expect(result.finance.status).toBe("unavailable");
      expect(result.network.status).toBe("ready");
      expect(result.retention).toMatchObject({
        status: "ready",
        data: { highRisk: 4, critical: 5, calculatedAt: "2026-10-01T12:00:00.000Z" },
      });
      expect(JSON.stringify(result)).not.toContain("PRIVATE_FINANCE_ERROR");
      expect(f.finance.dashboard).toHaveBeenCalledWith({ ...period, regime: "all", receivableScope: "active" }, undefined);
    } finally {
      await f.service.close();
    }
  });
  it("não consulta fontes sem todas as permissões, nem executa queries para um painel restrito", async () => {
    const f = fixture();
    try {
      const result = await f.service.dashboard(period, (p) => p === "support.orders.view" || p === "support.tickets.view");
      expect(result.orders.status).toBe("restricted");
      expect(result.tickets.status).toBe("restricted");
      expect(f.read).not.toHaveBeenCalled();
      expect(f.risk.getSummary).not.toHaveBeenCalled();
      expect(f.finance.dashboard).not.toHaveBeenCalled();
    } finally {
      await f.service.close();
    }
  });
  it("valida datas, limite de período e futuro antes de acessar fontes", async () => {
    const f = fixture();
    try {
      expect(providerAnalyticsQuery.safeParse({ from: "2026-02-30", to: "2026-10-09" }).success).toBe(false);
      expect(providerAnalyticsQuery.safeParse({ from: "2025-01-01", to: "2026-10-09" }).success).toBe(false);
      await expect(f.service.dashboard({ from: "2026-10-09", to: "2026-10-10" }, () => true)).rejects.toMatchObject({ statusCode: 400 });
      expect(f.read).not.toHaveBeenCalled();
      const midnight = providerAnalyticsSql(period, "2026-10-09", "2026-10-09 00:30:00");
      expect(midnight.orders.params[0]).toBe("2026-10-07 00:30:00");
    } finally {
      await f.service.close();
    }
  });
  it("preserva customizações de perfil e concede o novo painel só por permissão", () => {
    expect(rolePermissions.ADMIN).toContain("analytics.dashboard.view");
    expect(rolePermissions.MANAGER).toContain("analytics.dashboard.view");
    expect(rolePermissions.OPERATOR).not.toContain("analytics.dashboard.view");
    expect(effectivePermissions("MANAGER", ["support.customers.view"], {})).not.toContain("analytics.dashboard.view");
  });
  it("o endpoint exige acesso ao Analytics e não expõe fontes além das permissões de origem", async () => {
    const app = Fastify();
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({
      id: 1,
      name: "QA",
      email: "qa@example.test",
      role: "OPERATOR",
      permissions: ["analytics.dashboard.view", "network.logins.list"],
    } as never);
    const report = vi
      .spyOn(ProviderAnalyticsService.prototype, "dashboard")
      .mockImplementation(
        async (_q, can) => ({ networkAllowed: can("network.logins.list"), financeAllowed: can("finance.dashboard.view") }) as never
      );
    vi.spyOn(IxcReadDatabase.prototype, "close").mockResolvedValue();
    try {
      await app.register(providerAnalyticsRoutes, { prefix: "/api/provider-analytics" });
      const response = await app.inject({
        url: "/api/provider-analytics/dashboard?from=2026-10-01&to=2026-10-09",
        headers: { authorization: "Bearer qa" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toEqual({ networkAllowed: true, financeAllowed: false });
      vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ id: 1, role: "OPERATOR", permissions: [] } as never);
      expect((await app.inject({ url: "/api/provider-analytics/dashboard?from=2026-10-01&to=2026-10-09" })).statusCode).toBe(403);
      expect(report).toHaveBeenCalledOnce();
      vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue(null);
      expect((await app.inject({ url: "/api/provider-analytics/dashboard?from=2026-10-01&to=2026-10-09" })).statusCode).toBe(401);
      expect((await app.inject({ method: "POST", url: "/api/provider-analytics/dashboard" })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
  it("agrupa eventos nos 12 meses sem misturar anos ou contar cancelamentos de contratos ativos", async () => {
    const f = fixture();
    try {
      f.sqlite.exec(`INSERT INTO cliente_contrato(id,id_cliente,status,data_ativacao,data_cancelamento) VALUES
        (10,1,'I','2024-01-01 00:00:00','2024-02-29 23:59:59'),
        (11,1,'I','2024-12-31 23:59:59','2025-01-01 00:00:00'),
        (12,1,'A','2024-02-29 00:00:00','2024-01-02 00:00:00'),
        (13,1,'I','2023-12-31 23:59:59','2024-12-31 23:59:59'),
        (14,1,'I','0000-00-00','0000-00-00');`);
      f.sqlite.exec("UPDATE cliente_contrato SET data_acesso_desativado=data_cancelamento,motivo_cancelamento=1");
      const result = await f.service.portfolioEvolution(2024);
      expect(result).toMatchObject({
        year: 2024,
        earliestYear: 2023,
        through: "2024-12-31",
        activations: 3,
        cancellations: 2,
        eventBalance: 1,
      });
      expect(result.series).toHaveLength(12);
      expect(result.series[0]).toEqual({ month: "2024-01", activations: 1, cancellations: 0, growth: 100 });
      expect(result.series[1]).toEqual({ month: "2024-02", activations: 1, cancellations: 1, growth: 0 });
      expect(result.series[2]).toEqual({ month: "2024-03", activations: 0, cancellations: 0, growth: null });
      expect(result.series[11]).toEqual({ month: "2024-12", activations: 1, cancellations: 1, growth: 0 });
      expect(f.finance.dashboard).not.toHaveBeenCalled();
      expect(f.risk.getSummary).not.toHaveBeenCalled();
      expect(f.read).toHaveBeenCalledTimes(2);
      for (const [query] of f.read.mock.calls) {
        assertReadQuery(query);
        expect(query.timeoutSeconds).toBe(5);
      }
    } finally {
      await f.service.close();
    }
  });
  it("limita o ano atual ao dia de Brasília e distingue meses vazios de meses futuros", async () => {
    const f = fixture();
    try {
      const result = await f.service.portfolioEvolution(2026);
      expect(result).toMatchObject({ through: "2026-10-09", activations: 7, cancellations: 2, eventBalance: 5 });
      expect(result.series[0]).toEqual({ month: "2026-01", activations: 0, cancellations: 0, growth: null });
      expect(result.series[9]).toEqual({ month: "2026-10", activations: 4, cancellations: 2, growth: 50 });
      expect(result.series[10]).toEqual({ month: "2026-11", activations: null, cancellations: null, growth: null });
      expect(result.series[11]).toEqual({ month: "2026-12", activations: null, cancellations: null, growth: null });
      const empty = await f.service.portfolioEvolution(2020);
      expect(empty.series.every((r) => r.activations === 0 && r.cancellations === 0)).toBe(true);
      await expect(f.service.portfolioEvolution(2027)).rejects.toMatchObject({ statusCode: 400 });
      for (const year of [1899, 2026.5, "2026 OR 1=1", undefined]) expect(portfolioEvolutionQuery.safeParse({ year }).success).toBe(false);
      expect(portfolioEvolutionQuery.safeParse({ year: 2026, from: "2025-01-01" }).success).toBe(false);
      expect(portfolioEvolutionQuery.safeParse({ year: 2026, mode: "invalid" }).success).toBe(false);
    } finally {
      await f.service.close();
    }
  });
  it("protege a evolução anual com Analytics e permissão de carteira, sem escrita ou erros sensíveis", async () => {
    const app = Fastify();
    const authenticate = vi
      .spyOn(AuthService.prototype, "authenticate")
      .mockResolvedValue({ id: 1, role: "OPERATOR", permissions: ["analytics.dashboard.view"] } as never);
    const report = vi.spyOn(ProviderAnalyticsService.prototype, "portfolioEvolution").mockResolvedValue({ year: 2024 } as never);
    vi.spyOn(IxcReadDatabase.prototype, "close").mockResolvedValue();
    try {
      await app.register(providerAnalyticsRoutes, { prefix: "/api/provider-analytics" });
      const url = "/api/provider-analytics/portfolio-evolution?year=2024";
      expect((await app.inject({ url })).statusCode).toBe(403);
      expect(report).not.toHaveBeenCalled();
      for (const permission of ["churn.dashboard", "support.customers.view"]) {
        authenticate.mockResolvedValue({ id: 1, role: "OPERATOR", permissions: ["analytics.dashboard.view", permission] } as never);
        const response = await app.inject({ url });
        expect(response.statusCode).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.json()).toEqual({ year: 2024 });
      }
      expect(report).toHaveBeenLastCalledWith(2024, expect.any(AbortSignal), "activation");
      expect((await app.inject({ url: `${url}&mode=general` })).statusCode).toBe(200);
      expect(report).toHaveBeenLastCalledWith(2024, expect.any(AbortSignal), "general");
      expect((await app.inject({ url: "/api/provider-analytics/portfolio-evolution?year=all&mode=general" })).statusCode).toBe(200);
      expect(report).toHaveBeenLastCalledWith("all", expect.any(AbortSignal), "general");
      expect((await app.inject({ url: "/api/provider-analytics/portfolio-evolution?year=all&mode=activation" })).statusCode).toBe(400);
      expect((await app.inject({ url: `${url}&mode=invalid` })).statusCode).toBe(400);
      expect((await app.inject({ url: "/api/provider-analytics/portfolio-evolution?year=invalid" })).statusCode).toBe(400);
      expect((await app.inject({ method: "POST", url })).statusCode).toBe(404);
      report.mockRejectedValueOnce(new Error("PRIVATE_SQL_ERROR"));
      const failed = await app.inject({ url });
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain("PRIVATE_SQL_ERROR");
      authenticate.mockResolvedValue({ id: 1, role: "OPERATOR", permissions: ["churn.dashboard"] } as never);
      expect((await app.inject({ url })).statusCode).toBe(403);
      authenticate.mockResolvedValue(null);
      expect((await app.inject({ url })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
  it("compara entradas e cancelamentos do mesmo mês, preservando percentuais negativos, base zero e a regra de OS", async () => {
    const f = fixture();
    try {
      f.sqlite.exec(`INSERT INTO cliente_contrato(id,id_cliente,status,data_ativacao,data_cancelamento) VALUES
        (20,1,'A','2023-12-01',NULL),(21,1,'A','2023-12-02',NULL),
        (22,1,'A','2024-01-01',NULL),(23,1,'A','2024-01-02',NULL),(24,1,'A','2024-01-03',NULL),
        (25,1,'I','2022-01-01','2024-02-01'),(26,1,'I','2022-01-01','2024-02-02'),(27,1,'I','2022-01-01','2024-02-03'),
        (28,1,'I','2022-01-01','2024-03-01'),(29,1,'I','2022-01-01','2024-03-02'),
        (30,1,'I','2024-04-01','2024-04-02'),(31,1,'A','2024-05-01',NULL),
        (32,1,'A','2024-02-01',NULL),(33,1,'A','2024-02-02',NULL),(34,1,'A','2024-03-01',NULL),
        (35,1,'I','2022-01-01','2024-06-01'),(36,1,'I','2022-01-01','2024-01-01');`);
      f.sqlite.exec("UPDATE cliente_contrato SET data_acesso_desativado=data_cancelamento,motivo_cancelamento=1");
      const report = await f.service.portfolioEvolution(2024);
      expect(report).toMatchObject({ activations: 8, cancellations: 8, eventBalance: 0 });
      expect(report.series.slice(0, 6).map((r) => r.growth)).toEqual([expect.closeTo(200 / 3, 8), -50, -100, 0, 100, null]);
      f.activationSettings.read.mockResolvedValue({ source: "serviceOrders", subjectIds: [2] });
      f.sqlite.exec(`INSERT INTO su_oss_chamado(id,id_cliente,id_assunto,status,data_fechamento) VALUES
        (20,1,2,'F','2023-12-01'),(21,1,2,'F','2023-12-02'),
        (22,1,2,'F','2024-01-01'),(23,1,2,'F','2024-01-02'),(24,1,2,'F','2024-01-03'),
        (25,1,3,'F','2023-12-03'),(26,1,2,'A','2023-12-04');`);
      const orders = await f.service.portfolioEvolution(2024);
      expect(orders.activations).toBe(3);
      expect(orders.series[0].growth).toBeCloseTo(200 / 3, 8);
    } finally {
      await f.service.close();
    }
  });
  it("reproduz o critério IXC por ativação, desativação e motivos de churn, acumulando antes do ano e sem somar acumulados", async () => {
    const f = fixture();
    try {
      f.sqlite.exec(`DELETE FROM cliente_contrato;
        INSERT INTO cliente_contrato(id,id_cliente,status,data_cadastro_sistema,data_ativacao,data_cancelamento,data_acesso_desativado,motivo_cancelamento) VALUES
        (50,1,'A','2025-01-01','2024-01-01',NULL,NULL,NULL),
        (51,1,'I','2023-01-01','2024-01-31 23:59:59','2024-02-15','2024-03-01',1),
        (52,1,'P','2024-01-01','2024-01-01',NULL,NULL,1),
        (53,1,'A','2024-01-01','2023-12-31',NULL,NULL,NULL),
        (54,1,'I','2024-01-01','2024-02-01','2024-02-02','2024-02-02',1),
        (55,1,'A','2024-01-01','0000-00-00',NULL,NULL,NULL),
        (56,1,'I','2024-01-01','2026-10-10','2026-10-10','2026-10-10',1),
        (57,1,'D','2024-01-01','2024-02-29','2024-02-29','2024-02-29',1),
        (58,1,'I','2024-01-01','2022-01-01','2023-06-01','2023-06-01',1),
        (59,1,'I','2024-01-01','2020-01-01','2024-01-01','2024-01-01',1),
        (60,1,'I',NULL,'2024-02-29 23:59:59','2024-03-01','2024-03-01',2),
        (61,1,'I',NULL,'2024-02-01','2024-03-01','2024-03-01',NULL),
        (62,1,'I',NULL,'2024-02-01','2024-03-01','2024-03-01',99),
        (63,1,'I',NULL,'2024-02-01','2024-03-01','2024-03-01',3),
        (64,1,'I',NULL,'2024-02-01','2024-03-01',NULL,1),
        (65,1,'I',NULL,'2024-02-01','2024-03-01','0000-00-00',1),
        (66,1,'I',NULL,'2024-02-01','2024-03-01','2026-10-09',1);`);
      f.activationSettings.read.mockRejectedValueOnce(new Error("PRIVATE_SETTINGS_ERROR"));
      const general = await f.service.portfolioEvolution(2024, undefined, "general");
      expect(f.activationSettings.read).not.toHaveBeenCalled();
      expect(general).toMatchObject({ mode: "general", activations: 13, cancellations: 4, eventBalance: 9, earliestYear: 2020 });
      expect(general.series[0]).toEqual({ month: "2024-01", activations: 5, cancellations: 2, growth: 60 });
      expect(general.series[1]).toEqual({ month: "2024-02", activations: 13, cancellations: 3, growth: expect.closeTo(1000 / 13, 8) });
      expect(general.series[2]).toEqual({ month: "2024-03", activations: 13, cancellations: 4, growth: expect.closeTo(900 / 13, 8) });
      expect(general.series[11]).toEqual({ ...general.series[2], month: "2024-12" });
      expect(general.activations).toBe(general.series[11].activations);
      expect(general.cancellations).toBe(general.series[11].cancellations);
      expect(f.read.mock.calls).toHaveLength(3);
      for (const [query] of f.read.mock.calls) assertReadQuery(query);
      f.activationSettings.read.mockReset().mockResolvedValue(defaultActivationSettings);
      const activation = await f.service.portfolioEvolution(2024);
      expect(activation).toMatchObject({ mode: "activation", activations: 10, cancellations: 3 });
      expect(activation.series[0].activations).toBe(2);
      expect(activation.series[1].activations).toBe(8);
      expect(activation.series[1].cancellations).toBe(1);
      expect(activation.series[2].cancellations).toBe(1);
      const current = await f.service.portfolioEvolution(2026, undefined, "general");
      expect(current.activations).toBe(13);
      expect(current.series[0]).toEqual({ month: "2026-01", activations: 13, cancellations: 4, growth: expect.closeTo(900 / 13, 8) });
      expect(current.series[9]).toEqual({ month: "2026-10", activations: 13, cancellations: 5, growth: expect.closeTo(800 / 13, 8) });
      expect(current.series[10].activations).toBeNull();
      const all = await f.service.portfolioEvolution("all", undefined, "general");
      expect(all).toMatchObject({
        year: "all",
        granularity: "year",
        activations: 13,
        cancellations: 5,
        eventBalance: 8,
        through: "2026-10-09",
      });
      expect(all.series.map((row) => row.month)).toEqual(["2020", "2021", "2022", "2023", "2024", "2025", "2026"]);
      expect(all.series[0]).toEqual({ month: "2020", activations: 1, cancellations: 0, growth: 100 });
      expect(all.series[1]).toEqual({ month: "2021", activations: 1, cancellations: 0, growth: 100 });
      expect(all.series[3]).toEqual({ month: "2023", activations: 3, cancellations: 1, growth: expect.closeTo(200 / 3, 8) });
      expect(all.series[4]).toEqual({ month: "2024", activations: 13, cancellations: 4, growth: expect.closeTo(900 / 13, 8) });
      expect(all.series[5]).toEqual({ ...all.series[4], month: "2025" });
      expect(all.series[6]).toEqual({ month: "2026", activations: 13, cancellations: 5, growth: expect.closeTo(800 / 13, 8) });
      expect(current.series[9].activations).toBe(all.series[6].activations);
      expect(general.series[11].cancellations).toBe(all.series[4].cancellations);
      const before = await f.service.portfolioEvolution(2019, undefined, "general");
      expect(before.activations).toBe(0);
      expect(before.series.every((row) => row.activations === 0 && row.cancellations === 0 && row.growth === null)).toBe(true);
      // A known cancellation date does not substitute an absent deactivation date; N/null/missing reasons do not enter churn.
      f.sqlite.exec("UPDATE fn_areceber_mot_cancelamento SET considerar_churn='N' WHERE id=1");
      const changedRule = await f.service.portfolioEvolution("all", undefined, "general");
      expect(changedRule.activations).toBe(13);
      expect(changedRule.cancellations).toBe(0);
    } finally {
      await f.service.close();
    }
  });
  it("Todos exige Geral, mantém uma série válida sem histórico e usa somente consultas de leitura", async () => {
    const f = fixture();
    try {
      expect(portfolioEvolutionQuery.safeParse({ year: "all", mode: "general" }).success).toBe(true);
      expect(portfolioEvolutionQuery.safeParse({ year: "all", mode: "activation" }).success).toBe(false);
      await expect(f.service.portfolioEvolution("all")).rejects.toThrow();
      expect(f.read).not.toHaveBeenCalled();
      f.sqlite.exec("DELETE FROM cliente_contrato");
      const all = await f.service.portfolioEvolution("all", undefined, "general");
      expect(all).toMatchObject({
        year: "all",
        granularity: "year",
        earliestYear: 2026,
        activations: 0,
        cancellations: 0,
        eventBalance: 0,
      });
      expect(all.series).toEqual([{ month: "2026", activations: 0, cancellations: 0, growth: null }]);
      expect(f.read).toHaveBeenCalledTimes(2);
      for (const [query] of f.read.mock.calls) assertReadQuery(query);
    } finally {
      await f.service.close();
    }
  });
  it("reconsulta a regra salva e conta somente OS finalizadas dos assuntos escolhidos pela data de fechamento", async () => {
    const f = fixture();
    try {
      f.sqlite.exec(`INSERT INTO su_oss_chamado(id,id_cliente,id_assunto,status,data_abertura,data_fechamento) VALUES
        (6,1,2,'F','2025-01-01','2026-10-02 23:59:59'),
        (7,1,2,'A','2026-10-02','2026-10-02'),
        (8,1,3,'F','2026-10-02','2026-10-02'),
        (9,1,2,'F','2026-01-01','2026-02-01'),
        (10,1,2,'F','2026-10-02','2026-10-10'),
        (11,1,2,'F','2026-10-02','0000-00-00'),
        (12,1,2,'C','2026-10-02','2026-10-02');`);
      f.activationSettings.read.mockResolvedValue({ source: "serviceOrders", subjectIds: [2] });
      const dashboard = await f.service.dashboard(period, (p) => p === "churn.dashboard");
      expect(dashboard.portfolio).toMatchObject({
        status: "ready",
        data: { activations: 1, cancellations: 2, eventBalance: -1, activationDefinition: { source: "serviceOrders", subjectIds: [2] } },
      });
      if (dashboard.portfolio.status === "ready")
        expect(dashboard.portfolio.data.series[1]).toEqual({ date: "2026-10-02", activations: 1, cancellations: 0 });
      const annual = await f.service.portfolioEvolution(2026);
      expect(annual).toMatchObject({
        activations: 2,
        cancellations: 2,
        eventBalance: 0,
        activationDefinition: { source: "serviceOrders", subjectIds: [2] },
      });
      expect(annual.series[1].activations).toBe(1);
      expect(annual.series[9].activations).toBe(1);
      f.activationSettings.read.mockResolvedValue({ source: "serviceOrders", subjectIds: [2, 3] });
      expect((await f.service.portfolioEvolution(2026)).activations).toBe(3);
      f.activationSettings.read.mockResolvedValue(defaultActivationSettings);
      expect((await f.service.portfolioEvolution(2026)).activations).toBe(7);
    } finally {
      await f.service.close();
    }
  });
  it("falha apenas na fonte de carteira se a regra não puder ser lida e não usa silenciosamente outra contagem", async () => {
    const f = fixture();
    try {
      f.activationSettings.read.mockRejectedValue(new Error("PRIVATE_SETTINGS_ERROR"));
      const dashboard = await f.service.dashboard(period, (p) => p === "churn.dashboard" || p === "network.logins.list");
      expect(dashboard.portfolio.status).toBe("unavailable");
      expect(dashboard.network.status).toBe("ready");
      expect(JSON.stringify(dashboard)).not.toContain("PRIVATE_SETTINGS_ERROR");
      f.activationSettings.read.mockClear();
      await f.service.dashboard(period, () => false);
      expect(f.activationSettings.read).not.toHaveBeenCalled();
    } finally {
      await f.service.close();
    }
  });
});
