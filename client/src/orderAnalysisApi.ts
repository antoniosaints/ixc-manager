import { apiFetch } from "./http";
export interface AnalysisOrder {
  id: number;
  customerId: number | null;
  customerName: string | null;
  contractId: number | null;
  loginId: number | null;
  online: string | null;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
  cityId: number | null;
  city: string | null;
  networkBranch: string | null;
  message: string | null;
  response: string | null;
  truncated: boolean;
  messages: { date: string | null; body: string | null }[];
}
export interface OrderAnalysis {
  history?: HistorySave | null;
  filters: { subjectId: number; from: string; to: string };
  subject: { id: number; name: string };
  queriedAt: string;
  totals: {
    orders: number;
    customers: number;
    recurringCustomers: number;
    closed: number;
    missingCustomer: number;
    missingCity: number;
    missingNetworkBranch: number;
    withoutText: number;
  };
  customers: {
    id: number;
    name: string | null;
    orderIds: number[];
    total: number;
    recurring: boolean;
    lastOpenedAt: string | null;
    linkedLogins: number;
    online: number;
    offline: number;
    unknownConnection: number;
  }[];
  clusters: { city: string; networkBranch: string | null; orderIds: number[]; orders: number; customers: number }[];
  daily: { date: string; total: number }[];
  messageCount: number;
  warnings: string[];
  orders: AnalysisOrder[];
  ai: {
    status: "completed" | "unconfigured" | "failed" | "empty";
    message: string | null;
    model: string;
    provider: "openai" | "gemini";
    batches: number;
    report: {
      summary: string;
      findings: { title: string; assessment: string; severity: "low" | "medium" | "high"; orderIds: number[] }[];
      actions: string[];
      limitations: string[];
    } | null;
  };
}
export interface HistorySave {
  id: string;
  saved: boolean;
  createdAt: string;
  message: string | null;
}
export type OrderAnalysisSnapshot = Pick<OrderAnalysis, "filters" | "subject" | "queriedAt" | "messageCount" | "warnings"> & {
  totals: OrderAnalysis["totals"] & { cities: number };
  ai: Pick<OrderAnalysis["ai"], "model" | "provider" | "batches"> & { report: NonNullable<OrderAnalysis["ai"]["report"]> };
};
export interface OrderAnalysisHistoryEntry {
  id: string;
  subject: OrderAnalysis["subject"];
  filters: OrderAnalysis["filters"];
  createdAt: string;
  generatedAt: string;
  provider: string;
  model: string;
  totalOrders: number;
  summary: string;
}
export interface OrderAnalysisHistoryPage {
  items: OrderAnalysisHistoryEntry[];
  total: number;
  page: number;
  limit: number;
  queriedAt: string;
  subjects: { id: number; name: string }[];
}
async function request<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  const token = localStorage.getItem("retencao-cas.auth-token");
  const response = await apiFetch(`/api/support/order-analysis${path}`, {
    method: body ? "POST" : "GET",
    signal,
    cache: "no-store",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message ?? "Não foi possível concluir a análise. Tente novamente.");
  }
  return response.json();
}
export const orderAnalysisApi = {
  history: (query: URLSearchParams, signal?: AbortSignal) => request<OrderAnalysisHistoryPage>(`/history?${query}`, signal),
  saved: (id: string, signal?: AbortSignal) =>
    request<{ id: string; createdAt: string; snapshot: OrderAnalysisSnapshot }>(`/history/${encodeURIComponent(id)}`, signal),
  retryHistory: (id: string, signal?: AbortSignal) => request<HistorySave>(`/history/${encodeURIComponent(id)}/retry`, signal, {}),
  subjects: (signal?: AbortSignal) =>
    request<{ subjects: { id: number; name: string }[]; configured: boolean; model: string; provider: "openai" | "gemini" }>(
      "/subjects",
      signal
    ),
  analyze: (filters: OrderAnalysis["filters"], signal?: AbortSignal) => request<OrderAnalysis>("", signal, filters),
};
