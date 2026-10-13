import { apiFetch } from "./http";

export interface RaffleFilters {
  startFrom: string;
  startTo: string;
  status: string;
  planIds: number[];
  productIds: number[];
  productMatch: "any" | "all";
}
export interface RaffleConfig {
  name: string;
  background: string;
  logo: string;
  prizes: string[];
  oncePerCustomer: boolean;
  filters: RaffleFilters;
}
export interface RaffleParticipant {
  contractId: number;
  customerId: number;
  customerName: string;
  city: string | null;
  plan: string | null;
  activatedAt: string | null;
}
export interface RaffleResult {
  order: number;
  prize: string;
  contractId: number;
  customerName: string;
  city: string | null;
  drawnAt: string;
}
export interface RafflePresentation {
  id: string;
  name: string;
  background: string;
  logo: string;
  prizes: string[];
  total: number;
  remaining: number;
  revision: number;
  phase: "ready" | "countdown" | "finished";
  countdownEndsAt: string | null;
  serverNow: string;
  results: RaffleResult[];
}
export interface RaffleAdmin extends RafflePresentation {
  config: RaffleConfig;
  sharing: boolean;
  createdAt: string;
  updatedAt: string;
  sample: RaffleParticipant[];
  oncePerCustomer: boolean;
}
export interface RaffleListItem {
  id: string;
  name: string;
  createdAt: string;
  total: number;
  drawn: number;
}

async function request<T>(path: string, init: RequestInit = {}, publicRequest = false): Promise<T> {
  const token = localStorage.getItem("retencao-cas.auth-token");
  const response = await apiFetch(`/api/raffles${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(publicRequest ? {} : { Authorization: `Bearer ${token ?? ""}` }),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? "Não foi possível consultar o sorteio.");
  }
  return response.json() as Promise<T>;
}
const body = (value: unknown) => JSON.stringify(value);
export const rafflesApi = {
  list: () => request<{ items: RaffleListItem[] }>("/"),
  options: () => request<{ plans: { id: number; name: string }[]; products: { id: number; name: string }[] }>("/options"),
  preview: (filters: RaffleFilters) =>
    request<{ total: number; items: RaffleParticipant[] }>("/preview", { method: "POST", body: body(filters) }),
  create: (config: RaffleConfig) => request<RaffleAdmin>("/", { method: "POST", body: body(config) }),
  get: (id: string) => request<RaffleAdmin>(`/${encodeURIComponent(id)}`),
  update: (id: string, config: RaffleConfig) => request<RaffleAdmin>(`/${encodeURIComponent(id)}`, { method: "PUT", body: body(config) }),
  draw: (id: string, requestId: string) =>
    request<RaffleAdmin>(`/${encodeURIComponent(id)}/draw`, { method: "POST", body: body({ requestId }) }),
  share: (id: string, enabled: boolean) =>
    request<{ raffle: RaffleAdmin; token: string | null }>(`/${encodeURIComponent(id)}/share`, { method: "POST", body: body({ enabled }) }),
  public: (token: string) => request<RafflePresentation>(`/public/${encodeURIComponent(token)}`, {}, true),
  async pdf(id: string) {
    const response = await apiFetch(`/api/raffles/${encodeURIComponent(id)}/pdf`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${localStorage.getItem("retencao-cas.auth-token") ?? ""}` },
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message ?? "Não foi possível exportar o PDF.");
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `sorteio-${id}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
export function raffleResultsText(s: RafflePresentation) {
  return [
    s.name,
    ...s.results.map(
      (r) =>
        `${r.order}º prêmio — ${r.prize}\nContrato #${r.contractId} — ${r.customerName}\n${r.city ?? "Localidade não informada"} · ${new Date(r.drawnAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
    ),
  ].join("\n\n");
}
