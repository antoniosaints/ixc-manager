import { createTechnicalApi, type ContractContact, type LivePage, type UpgradeLogin } from "./upgradesApi";
export interface SupportCustomer {
  id: number;
  name: string;
  active: boolean | null;
  document: string | null;
  phone: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
}
export interface SupportCustomerDetails extends SupportCustomer {
  email: string | null;
  contactName: string | null;
  zip: string | null;
  reference: string | null;
  contacts: ContractContact[];
  notes: { label: string; content: string; truncated?: boolean }[];
  tradeName: string | null;
  socialName: string | null;
  personType: string | null;
  categoryId: number | null;
  category: string | null;
  branchId: number | null;
  branch: string | null;
  salespersonId: number | null;
  salesperson: string | null;
  registeredAt: string | null;
  updatedAt: string | null;
  state: string | null;
  internetStatus: string | null;
  localityType: string | null;
  block: string | null;
  apartment: string | null;
  billingAddress: {
    address: string | null;
    city: string | null;
    state: string | null;
    neighborhood: string | null;
    zip: string | null;
    reference: string | null;
  };
  billing: {
    dueDay: number | null;
    automaticBlock: boolean | null;
    overdueNotice: boolean | null;
    doNotBlockUntil: string | null;
    doNotNotifyUntil: string | null;
    email: boolean | null;
    sms: boolean | null;
  };
  relatedContacts: {
    id: number | null;
    name: string;
    email: string | null;
    primary: boolean | null;
    active: boolean | null;
    numbers: ContractContact[];
  }[];
  contactsTruncated: boolean;
}
export type AnalysisCategory = "financial" | "support" | "network" | "contract" | "satisfaction";
export interface CustomerAnalysis {
  customer: { id: number; name: string };
  queriedAt: string;
  partial: boolean;
  message: string | null;
  warnings: string[];
  sources: { key: string; label: string; status: "ok" | "unavailable"; count: number | null }[];
  contracts: {
    id: number;
    name: string;
    score: number;
    level: string;
    factors: Record<AnalysisCategory, number>;
    reasons: { category: AnalysisCategory; code: string; description: string; points: number }[];
  }[];
}
export interface SupportContract {
  id: number;
  customerId: number;
  name: string;
  status: string;
  internetStatus: string;
  branchId: number | null;
  activatedAt: string | null;
  expiresAt: string | null;
  address: string | null;
}
export interface SupportCase {
  id: number;
  protocol: string | null;
  contractId: number | null;
  loginId: number | null;
  subjectId: number | null;
  subjectName: string | null;
  title: string | null;
  status: string;
  priority: string | null;
  openedAt: string | null;
  scheduledAt: string | null;
  closedAt: string | null;
  updatedAt: string | null;
  message: string | null;
  response: string | null;
}
export interface SupportComodato {
  id: number;
  contractId: number;
  loginId: number | null;
  productId: number | null;
  description: string | null;
  status: string | null;
  movement: string | null;
  date: string | null;
  quantity: number | null;
  assetId: number | null;
  assetNumber: string | null;
  serial: string | null;
  mac: string | null;
  returnId: number | null;
}
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = localStorage.getItem("retencao-cas.auth-token");
  const response = await fetch(`/api/support${path}`, {
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
export const supportApi = {
  ...createTechnicalApi("/api/support"),
  login: (id: string, loginId: number, signal?: AbortSignal) =>
    get<{ login: UpgradeLogin; queriedAt: string }>(`/contracts/${encodeURIComponent(id)}/logins/${loginId}`, signal),
  customers: (params: URLSearchParams, signal?: AbortSignal) => get<LivePage<SupportCustomer>>(`/customers?${params}`, signal),
  customer: (id: string, signal?: AbortSignal) =>
    get<{ customer: SupportCustomerDetails; queriedAt: string; source: "database" }>(`/customers/${encodeURIComponent(id)}`, signal),
  analyze: (id: string, signal?: AbortSignal) => get<CustomerAnalysis>(`/customers/${encodeURIComponent(id)}/analysis`, signal),
  contracts: (id: string, params: URLSearchParams, signal?: AbortSignal) =>
    get<LivePage<SupportContract>>(`/customers/${encodeURIComponent(id)}/contracts?${params}`, signal),
  customerLogins: (id: string, params: URLSearchParams, signal?: AbortSignal) =>
    get<LivePage<UpgradeLogin>>(`/customers/${encodeURIComponent(id)}/logins?${params}`, signal),
  cases: (id: string, kind: "orders" | "tickets", params: URLSearchParams, signal?: AbortSignal) =>
    get<LivePage<SupportCase>>(`/customers/${encodeURIComponent(id)}/${kind}?${params}`, signal),
  caseDetail: (id: string, kind: "orders" | "tickets", caseId: number, signal?: AbortSignal) =>
    get<{ record: SupportCaseDetails; queriedAt: string }>(`/customers/${encodeURIComponent(id)}/${kind}/${caseId}`, signal),
  caseHistory: (
    id: string,
    kind: "orders" | "tickets",
    caseId: number,
    section: "messages" | "movements",
    params: URLSearchParams,
    signal?: AbortSignal
  ) =>
    get<LivePage<SupportCaseHistory> & { source: string }>(
      `/customers/${encodeURIComponent(id)}/${kind}/${caseId}/${section}?${params}`,
      signal
    ),
  comodato: (id: string, params: URLSearchParams, signal?: AbortSignal) =>
    get<LivePage<SupportComodato>>(`/contracts/${encodeURIComponent(id)}/comodato?${params}`, signal),
};
export const contractStatus = (status: string) =>
  (({ A: "Ativo", I: "Inativo", P: "Pré-contrato", N: "Negativado", D: "Desistiu" }) as Record<string, string>)[status] ??
  (status ? `Status ${status}` : "Sem status");
export const loginStatus = (status: UpgradeLogin["status"]) => ({ online: "Online", offline: "Offline", unknown: "Sem status" })[status];
export const caseStatus = (code: string, kind: "orders" | "tickets") => {
  // Only confirmed IXC codes are translated; unknown values stay visible.
  const labels: Record<string, string> =
    kind === "orders"
      ? {
          A: "Aberta",
          F: "Finalizada",
          AN: "Em análise",
          EN: "Encaminhada",
          AS: "Assumida",
          AG: "Agendada",
          EX: "Em execução",
          RAG: "Aguardando agendamento",
          DS: "Em deslocamento",
        }
      : { N: "Novo", P: "Pendente", EP: "Em progresso", S: "Solucionado", C: "Cancelado" };
  return labels[code] ?? (code ? `Status ${code}` : "Sem status");
};

export interface SupportCaseDetails extends SupportCase {
  customerId: number;
  kind: "orders" | "tickets";
  flowStatus: string | null;
  messageTruncated: boolean;
  branchId: number | null;
  address: string | null;
  sector: string | null;
  technician: string | null;
  diagnosis: string | null;
  ticketId: number | null;
  reopenReason: string | null;
  stages: { label: string; date: string }[];
}
export interface SupportCaseHistory {
  id: string;
  date: string | null;
  operator: string | null;
  technician: string | null;
  status: string | null;
  title: string | null;
  type: string | null;
  event: string | null;
  body: string | null;
  observation: string | null;
  visibility: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  diagnosis: string | null;
  quantity: string | null;
  totalValue: string | null;
  serial: string | null;
  mac: string | null;
  truncated: boolean;
}
