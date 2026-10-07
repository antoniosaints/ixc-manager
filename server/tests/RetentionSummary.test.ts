import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RetentionSummaryService, retentionSummarySql } from "../src/services/retention/RetentionSummaryService.js";
import { assertReadQuery, type IxcReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { RetentionRepository } from "../src/repositories/RetentionRepository.js";
import { db } from "../src/repositories/database.js";

const now = () => new Date("2026-10-01T02:30:00Z"); // Still September in Brasília.
const risk = { lowRisk: 1, attention: 2, medium: 3, highRisk: 4, critical: 5, riskCalculatedAt: new Date("2026-09-29T12:00:00Z") };
const operational = { activeCustomers: "12", blocked: "3", cancellationsThisMonth: "2" };
const fixture = () => {
  const reader = {
    select: vi.fn(async (q: IxcReadQuery) => {
      assertReadQuery(q);
      return [operational];
    }),
    close: vi.fn(async () => {}),
  };
  const repo = { getSummary: vi.fn(async () => risk), getOperationalSummary: vi.fn(async () => operational) };
  return { reader, repo, service: new RetentionSummaryService(reader, repo as any, now) };
};
afterEach(() => vi.restoreAllMocks());

describe("Indicadores independentes do Churn", () => {
  it("consulta SQL de leitura sem analisar, gravar ou depender de scores para as contagens", async () => {
    const { service, reader, repo } = fixture();
    const result = await service.getSummary();
    expect(result).toMatchObject({
      activeCustomers: 12,
      blocked: 3,
      cancellationsThisMonth: 2,
      highRisk: 4,
      critical: 5,
      operationalSource: "database",
      riskSource: "synchronized",
      referenceDate: "2026-09-30",
      riskCalculatedAt: "2026-09-29T12:00:00.000Z",
      warnings: [],
    });
    expect(reader.select).toHaveBeenCalledOnce();
    const q = reader.select.mock.calls[0]![0];
    assertReadQuery(q);
    expect(q.params).toEqual(["2026-09-01", "2026-10-01"]);
    expect(q.sql).not.toContain("retention_");
    expect(repo.getOperationalSummary).not.toHaveBeenCalled();
    await service.close();
    expect(reader.close).toHaveBeenCalledOnce();
  });
  it("executa a consulta real com duplicidade de contratos, estados diferentes e datas limites", () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`CREATE TABLE cliente (id INTEGER PRIMARY KEY, ativo TEXT);
        CREATE TABLE cliente_contrato (id INTEGER PRIMARY KEY, id_cliente INTEGER, status TEXT, status_internet TEXT, data_cancelamento TEXT);
        INSERT INTO cliente VALUES (1,'S'),(2,'S'),(3,'N'),(4,'S'),(5,'S'),(6,'S');
        INSERT INTO cliente_contrato VALUES
        (1,1,'A','CA',NULL),(2,1,'A','CM',NULL),
        (3,2,'I','CA','2026-09-01'),(4,3,'A','CA',NULL),
        (5,4,'A','A',NULL),(6,5,'D','CA',NULL),(7,5,'P','CM',NULL),
        (8,3,'I','D','2026-09-30'),(9,3,'I','D','2026-08-31'),
        (10,3,'I','D','2026-10-01'),(11,3,'A','D','2026-09-15'),
        (12,3,'I','D','0000-00-00'),(13,3,'I','D',NULL)`);
      const q = retentionSummarySql("2026-09-30");
      expect(sqlite.prepare(q.sql).get(...q.params)).toMatchObject({ activeCustomers: 5, blocked: 1, cancellationsThisMonth: 2 });
      // Customer with no score/contract is counted; future cancellations in the month are excluded.
      expect(sqlite.prepare(retentionSummarySql("2026-09-15").sql).get("2026-09-01", "2026-09-16")).toMatchObject({
        cancellationsThisMonth: 1,
      });
      sqlite.exec("DELETE FROM cliente_contrato; DELETE FROM cliente");
      expect(sqlite.prepare(q.sql).get(...q.params)).toMatchObject({ activeCustomers: 0, blocked: 0, cancellationsThisMonth: 0 });
      expect(retentionSummarySql("2026-12-31").params).toEqual(["2026-12-01", "2027-01-01"]);
    } finally {
      sqlite.close();
    }
  });
  it("usa o fallback sem scores e avisa sobre a sincronização sem expor erros SQL", async () => {
    const { service, reader, repo } = fixture();
    reader.select.mockRejectedValue(new Error("SQL_PASSWORD_NAO_EXPOR"));
    const result = await service.getSummary();
    expect(result).toMatchObject({ activeCustomers: 12, critical: 5, operationalSource: "synchronized", operationalQueriedAt: null });
    expect(repo.getOperationalSummary).toHaveBeenCalledWith("2026-09-01", "2026-10-01");
    expect(result.warnings[0]).toContain("desatualizados");
    expect(JSON.stringify(result)).not.toContain("SQL_PASSWORD_NAO_EXPOR");
  });
  it("não substitui indisponibilidade por zero e mantém o risco disponível", async () => {
    const { service, reader, repo } = fixture();
    reader.select.mockResolvedValue([]);
    repo.getOperationalSummary.mockRejectedValue(new Error("local unavailable"));
    expect(await service.getSummary()).toMatchObject({
      activeCustomers: null,
      blocked: null,
      cancellationsThisMonth: null,
      highRisk: 4,
      operationalSource: "unavailable",
    });
  });
  it("mantém os indicadores IXC mesmo se a base de scores falhar", async () => {
    const { service, repo } = fixture();
    repo.getSummary.mockRejectedValue(new Error("local unavailable"));
    expect(await service.getSummary()).toMatchObject({
      activeCustomers: 12,
      blocked: 3,
      critical: null,
      highRisk: null,
      riskSource: "unavailable",
    });
  });
  it("o fallback local também conta clientes sem scores e bloqueados únicos", async () => {
    const query = vi.spyOn(db, "query").mockResolvedValue([[operational], []] as any);
    await new RetentionRepository().getOperationalSummary("2026-09-01", "2026-10-01");
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual(["2026-09-01", "2026-10-01"]);
    expect(sql).not.toContain("risk_scores");
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`CREATE TABLE retention_customers (id INTEGER PRIMARY KEY, active TEXT);
        CREATE TABLE retention_contracts (id INTEGER PRIMARY KEY, customer_id INTEGER, status TEXT, internet_status TEXT);
        CREATE TABLE retention_cancellations (cancellation_date TEXT);
        INSERT INTO retention_customers VALUES (1,'S'),(2,'S'),(3,'N');
        INSERT INTO retention_contracts VALUES (1,1,'A','CA'),(2,1,'A','CM'),(3,2,'I','CA'),(4,3,'A','CA');
        INSERT INTO retention_cancellations VALUES ('2026-09-30'),('2026-08-31'),('2026-10-01')`);
      expect(sqlite.prepare(sql).get(...(params as string[]))).toMatchObject({ activeCustomers: 2, blocked: 1, cancellationsThisMonth: 1 });
    } finally {
      sqlite.close();
    }
  });
});
