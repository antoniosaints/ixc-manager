import { apiFetch } from "./http";
import type { ActivationSettings } from "./settingsApi";
import type { FinanceDashboard } from "./financeApi";
export type AnalyticsSection<T> = { status: "ready"; data: T } | { status: "unavailable"; message: string } | { status: "restricted" };
export interface ProviderAnalytics {
  period: { from: string; to: string };
  asOf: string;
  queriedAt: string;
  portfolio: AnalyticsSection<{
    activationDefinition: ActivationSettings;
    activeCustomers: number;
    activeContracts: number;
    blockedCustomers: number;
    activations: number;
    cancellations: number;
    customersWithoutActiveContract: number;
    eventBalance: number;
    series: { date: string; activations: number; cancellations: number }[];
  }>;
  network: AnalyticsSection<{
    activeLogins: number;
    online: number;
    offline: number;
    releasedOffline: number;
    cities: { cityId: number | null; name: string; total: number; offline: number }[];
  }>;
  orders: AnalyticsSection<{
    open: number;
    older48h: number;
    overdueAppointments: number;
    urgent: number;
    completed: number;
    created: number;
    subjects: { name: string; total: number }[];
    oldest: { id: number; customerId: number; customerName: string; subject: string; openedAt: string }[];
  }>;
  tickets: AnalyticsSection<{ open: number; unread: number; older48h: number; created: number }>;
  finance: AnalyticsSection<
    Pick<FinanceDashboard, "totals" | "growth" | "previous" | "aging" | "payable" | "reconciliation" | "quality" | "warnings" | "series">
  >;
  retention: AnalyticsSection<{
    lowRisk: number;
    attention: number;
    medium: number;
    highRisk: number;
    critical: number;
    calculatedAt: string | null;
  }>;
  upgrades: AnalyticsSection<{ eligibleContracts: number; expired: number; next30: number; missingExpiration: number }>;
}
export type PortfolioMode = "general" | "activation";
export type PortfolioYear = number | "all";
export interface PortfolioEvolution {
  mode: PortfolioMode;
  activationDefinition: ActivationSettings;
  year: PortfolioYear;
  granularity: "month" | "year";
  earliestYear: number;
  currentYear: number;
  through: string;
  queriedAt: string;
  activations: number;
  cancellations: number;
  eventBalance: number;
  series: { month: string; activations: number | null; cancellations: number | null; growth: number | null }[];
}
export function portfolioEvolution(
  year: PortfolioYear,
  signal?: AbortSignal,
  mode: PortfolioMode = "activation"
): Promise<PortfolioEvolution> {
  return analyticsRequest(`/api/provider-analytics/portfolio-evolution?${new URLSearchParams({ year: String(year), mode })}`, signal);
}
export function providerAnalytics(params: URLSearchParams, signal?: AbortSignal): Promise<ProviderAnalytics> {
  return analyticsRequest(`/api/provider-analytics/dashboard?${params}`, signal);
}
async function analyticsRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = localStorage.getItem("retencao-cas.auth-token"),
    controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 65000);
  try {
    const response = await apiFetch(path, {
      signal: controller.signal,
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message ?? "Não foi possível consultar o painel.");
    }
    return await response.json();
  } catch (error) {
    if (timedOut) throw new Error("A consulta demorou mais que o esperado. Reduza o período e tente novamente.");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
