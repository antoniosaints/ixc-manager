<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter, RouterLink, type RouteLocationRaw } from "vue-router";
import {
  LayoutDashboard,
  ArrowUpRight,
  ArrowRight,
  Users,
  TrendingUp,
  WifiOff,
  Headset,
  Banknote,
  ShieldAlert,
  CalendarDays,
  RefreshCw,
  CircleAlert,
  CheckCircle2,
  Info,
  Network,
  Wrench,
  FileClock,
  Zap,
  LockKeyhole,
} from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import { providerAnalytics, type AnalyticsSection, type PortfolioMode, type PortfolioYear } from "../providerAnalyticsApi";
import RecordQuickLink from "../components/RecordQuickLink.vue";
import ProviderAnalyticsChart from "../components/ProviderAnalyticsChart.vue";
import ProviderAnalyticsLoading from "../components/ProviderAnalyticsLoading.vue";
import ProviderPortfolioEvolution from "../components/ProviderPortfolioEvolution.vue";
import { formatConsulted } from "../upgradesApi";
const auth = useAuthStore(),
  route = useRoute(),
  router = useRouter();
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date());
const readPortfolioYear = (): PortfolioYear => {
  if (route.query.portfolioYear === "all" && route.query.portfolioMode === "general") return "all";
  const year = Number(route.query.portfolioYear),
    current = Number(today.slice(0, 4));
  return Number.isInteger(year) && year >= 1900 && year <= current ? year : current;
};
const portfolioYear = ref(readPortfolioYear());
const readPortfolioMode = (): PortfolioMode => (route.query.portfolioMode === "general" ? "general" : "activation");
const portfolioMode = ref(readPortfolioMode());
watch([portfolioYear, portfolioMode], ([year, mode]) => {
  void router.replace({ query: { ...route.query, portfolioYear: String(year), portfolioMode: mode } });
});
const validDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const readPeriod = () =>
  validDate(route.query.from) &&
  validDate(route.query.to) &&
  route.query.from <= route.query.to &&
  route.query.to <= today &&
  Date.parse(route.query.to) - Date.parse(route.query.from) < 366 * 86400000
    ? { from: route.query.from, to: route.query.to }
    : { from: `${today.slice(0, 7)}-01`, to: today };
const form = reactive(readPeriod()),
  applied = ref({ ...form }),
  validation = ref("");
const { data, loading, error, reload } = useLiveQuery((signal) => providerAnalytics(new URLSearchParams(applied.value), signal));
watch(
  () => route.query,
  () => {
    portfolioYear.value = readPortfolioYear();
    portfolioMode.value = readPortfolioMode();
    const next = readPeriod();
    Object.assign(form, next);
    if (next.from !== applied.value.from || next.to !== applied.value.to) {
      applied.value = next;
      void reload();
    }
  }
);
function apply() {
  validation.value = "";
  if (
    !validDate(form.from) ||
    !validDate(form.to) ||
    form.from > form.to ||
    form.to > today ||
    Date.parse(form.to) - Date.parse(form.from) >= 366 * 86400000
  ) {
    validation.value = "Use um período de até 366 dias, sem datas futuras.";
    return;
  }
  applied.value = { ...form };
  void router.replace({ path: "/overview", query: { ...route.query, ...form } });
  void reload();
}
function preset(mode: "month" | "30" | "90") {
  Object.assign(form, {
    from:
      mode === "month"
        ? `${today.slice(0, 7)}-01`
        : new Date(Date.parse(`${today}T12:00:00Z`) - (mode === "30" ? 29 : 89) * 86400000).toISOString().slice(0, 10),
    to: today,
  });
  apply();
}
const ready = <T,>(section?: AnalyticsSection<T>) => (section?.status === "ready" ? section.data : null);
const portfolio = computed(() => ready(data.value?.portfolio)),
  network = computed(() => ready(data.value?.network)),
  orders = computed(() => ready(data.value?.orders)),
  tickets = computed(() => ready(data.value?.tickets)),
  finance = computed(() => ready(data.value?.finance)),
  retention = computed(() => ready(data.value?.retention)),
  upgrades = computed(() => ready(data.value?.upgrades));
