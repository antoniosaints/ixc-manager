import type { RecordTarget } from "../recordNavigation";
export type GraphArea = "contracts" | "logins" | "orders" | "tickets" | "financial" | "equipment";
export type GraphTone = "danger" | "warning" | "success" | "neutral";
export interface GraphRecord {
  key: string;
  kind: GraphArea;
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  tone: GraphTone;
  contractId: number | null;
  loginId: number | null;
  ticketId: number | null;
  date: string | null;
  facts: { label: string; value: string }[];
}
export interface GraphGroup {
  state: "ok" | "restricted" | "unavailable";
  total: number | null;
  metrics: Record<string, number | null>;
  records: GraphRecord[];
  detailsRestricted: boolean;
}
export interface CustomerGraph {
  customer: {
    id: number;
    name: string;
    active: boolean | null;
    city: string | null;
    neighborhood: string | null;
    satisfaction: number | null;
    registeredAt: string | null;
  };
  groups: Record<GraphArea, GraphGroup>;
  previewLimit: number;
  queriedAt: string;
  referenceDate: string;
  partial: boolean;
}
export const graphAreas = [
  { key: "contracts", label: "Contratos", color: "#6366f1", angle: -90, description: "Planos, situação do acesso e permanência." },
  { key: "logins", label: "Logins", color: "#0891b2", angle: -30, description: "Cadastros de acesso e estado de conexão no IXC." },
  { key: "orders", label: "Ordens de serviço", color: "#d97706", angle: 30, description: "OS em aberto, prioridades e vínculos técnicos." },
  { key: "financial", label: "Financeiro", color: "#059669", angle: 90, description: "Títulos, saldos abertos e vencimentos." },
  { key: "tickets", label: "Atendimentos", color: "#db2777", angle: 150, description: "Histórico de atendimento e pendências." },
  { key: "equipment", label: "Equipamentos", color: "#7c3aed", angle: 210, description: "Comodatos em posse do cliente e seus vínculos." },
] as const;
export function graphInsights(data: CustomerGraph) {
  const insights: { key: string; title: string; description: string; area: GraphArea; tone: GraphTone }[] = [];
  const metrics = (area: GraphArea, metric: string) => (data.groups[area].state === "ok" ? (data.groups[area].metrics[metric] ?? 0) : 0);
  if (metrics("financial", "overdue"))
    insights.push({
      key: "overdue",
      title: "Pendências financeiras",
      description: `${metrics("financial", "overdue")} título(s) vencido(s). Confirme os valores e a situação de pagamento.`,
      area: "financial",
      tone: "danger",
    });
  if (metrics("logins", "offline"))
    insights.push({
      key: "offline",
      title: "Acessos ativos offline",
      description: `${metrics("logins", "offline")} login(s) ativo(s) offline no IXC. Verifique o impacto com o cliente.`,
      area: "logins",
      tone: "danger",
    });
  if (metrics("orders", "urgent") || metrics("tickets", "urgent"))
    insights.push({
      key: "urgent",
      title: "Suporte com prioridade alta",
      description: `${metrics("orders", "urgent")} OS e ${metrics("tickets", "urgent")} atendimento(s) abertos com prioridade alta ou crítica.`,
      area: metrics("orders", "urgent") ? "orders" : "tickets",
      tone: "warning",
    });
  if (metrics("contracts", "blocked"))
    insights.push({
      key: "blocked",
      title: "Contratos com acesso bloqueado",
      description: `${metrics("contracts", "blocked")} contrato(s) ativo(s) com bloqueio automático ou manual. Confirme o motivo no contrato.`,
      area: "contracts",
      tone: "danger",
    });
  if (metrics("contracts", "expiring"))
    insights.push({
      key: "expiring",
      title: "Permanência perto do vencimento",
      description: `${metrics("contracts", "expiring")} contrato(s) ativo(s) com permanência vencendo nos próximos 30 dias.`,
      area: "contracts",
      tone: "warning",
    });
  if (metrics("orders", "open") && metrics("logins", "offline"))
    insights.push({
      key: "cross",
      title: "Revisar suporte e conexão juntos",
      description:
        "Há OS abertas e acessos offline. Explore as ligações registradas para saber se pertencem ao mesmo contrato; isso não comprova a causa do problema.",
      area: "orders",
      tone: "warning",
    });
  return insights;
}
export function recordTarget(record: GraphRecord, customerId: number): RecordTarget | null {
  const id = Number(record.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (record.kind === "contracts") return { kind: "contract", id, module: "support" };
  if (record.kind === "logins") return { kind: "login", id, customerId };
  if (record.kind === "orders" || record.kind === "tickets") return { kind: record.kind, id, customerId };
  if (record.kind === "financial") return { kind: "receivable", id, customerId };
  return null;
}
export function graphRelations(records: GraphRecord[]) {
  const known = new Set(records.map((r) => r.key));
  const links: { from: string; to: string; label: string }[] = [];
  for (const r of records) {
    const candidates = [
      { key: r.contractId ? `contracts:${r.contractId}` : "", label: "Contrato vinculado" },
      { key: r.loginId ? `logins:${r.loginId}` : "", label: "Login vinculado" },
      { key: r.ticketId ? `tickets:${r.ticketId}` : "", label: "Atendimento vinculado" },
    ];
    for (const target of candidates)
      if (target.key !== r.key && known.has(target.key)) links.push({ from: r.key, to: target.key, label: target.label });
  }
  return links;
}
export function groupCaption(area: GraphArea, g: GraphGroup) {
  if (g.state === "restricted") return "Acesso restrito";
  if (g.state === "unavailable") return "Fonte indisponível";
  const n = (key: string) => g.metrics[key] ?? 0;
  if (area === "contracts")
    return `${n("active")} ${n("active") === 1 ? "ativo" : "ativos"} · ${n("blocked")} ${n("blocked") === 1 ? "bloqueado" : "bloqueados"}`;
  if (area === "logins") return `${n("online")} online · ${n("offline")} offline`;
  if (area === "orders" || area === "tickets")
    return `${n("open")} ${n("open") === 1 ? "aberto" : "abertos"} · ${n("urgent")} ${n("urgent") === 1 ? "prioritário" : "prioritários"}`;
  if (area === "financial") return `${n("overdue")} ${n("overdue") === 1 ? "vencido" : "vencidos"} · ${n("open")} em aberto`;
  return "Comodatos em posse";
}
