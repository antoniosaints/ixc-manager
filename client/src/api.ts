export type RiskLevel = "LOW" | "ATTENTION" | "MEDIUM" | "HIGH" | "CRITICAL";
export interface RetentionSummary {
  activeCustomers: number | null;
  blocked: number | null;
  cancellationsThisMonth: number | null;
  lowRisk: number | null;
  attention: number | null;
  medium: number | null;
  highRisk: number | null;
  critical: number | null;
  operationalSource: "database" | "synchronized" | "unavailable";
  operationalQueriedAt: string | null;
  riskSource: "synchronized" | "unavailable";
  riskCalculatedAt: string | null;
  referenceDate: string;
  warnings: string[];
}
export interface Customer {
  customer_id: number;
  contract_id: number;
  name: string;
  city: string | null;
  neighborhood: string | null;
  plan_name: string | null;
  score: number;
  risk_level: RiskLevel;
  financial_score: number;
  support_score: number;
  network_score: number;
  contract_score: number;
  satisfaction_score: number;
  calculated_at: string;
  workflow_status: "OPEN" | "RESOLVED";
  attention_critical: boolean;
}
export interface SyncJob {
  id: string;
  name: string;
  state: "active" | "waiting" | "delayed" | "completed" | "failed";
  progress:
    | number
    | {
        phase?: string;
        currentResource?: string | null;
        completed?: number;
        total?: number;
        resourceProcessed?: number;
        resourceTotal?: number;
        scoreProcessed?: number;
        scoreTotal?: number;
      };
  createdAt: string;
  processedAt: string | null;
  finishedAt: string | null;
  failedReason: string | null;
}
export interface SyncStatus {
  counts: Record<string, number>;
  jobs: Record<SyncJob["state"], SyncJob[]>;
}
export interface SyncEnqueueResult {
  status: "queued" | "already_running";
  jobId: string;
}
export interface RecalculationJob {
  id: string;
  state: SyncJob["state"] | "unknown";
  failedReason: string | null;
}
const requestHeaders = (headers?: HeadersInit) => {
  const merged = new Headers(headers);
  const token = localStorage.getItem("retencao-cas.auth-token");
  if (token) merged.set("Authorization", `Bearer ${token}`);
  return merged;
};
const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`/api/retention${path}`, { ...init, headers: requestHeaders(init?.headers) });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "Não foi possível concluir a solicitação.");
  }
  return response.json() as Promise<T>;
};
const authRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`/api/auth${path}`, { ...init, headers: requestHeaders(init?.headers) });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "Não foi possível concluir a solicitação.");
  }
  return response.json() as Promise<T>;
};
export type UserRole = "USER" | "OPERATOR" | "MANAGER" | "ADMIN";
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active?: boolean;
  createdAt?: string;
  permissions?: string[];
  profileId?: number | null;
  profileName?: string | null;
  permissionOverrides?: Record<string, boolean>;
}
export const api = {
  summary: () => request<RetentionSummary>("/summary", { cache: "no-store" }),
  customers: (params: URLSearchParams) => request<{ items: Customer[]; total: number }>(`/customers?${params}`),
  customer: (id: number, contractId?: number, signal?: AbortSignal) =>
    request<any>(`/customers/${id}${contractId ? `?contractId=${contractId}` : ""}`, { signal }),
  customerPdf: async (id: number, contractId: number, signal?: AbortSignal): Promise<Blob> => {
    const response = await fetch(`/api/retention/customers/${id}/pdf?contractId=${contractId}`, {
      headers: requestHeaders(),
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message ?? "Não foi possível exportar o PDF.");
    }
    return response.blob();
  },
  addCustomerNote: (id: number, content: string) =>
    request(`/customers/${id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  updateCustomerWorkflow: (id: number, status: "OPEN" | "RESOLVED") =>
    request(`/customers/${id}/workflow`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),
  updateCustomerAttention: (id: number, contractId: number, critical: boolean) =>
    request(`/customers/${id}/attention`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractId, critical }),
    }),
  timeline: (id: number, signal?: AbortSignal) => request<{ events: any[] }>(`/customers/${id}/timeline`, { signal }),
  analytics: (dimension: string) => request<{ items: any[] }>(`/analytics/${dimension}`),
  recalculate: (id?: number) => request<SyncEnqueueResult>(id ? `/customers/${id}/recalculate` : `/recalculate`, { method: "POST" }),
  job: (id: string) => request<RecalculationJob>(`/jobs/${id}`),
  sync: () => request<SyncEnqueueResult>("/sync", { method: "POST" }),
  syncStatus: (signal?: AbortSignal) => request<SyncStatus>("/sync/status", { signal }),
  setupStatus: () => authRequest<{ needsSetup: boolean }>("/setup-status"),
  login: (email: string, password: string) =>
    authRequest<{ token: string; user: AuthUser }>("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  setup: (name: string, email: string, password: string) =>
    authRequest<{ token: string; user: AuthUser }>("/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    }),
  me: () => authRequest<AuthUser>("/me"),
  logout: () => authRequest<{ ok: boolean }>("/logout", { method: "POST" }),
  users: () => authRequest<{ items: AuthUser[] }>("/users"),
  createUser: (input: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    active?: boolean;
    profileId?: number | null;
    permissionOverrides?: Record<string, boolean>;
  }) =>
    authRequest<{ id: number }>("/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
  updateUser: (
    id: number,
    input: Partial<{
      name: string;
      email: string;
      role: UserRole;
      active: boolean;
      password: string;
      profileId: number | null;
      permissionOverrides: Record<string, boolean>;
    }>
  ) =>
    authRequest<{ ok: boolean }>(`/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
};
