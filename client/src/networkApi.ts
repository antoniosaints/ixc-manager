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
async function read<T>(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const token = localStorage.getItem("retencao-cas.auth-token");
  const response = await fetch(`/api/network${path}?${params}`, {
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
  loginSignal: (boxId: number, loginId: number, signal?: AbortSignal) =>
    read<LoginSignalDetails>(`/boxes/${boxId}/logins/${loginId}/signal`, new URLSearchParams(), signal),
  box: (id: number, signal?: AbortSignal) => read<{ box: NetworkBox; queriedAt: string }>(`/boxes/${id}`, new URLSearchParams(), signal),
  boxes: (params: URLSearchParams, signal?: AbortSignal) => read<NetworkBoxes>("/boxes", params, signal),
  logins: (id: number, params: URLSearchParams, signal?: AbortSignal) => read<NetworkLogins>(`/boxes/${id}/logins`, params, signal),
  login: (boxId: number, loginId: number, signal?: AbortSignal) =>
    read<{ login: NetworkLogin; queriedAt: string }>(`/boxes/${boxId}/logins/${loginId}`, new URLSearchParams(), signal),
};
