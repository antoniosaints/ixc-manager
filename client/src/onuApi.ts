import { apiFetch } from "./http";
export interface PendingOnu {
  pendingId: string;
  oltId: number;
  oltName: string;
  serial: string;
  pon: string;
  model: string;
  chassis: number;
  slot: number;
  ponNumber: number;
  canAuthorize: boolean;
}
export interface Onu {
  id: number;
  oltId: number;
  name: string;
  serial: string;
  pon: string;
  model: string;
  authorization: string;
  loginId: number | null;
  contractId: number | null;
  profileId: number | null;
  hardwareId: number | null;
  projectId: number | null;
  boxId: number | null;
  port: number | null;
  vlan: number | null;
  oltName?: string;
  login?: string;
  profileName?: string;
  hardwareName?: string;
  projectName?: string;
  boxName?: string;
  contractName?: string;
}
export interface OnuPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  queriedAt: string;
}
export interface OnuOptions {
  olts: { id: number; name: string; manufacturer: string; defaultProfileId: number }[];
  profiles: { id: number; name: string; manufacturer: string }[];
  hardware: { id: number; name: string }[];
  projects: { id: number; name: string }[];
  boxes: { id: number; name: string; projectId: number; capacity: number }[];
}
export interface OnuContract {
  id: number;
  name: string;
  customerId: number;
  customerName: string;
}
export interface OnuLogin {
  id: number;
  login: string;
  customerId: number;
  customerName: string;
  contractId: number;
  contractName: string;
  boxId: number | null;
  port: number | null;
}
export interface OnuConfiguration {
  profileId: number;
  hardwareId: number;
  projectId: number;
  boxId: number;
  port: number;
  loginId: number;
  contractId: number;
  vlan: number;
  name: string;
}
export type OnuPlanInput =
  | { action: "authorize"; oltId: number; pendingId?: string; onuId?: number; configuration: OnuConfiguration }
  | { action: "deauthorize"; onuId: number };
export interface OnuReview {
  token: string;
  review: Record<string, unknown>;
  expiresInSeconds: number;
  profileScript?: string;
}
export interface OnuBlockage {
  scope: "olt" | "login";
  retryAfterSeconds: number | null;
  state: "prepared" | "processing" | "success" | "rejected" | "partial" | "unknown" | "unavailable";
  operationToken?: string;
}
export class OnuApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly blockage?: OnuBlockage
  ) {
    super(message);
  }
}
export interface OnuOperationResult {
  blockage?: OnuBlockage;
  state: "prepared" | "processing" | "success" | "rejected" | "partial" | "unknown";
  result: { state: string; message: string; onuId: number | null; step: string } | null;
}
async function request<T>(path: string, params?: URLSearchParams, body?: unknown, signal?: AbortSignal): Promise<T> {
  const token = localStorage.getItem("retencao-cas.auth-token");
  const response = await apiFetch(`/api/network/onus${path}${params ? `?${params}` : ""}`, {
    method: body === undefined ? "GET" : "POST",
    signal,
    cache: "no-store",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new OnuApiError(error?.message ?? "Não foi possível consultar a ONU.", response.status, error?.code, error?.blockage);
  }
  return response.json();
}
export const onuApi = {
  options: (params = new URLSearchParams(), signal?: AbortSignal) => request<OnuOptions>("/options", params, undefined, signal),
  pending: (params: URLSearchParams, signal?: AbortSignal) => request<OnuPage<PendingOnu>>("/pending", params, undefined, signal),
  registered: (params: URLSearchParams, signal?: AbortSignal) => request<OnuPage<Onu>>("/registered", params, undefined, signal),
  detail: (id: number, signal?: AbortSignal) => request<{ onu: Onu; queriedAt: string }>(`/${id}`, undefined, undefined, signal),
  logins: (search: string, kind: string, signal?: AbortSignal) =>
    request<{ items: OnuLogin[] }>("/logins", new URLSearchParams({ search, kind }), undefined, signal),
  contracts: (search: string, signal?: AbortSignal) =>
    request<{ items: OnuContract[] }>("/contracts", new URLSearchParams({ search }), undefined, signal),
  contractLogins: (id: number, search = "", signal?: AbortSignal) =>
    request<{ items: OnuLogin[] }>(`/contracts/${id}/logins`, new URLSearchParams({ search }), undefined, signal),
  profile: (id: number, oltId: number, signal?: AbortSignal) =>
    request<{ id: number; name: string; script: string }>(
      `/profiles/${id}`,
      new URLSearchParams({ oltId: String(oltId) }),
      undefined,
      signal
    ),
  ports: (boxId: number, loginId?: number, onuId?: number, signal?: AbortSignal) =>
    request<{ ports: { port: number; occupied: boolean }[] }>(
      `/boxes/${boxId}/ports`,
      new URLSearchParams({ ...(loginId ? { loginId: String(loginId) } : {}), ...(onuId ? { onuId: String(onuId) } : {}) }),
      undefined,
      signal
    ),
  prepare: (input: OnuPlanInput) => request<OnuReview>("/plans", undefined, input),
  execute: (token: string) => request<OnuOperationResult>(`/operations/${token}/execute`, undefined, { confirmed: true }),
  status: (token: string) => request<OnuOperationResult>(`/operations/${token}`),
};
