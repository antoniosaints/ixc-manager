import { getRiskLevel, riskConfig, riskThresholds, type RiskThresholds } from "../../config/risk.js";
import type { RiskContext, RiskReason, RiskResult } from "../../types/retention.js";

type Category = RiskReason["category"];
interface PartialRisk {
  points: number;
  reasons: RiskReason[];
}
const empty = (): PartialRisk => ({ points: 0, reasons: [] });
const add = (
  result: PartialRisk,
  category: Category,
  code: string,
  description: string,
  points: number,
  metadata?: Record<string, unknown>
) => {
  result.points += points;
  result.reasons.push({ category, code, description, points, metadata });
};
const capped = (result: PartialRisk, max: number): PartialRisk => ({ points: Math.min(result.points, max), reasons: result.reasons });

export class RetentionRiskEngine {
  calculate(context: RiskContext, thresholds: Omit<RiskThresholds, "low"> = riskThresholds): RiskResult {
    const financial = this.calculateFinancialRisk(context);
    const support = this.calculateSupportRisk(context);
    const network = this.calculateNetworkRisk(context);
    const contract = this.calculateContractRisk(context);
    const satisfaction = this.calculateSatisfactionRisk(context);
    const score = [financial, support, network, contract, satisfaction].reduce((sum, item) => sum + item.points, 0);
    return {
      score,
      level: getRiskLevel(score, thresholds),
      factors: {
        financial: financial.points,
        support: support.points,
        network: network.points,
        contract: contract.points,
        satisfaction: satisfaction.points,
      },
      reasons: [...financial.reasons, ...support.reasons, ...network.reasons, ...contract.reasons, ...satisfaction.reasons],
    };
  }

  calculateFinancialRisk({ financial }: RiskContext): PartialRisk {
    const result = empty();
    const { overdueInvoices, maxOverdueDays } = financial;
    const amount =
      overdueInvoices >= 3 ? riskConfig.financial.overdueInvoice[3] : (riskConfig.financial.overdueInvoice[overdueInvoices] ?? 0);
    if (amount)
      add(
        result,
        "financial",
        "OVERDUE_INVOICES",
        `${overdueInvoices} fatura${overdueInvoices > 1 ? "s" : ""} vencida${overdueInvoices > 1 ? "s" : ""}`,
        amount,
        { overdueInvoices }
      );
    if (maxOverdueDays > 30)
      add(result, "financial", "OVERDUE_30_DAYS", `Existe fatura vencida há ${maxOverdueDays} dias`, riskConfig.financial.overdue30Days, {
        maxOverdueDays,
      });
    else if (maxOverdueDays > 15)
      add(result, "financial", "OVERDUE_15_DAYS", `Existe fatura vencida há ${maxOverdueDays} dias`, riskConfig.financial.overdue15Days, {
        maxOverdueDays,
      });
    if (financial.recentBlock)
      add(result, "financial", "RECENT_FINANCIAL_BLOCK", "Bloqueio financeiro recente", riskConfig.financial.recentBlock);
    if (financial.recentTrustUnlock)
      add(result, "financial", "RECENT_TRUST_UNLOCK", "Desbloqueio de confiança recente", riskConfig.financial.recentTrustUnlock);
    return capped(result, riskConfig.financial.max);
  }

  calculateSupportRisk({ support }: RiskContext): PartialRisk {
    const result = empty();
    const count = support.tickets30d;
    const ticketPoints =
      count >= 4 ? riskConfig.support.tickets4 : count === 3 ? riskConfig.support.tickets3 : count === 2 ? riskConfig.support.tickets2 : 0;
    if (ticketPoints) add(result, "support", "TICKETS_30_DAYS", `${count} atendimentos nos últimos 30 dias`, ticketPoints, { count });
    if (support.recurringSubjects)
      add(result, "support", "RECURRING_SUBJECT", "Assunto recorrente em atendimentos", riskConfig.support.recurringSubject);
    if (support.criticalTickets) add(result, "support", "CRITICAL_TICKET", "Atendimento prioritário/crítico", riskConfig.support.critical);
    if (support.pendingTickets) add(result, "support", "PENDING_TICKET", "Atendimento pendente", riskConfig.support.pending);
    if (support.slaProblems) add(result, "support", "SLA_PROBLEM", "Atendimento ou OS com SLA problemático", riskConfig.support.slaProblem);
    if (support.serviceOrders30d >= 2)
      add(
        result,
        "support",
        "SERVICE_ORDERS_30D",
        `${support.serviceOrders30d} ordens de serviço nos últimos 30 dias`,
        riskConfig.support.serviceOrder30d,
        { count: support.serviceOrders30d }
      );
    return capped(result, riskConfig.support.max);
  }

