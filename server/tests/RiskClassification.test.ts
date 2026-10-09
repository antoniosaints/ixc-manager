import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/queues/retentionQueue.js", () => ({
  enqueueCustomerRecalculate: vi.fn(),
  enqueueFullSync: vi.fn(),
  getRetentionJobStatus: vi.fn(),
  getRetentionQueueStatus: vi.fn(),
  retentionQueue: { add: vi.fn() },
}));
import { getRiskLevel } from "../src/config/risk.js";
import { currentRiskLevelSql } from "../src/repositories/riskLevelSql.js";
import { RetentionRepository } from "../src/repositories/RetentionRepository.js";
import { db } from "../src/repositories/database.js";
import { getCustomerRiskSnapshot } from "../src/services/retention/CustomerRiskSnapshot.js";
import { directRetention } from "../src/services/retention/DirectRetentionService.js";
import { retentionRoutes } from "../src/controllers/retentionController.js";
import { AuthService } from "../src/services/AuthService.js";
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE retention_customers(id INTEGER PRIMARY KEY,active TEXT,name TEXT,city TEXT,neighborhood TEXT,satisfaction INTEGER,phone TEXT,mobile_phone TEXT,commercial_phone TEXT,whatsapp TEXT);
    CREATE TABLE retention_contracts(id INTEGER PRIMARY KEY,customer_id INTEGER,status TEXT,internet_status TEXT,plan_name TEXT,branch_id INTEGER,activated_at TEXT);
    CREATE TABLE retention_cities(id TEXT PRIMARY KEY,label TEXT);
    CREATE TABLE retention_risk_scores(id INTEGER PRIMARY KEY,customer_id INTEGER,contract_id INTEGER,score INTEGER,risk_level TEXT,financial_score INTEGER,support_score INTEGER,network_score INTEGER,contract_score INTEGER,satisfaction_score INTEGER,calculated_at TEXT);
    CREATE TABLE retention_customer_workflow(customer_id INTEGER PRIMARY KEY,status TEXT);
    CREATE TABLE retention_contract_attention(contract_id INTEGER PRIMARY KEY);
    CREATE TABLE retention_risk_factors(id INTEGER PRIMARY KEY,risk_score_id INTEGER,category TEXT,code TEXT,description TEXT,points INTEGER,metadata_json TEXT);
    INSERT INTO retention_cities VALUES('1','Cidade de teste');`);
  const scores = [59, 60, 69, 84, 85, 60, 60, 70, 60];
  for (let i = 1; i <= 10; i++) {
    sqlite
      .prepare("INSERT INTO retention_customers(id,active,name,city) VALUES(?,?,?,?)")
      .run(i, i === 6 ? "N" : "S", `Cliente fictício ${i}`, "1");
    sqlite
      .prepare("INSERT INTO retention_contracts(id,customer_id,status,plan_name) VALUES(?,?,?,?)")
      .run(i, i, i === 7 ? "I" : "A", "Plano fictício");
    if (i <= 9)
      sqlite
        .prepare("INSERT INTO retention_risk_scores(id,customer_id,contract_id,score,risk_level,calculated_at) VALUES(?,?,?,?,?,?)")
        .run(i, i, i, scores[i - 1]!, i === 2 || i === 3 ? "MEDIUM" : "HIGH", "2026-10-09 09:00:00");
  }
  sqlite.exec(`INSERT INTO retention_risk_scores(id,customer_id,contract_id,score,risk_level,calculated_at) VALUES(80,8,8,59,'MEDIUM','2026-10-09 09:00:00');
    INSERT INTO retention_contracts(id,customer_id,status,plan_name) VALUES(99,9,'A','Plano fictício');
    INSERT INTO retention_risk_scores(id,customer_id,contract_id,score,risk_level,calculated_at) VALUES(99,9,99,85,'HIGH','2026-10-09 09:00:00');
    INSERT INTO retention_contract_attention VALUES(1),(9),(99);`);
  vi.spyOn(db, "query").mockImplementation(async (sql: any, params: any = []) => [sqlite.prepare(sql).all(...params), []] as any);
  return { sqlite, repository: new RetentionRepository() };
}
describe("Faixas atuais de risco de churn", () => {
  it.each([
    [0, "LOW"],
    [29, "LOW"],
    [30, "ATTENTION"],
    [49, "ATTENTION"],
    [50, "MEDIUM"],
    [59, "MEDIUM"],
    [60, "HIGH"],
    [69, "HIGH"],
    [70, "HIGH"],
    [84, "HIGH"],
    [85, "CRITICAL"],
    [100, "CRITICAL"],
  ] as const)("classifica %i com a mesma faixa no motor e na leitura SQL", (score, level) => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      expect(getRiskLevel(score)).toBe(level);
      expect(sqlite.prepare(`SELECT ${currentRiskLevelSql} level FROM (SELECT ? score) rs`).get(score)).toMatchObject({ level });
    } finally {
      sqlite.close();
    }
  });
  it("atualiza cards e filtro Alto para scores antigos de 60–69 sem reanalisar; mantém o último score e o crítico manual", async () => {
    const { sqlite, repository } = fixture();
    try {
      expect(await repository.getSummary()).toMatchObject({ medium: 2, highRisk: 4, critical: 3 });
      const high = await repository.listCustomers({ riskLevel: "HIGH", workflowStatus: "ALL", page: 1, limit: 25 });
      expect(high.total).toBe(4);
      expect(high.items.map((row) => row.contract_id).sort((a, b) => a - b)).toEqual([2, 3, 4, 9]);
      expect(high.items.every((row) => row.risk_level === "HIGH" && row.score >= 60 && row.score < 85)).toBe(true);
      const medium = await repository.listCustomers({ riskLevel: "MEDIUM", workflowStatus: "ALL", page: 1, limit: 25 });
      expect(medium.items.map((row) => row.contract_id).sort((a, b) => a - b)).toEqual([1, 8]);
      const filtered = await repository.listCustomers({
        riskLevel: "HIGH",
        minScore: 66,
        maxScore: 84,
        workflowStatus: "ALL",
        page: 1,
        limit: 25,
      });
      expect(filtered.total).toBe(2);
      // The historical label remains unchanged; no business record or score was rewritten.
      expect(sqlite.prepare("SELECT risk_level FROM retention_risk_scores WHERE id=2").get()).toMatchObject({ risk_level: "MEDIUM" });
    } finally {
      sqlite.close();
    }
  });
  it("detalhes e dados para PDF usam a faixa atual e não classificam contrato sem score como baixo", async () => {
    const { sqlite } = fixture();
    try {
      expect((await getCustomerRiskSnapshot(2, 2))?.customer).toMatchObject({ score: 60, risk_level: "HIGH" });
      expect((await getCustomerRiskSnapshot(5, 5))?.customer).toMatchObject({ score: 85, risk_level: "CRITICAL" });
      expect((await getCustomerRiskSnapshot(10, 10))?.customer).toMatchObject({ score: null, risk_level: null });
    } finally {
      sqlite.close();
    }
  });
  it("análises por cidade somam Alto e Crítico com o mesmo limite de 60", async () => {
    const { sqlite } = fixture();
    vi.spyOn(directRetention, "analytics").mockResolvedValue({ items: [{ label: "Cidade de teste", customers: 7, highRisk: 6 }] });
    const app = Fastify();
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({
      id: 1,
      role: "OPERATOR",
      permissions: ["churn.analytics"],
    } as never);
    try {
      await app.register(retentionRoutes, { prefix: "/api/retention" });
      const response = await app.inject({ url: "/api/retention/analytics/cities" });
      expect(response.statusCode).toBe(200);
      expect(response.json().items).toEqual([{ label: "Cidade de teste", customers: 7, highRisk: 6 }]);
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
