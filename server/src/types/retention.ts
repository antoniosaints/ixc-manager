import type { RiskLevel } from "../config/risk.js";

export interface RiskReason {
  category: "financial" | "support" | "network" | "contract" | "satisfaction";
  code: string;
  description: string;
  points: number;
  metadata?: Record<string, unknown>;
}
export interface RiskResult {
  score: number;
  level: RiskLevel;
  factors: { financial: number; support: number; network: number; contract: number; satisfaction: number };
  reasons: RiskReason[];
}
export interface RiskContext {
  customerId: number;
  contractId: number;
  satisfaction?: number | null;
  financial: { overdueInvoices: number; maxOverdueDays: number; recentBlock: boolean; recentTrustUnlock: boolean };
  support: {
    tickets30d: number;
    recurringSubjects: number;
    criticalTickets: number;
    pendingTickets: number;
    slaProblems: number;
    serviceOrders30d: number;
  };
  network: {
    disconnects7d: number;
    baselineDisconnects7d: number;
    shortSessions7d: number;
    offlineDays: number;
    consumptionDropPercent?: number;
    recurringTerminateCause: boolean;
  };
  contract: { fidelityDaysRemaining?: number; recentBlock: boolean; recentSuspension: boolean };
}