const number = (n: number) => n.toLocaleString("pt-BR");
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
const percent = (part: number, total: number) =>
  total ? `${((part / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
const financeLink = (extra: Record<string, string> = {}): RouteLocationRaw => ({
  path: "/finance/list",
  query: { ...applied.value, regime: "all", receivableScope: "active", ...extra },
});
const offlineLink = (cityId?: number | null, released = false): RouteLocationRaw => ({
  path: "/network/logins",
  query: {
    registration: "active",
    connection: "offline",
    ...(cityId ? { cityId: String(cityId) } : {}),
    ...(released ? { access: "released" } : {}),
  },
});
const targetProps = (to?: RouteLocationRaw) => (to ? (typeof to === "string" && to.startsWith("#") ? { href: to } : { to }) : {});
const customerLink = auth.can("support.customers.view") ? "/support" : auth.can("churn.dashboard") ? "/" : undefined;
const cards = computed(() => {
  const p = portfolio.value,
    n = network.value,
    o = orders.value,
    f = finance.value,
    r = retention.value;
  return [
    ...(p
      ? [
          {
            label: "Clientes ativos",
            value: number(p.activeCustomers),
            hint: `${number(p.activeContracts)} contratos ativos`,
            icon: Users,
            to: customerLink,
            tone: "neutral",
          },
          {
            label: "Saldo de ativações",
            value: `${p.eventBalance > 0 ? "+" : ""}${number(p.eventBalance)}`,
            hint: `${number(p.activations)} ${p.activationDefinition.source === "serviceOrders" ? "OS de ativação finalizadas" : "ativações"} · ${number(p.cancellations)} cancelamentos`,
            icon: TrendingUp,
            to: auth.can("churn.dashboard") ? "/" : undefined,
            tone: p.eventBalance < 0 ? "danger" : "good",
          },
        ]
      : []),
    ...(n
      ? [
          {
            label: "Offline com acesso liberado",
            value: number(n.releasedOffline),
            hint: `${number(n.offline)} offline no cadastro ativo`,
            icon: WifiOff,
            to: offlineLink(undefined, true),
            tone: n.releasedOffline ? "warning" : "good",
          },
        ]
      : []),
    ...(o
      ? [
          {
            label: "Ordens em aberto",
            value: number(o.open),
            hint: `${number(o.older48h)} abertas há mais de 48h`,
            icon: Wrench,
            to: "#analytics-support",
            tone: o.older48h ? "warning" : "neutral",
          },
        ]
      : []),
    ...(f?.aging
      ? [
          {
            label: "Inadimplência recuperável",
            value: money(f.aging.total),
            hint: `${number(f.aging.count)} títulos · clientes/contratos ativos`,
            icon: Banknote,
            to: financeLink({ tab: "pending", kind: "receivable", scope: "aging", bucket: "all" }),
            tone: f.aging.count ? "warning" : "good",
          },
        ]
      : []),
    ...(r
      ? [
          {
            label: "Contratos com risco alto",
            value: number(r.highRisk),
            hint: `${number(r.critical)} clientes em risco/atenção crítica`,
            icon: ShieldAlert,
            to: auth.can("churn.dashboard") ? "/" : undefined,
            tone: r.highRisk || r.critical ? "danger" : "good",
          },
        ]
      : []),
  ];
});
type Priority = {
  id: string;
  title: string;
  description: string;
  action: string;
  to?: RouteLocationRaw;
  tone: "danger" | "warning" | "info";
};
const priorities = computed(() => {
  const result: Priority[] = [],
    p = portfolio.value,
    n = network.value,
    o = orders.value,
    t = tickets.value,
    f = finance.value,
    r = retention.value,
    u = upgrades.value;
  if (n?.releasedOffline)
    result.push({
      id: "offline",
      title: `${number(n.releasedOffline)} logins liberados offline`,
      description: "Priorize acessos liberados. Verifique sessão, concentrador e região antes de tratar como falha de equipamento.",
      action: "Ver logins offline",
      to: offlineLink(undefined, true),
      tone: "danger",
    });
  if (o?.overdueAppointments)
    result.push({
      id: "appointments",
      title: `${number(o.overdueAppointments)} OS com agendamento passado`,
      description: "Confirme a execução e atualize a agenda. Uma OS em aberto com agenda passada exige revisão.",
      action: "Ver fila de atendimento",
      to: "#analytics-support",
      tone: "danger",
    });
  if (t?.unread)
    result.push({
      id: "unread",
      title: `${number(t.unread)} atendimentos com mensagens não lidas`,
      description: "Revise as respostas pendentes para reduzir o tempo de espera do cliente.",
      action: "Ver atendimento",
      to: "#analytics-support",
      tone: "warning",
    });
  if (o?.older48h)
    result.push({
      id: "backlog",
      title: `${number(o.older48h)} OS abertas há mais de 48 horas`,
      description: "Revise prioridades, impedimentos e responsáveis. 48h é um critério de triagem deste painel, não o SLA contratado.",
      action: "Ver ordens mais antigas",
      to: "#analytics-support",
      tone: "warning",
    });
  if (f?.aging?.count)
    result.push({
      id: "debt",
      title: `${money(f.aging.total)} em atraso recuperável`,
      description: "Títulos realmente em aberto de clientes e contratos ativos. Priorize atrasos recentes e negociações viáveis.",
      action: "Abrir títulos",
      to: financeLink({ tab: "pending", kind: "receivable", scope: "aging", bucket: "all" }),
      tone: "warning",
    });
  if (f?.totals.result !== undefined && f.totals.result < 0)
    result.push({
      id: "result",
      title: "Despesas superam receitas no período",
      description: `Resultado contábil de ${money(f.totals.result)}. Confira contas, estornos e regime antes de decidir cortes.`,
      action: "Revisar contas",
      to: financeLink({ tab: "accounts" }),
      tone: "danger",
    });
  if (p && p.cancellations > p.activations)
    result.push({
      id: "loss",
      title: "Cancelamentos superam ativações",
      description: `Saldo de ${number(p.eventBalance)} eventos de contrato no período. Revise motivos e qualidade do atendimento no Churn.`,
      action: "Abrir Churn",
      to: auth.can("churn.dashboard") ? "/" : undefined,
      tone: "warning",
    });
  if (r?.critical)
    result.push({
      id: "critical",
      title: `${number(r.critical)} clientes em risco/atenção crítica`,
      description: "Use a análise existente para priorizar contato. Os scores são da base sincronizada e podem estar desatualizados.",
      action: "Abrir fila de atenção",
      to: auth.can("churn.attention.view") ? "/attention" : "/",
      tone: "danger",
    });
  if (u?.next30)
    result.push({
      id: "renew",
      title: `${number(u.next30)} permanências vencem em até 30 dias`,
      description: "Antecipe o contato comercial e revise a experiência antes de oferecer renovação ou upgrade.",
      action: "Ver oportunidades",
      to: "/upgrades",
      tone: "info",
    });
  if (p?.customersWithoutActiveContract)
    result.push({
      id: "registry",
      title: `${number(p.customersWithoutActiveContract)} cadastros ativos sem contrato ativo`,
      description: "Revise a consistência cadastral. Cliente ativo e contrato ativo são indicadores distintos.",
      action: "Consultar clientes",
      to: customerLink,
      tone: "info",
    });
  if (u?.missingExpiration)
    result.push({
      id: "expiration",
      title: `${number(u.missingExpiration)} contratos sem fim de permanência válido`,
      description: "Confira as datas no IXC para evitar oportunidades comerciais incompletas.",
      action: "Ver oportunidades",
      to: "/upgrades",
      tone: "info",
    });
  if (f?.reconciliation?.pending)
    result.push({
      id: "reconciliation",
      title: `${number(f.reconciliation.pending)} lançamentos sem conciliação registrada`,
      description: "Revise as movimentações com o extrato bancário para confiar no resultado financeiro.",
      action: "Ver movimentação contábil",
      to: financeLink({ tab: "ledger" }),
      tone: "info",
    });
  if (f?.quality.unclassified)
    result.push({
      id: "classification",
      title: `${number(f.quality.unclassified)} lançamentos sem classificação válida`,
      description:
        "Lançamentos do período e da comparação com classificação inconsistente foram separados do resultado. Confira as contas no IXC.",
      action: "Revisar o financeiro",
      to: financeLink({ tab: "ledger" }),
      tone: "warning",
    });
  const rank = { danger: 0, warning: 1, info: 2 };
  return result.sort((a, b) => rank[a.tone] - rank[b.tone]);
});
const selectedPriority = ref("all");
const filteredPriorities = computed(() =>
  priorities.value.filter((p) => selectedPriority.value === "all" || p.tone === selectedPriority.value)
);
const sections = [
  ["portfolio", "Carteira"],
  ["network", "Rede"],
  ["orders", "Ordens de serviço"],
  ["tickets", "Atendimentos"],
  ["finance", "Financeiro"],
  ["retention", "Retenção"],
  ["upgrades", "Comercial"],
] as const;
const unavailable = computed(() => sections.filter(([key]) => data.value?.[key].status === "unavailable").map(([, label]) => label));
const restricted = computed(() => sections.filter(([key]) => data.value?.[key].status === "restricted").map(([, label]) => label));
const hasReady = computed(() => sections.some(([key]) => data.value?.[key].status === "ready"));
</script>
<template>
  <div class="provider-analytics space-y-5">
    <div class="analytics-heading">
      <div>
        <p class="analytics-eyebrow">INTELIGÊNCIA DE GESTÃO</p>
        <h1><LayoutDashboard aria-hidden="true" />Analytics</h1>
        <p class="analytics-muted">Uma visão do provedor para identificar prioridades e agir com contexto.</p>
      </div>
      <span class="analytics-source"><span />IXC · somente leitura</span>
    </div>
    <form class="panel analytics-period" @submit.prevent="apply">
      <div class="analytics-period-title">
        <CalendarDays class="h-4 w-4" aria-hidden="true" /><strong>Período dos resultados</strong
        ><span class="analytics-muted">Operação e pendências mostram a situação atual.</span>
      </div>
      <div class="analytics-period-controls">
        <label>De<input v-model="form.from" type="date" class="input" :max="today" required /></label>
        <label>Até<input v-model="form.to" type="date" class="input" :max="today" required /></label>
        <button type="submit" class="button-primary" :disabled="loading">
          <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Consultar
        </button>
        <div class="analytics-presets">
          <button type="button" class="button-secondary" @click="preset('month')">Este mês</button
          ><button type="button" class="button-secondary" @click="preset('30')">Últimos 30 dias</button
          ><button type="button" class="button-secondary" @click="preset('90')">Últimos 90 dias</button>
        </div>
      </div>
      <p v-if="validation" class="mt-2 text-sm text-red-600" role="alert">{{ validation }}</p>
    </form>
    <ProviderAnalyticsLoading v-if="loading" />
    <div v-else-if="error" class="panel analytics-state" role="alert">
      <CircleAlert class="h-5 w-5" aria-hidden="true" /><span>{{ error }}</span
      ><button class="button-secondary" @click="reload">Tentar novamente</button>
    </div>
    <template v-else-if="data">
      <div class="analytics-consulted">
        <span
          >{{ date(data.period.from) }} a {{ date(data.period.to) }} · Consultado em {{ formatConsulted(data.queriedAt) }} · Brasília</span
        ><span>{{ priorities.length }} pontos para revisar</span>
      </div>
      <div v-if="unavailable.length" class="analytics-notice" role="status">
        <CircleAlert class="h-4 w-4" aria-hidden="true" /><span
          >Fontes indisponíveis: {{ unavailable.join(", ") }}. Os demais indicadores continuam disponíveis. Atualize para tentar
          novamente.</span
        >
      </div>
      <div v-if="!hasReady" class="panel analytics-state">
        <LockKeyhole class="h-5 w-5" aria-hidden="true" />Nenhum indicador disponível. Acesso ao Analytics também requer permissões das
        áreas consultadas.
      </div>
      <div class="analytics-kpis">
        <component
          :is="card.to ? (typeof card.to === 'string' && card.to.startsWith('#') ? 'a' : RouterLink) : 'div'"
          v-for="card in cards"
          :key="card.label"
          v-bind="targetProps(card.to)"
          class="panel analytics-kpi"
          :data-tone="card.tone"
        >
          <div class="analytics-kpi-label">
            <component :is="card.icon" class="h-4 w-4" aria-hidden="true" /><span>{{ card.label }}</span
            ><ArrowUpRight v-if="card.to" class="ml-auto h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <strong class="analytics-kpi-value">{{ card.value }}</strong
          ><small>{{ card.hint }}</small>
        </component>
      </div>
      <div v-if="hasReady" class="analytics-overview-grid">
        <section class="panel analytics-priorities">
          <div class="analytics-section-title">
            <ShieldAlert class="h-4 w-4" aria-hidden="true" />
            <h2>Prioridades de gestão</h2>
            <span class="analytics-count">{{ priorities.length }}</span>
          </div>
          <p class="analytics-muted text-xs">Sinais para revisão humana, organizados por urgência.</p>
          <div class="analytics-filter-tabs" aria-label="Filtrar avisos">
            <button
              v-for="option in [
                { value: 'all', label: 'Todos' },
                { value: 'danger', label: 'Prioridade' },
                { value: 'warning', label: 'Atenção' },
                { value: 'info', label: 'Melhorias' },
              ]"
              :key="option.value"
              type="button"
              :aria-pressed="selectedPriority === option.value"
              @click="selectedPriority = option.value"
            >
              {{ option.label }}
            </button>
          </div>
          <div class="analytics-priority-list">
            <article v-for="priority in filteredPriorities" :key="priority.id" class="analytics-priority" :data-tone="priority.tone">
              <CircleAlert class="h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <h3>{{ priority.title }}</h3>
                <p>{{ priority.description }}</p>
                <component
                  :is="typeof priority.to === 'string' && priority.to.startsWith('#') ? 'a' : RouterLink"
                  v-if="priority.to"
                  v-bind="targetProps(priority.to)"
                  class="analytics-link"
                  >{{ priority.action }}<ArrowRight class="h-3 w-3" aria-hidden="true"
                /></component>
              </div>
            </article>
            <p v-if="!filteredPriorities.length" class="analytics-empty">
              <CheckCircle2 class="h-5 w-5" aria-hidden="true" />Nenhum aviso nesta seleção. Confira também as fontes e a atualização dos
              dados.
            </p>
          </div>
        </section>
        <section v-if="portfolio" class="panel analytics-section">
          <ProviderPortfolioEvolution v-model:year="portfolioYear" v-model:mode="portfolioMode" />
          <div class="analytics-inline-metrics">
            <span
              ><b>{{ number(portfolio.blockedCustomers) }}</b> clientes ativos com bloqueio</span
            ><span
              ><b>{{ number(portfolio.customersWithoutActiveContract) }}</b> ativos sem contrato ativo</span
            >
          </div>
        </section>
      </div>
      <div class="analytics-detail-grid">
        <section v-if="network" class="panel analytics-section">
          <div class="analytics-section-title">
            <Network class="h-4 w-4" aria-hidden="true" />
            <h2>Conectividade</h2>
            <span class="analytics-tag">Agora</span>
          </div>
          <div class="analytics-stats">
            <div>
              <small>Online</small><strong>{{ number(network.online) }}</strong>
            </div>
            <div>
              <small>Offline</small><strong>{{ number(network.offline) }}</strong>
            </div>
            <div>
              <small>Online no IXC</small><strong>{{ percent(network.online, network.activeLogins) }}</strong>
            </div>
          </div>
          <div class="analytics-meter" :aria-label="`${percent(network.online, network.activeLogins)} dos logins ativos têm IP`">
            <span :style="{ width: network.activeLogins ? `${(network.online / network.activeLogins) * 100}%` : '0%' }" />
          </div>
          <h3 class="analytics-subtitle">Cidades com mais logins offline</h3>
          <RouterLink v-for="city in network.cities" :key="city.cityId ?? 0" :to="offlineLink(city.cityId)" class="analytics-ranking-row"
            ><span
              >{{ city.name }}<small>{{ number(city.total) }} logins ativos</small></span
            ><strong
              >{{ number(city.offline) }} <small>· {{ percent(city.offline, city.total) }}</small></strong
            ><ArrowUpRight class="h-3.5 w-3.5" aria-hidden="true"
          /></RouterLink>
          <p v-if="!network.cities.length" class="analytics-empty">Nenhum login ativo offline nesta consulta.</p>
          <p class="analytics-footnote">
            O status de conexão do IXC tem prioridade sobre o IP cadastrado. Inclui todos os cadastros de login ativos; não é teste de
            alcance nem medição de disponibilidade. A lista de logins possui monitor ao vivo.
          </p>
        </section>
        <section v-if="finance" class="panel analytics-section">
          <div class="analytics-section-title">
            <Banknote class="h-4 w-4" aria-hidden="true" />
            <h2>Resultado financeiro</h2>
            <span class="analytics-tag">No período</span>
          </div>
          <div class="analytics-stats">
            <div>
              <small>Receitas</small><strong>{{ money(finance.totals.revenue) }}</strong>
            </div>
            <div>
              <small>Despesas</small><strong>{{ money(finance.totals.expense) }}</strong>
            </div>
            <div>
              <small>Resultado</small><strong>{{ money(finance.totals.result) }}</strong>
            </div>
          </div>
          <ProviderAnalyticsChart
            :labels="finance.series.map((r) => date(r.date))"
            :first="finance.series.map((r) => r.revenue)"
            :second="finance.series.map((r) => r.expense)"
            :names="['Receitas', 'Despesas']"
            money
          />
          <p class="analytics-footnote">
            Todos os regimes. Comparação: {{ date(finance.previous.from) }} a {{ date(finance.previous.to) }}.
            {{
              finance.growth.revenue === null
                ? "Sem base positiva para crescimento da receita."
                : `Receita: ${finance.growth.revenue.toLocaleString("pt-BR")}% sobre o período anterior.`
            }}
            Resultado contábil, sujeito à classificação e conciliação.
          </p>
          <RouterLink :to="financeLink({ tab: 'accounts' })" class="analytics-link"
            >Investigar receitas e despesas<ArrowUpRight class="h-3 w-3" aria-hidden="true"
          /></RouterLink>
        </section>
        <section v-if="orders || tickets" id="analytics-support" class="panel analytics-section analytics-support-section">
          <div class="analytics-section-title analytics-support-header">
            <Headset class="h-4 w-4" aria-hidden="true" />
            <h2>Atendimento e execução</h2>
            <span class="analytics-tag">Fila atual</span>
            <RouterLink v-if="auth.can('support.orders.view')" to="/support/orders" class="analytics-link"
              >Ver todas as OS<ArrowUpRight class="h-3 w-3" aria-hidden="true"
            /></RouterLink>
          </div>
          <div class="analytics-stats analytics-support-stats">
            <div v-if="orders">
              <small>Ordens abertas</small><strong>{{ number(orders.open) }}</strong>
            </div>
            <div v-if="orders">
              <small>Agendamentos vencidos</small><strong>{{ number(orders.overdueAppointments) }}</strong>
            </div>
            <div v-if="tickets">
              <small>Atendimentos abertos</small><strong>{{ number(tickets.open) }}</strong>
            </div>
            <div v-if="tickets">
              <small>Com mensagens não lidas</small><strong>{{ number(tickets.unread) }}</strong>
            </div>
          </div>
          <div v-if="orders" class="analytics-support-columns">
            <section class="analytics-support-block" aria-labelledby="analytics-oldest-orders">
              <div class="analytics-support-block-title">
                <h3 id="analytics-oldest-orders">Ordens abertas há mais tempo</h3>
                <span>Abertura</span>
              </div>
              <ul class="analytics-oldest-orders">
                <li v-for="order in orders.oldest" :key="order.id">
                  <RecordQuickLink
                    :target="{ kind: 'orders', id: order.id, customerId: order.customerId }"
                    :label="`Abrir ordem de serviço #${order.id} · ${order.customerName}`"
                    class="analytics-order-link"
                  >
                    <span class="analytics-order-info">
                      <strong>{{ order.customerName }}</strong>
                      <small>#{{ order.id }} · {{ order.subject }}</small>
                    </span>
                    <time :datetime="order.openedAt.slice(0, 10)">{{ date(order.openedAt) }}</time>
                  </RecordQuickLink>
                </li>
              </ul>
              <p v-if="!orders.oldest.length" class="analytics-empty">Nenhuma ordem aberta com cliente e data válidos.</p>
            </section>
            <section class="analytics-support-block" aria-labelledby="analytics-order-subjects">
              <div class="analytics-support-block-title">
                <h3 id="analytics-order-subjects">Principais assuntos na fila</h3>
                <span>OS abertas</span>
              </div>
              <ul class="analytics-subject-list">
                <li v-for="subject in orders.subjects" :key="subject.name">
                  <span>{{ subject.name }}</span
                  ><strong>{{ number(subject.total) }}</strong>
                </li>
              </ul>
              <p v-if="!orders.subjects.length" class="analytics-empty">Nenhum assunto na fila atual.</p>
            </section>
          </div>
          <div class="analytics-support-summary">
            <p v-if="orders">
              <strong>No período selecionado</strong>
              {{ number(orders.created) }} OS abertas · {{ number(orders.completed) }} finalizadas
            </p>
            <p v-else-if="tickets"><strong>No período selecionado</strong>{{ number(tickets.created) }} atendimentos criados</p>
            <p>
              <strong>Atenção à fila atual</strong>
              <span v-if="orders">{{ number(orders.urgent) }} OS com prioridade alta/crítica</span>
              <span v-if="tickets">{{ number(tickets.older48h) }} atendimentos abertos há mais de 48h</span>
            </p>
          </div>
          <p v-if="tickets" class="analytics-footnote">Mensagens não lidas consideram o indicador de leitura do suporte no IXC.</p>
        </section>
        <section v-if="finance" class="panel analytics-section">
          <div class="analytics-section-title">
            <FileClock class="h-4 w-4" aria-hidden="true" />
            <h2>Recebimento e controle</h2>
            <span class="analytics-tag">Carteira atual</span>
          </div>
          <template v-if="finance.aging"
            ><p class="analytics-muted text-xs">Atrasos de clientes e contratos ativos, incluindo vencimentos anteriores ao período.</p>
            <RouterLink
              v-for="bucket in finance.aging.buckets"
              :key="bucket.key"
              :to="financeLink({ tab: 'pending', kind: 'receivable', scope: 'aging', bucket: bucket.key })"
              class="analytics-ranking-row"
              ><span
                >{{ bucket.key === "91+" ? "Mais de 90 dias" : `${bucket.key} dias`
                }}<small>{{ number(bucket.count) }} títulos</small></span
              ><strong>{{ money(bucket.total) }}</strong
              ><ArrowUpRight class="h-3.5 w-3.5" aria-hidden="true" /></RouterLink
          ></template>
          <p v-else class="analytics-notice">Inadimplência indisponível. Nenhum saldo foi presumido.</p>
          <RouterLink
            v-if="finance.payable"
            :to="financeLink({ tab: 'pending', kind: 'payable', scope: 'period' })"
            class="analytics-ranking-row"
            ><span
              >A pagar no período<small
                >{{ number(finance.payable.count) }} títulos · {{ money(finance.payable.overdue) }} vencidos</small
              ></span
            ><strong>{{ money(finance.payable.total) }}</strong
            ><ArrowUpRight class="h-3.5 w-3.5" aria-hidden="true"
          /></RouterLink>
          <p v-if="finance.reconciliation" class="analytics-footnote">
            {{ number(finance.reconciliation.pending) }} lançamentos sem conciliação registrada;
            {{ number(finance.reconciliation.unknown) }} sem classificação de conciliação. Não equivale à conferência do extrato bancário.
          </p>
          <p v-for="warning in finance.warnings" :key="warning" class="analytics-notice text-xs">{{ warning }}</p>
        </section>
        <section v-if="retention || upgrades" class="panel analytics-section">
          <div class="analytics-section-title">
            <Zap class="h-4 w-4" aria-hidden="true" />
            <h2>Retenção e evolução comercial</h2>
          </div>
          <div v-if="retention" class="analytics-stats">
            <div>
              <small>Contratos · risco alto</small><strong>{{ number(retention.highRisk) }}</strong>
            </div>
            <div>
              <small>Clientes · crítico/atenção</small><strong>{{ number(retention.critical) }}</strong>
            </div>
          </div>
          <p v-if="retention" class="analytics-footnote">
            Scores da base sincronizada. Último cálculo registrado:
            {{ retention.calculatedAt ? formatConsulted(retention.calculatedAt) : "não informado" }}. A data mais recente não garante que
            todos os scores estejam atualizados. Consulte o Churn para validar causas e recalcular quando necessário.
          </p>
          <div v-if="upgrades" class="analytics-stats">
            <div>
              <small>Permanências vencidas</small><strong>{{ number(upgrades.expired) }}</strong>
            </div>
            <div>
              <small>Vencem em até 30 dias</small><strong>{{ number(upgrades.next30) }}</strong>
            </div>
          </div>
          <p v-if="upgrades" class="analytics-footnote">
            Clientes/contratos ativos com internet liberada. Permanência vencida é uma oportunidade de revisão comercial; não indica
            contrato cancelado.
          </p>
          <div class="analytics-inline-metrics">
            <RouterLink v-if="auth.can('churn.dashboard')" to="/" class="analytics-link"
              >Abrir Churn<ArrowUpRight class="h-3 w-3" aria-hidden="true" /></RouterLink
            ><RouterLink v-if="upgrades" to="/upgrades" class="analytics-link"
              >Ver oportunidades<ArrowUpRight class="h-3 w-3" aria-hidden="true"
            /></RouterLink>
          </div>
        </section>
      </div>
      <footer class="analytics-footer">
        <Info class="h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Indicadores consultados ao abrir ou atualizar o painel. Sem escrita no IXC e sem análise completa automática. Áreas e atalhos
          seguem as permissões do seu perfil.<span v-if="restricted.length"> Áreas sem acesso: {{ restricted.join(", ") }}.</span> Os avisos
          orientam a revisão e não executam ações.
        </p>
      </footer>
    </template>
  </div>
