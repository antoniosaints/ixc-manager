import { apiFetch } from "./http";
export interface LoginToolScope {
  module: "support" | "upgrades" | "network";
  contractId?: number;
  boxId?: number;
}
export type LoginAction = "disconnect" | "clearMac" | "reboot";
export interface LoginActionPlan {
  token: string;
  review: {
    action: LoginAction;
    loginId: number;
    login: string;
    customerId: number;
    contractId: number | null;
    mac: string | null;
    onuId: number | null;
    oltId: number | null;
    serial: string | null;
    pon: string | null;
  };
  expiresInSeconds: number;
}
export interface LoginActionResult {
  state: "prepared" | "processing" | "success" | "rejected" | "unknown";
  result: { message: string; state: string } | null;
}
export interface ConsumptionPeriod {
  date: string;
  downloadBytes: string | null;
  uploadBytes: string | null;
  records: number;
}
export interface LoginConsumption {
  loginId: number;
  from: string;
  to: string;
  daily: ConsumptionPeriod[];
  monthly: ConsumptionPeriod[];
  totals: { downloadBytes: string | null; uploadBytes: string | null };
  duplicatePeriods: number;
  queriedAt: string;
  source: "ixc-database";
}
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const token = localStorage.getItem("retencao-cas.auth-token");
  const response = await apiFetch(`/api/login-tools${path}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    signal,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.message ?? "Não foi possível consultar o login.");
  return result;
}
export const loginToolsApi = {
  consumption: (loginId: number, scope: LoginToolScope, from: string, to: string, signal?: AbortSignal) =>
    request<LoginConsumption>(
      `/${loginId}/consumption?${new URLSearchParams(Object.entries({ ...scope, from, to }).map(([k, v]) => [k, String(v)]))}`,
      undefined,
      signal
    ),
  prepare: (loginId: number, scope: LoginToolScope, action: LoginAction) =>
    request<LoginActionPlan>(`/${loginId}/plans`, { scope, action }),
  execute: (token: string) => request<LoginActionResult>(`/operations/${token}/execute`, { confirmed: true }),
  status: (token: string) => request<LoginActionResult>(`/operations/${token}`),
};
