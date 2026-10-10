import { apiFetch } from "./http";
export interface PonPosition {
  entryId: string;
  onuId: number | null;
  oltId: number | null;
  pon: string | null;
  position: number | null;
  loginId: number | null;
  login: string | null;
  boxId: number | null;
  boxName: string | null;
  port: number | null;
  active: boolean | null;
  status: "online" | "offline" | "unknown";
  source: "IXC" | "RADIUS" | null;
  ip: string | null;
  sessionStartedAt: string | null;
  sessionStoppedAt: string | null;
  sessionUpdatedAt: string | null;
  disconnectReason: string | null;
  warning: string | null;
}
export interface PonEvent extends Pick<
  PonPosition,
  "entryId" | "oltId" | "pon" | "onuId" | "position" | "loginId" | "login" | "boxId" | "boxName" | "port"
> {
  status: "online" | "offline";
  checkedAt: string;
}
export interface PonState {
  oltId: number | null;
  pon: string | null;
  boxId?: number;
  boxName?: string;
  capacity?: number | null;
  checkedAt: string;
  positions: PonPosition[];
  events: PonEvent[];
  snapshot: boolean;
}
export interface PonOptions {
  boxes: { id: number; name: string; capacity: number | null }[];
  olts: { id: number; name: string }[];
  pons: { pon: string; total: number; containsBox?: boolean }[];
}
export const ponApi = {
  async options(oltId?: number, signal?: AbortSignal, boxId?: number): Promise<PonOptions> {
    const token = localStorage.getItem("retencao-cas.auth-token");
    const params = new URLSearchParams({ ...(oltId ? { oltId: String(oltId) } : {}), ...(boxId ? { boxId: String(boxId) } : {}) });
    const response = await apiFetch(`/api/network/pon/options?${params}`, {
      signal,
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? "Não foi possível consultar as PONs.");
    return response.json();
  },
};
