export interface UpgradeContract {
  contractId: number;
  customerId: number;
  customerName: string;
  customerAvailable: boolean;
  customerActive: boolean | null;
  planId: number | null;
  planName: string;
  branchId: number | null;
  contractStatus: string;
  internetStatus: string;
  suspended: boolean;
  fidelityMonths: number | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  permanenceStatus: "expired" | "today" | "expiring" | "missing";
  activatedAt: string | null;
  signedAt: string | null;
  renewedAt: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
}
export interface UpgradeSummary {
  counts: Record<"expired" | "next30" | "next60" | "next90" | "missing", number>;
  referenceDate: string;
  queriedAt: string;
}
export interface ContractContact {
  number: string;
  labels: string[];
  sources: string[];
  extension: string | null;
  telUrl: string;
  whatsappUrl: string | null;
}
export interface UpgradeContractDetails extends UpgradeContract {
  contactName: string | null;
  email: string | null;
  extension: string | null;
  contacts: ContractContact[];
  billingDay: number | null;
  autoRenew: boolean | null;
  paidUntil: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  installation: {
    zip: string | null;
    reference: string | null;
    building: string | null;
    apartment: string | null;
    usesCustomerAddress: boolean;
  };
  notes: { label: string; content: string }[];
}
export type LoginSecretField = "authentication" | "router1" | "router2" | "wifi24" | "wifi5" | "wpa";
export interface EquipmentTarget {
  label: string;
  ip: string | null;
  port: number | null;
  protocol: string | null;
  url: string | null;
  reason: string | null;
}
export interface UpgradeLogin {
  id: number;
  contractId: number;
  customerId: number;
  login: string | null;
  active: boolean | null;
  status: "online" | "offline" | "unknown";
  authentication: string | null;
  connectionType: string | null;
  ip: string | null;
  auxiliaryIp: string | null;
  mac: string | null;
  ipv6Prefix: string | null;
  framedIpv6Prefix: string | null;
  routerUsername: string | null;
  wifi24Ssid: string | null;
  wifi5Ssid: string | null;
  wpaUsername: string | null;
  accessType: string | null;
  routerPort: number | null;
  router2Port: number | null;
  auxiliaryPort: number | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  connectedTime: string | null;
  disconnectReason: string | null;
  disconnectCount: number | null;
  concentratorId: number | null;
  concentrator: string | null;
  interface: string | null;
  transmitterId: number | null;
  hardwareId: number | null;
  onuMac: string | null;
  equipmentType: string | null;
  ftthBoxId: number | null;
  ftthBoxName: string | null;
  ftthBoxSource?: "login" | "onu" | null;
  ftthBoxAmbiguous?: boolean;
  ftthPort: string | null;
  vlan: string | null;
  transmissionInterface: string | null;
  lastServiceSignal: string | null;
  address: string | null;
  neighborhood: string | null;
  zip: string | null;
  usesCustomerAddress: boolean | null;
  accessTargets: EquipmentTarget[];
  secretAvailability: Record<LoginSecretField, boolean>;
}
export interface LoginSignalReading {
  onuId: number;
  model: string | null;
  serial: string | null;
  pon: string | null;
  rxDbm: number | null;
  txDbm: number | null;
  measuredAt: string | null;
  temperatureC: number | null;
  voltageV: number | null;
  powerStatus: "regular" | "irregular" | "indefinido" | null;
  authorization: "authorized" | "unauthorized" | null;
  linkedContractId?: number | null;
  contractMismatch?: boolean;
}
export interface LoginSignalDetails {
  readings: LoginSignalReading[];
  truncated: boolean;
  source: "ixc-database" | "ixc-api";
  queriedAt: string;
}
export interface UpgradePlan {
  id: number;
  name: string;
  description: string | null;
  fidelityMonths: number | null;
  branchId: number | null;
  value: number | null;
}
export interface LivePage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  queriedAt: string;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = localStorage.getItem("retencao-cas.auth-token");
  const response = await fetch(`/api/upgrades${path}`, {
    signal,
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "Não foi possível consultar o IXC. Tente novamente.");
  }
  return response.json();
}
export function createTechnicalApi(base: string) {
  async function getTechnical<T>(path: string, signal?: AbortSignal): Promise<T> {
    const token = localStorage.getItem("retencao-cas.auth-token");
    const response = await fetch(`${base}${path}`, {
      signal,
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.message ?? "Não foi possível consultar o IXC. Tente novamente.");
    }
    return response.json();
  }
  return {
    contract: (id: string, signal?: AbortSignal) =>
      getTechnical<{ contract: UpgradeContractDetails; queriedAt: string; referenceDate: string }>(
        `/contracts/${encodeURIComponent(id)}`,
        signal
      ),
    logins: (id: string, params: URLSearchParams, signal?: AbortSignal) =>
      getTechnical<LivePage<UpgradeLogin>>(`/contracts/${encodeURIComponent(id)}/logins?${params}`, signal),
    loginSignal: (id: string, loginId: number, signal?: AbortSignal) =>
      getTechnical<LoginSignalDetails>(`/contracts/${encodeURIComponent(id)}/logins/${loginId}/signal`, signal),
    loginSecret: (id: string, loginId: number, field: LoginSecretField, signal?: AbortSignal) =>
      getTechnical<{ value: string | null; queriedAt: string }>(
        `/contracts/${encodeURIComponent(id)}/logins/${loginId}/secrets/${field}`,
        signal
      ),
    loginAccess: async (
      id: string,
      loginId: number,
      protocol: "http" | "https",
      port: 80 | 7000 | 7001,
      signal?: AbortSignal
    ): Promise<{ url: string; password: string }> => {
      const token = localStorage.getItem("retencao-cas.auth-token");
      const response = await fetch(`${base}/contracts/${encodeURIComponent(id)}/logins/${loginId}/access`, {
        method: "POST",
        signal,
        cache: "no-store",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ protocol, port }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message ?? "Não foi possível preparar o acesso ao equipamento.");
      }
      return response.json();
    },
  };
}
export const upgradesApi = {
  export: async (
    body: {
      includeNotes?: boolean;
      themeMode?: "light" | "dark";
      filters: Record<string, string>;
      peopleCount: number;
      clientsPerPerson: number;
      names: string[];
      contractIds?: number[];
    },
    signal?: AbortSignal
  ): Promise<Blob> => {
    const token = localStorage.getItem("retencao-cas.auth-token");
    const response = await fetch("/api/upgrades/export", {
      method: "POST",
      signal,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.message ?? "Não foi possível gerar o PDF. Tente novamente.");
    }
    return response.blob();
  },
  opportunities: (params: URLSearchParams, signal?: AbortSignal) => get<LivePage<UpgradeContract>>(`/opportunities?${params}`, signal),
  summary: (params: URLSearchParams, signal?: AbortSignal) => get<UpgradeSummary>(`/summary?${params}`, signal),
  ...createTechnicalApi("/api/upgrades"),
  plans: (params: URLSearchParams, signal?: AbortSignal) => get<LivePage<UpgradePlan>>(`/plans?${params}`, signal),
};

