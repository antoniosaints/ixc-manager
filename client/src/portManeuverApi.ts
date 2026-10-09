import { apiFetch } from "./http";
export interface ManeuverOptions {
  boxId: number;
  boxName: string;
  capacity: number;
  queriedAt: string;
  logins: {
    id: number;
    login: string;
    customerName: string;
    port: number;
    active: boolean;
    onuId: number | null;
    onuPort: number | null;
    blockedReason: string | null;
  }[];
  ports: { port: number; status: "free" | "occupied" | "blocked"; loginId: number | null; login: string | null; reason: string | null }[];
}
export interface ManeuverPlan {
  token: string;
  review: {
    mode: "move" | "swap" | "restore";
    boxId: number;
    boxName: string;
    loginOnly?: boolean;
    temporaryPort?: number | null;
    logins: { id: number; login: string; customerId: number; contractId: number; fromPort: number; toPort: number; onuId: number | null }[];
  };
  expiresInSeconds: number;
}
export interface ManeuverResult {
  state: "prepared" | "processing" | "success" | "rejected" | "partial" | "unknown";
  result: { message: string; step: string; state: string } | null;
}
async function requestPath<T>(path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem("retencao-cas.auth-token");
  const response = await apiFetch(`/api/network/port-maneuvers${path}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result)
    throw new Error(result?.message ?? "Não foi possível consultar a manobra. Consulte o resultado antes de repetir.");
  return result;
}
const request = <T>(boxId: number, path = "", body?: unknown) => requestPath<T>(`/boxes/${boxId}${path}`, body);
export const portManeuverApi = {
  loginContext: (loginId: number) => requestPath<{ boxId: number; boxName: string }>(`/logins/${loginId}`),
  options: (boxId: number, loginId?: number) => request<ManeuverOptions>(boxId, loginId ? `/login-ports/${loginId}` : ""),
  prepare: (boxId: number, input: { loginId: number; targetPort: number; swapLoginId?: number; loginOnly?: boolean }) =>
    request<ManeuverPlan>(boxId, "/plans", input),
  execute: (boxId: number, token: string) => request<ManeuverResult>(boxId, `/operations/${token}/execute`, { confirmed: true }),
  status: (boxId: number, token: string) => request<ManeuverPlan & ManeuverResult>(boxId, `/operations/${token}`),
  recovery: (boxId: number, token: string) => request<ManeuverPlan>(boxId, `/operations/${token}/recovery`, {}),
};