  calculateNetworkRisk({ network }: RiskContext): PartialRisk {
    const result = empty();
    const increase =
      network.baselineDisconnects7d > 0
        ? ((network.disconnects7d - network.baselineDisconnects7d) / network.baselineDisconnects7d) * 100
        : network.disconnects7d > 0
          ? 100
          : 0;
    if (increase >= riskConfig.network.disconnectIncreaseThreshold)
      add(
        result,
        "network",
        "DISCONNECT_INCREASE",
        `Desconexões aumentaram ${Math.round(increase)}% frente à média`,
        riskConfig.network.disconnectIncrease,
        { increase }
      );
    if (network.disconnects7d >= riskConfig.network.excessiveDisconnects7d)
      add(
        result,
        "network",
        "EXCESSIVE_DISCONNECTS",
        `${network.disconnects7d} desconexões nos últimos 7 dias`,
        riskConfig.network.excessiveDisconnects,
        { count: network.disconnects7d }
      );
    if (network.shortSessions7d >= riskConfig.network.shortSessions7d)
      add(
        result,
        "network",
        "SHORT_SESSIONS",
        `${network.shortSessions7d} sessões curtas nos últimos 7 dias`,
        riskConfig.network.shortSessions
      );
    if (network.offlineDays >= 3)
      add(result, "network", "ABNORMAL_OFFLINE", `${network.offlineDays} dias sem conexão`, riskConfig.network.abnormalOffline);
    if ((network.consumptionDropPercent ?? 0) >= riskConfig.network.consumptionDropPercent)
      add(
        result,
        "network",
        "CONSUMPTION_DROP",
        `Consumo caiu ${Math.round(network.consumptionDropPercent ?? 0)}% frente à média`,
        riskConfig.network.consumptionDrop,
        { percent: network.consumptionDropPercent }
      );
    if (network.recurringTerminateCause)
      add(result, "network", "RECURRING_TERMINATE_CAUSE", "Motivo de desconexão recorrente", riskConfig.network.recurringTerminateCause);
    return capped(result, riskConfig.network.max);
  }

  calculateContractRisk({ contract }: RiskContext): PartialRisk {
    const result = empty();
    const days = contract.fidelityDaysRemaining;
    if (days !== undefined && days >= 0 && days < 30)
      add(result, "contract", "FIDELITY_30_DAYS", `Fidelidade termina em ${days} dias`, riskConfig.contract.fidelity30Days);
    else if (days !== undefined && days >= 0 && days < 60)
      add(result, "contract", "FIDELITY_60_DAYS", `Fidelidade termina em ${days} dias`, riskConfig.contract.fidelity60Days);
    if (contract.recentBlock) add(result, "contract", "RECENT_BLOCK", "Bloqueio contratual recente", riskConfig.contract.recentBlock);
    if (contract.recentSuspension)
      add(result, "contract", "RECENT_SUSPENSION", "Suspensão contratual recente", riskConfig.contract.recentSuspension);
    return capped(result, riskConfig.contract.max);
  }

  calculateSatisfactionRisk({ satisfaction }: RiskContext): PartialRisk {
    const result = empty();
    const points = satisfaction ? (riskConfig.satisfaction.values[satisfaction] ?? 0) : 0;
    if (points) add(result, "satisfaction", "LOW_SATISFACTION", `Grau de satisfação ${satisfaction}`, points, { satisfaction });
    return capped(result, riskConfig.satisfaction.max);
  }
}