</template>
<style scoped>
.provider-analytics {
  color: var(--appearance-text);
}
.analytics-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}
.analytics-heading h1 {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.65rem;
  font-weight: 750;
  margin: 0.2rem 0 0.3rem;
}
.analytics-heading h1 svg {
  width: 25px;
  height: 25px;
}
.analytics-eyebrow {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--appearance-primary-text);
}
.analytics-muted,
.analytics-footnote,
.analytics-footer,
.analytics-consulted {
  color: var(--appearance-secondary);
}
.analytics-heading > .analytics-muted,
.analytics-heading p.analytics-muted {
  font-size: 0.8rem;
}
.analytics-source {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--appearance-border);
  border-radius: 99px;
  font-size: 0.65rem;
  white-space: nowrap;
  background: var(--appearance-surface);
}
.analytics-source > span {
  width: 6px;
  height: 6px;
  background: #10b981;
  border-radius: 50%;
}
.analytics-period {
  padding: 1rem;
}
.analytics-period-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.8rem;
}
.analytics-period-title > span {
  margin-left: 0.25rem;
  font-size: 0.7rem;
}
.analytics-period-controls {
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-top: 0.7rem;
}
.analytics-period-controls label {
  display: grid;
  gap: 0.3rem;
  font-size: 0.65rem;
  color: var(--appearance-secondary);
  width: 160px;
}
.analytics-period-controls .input {
  height: 32px;
  min-height: 32px;
  padding: 0.3rem 0.65rem;
  font-size: 0.75rem;
  color: var(--appearance-text);
}
.analytics-period-controls button {
  height: 32px;
  min-height: 32px;
  padding: 0.3rem 0.7rem;
  font-size: 0.7rem;
  gap: 0.35rem;
}
.analytics-presets {
  display: flex;
  gap: 0.4rem;
  margin-left: auto;
  flex-wrap: wrap;
}
.analytics-consulted {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.65rem;
  flex-wrap: wrap;
}
.analytics-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}
.analytics-kpi {
  display: block;
  padding: 1rem;
  transition:
    border-color 0.15s,
    transform 0.15s;
  min-width: 0;
  text-decoration: none;
}
.analytics-kpi:is(a):hover {
  border-color: var(--appearance-primary);
  transform: translateY(-1px);
}
.analytics-kpi-label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--appearance-secondary);
}
.analytics-kpi-value {
  display: block;
  font-size: 1.65rem;
  line-height: 1.2;
  letter-spacing: -0.03em;
  margin: 0.6rem 0 0.35rem;
  font-variant-numeric: tabular-nums;
}
.analytics-kpi small {
  font-size: 0.65rem;
  color: var(--appearance-secondary);
}
.analytics-kpi[data-tone="danger"] .analytics-kpi-label svg:first-child {
  color: #e11d48;
}
.analytics-kpi[data-tone="warning"] .analytics-kpi-label svg:first-child {
  color: #d97706;
}
.analytics-kpi[data-tone="good"] .analytics-kpi-label svg:first-child {
  color: #059669;
}
.analytics-overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 1rem;
}
.analytics-section,
.analytics-priorities {
  padding: 1.05rem;
  min-width: 0;
}
.analytics-section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}
.analytics-section-title h2 {
  font-size: 0.85rem;
  font-weight: 700;
}
.analytics-count,
.analytics-tag {
  font-size: 0.6rem;
  white-space: nowrap;
  background: var(--appearance-muted);
  padding: 0.2rem 0.45rem;
  border-radius: 0.4rem;
  color: var(--appearance-secondary);
}
.analytics-tag {
  margin-left: auto;
}
.analytics-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 0.75rem;
  padding: 0.8rem 0;
}
.analytics-stats small {
  font-size: 0.65rem;
  color: var(--appearance-secondary);
  display: block;
}
.analytics-stats strong {
  font-size: 1.03rem;
  display: block;
  margin-top: 0.2rem;
  font-variant-numeric: tabular-nums;
}
.analytics-footnote {
  font-size: 0.65rem;
  line-height: 1.6;
  margin-top: 0.75rem;
}
.analytics-inline-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  border-top: 1px solid var(--appearance-border);
  padding-top: 0.7rem;
  margin-top: 0.8rem;
  font-size: 0.7rem;
  color: var(--appearance-secondary);
}
.analytics-filter-tabs {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin: 0.7rem 0;
}
.analytics-filter-tabs button {
  font-size: 0.65rem;
  padding: 0.3rem 0.6rem;
  border-radius: 0.5rem;
  border: 1px solid var(--appearance-border);
  background: var(--appearance-surface);
  color: var(--appearance-secondary);
}
.analytics-filter-tabs button[aria-pressed="true"] {
  background: var(--appearance-primary-tint);
  color: var(--appearance-primary-text);
  border-color: var(--appearance-primary);
}
.analytics-priority-list {
  max-height: 345px;
  overflow: auto;
  padding-right: 0.2rem;
  overscroll-behavior: contain;
}
.analytics-priority {
  display: flex;
  gap: 0.65rem;
  padding: 0.8rem 0;
  border-bottom: 1px solid var(--appearance-border);
}
.analytics-priority:last-child {
  border-bottom: 0;
}
.analytics-priority > svg {
  margin-top: 0.1rem;
  color: var(--appearance-primary-text);
}
.analytics-priority[data-tone="danger"] > svg {
  color: #e11d48;
}
.analytics-priority[data-tone="warning"] > svg {
  color: #d97706;
}
.analytics-priority h3 {
  font-size: 0.75rem;
  font-weight: 700;
}
.analytics-priority p {
  color: var(--appearance-secondary);
  font-size: 0.65rem;
  line-height: 1.6;
  margin: 0.25rem 0 0.35rem;
}
.analytics-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--appearance-primary-text);
  font-size: 0.65rem;
  font-weight: 650;
}
.analytics-link:hover {
  text-decoration: underline;
}
.analytics-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.analytics-support-section {
  grid-column: 1/-1;
  scroll-margin-top: 1rem;
}
.analytics-support-header {
  flex-wrap: wrap;
}
.analytics-support-stats {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  padding: 0.5rem 0 1rem;
}
.analytics-support-stats > div {
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--appearance-border);
  border-radius: 0.65rem;
  background: var(--appearance-muted);
}
.analytics-support-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
.analytics-support-block {
  min-width: 0;
  border: 1px solid var(--appearance-border);
  border-radius: 0.65rem;
  overflow: hidden;
}
.analytics-support-block-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  justify-content: space-between;
  padding: 0.75rem;
  background: var(--appearance-muted);
  border-bottom: 1px solid var(--appearance-border);
}
.analytics-support-block-title h3 {
  font-size: 0.7rem;
  font-weight: 650;
}
.analytics-support-block-title > span {
  font-size: 0.6rem;
  color: var(--appearance-secondary);
  white-space: nowrap;
}
.analytics-oldest-orders > li + li,
.analytics-subject-list > li + li {
  border-top: 1px solid var(--appearance-border);
}
.analytics-oldest-orders :deep(.analytics-order-link) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.7rem 0.75rem;
  text-align: left;
  border-radius: 0;
}
.analytics-oldest-orders :deep(.analytics-order-link:hover) {
  background: var(--appearance-muted);
}
.analytics-oldest-orders :deep(.analytics-order-link:focus-visible) {
  outline: 2px solid var(--appearance-primary);
  outline-offset: -2px;
}
.analytics-order-info {
  min-width: 0;
  overflow-wrap: anywhere;
}
.analytics-order-info strong {
  display: block;
  font-size: 0.7rem;
  line-height: 1.5;
  font-weight: 650;
}
.analytics-order-info small {
  display: block;
  margin-top: 0.15rem;
  color: var(--appearance-secondary);
  font-size: 0.6rem;
  line-height: 1.5;
}
.analytics-oldest-orders time {
  color: var(--appearance-secondary);
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.analytics-subject-list > li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.8rem 0.75rem;
  font-size: 0.7rem;
}
.analytics-subject-list > li > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.analytics-subject-list strong {
  flex-shrink: 0;
  padding: 0.15rem 0.5rem;
  border-radius: 0.4rem;
  background: var(--appearance-muted);
  font-variant-numeric: tabular-nums;
}
.analytics-support-block .analytics-empty {
  padding: 0.75rem;
}
.analytics-support-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 2rem;
  margin-top: 1rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--appearance-border);
  font-size: 0.65rem;
  line-height: 1.6;
  color: var(--appearance-secondary);
}
.analytics-support-summary strong {
  display: block;
  color: var(--appearance-text);
  font-weight: 650;
  margin-bottom: 0.15rem;
}
.analytics-support-summary p > span {
  display: block;
}
.analytics-subtitle {
  font-size: 0.7rem;
  font-weight: 650;
  margin: 0.8rem 0 0.4rem;
}
.analytics-ranking-row {
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--appearance-border);
  font-size: 0.7rem;
  min-width: 0;
}
.analytics-ranking-row > span:first-child {
  flex: 1;
  min-width: 0;
}
.analytics-ranking-row small {
  font-size: 0.6rem;
  color: var(--appearance-secondary);
}
.analytics-ranking-row > span > small {
  display: block;
  margin-top: 0.15rem;
}
.analytics-ranking-row > strong {
  white-space: nowrap;
  font-size: 0.7rem;
}
.analytics-ranking-row:is(a):hover {
  color: var(--appearance-primary-text);
}
.analytics-ranking-row:last-child {
  border-bottom: 0;
}
.analytics-meter {
  height: 6px;
  background: var(--appearance-muted);
  border-radius: 99px;
  overflow: hidden;
  margin: 0.3rem 0 0.9rem;
}
.analytics-meter > span {
  display: block;
  height: 100%;
  background: #10b981;
}
.analytics-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  border: 1px solid var(--appearance-border);
  background: var(--appearance-muted);
  color: var(--appearance-secondary);
  padding: 0.65rem 0.75rem;
  border-radius: 0.6rem;
  font-size: 0.7rem;
  margin: 0.5rem 0;
}
.analytics-notice svg {
  flex-shrink: 0;
}
.analytics-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2.5rem 1rem;
  font-size: 0.8rem;
  flex-wrap: wrap;
}
.analytics-empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.7rem;
  color: var(--appearance-secondary);
  padding: 1rem 0;
}
.analytics-footer {
  display: flex;
  gap: 0.5rem;
  font-size: 0.65rem;
  line-height: 1.6;
}
@media (min-width: 1500px) {
  .analytics-kpis {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .analytics-kpi {
    padding: 0.85rem;
  }
  .analytics-kpi-value {
    font-size: 1.45rem;
  }
}
@media (max-width: 1000px) {
  .analytics-overview-grid,
  .analytics-detail-grid {
    grid-template-columns: 1fr;
  }
  .analytics-support-columns {
    grid-template-columns: 1fr;
  }
  .analytics-support-section {
    grid-column: auto;
  }
}
@media (max-width: 640px) {
  .analytics-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .analytics-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .analytics-kpi-value {
    font-size: 1.35rem;
  }
  .analytics-presets {
    margin-left: 0;
  }
  .analytics-period-controls label {
    width: calc(50% - 0.3rem);
  }
  .analytics-period-title > span {
    margin-left: 0;
  }
  .analytics-kpi-label {
    font-size: 0.65rem;
  }
}
</style>
