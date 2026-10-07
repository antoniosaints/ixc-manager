import { describe, expect, it } from "vitest";
import { RetentionRiskEngine } from "../src/services/retention/RetentionRiskEngine.js";
import type { RiskContext } from "../src/types/retention.js";

const healthy = (): RiskContext => ({
  customerId: 1,
  contractId: 1,
  satisfaction: 5,
  financial: { overdueInvoices: 0, maxOverdueDays: 0, recentBlock: false, recentTrustUnlock: false },
  support: { tickets30d: 0, recurringSubjects: 0, criticalTickets: 0, pendingTickets: 0, slaProblems: 0, serviceOrders30d: 0 },
  network: { disconnects7d: 2, baselineDisconnects7d: 2, shortSessions7d: 0, offlineDays: 0, recurringTerminateCause: false },
  contract: { recentBlock: false, recentSuspension: false },
});
describe("RetentionRiskEngine", () => {
  const engine = new RetentionRiskEngine();
  it("mantém cliente saudável em baixo risco", () => {
    const result = engine.calculate(healthy());
    expect(result.score).toBe(0);
    expect(result.level).toBe("LOW");
  });
  it("limita risco financeiro ao teto", () => {
    const ctx = healthy();
    ctx.financial = { overdueInvoices: 3, maxOverdueDays: 35, recentBlock: true, recentTrustUnlock: true };
    const result = engine.calculate(ctx);
    expect(result.factors.financial).toBe(30);
    expect(result.reasons.some((r) => r.code === "OVERDUE_30_DAYS")).toBe(true);
  });
  it("identifica cliente técnico mesmo sem atraso", () => {
    const ctx = healthy();
    ctx.support = { tickets30d: 5, recurringSubjects: 1, criticalTickets: 0, pendingTickets: 1, slaProblems: 1, serviceOrders30d: 4 };
    ctx.network = {
      disconnects7d: 38,
      baselineDisconnects7d: 6,
      shortSessions7d: 7,
      offlineDays: 0,
      consumptionDropPercent: 60,
      recurringTerminateCause: true,
    };
    const result = engine.calculate(ctx);
    expect(result.factors.support).toBe(25);
    expect(result.factors.network).toBe(25);
    expect(result.level).toBe("MEDIUM");
  });
  it("classifica cenário misto como crítico", () => {
    const ctx = healthy();
    ctx.satisfaction = 1;
    ctx.financial = { overdueInvoices: 3, maxOverdueDays: 35, recentBlock: true, recentTrustUnlock: true };
    ctx.support = { tickets30d: 5, recurringSubjects: 1, criticalTickets: 1, pendingTickets: 1, slaProblems: 1, serviceOrders30d: 4 };
    ctx.network = {
      disconnects7d: 38,
      baselineDisconnects7d: 6,
      shortSessions7d: 7,
      offlineDays: 4,
      consumptionDropPercent: 60,
      recurringTerminateCause: true,
    };
    ctx.contract = { fidelityDaysRemaining: 14, recentBlock: true, recentSuspension: true };
    const result = engine.calculate(ctx);
    expect(result.score).toBe(100);
    expect(result.level).toBe("CRITICAL");
  });
});
