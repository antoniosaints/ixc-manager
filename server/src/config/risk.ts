export const riskConfig = {
  financial: {
    max: 30,
    overdueInvoice: [0, 5, 10, 15] as const,
    overdue15Days: 5,
    overdue30Days: 10,
    recentBlock: 10,
    recentTrustUnlock: 5,
  },
  support: {
    max: 25,
    tickets2: 5,
    tickets3: 10,
    tickets4: 15,
    recurringSubject: 5,
    critical: 5,
    pending: 5,
    slaProblem: 5,
    serviceOrder30d: 5,
  },
  network: {
    max: 25,
    disconnectIncrease: 5,
    excessiveDisconnects: 10,
    shortSessions: 5,
    abnormalOffline: 5,
    consumptionDrop: 5,
    recurringTerminateCause: 5,
    disconnectIncreaseThreshold: 100,
    excessiveDisconnects7d: 15,
    shortSessions7d: 5,
    consumptionDropPercent: 50,
  },
  contract: { max: 10, fidelity60Days: 3, fidelity30Days: 5, recentBlock: 5, recentSuspension: 5 },
  satisfaction: { max: 10, values: { 1: 10, 2: 6, 3: 2, 4: 0, 5: 0 } as Record<number, number> },
} as const;

export const riskLevels = ["LOW", "ATTENTION", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof riskLevels)[number];
export const riskThresholds = { attention: 30, medium: 50, high: 60, critical: 85 } as const;
export interface RiskThresholds {
  low: 0;
  attention: number;
  medium: number;
  high: number;
  critical: number;
}
export function getRiskLevel(score: number, thresholds: Omit<RiskThresholds, "low"> = riskThresholds): RiskLevel {
  if (score >= thresholds.critical) return "CRITICAL";
  if (score >= thresholds.high) return "HIGH";
  if (score >= thresholds.medium) return "MEDIUM";
  if (score >= thresholds.attention) return "ATTENTION";
  return "LOW";
}
