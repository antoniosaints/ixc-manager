export const permissionCatalog = [
  { key: "network.onus.view", group: "Rede", label: "Consultar ONUs, OLTs, perfis e pendências de autorização" },
  { key: "network.equipment.authorize", group: "Rede", label: "Autorizar e desautorizar equipamentos na OLT (altera o IXC e a rede)" },
  {
    key: "network.logins.list",
    group: "Rede",
    label: "Consultar lista geral de logins, clientes, documentos e filtros; acompanhar desconexões",
  },
  { key: "network.boxes.view", group: "Rede", label: "Consultar caixas de atendimento, capacidade e indicadores de conexão" },
  { key: "network.logins.view", group: "Rede", label: "Ver detalhes técnicos de logins, por caixa ou lista geral, e potência óptica" },
  { key: "collections.customers.view", group: "Cobranças", label: "Ver fila de clientes, saldos e filtros de cobrança" },
  { key: "collections.customer.view", group: "Cobranças", label: "Ver contatos e títulos detalhados do cliente" },
  { key: "collections.export", group: "Cobranças", label: "Exportar e distribuir listas de cobrança em PDF" },
  { key: "finance.dashboard.view", group: "Financeiro", label: "Ver painel, evolução, contas e valores em aberto" },
  { key: "churn.dashboard", group: "Churn", label: "Ver painel e lista de clientes" },
  { key: "churn.analytics", group: "Churn", label: "Ver análises" },
  { key: "churn.attention.view", group: "Churn", label: "Ver fila de atenção" },
  { key: "churn.resolved.view", group: "Churn", label: "Ver clientes resolvidos" },
  { key: "churn.customer.view", group: "Churn", label: "Ver detalhes e histórico do cliente" },
  { key: "churn.customer.export", group: "Churn", label: "Exportar relatório do cliente em PDF" },
  { key: "churn.notes.create", group: "Churn", label: "Adicionar anotações ao cliente" },
  { key: "churn.workflow.resolve", group: "Churn", label: "Resolver tratativas" },
  { key: "churn.workflow.reopen", group: "Churn", label: "Reabrir as próprias tratativas" },
  { key: "churn.attention.manage", group: "Churn", label: "Marcar e remover atenção crítica" },
  { key: "churn.recalculate", group: "Processos", label: "Recalcular scores" },
  { key: "churn.processes.view", group: "Processos", label: "Ver processos de sincronização" },
  { key: "churn.jobs.view", group: "Processos", label: "Consultar andamento de recálculos" },
  { key: "churn.sync", group: "Processos", label: "Iniciar sincronização" },
  { key: "upgrades.opportunities.view", group: "Upgrades", label: "Ver oportunidades" },
  { key: "upgrades.contract.view", group: "Upgrades", label: "Ver detalhes de contratos" },
  { key: "upgrades.plans.view", group: "Upgrades", label: "Ver catálogo de planos" },
  { key: "upgrades.logins.view", group: "Upgrades", label: "Ver logins, IPs e dados técnicos" },
  { key: "upgrades.credentials.view", group: "Upgrades", label: "Revelar e copiar senhas de internet, roteador e Wi-Fi" },
  { key: "upgrades.equipment.access", group: "Upgrades", label: "Abrir atalhos para equipamentos do cliente" },
  { key: "upgrades.export", group: "Upgrades", label: "Exportar listas em PDF" },
  { key: "support.customers.view", group: "Suporte", label: "Ver lista de clientes" },
  { key: "support.customer.view", group: "Suporte", label: "Ver cadastro e contatos do cliente" },
  { key: "support.customer.analyze", group: "Suporte", label: "Analisar risco de cancelamento ao vivo (inclui indicadores financeiros)" },
  { key: "support.contract.view", group: "Suporte", label: "Ver contratos, inclusive inativos" },
  { key: "support.logins.view", group: "Suporte", label: "Ver logins, IPs e dados técnicos" },
  { key: "support.orders.view", group: "Suporte", label: "Ver ordens de serviço" },
  { key: "support.tickets.view", group: "Suporte", label: "Ver atendimentos" },
  { key: "support.comodato.view", group: "Suporte", label: "Consultar comodatos do contrato" },
  { key: "support.credentials.view", group: "Suporte", label: "Revelar e copiar senhas" },
  { key: "support.equipment.access", group: "Suporte", label: "Acessar equipamentos com cópia da senha" },
] as const;
export type Permission = (typeof permissionCatalog)[number]["key"];
export const permissionKeys = permissionCatalog.map((item) => item.key);
const operator: Permission[] = [
  "support.customers.view",
  "support.customer.view",
  "support.customer.analyze",
  "support.contract.view",
  "support.logins.view",
  "support.orders.view",
  "support.tickets.view",
  "support.comodato.view",
  "churn.analytics",
  "churn.attention.view",
  "churn.resolved.view",
  "churn.customer.view",
  "churn.customer.export",
  "churn.notes.create",
  "churn.workflow.resolve",
  "churn.workflow.reopen",
  "churn.jobs.view",
  "upgrades.opportunities.view",
  "upgrades.contract.view",
  "upgrades.logins.view",
  "upgrades.plans.view",
  "upgrades.export",
];
export const rolePermissions: Record<string, Permission[]> = {
  USER: ["churn.analytics"],
  OPERATOR: operator,
  MANAGER: [...operator.filter((key) => key !== "churn.jobs.view"), "churn.dashboard", "churn.attention.manage"],
  ADMIN: [...permissionKeys],
};
/** Templates are opt-in; existing custom profiles and user overrides remain authoritative. */
export const accessPresets: { key: string; name: string; description: string; permissions: Permission[] }[] = [
  { key: "USER", name: "Consulta analítica", description: "Acesso às análises de Churn.", permissions: rolePermissions.USER! },
  {
    key: "OPERATOR",
    name: "Operador",
    description: "Operação de retenção, upgrades e atendimento.",
    permissions: rolePermissions.OPERATOR!,
  },
  { key: "MANAGER", name: "Gestor", description: "Painel de Churn, filas e gestão de atenção.", permissions: rolePermissions.MANAGER! },
  {
    key: "SUPPORT",
    name: "Suporte",
    description: "Cadastro, contratos, atendimentos, logins e caixas; sem acesso a senhas.",
    permissions: [
      "support.customers.view",
      "support.customer.view",
      "support.contract.view",
      "support.logins.view",
      "support.orders.view",
      "support.tickets.view",
      "support.comodato.view",
      "network.boxes.view",
      "network.logins.view",
      "network.logins.list",
      "network.onus.view",
    ],
  },
  {
    key: "NETWORK",
    name: "Rede",
    description: "Caixas, lista geral de logins, dados técnicos e monitor em tempo real.",
    permissions: ["network.boxes.view", "network.logins.view", "network.logins.list", "network.onus.view"],
  },
  {
    key: "COMMERCIAL",
    name: "Comercial",
    description: "Oportunidades, planos, contratos e exportação; sem acesso a senhas.",
    permissions: [
      "upgrades.opportunities.view",
      "upgrades.contract.view",
      "upgrades.plans.view",
      "upgrades.logins.view",
      "upgrades.export",
    ],
  },
  {
    key: "FINANCE",
    name: "Financeiro",
    description: "Painel financeiro e gestão de pendências e cobranças.",
    permissions: ["finance.dashboard.view", "collections.customers.view", "collections.customer.view", "collections.export"],
  },
  {
    key: "COLLECTIONS",
    name: "Cobranças",
    description: "Fila, contatos, títulos pendentes e exportação para cobrança.",
    permissions: ["collections.customers.view", "collections.customer.view", "collections.export"],
  },
];
export function effectivePermissions(role: string, profile: string[] | null, overrides: Record<string, boolean> = {}): Permission[] {
  if (role === "ADMIN") return [...permissionKeys];
  const access = new Set(profile ?? rolePermissions[role] ?? []);
  for (const key of permissionKeys) {
    if (overrides[key] === true) access.add(key);
    else if (overrides[key] === false) access.delete(key);
  }
  return permissionKeys.filter((key) => access.has(key));
}
