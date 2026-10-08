import { apiFetch } from "./http";
import type { ContractContact } from "./upgradesApi";
export interface CollectionCustomer {
  id: number;
  name: string;
  active: boolean | null;
  document: string | null;
  contacts: ContractContact[];
  city: string | null;
  neighborhood: string | null;
  email: string | null;
  titles: number;
  balance: number;
  overdueBalance: number;
  overdueTitles: number;
  oldestDue: string | null;
  daysLate: number;
}
export interface CollectionTitle {
  id: string;
  customerId: number;
  contractId: number | null;
  contractName: string | null;
  contractStatus: string | null;
  internetStatus: string | null;
  document: string | null;
  dueDate: string | null;
  issuedDate: string | null;
  amount: number;
  paid: number | null;
  balance: number;
  status: string | null;
  accountId: number | null;
  accountName: string | null;
  branchId: number | null;
  branchName: string | null;
  daysLate: number;
  awaitingConfirmation: boolean | null;
  processing: boolean | null;
  inCollection: boolean | null;
}
export interface CollectionsPage {
  items: CollectionCustomer[];
  total: number;
  page: number;
  limit: number;
  queriedAt: string;
  referenceDate: string;
  warnings: string[];
  summary: { customers: number; titles: number; balance: number; buckets: { key: string; customers: number; balance: number }[] };
}
export interface CollectionDetail {
  customer: CollectionCustomer;
  items: CollectionTitle[];
  total: number;
  balance: number;
  page: number;
  limit: number;
  referenceDate: string;
  queriedAt: string;
}
async function request(path: string, signal?: AbortSignal, body?: unknown) {
  const token = localStorage.getItem("retencao-cas.auth-token");
  const response = await apiFetch(`/api/collections${path}`, {
    signal,
    cache: "no-store",
    method: body ? "POST" : "GET",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const reason = await response.json().catch(() => null);
    throw new Error(reason?.message ?? "Não foi possível consultar as cobranças.");
  }
  return response;
}
export const collectionsApi = {
  list: async (params: URLSearchParams, signal?: AbortSignal): Promise<CollectionsPage> =>
    (await request(`/customers?${params}`, signal)).json(),
  options: async (signal?: AbortSignal): Promise<{ branches: { id: number; name: string }[]; accounts: { id: number; name: string }[] }> =>
    (await request("/options", signal)).json(),
  customer: async (id: number, params: URLSearchParams, signal?: AbortSignal): Promise<CollectionDetail> =>
    (await request(`/customers/${id}?${params}`, signal)).json(),
  export: async (body: unknown, signal?: AbortSignal): Promise<Blob> => (await request("/export", signal, body)).blob(),
};
export const collectionMoney = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const collectionBucketLabels: Record<string, string> = {
  all: "Todos os atrasos",
  "1-30": "1–30 dias",
  "31-60": "31–60 dias",
  "61-90": "61–90 dias",
  "91+": "Mais de 90 dias",
  upcoming: "Vence hoje / a vencer",
};