export const formatDate = (date: string | null) =>
  date ? new Date(`${date}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Não informada";
/** IXC returns local date/time strings without an offset. Preserve the reported clock. */
export const formatIxcDateTime = (value: string | null) => {
  if (!value) return "Não informada";
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2})(?::\d{2})?)?$/.exec(value);
  if (!parts || parts[1] === "0000") return "Não informada";
  const date = `${parts[1]}-${parts[2]}-${parts[3]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return "Não informada";
  return `${parts[3]}/${parts[2]}/${parts[1]}${parts[4] ? ` · ${parts[4]}` : ""}`;
};
export const formatConsulted = (date?: string) =>
  date
    ? new Date(date).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : "";
const internetStatuses: Record<string, string> = {
  A: "Liberado",
  CA: "Bloqueio automático",
  CM: "Bloqueio manual",
  FA: "Financeiro em atraso",
  AA: "Aguardando assinatura",
  D: "Desativado",
};
export const internetStatus = (status: string) => internetStatuses[status] ?? (status || "Não informado");
export const permanenceLabel = (contract: UpgradeContract) =>
  contract.daysRemaining === null
    ? "Sem data"
    : contract.daysRemaining < 0
      ? `Vencida há ${Math.abs(contract.daysRemaining)} dias`
      : contract.daysRemaining === 0
        ? "Vence hoje"
        : `Vence em ${contract.daysRemaining} dias`;
