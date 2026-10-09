import { apiFetch } from "./http";
import type { LivePage, LoginSignalDetails } from "./upgradesApi";
export interface NetworkBox {
  id: number;
  name: string;
  active: boolean | null;
  capacity: number | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  zip: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  projectId: number | null;
  transmitterId: number | null;
  transmitter: string | null;
  interfaceId: number | null;
  notes: string | null;
  updatedAt: string | null;
  totalLogins: number;
  activeLogins: number;
  inactiveLogins: number;
  onlineLogins: number;
  offlineLogins: number;
  unknownLogins: number;
  occupiedPorts: number;
  freePorts: number | null;
  duplicatePorts: number;
  invalidPorts: number;
}
export interface NetworkLogin {
  technology?: { code: string | null; label: string; kind: string };
  id: number;
  login: string | null;
  active: boolean | null;
  status: "online" | "offline" | "unknown";
  port: number | null;
  customerId: number | null;
  customerName: string | null;
  customerActive: boolean | null;
  contractId: number | null;
  contractName: string | null;
  contractStatus: string | null;
  ip: string | null;
  mac: string | null;
  onuMac: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  disconnectReason: string | null;
  lastServiceSignal: string | null;
  concentrator: string | null;
}
export interface NetworkBoxes extends LivePage<NetworkBox> {
  summary: { boxes: number; activeLogins: number; onlineLogins: number; offlineLogins: number; unknownLogins: number };
}
export interface NetworkLogins extends LivePage<NetworkLogin> {
  box: NetworkBox;
}
export interface NetworkLoginRow extends NetworkLogin {
  customerDocument: string | null;
  ftthBoxId: number | null;
  ftthBoxName: string | null;
  ftthBoxSource: "login" | "onu";
  cityId: number | null;
  city: string | null;
  branchId: number | null;
  branch: string | null;
}
export interface NetworkLoginList extends LivePage<NetworkLoginRow> {
  summary: { total: number; activeLogins: number; inactiveLogins: number; onlineLogins: number; offlineLogins: number };
}
async function read<T>(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const token = localStorage.getItem("retencao-cas.auth-token");
  const response = await apiFetch(`/api/network${path}?${params}`, {
    signal,
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "Não foi possível consultar a rede.");
  }
  return response.json();
}
export const networkApi = {
  list: (params: URLSearchParams, signal?: AbortSignal) => read<NetworkLoginList>("/logins", params, signal),
  listFilters: (signal?: AbortSignal) =>
    read<{ cities: { id: number; name: string }[]; branches: { id: number; name: string }[] }>(
      "/logins/filters",
      new URLSearchParams(),
      signal
    ),
  directLogin: (id: number, signal?: AbortSignal) =>
    read<{ login: NetworkLoginRow; queriedAt: string }>(`/logins/${id}`, new URLSearchParams(), signal),
  directSignal: (id: number, signal?: AbortSignal) => read<LoginSignalDetails>(`/logins/${id}/signal`, new URLSearchParams(), signal),
  loginSignal: (boxId: number, loginId: number, signal?: AbortSignal) =>
    read<LoginSignalDetails>(`/boxes/${boxId}/logins/${loginId}/signal`, new URLSearchParams(), signal),
  box: (id: number, signal?: AbortSignal) => read<{ box: NetworkBox; queriedAt: string }>(`/boxes/${id}`, new URLSearchParams(), signal),
  boxes: (params: URLSearchParams, signal?: AbortSignal) => read<NetworkBoxes>("/boxes", params, signal),
  logins: (id: number, params: URLSearchParams, signal?: AbortSignal) => read<NetworkLogins>(`/boxes/${id}/logins`, params, signal),
  login: (boxId: number, loginId: number, signal?: AbortSignal) =>
    read<{ login: NetworkLogin; queriedAt: string }>(`/boxes/${boxId}/logins/${loginId}`, new URLSearchParams(), signal),
};
