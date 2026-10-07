<script setup lang="ts">
import { computed, reactive, ref, nextTick, watch } from "vue";
import {
  Banknote,
  CalendarRange,
  Search,
  TrendingUp,
  TrendingDown,
  Scale,
  Wallet,
  ChartNoAxesCombined,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Clock3,
  CheckCheck,
  Landmark,
  ListFilter,
  ChevronRight,
} from "lucide-vue-next";
import { useRoute, useRouter } from "vue-router";
import { financeNavigationQuery, readFinanceNavigation, type FinanceTab } from "../financeNavigation";
import { financeDashboard, financeOptions } from "../financeApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import LiveQueryState from "../components/LiveQueryState.vue";
import FinancePending from "../components/FinancePending.vue";
import FinanceBanks from "../components/FinanceBanks.vue";
import FinanceTrend from "../components/FinanceTrend.vue";
import { formatConsulted } from "../upgradesApi";
const today = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (key: string) => parts.find((part) => part.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};
const initial = today();
const route = useRoute(),
  router = useRouter();
const isList = computed(() => route.meta.financeView === "list");
const defaults = {
  from: `${initial.slice(0, 7)}-01`,
  to: initial,
  branchId: "",
  accountId: "",
  regime: "all",
  receivableScope: "active",
};
const initialNavigation = readFinanceNavigation(route.query, defaults);
const form = reactive(initialNavigation.filters);
const applied = ref({ ...form }),
  validation = ref("");
const params = computed(() => new URLSearchParams(Object.entries(applied.value).filter(([, value]) => value)));
const { data, loading, error, reload } = useLiveQuery((signal) => financeDashboard(params.value, signal));
const { data: options, error: optionsError } = useLiveQuery((signal) => financeOptions(signal));
const accountChoices = computed(() => {
  const accounts = new Map((options.value?.accounts ?? []).map((a) => [a.id, a]));
  for (const item of data.value?.ledger ?? [])
    accounts.set(item.id, { id: item.id, name: item.name, type: item.type, classification: item.classification });
  return [...accounts.values()].sort(
    (a, b) => a.classification.localeCompare(b.classification, "pt-BR") || a.name.localeCompare(b.name, "pt-BR")
  );
});
const tab = ref<FinanceTab>(initialNavigation.selection.tab),
  type = ref(initialNavigation.selection.type),
  accountSearch = ref(initialNavigation.selection.accountSearch),
  tablePage = ref(1);
const tableLimit = ref(10);
const detailPanel = ref<HTMLElement>();
const activePending = ref(initialNavigation.selection.pending);
const pendingSelection = ref(initialNavigation.selection.pending);
const pendingSession = ref(0);
async function changeReceivableScope(value: string) {
  if (value !== "active" && value !== "all") return;
  form.receivableScope = value;
  applied.value = { ...applied.value, receivableScope: value };
  await reload();
  await nextTick();
  detailPanel.value?.scrollIntoView({ behavior: "smooth", block: "start" });
  detailPanel.value?.querySelector<HTMLSelectElement>("#finance-pending-receivable-scope")?.focus({ preventScroll: true });
}
const navigationQuery = computed(() =>
  financeNavigationQuery(applied.value, {
    tab: tab.value,
    type: type.value,
    accountSearch: accountSearch.value,
    pending: pendingSelection.value,
  })
);
// Keep both submenus on the same applied filters; history and direct links restore the selected list.
watch(
  () => route.query,
  (query) => {
    if (route.meta.module !== "finance") return;
    const next = readFinanceNavigation(query, defaults);
    if (JSON.stringify(next.filters) !== JSON.stringify(applied.value)) {
      Object.assign(form, next.filters);
      applied.value = next.filters;
      tablePage.value = 1;
      void reload();
    }
    tab.value = next.selection.tab;
    type.value = next.selection.type;
    accountSearch.value = next.selection.accountSearch;
    if (JSON.stringify(next.selection.pending) !== JSON.stringify(pendingSelection.value)) {
      pendingSelection.value = next.selection.pending;
      activePending.value = next.selection.pending;
      pendingSession.value++;
    }
    tablePage.value = 1;
  }
);
watch(
  navigationQuery,
  (query) => {
    if (route.meta.module !== "finance") return;
    const current = Object.fromEntries(Object.entries(route.query).filter(([, value]) => value !== ""));
    if (Object.keys(current).length !== Object.keys(query).length || Object.entries(query).some(([key, value]) => current[key] !== value))
      void router.replace({ path: route.path, query });
  },
  { flush: "post" }
);
async function openPending(kind = "receivable", scope = "aging", bucket = "all") {
  await router.push({
    path: "/finance/list",
    query: { ...navigationQuery.value, tab: "pending", kind, scope, bucket, search: "", searchBy: "name", sort: "oldest" },
  });
  await nextTick();
  detailPanel.value?.scrollIntoView({ block: "start" });
}
async function showAccounts(kind = "all", name = "") {
  await router.push({ path: "/finance/list", query: { ...navigationQuery.value, tab: "accounts", type: kind, accountSearch: name } });
  await nextTick();
  detailPanel.value?.scrollIntoView({ block: "start" });
}
function selectTab(value: FinanceTab) {
  tab.value = value;
  if (value === "accounts" || value === "ledger") type.value = "all";
  tablePage.value = 1;
}
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) =>
  value.length === 7
    ? `${value.slice(5)}/${value.slice(0, 4)}`
    : new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const percent = (value: number | null) =>
  value === null
    ? "Sem base positiva para comparação"
    : `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% vs. anterior`;
const regimeLabel = (value: string) =>
  ({ all: "Todos os regimes", cash: "Caixa", competence: "Competência", manual: "Manual" })[value as "all"] ?? value;
const accountType = (type: string) => (({ R: "Receita", D: "Despesa", A: "Ativo", P: "Passivo" }) as Record<string, string>)[type] ?? type;
const ranked = (kind: "R" | "D") => (data.value?.accounts ?? []).filter((item) => item.type === kind).slice(0, 5);
const accountRows = computed(() =>
  (tab.value === "ledger" ? (data.value?.ledger ?? []) : (data.value?.accounts ?? [])).filter(
    (item) =>
      (type.value === "all" || item.type === type.value) &&
      `${item.name} ${item.id} ${item.classification}`.toLocaleLowerCase("pt-BR").includes(accountSearch.value.toLocaleLowerCase("pt-BR"))
  )
);
const rows = computed(() => (tab.value !== "series" ? accountRows.value : (data.value?.series ?? [])));
const totalPages = computed(() => Math.max(1, Math.ceil(rows.value.length / tableLimit.value)));
const pageAccounts = computed(() => accountRows.value.slice((tablePage.value - 1) * tableLimit.value, tablePage.value * tableLimit.value));
const pageSeries = computed(() =>
  (data.value?.series ?? []).slice((tablePage.value - 1) * tableLimit.value, tablePage.value * tableLimit.value)
);
function apply() {
  validation.value = "";
  if (!form.from || !form.to || form.from > form.to || Date.parse(form.to) - Date.parse(form.from) >= 366 * 86400000) {
    validation.value = "Informe um período válido de até 366 dias.";
    return;
  }
  if ([form.branchId, form.accountId].some((value) => value && !/^[1-9]\d*$/.test(value))) {
    validation.value = "Informe IDs positivos para filial e conta.";
    return;
  }
  applied.value = { ...form };
  tablePage.value = 1;
  void reload();
}
function preset(kind: string) {
  const end = today();
  form.to = end;
  if (kind === "month") form.from = `${end.slice(0, 7)}-01`;
  else if (kind === "year") form.from = `${end.slice(0, 4)}-01-01`;
  else {
    const start = new Date(`${end}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 29);
    form.from = start.toISOString().slice(0, 10);
  }
  apply();
}
</script>
<template>
  <div class="compact-view">
    <section class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-emerald-700">Gestão financeira</p>
        <h1 class="text-2xl font-extrabold tracking-tight">
          <component :is="isList ? ListFilter : Banknote" class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />{{
            isList ? "Lista financeira" : "Painel financeiro"
          }}
        </h1>
        <p class="mt-1 text-xs text-slate-500">
          {{
            isList
              ? "Consulte contas, movimentações, bancos e títulos com os filtros da análise."
              : "Receitas, despesas e resultado das contas contábeis no período."
          }}
        </p>
      </div>
      <span
        class="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700"
        ><span class="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" focusable="false" />Banco IXC · somente leitura</span
      >
    </section>
    <section class="panel mb-3 px-4 py-3" aria-label="Filtros financeiros">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-bold">
          <CalendarRange class="mr-2 inline h-4 w-4" aria-hidden="true" focusable="false" />Período da análise
        </h2>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="button-secondary" @click="preset('month')">Este mês</button
          ><button type="button" class="button-secondary" @click="preset('30')">Últimos 30 dias</button
          ><button type="button" class="button-secondary" @click="preset('year')">Este ano</button>
        </div>
      </div>
      <form class="flex flex-wrap items-end gap-2" @submit.prevent="apply">
        <label class="min-w-36 flex-1 text-[11px] text-slate-500"
          >De<input v-model="form.from" type="date" class="input mt-1 !h-8 !py-1" required
        /></label>
        <label class="min-w-36 flex-1 text-[11px] text-slate-500"
          >Até<input v-model="form.to" type="date" class="input mt-1 !h-8 !py-1" required
        /></label>
        <label class="min-w-32 flex-1 text-[11px] text-slate-500"
          >Filial<select v-model="form.branchId" class="input mt-1">
            <option value="">Todas as filiais</option>
            <option v-for="branch in options?.branches" :key="branch.id" :value="String(branch.id)">
              {{ branch.name }} · #{{ branch.id }}
            </option>
          </select>
        </label>
        <label class="min-w-40 flex-[2] text-[11px] text-slate-500"
          >Conta contábil analítica<select v-model="form.accountId" class="input mt-1">
            <option value="">Todas as contas</option>
            <option v-for="account in accountChoices" :key="account.id" :value="String(account.id)">
              {{ account.classification }} · {{ account.name }} · #{{ account.id }}
            </option>
          </select></label
        >
        <label class="min-w-36 flex-1 text-[11px] text-slate-500"
          >Regime contábil<select v-model="form.regime" class="input mt-1">
            <option value="all">Todos os regimes</option>
            <option value="cash">Caixa</option>
            <option value="competence">Competência</option>
            <option value="manual">Manual</option>
          </select></label
        >
        <label class="min-w-36 flex-1 text-[11px] text-slate-500"
          >Clientes / contratos<select v-model="form.receivableScope" class="input mt-1">
            <option value="active">Somente ativos</option>
            <option value="all">Todos</option>
          </select></label
        >
        <button type="submit" class="button-primary" :disabled="loading">
          <Search class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Consultar
        </button>
        <button
          v-if="form.branchId || form.accountId"
          type="button"
          class="button-secondary"
          @click="
            form.branchId = '';
            form.accountId = '';
            apply();
          "
        >
          Todas as contas e filiais
        </button>
      </form>
      <p class="mt-2 text-[10px] text-slate-500">
        Clientes / contratos filtra os recebíveis e a inadimplência. “Todos” inclui inativos, cancelados e títulos sem contrato.
      </p>
      <p v-if="optionsError || options?.truncated" role="alert" class="mt-2 text-xs text-amber-700">
        {{
          optionsError
            ? "Não foi possível carregar as opções de filial e conta. Atualize a consulta."
            : "O catálogo foi limitado a 5.000 opções."
        }}
      </p>
      <p v-if="validation" role="alert" class="mt-2 text-xs text-red-600">{{ validation }}</p>
    </section>
    <LiveQueryState :loading="loading" :error="error" @retry="reload" />
    <p v-if="loading" class="mb-4 text-center text-xs text-slate-500">
      Consultando os indicadores no banco IXC. Períodos maiores podem levar alguns segundos.
    </p>
    <template v-if="data && !loading && !error">
      <div
        v-for="warning in data.warnings"
        :key="warning"
        role="alert"
        class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
      >
        <Info class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" />{{ warning }}
      </div>
      <p class="mb-2 text-[11px] text-slate-500">
        {{ date(data.period.from) }} a {{ date(data.period.to) }} · Comparação: {{ date(data.previous.from) }} a
        {{ date(data.previous.to) }} (mesma quantidade de dias) · {{ regimeLabel(data.regime) }}.
      </p>
      <template v-if="!isList">
        <div class="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <section class="panel px-3 py-3">
            <h2 class="mb-1 text-[11px] font-medium text-slate-500">
              <TrendingUp class="mr-1 inline h-4 w-4 text-emerald-700" aria-hidden="true" focusable="false" />Receitas líquidas
            </h2>
            <button type="button" class="text-xl font-bold hover:underline" aria-label="Ver contas de receitas" @click="showAccounts('R')">
              {{ money(data.totals.revenue) }}
            </button>
            <p class="mt-1 text-[10px] text-slate-500">{{ percent(data.growth.revenue) }}</p>
          </section>
          <section class="panel px-3 py-3">
            <h2 class="mb-1 text-[11px] font-medium text-slate-500">
              <TrendingDown class="mr-1 inline h-4 w-4 text-red-600" aria-hidden="true" focusable="false" />Despesas líquidas
            </h2>
            <button type="button" class="text-xl font-bold hover:underline" aria-label="Ver contas de despesas" @click="showAccounts('D')">
              {{ money(data.totals.expense) }}
            </button>
            <p class="mt-1 text-[10px] text-slate-500">{{ percent(data.growth.expense) }}</p>
          </section>
          <section class="panel px-3 py-3">
            <h2 class="mb-1 text-[11px] font-medium text-slate-500">
              <Scale class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" />Resultado do período
            </h2>
            <strong class="text-xl" :class="data.totals.result >= 0 ? 'text-emerald-700' : 'text-red-600'">{{
              money(data.totals.result)
            }}</strong>
            <p class="mt-1 text-[10px] text-slate-500">
              Variação de {{ money(data.growth.resultDifference) }} · Margem
              {{ data.totals.margin === null ? "—" : `${data.totals.margin.toLocaleString("pt-BR")}%` }}
            </p>
          </section>
          <section class="panel px-3 py-3">
            <h2 class="mb-1 text-[11px] font-medium text-slate-500">
              <Wallet class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" />Em aberto por vencimento
            </h2>
            <div class="flex justify-between gap-2 text-xs">
              <span>A receber</span
              ><button
                type="button"
                class="font-bold hover:underline"
                :disabled="!data.receivable"
                aria-label="Listar títulos a receber em aberto no período"
                @click="openPending('receivable', 'period')"
              >
                {{ data.receivable ? money(data.receivable.total) : "Indisponível" }}
              </button>
            </div>
            <div class="mt-1 flex justify-between gap-2 text-xs">
              <span>A pagar</span
              ><button
                type="button"
                class="font-bold hover:underline"
                :disabled="!data.payable"
                aria-label="Listar títulos a pagar em aberto no período"
                @click="openPending('payable', 'period')"
              >
                {{ data.payable ? money(data.payable.total) : "Indisponível" }}
              </button>
            </div>
            <p class="mt-1 text-[10px] text-slate-500">
              Vencidos: receber {{ data.receivable ? money(data.receivable.overdue) : "—" }} · pagar
              {{ data.payable ? money(data.payable.overdue) : "—" }}
            </p>
          </section>
        </div>
        <div class="mb-3 grid gap-3 xl:grid-cols-[2fr_1fr]">
          <section class="panel px-3 py-3">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-1.5">
              <h2 class="text-sm font-bold"><Clock3 class="mr-1.5 inline h-4 w-4" aria-hidden="true" />Inadimplência atual</h2>
              <button
                v-if="data.aging"
                type="button"
                class="text-sm font-bold text-red-600 hover:underline"
                aria-label="Listar toda a inadimplência atual"
                @click="openPending()"
              >
                {{ money(data.aging.total) }}
                <span class="text-[10px] font-normal text-slate-500">· {{ data.aging.count.toLocaleString("pt-BR") }} títulos</span>
              </button>
            </div>
            <div v-if="data.aging" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                v-for="bucket in data.aging.buckets"
                :key="bucket.key"
                type="button"
                class="rounded-lg border px-2 py-2 text-left hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-600"
                :class="
                  tab === 'pending' &&
                  activePending.kind === 'receivable' &&
                  activePending.scope === 'aging' &&
                  activePending.bucket === bucket.key
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-transparent bg-slate-50'
                "
                :aria-pressed="
                  tab === 'pending' &&
                  activePending.kind === 'receivable' &&
                  activePending.scope === 'aging' &&
                  activePending.bucket === bucket.key
                "
                :aria-label="`Listar títulos com ${bucket.key === '91+' ? 'mais de 90' : bucket.key} dias de atraso`"
                @click="openPending('receivable', 'aging', bucket.key)"
              >
                <p class="text-[10px] text-slate-500">{{ bucket.key === "91+" ? "Mais de 90" : bucket.key.replace("-", "–") }} dias</p>
                <strong class="block text-sm">{{ money(bucket.total) }}</strong
                ><span class="text-[10px] text-slate-500"
                  >{{ bucket.count.toLocaleString("pt-BR") }} títulos <ChevronRight class="inline h-3 w-3" aria-hidden="true"
                /></span>
              </button>
            </div>
            <p v-else class="text-xs text-slate-500">Indicador indisponível nesta consulta.</p>
            <p v-if="data.aging" class="mt-2 text-[10px] text-slate-500">
              {{ data.receivableScope === "all" ? "Todos os clientes e contratos." : "Somente clientes e contratos ativos." }}
              Clique em uma faixa para listar as pendências. Saldos atuais vencidos antes de {{ date(data.aging.asOf) }}, incluindo
              vencimentos anteriores ao período.
              {{ data.aging.excludedRenegotiated ? `${data.aging.excludedRenegotiated} títulos renegociados foram separados.` : "" }}
            </p>
          </section>
          <section class="panel px-3 py-3">
            <h2 class="mb-2 text-sm font-bold">
              <CheckCheck class="mr-1.5 inline h-4 w-4" aria-hidden="true" />Conciliação dos lançamentos
            </h2>
            <template v-if="data.reconciliation">
              <div class="grid grid-cols-3 gap-2 text-center">
                <div>
                  <strong class="block text-lg text-emerald-700">{{ data.reconciliation.reconciled.toLocaleString("pt-BR") }}</strong
                  ><span class="text-[10px] text-slate-500">Conciliados</span>
                </div>
                <div>
                  <strong class="block text-lg">{{ data.reconciliation.pending.toLocaleString("pt-BR") }}</strong
                  ><span class="text-[10px] text-slate-500">Pendentes</span>
                </div>
                <div>
                  <strong class="block text-lg">{{ data.reconciliation.unknown.toLocaleString("pt-BR") }}</strong
                  ><span class="text-[10px] text-slate-500">Sem informação</span>
                </div>
              </div>
              <p class="mt-2 text-[10px] text-slate-500">
                {{
                  data.reconciliation.percentage === null
                    ? "Sem lançamentos."
                    : `${data.reconciliation.percentage.toLocaleString("pt-BR")}% conciliados no período.`
                }}
                Situação cadastrada no IXC, sem conferência com o extrato bancário.
              </p>
            </template>
            <p v-else class="text-xs text-slate-500">Indicador indisponível nesta consulta.</p>
          </section>
        </div>
        <div class="mb-3 grid grid-cols-1 gap-3 xl:grid-cols-[1.5fr_1fr]">
          <section class="panel min-w-0 p-4">
            <h2 class="mb-1 text-sm font-bold">
              <ChartNoAxesCombined class="mr-2 inline h-4 w-4" aria-hidden="true" focusable="false" />Evolução de receitas e despesas
            </h2>
            <p class="mb-3 text-[11px] text-slate-500">
              {{ data.series[0]?.date.length === 7 ? "Agrupamento mensal" : "Agrupamento diário" }} · valores líquidos das contrapartidas de
              estorno.
            </p>
            <FinanceTrend :series="data.series" />
          </section>
          <section class="panel min-w-0 p-4">
            <h2 class="mb-3 text-sm font-bold">Contas com maior participação</h2>
            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div v-for="kind in ['R', 'D'] as const" :key="kind">
                <h3 class="mb-2 text-xs font-semibold">
                  <ArrowUpRight
                    v-if="kind === 'R'"
                    class="mr-1 inline h-4 w-4 text-emerald-700"
                    aria-hidden="true"
                    focusable="false"
                  /><ArrowDownRight v-else class="mr-1 inline h-4 w-4 text-red-600" aria-hidden="true" focusable="false" />{{
                    kind === "R" ? "Receitas" : "Despesas"
                  }}
                </h3>
                <ol class="space-y-2">
                  <li v-for="(account, index) in ranked(kind)" :key="account.id" class="flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      class="min-w-0 truncate text-left hover:underline"
                      :title="account.name"
                      @click="showAccounts(kind, account.name)"
                    >
                      {{ index + 1 }}. {{ account.name }}</button
                    ><strong class="shrink-0">{{ money(account.value) }}</strong>
                  </li>
                </ol>
                <p v-if="!ranked(kind).length" class="text-xs text-slate-500">Sem lançamentos classificados no período.</p>
              </div>
            </div>
          </section>
        </div>
      </template>
      <section v-else ref="detailPanel" class="panel scroll-mt-4 overflow-hidden">
        <div class="border-b border-slate-100 px-4 py-3">
          <div class="mb-3 flex flex-wrap gap-2" role="group" aria-label="Visão dos dados financeiros">
            <button
              type="button"
              class="button-secondary"
              :aria-pressed="tab === 'accounts'"
              :class="tab === 'accounts' ? 'finance-nav-active' : ''"
              @click="selectTab('accounts')"
            >
              Resultado por conta</button
            ><button
              type="button"
              class="button-secondary"
              :aria-pressed="tab === 'series'"
              :class="tab === 'series' ? 'finance-nav-active' : ''"
              @click="selectTab('series')"
            >
              Evolução por período</button
            ><button
              type="button"
              class="button-secondary"
              :aria-pressed="tab === 'ledger'"
              :class="tab === 'ledger' ? 'finance-nav-active' : ''"
              @click="selectTab('ledger')"
            >
              Movimentação contábil</button
            ><button
              type="button"
              class="button-secondary"
              :aria-pressed="tab === 'banks'"
              :class="tab === 'banks' ? 'finance-nav-active' : ''"
              @click="selectTab('banks')"
            >
              <Landmark class="h-3.5 w-3.5" aria-hidden="true" />Caixa e bancos
            </button>
            <button
              type="button"
              class="button-secondary"
              :aria-pressed="tab === 'pending'"
              :class="tab === 'pending' ? 'finance-nav-active' : ''"
              @click="openPending()"
            >
              <ListFilter class="h-3.5 w-3.5" aria-hidden="true" />Pendências / títulos
            </button>
          </div>
          <div v-if="tab !== 'series' && tab !== 'banks' && tab !== 'pending'" class="flex flex-wrap items-center gap-2">
            <label class="sr-only" for="finance-type">Tipo de conta</label
            ><select id="finance-type" v-model="type" class="input !w-auto" @change="tablePage = 1">
              <option value="all">{{ tab === "ledger" ? "Todos os tipos" : "Receitas e despesas" }}</option>
              <option value="R">Receitas</option>
              <option value="D">Despesas</option>
              <option v-if="tab === 'ledger'" value="A">Ativo</option>
              <option v-if="tab === 'ledger'" value="P">Passivo</option></select
            ><label class="sr-only" for="finance-account-search">Buscar conta nos resultados</label
            ><input
              id="finance-account-search"
              v-model="accountSearch"
              class="input min-w-40 flex-1"
              placeholder="Buscar por nome, classificação ou ID da conta"
              @input="tablePage = 1"
            />
          </div>
        </div>
        <FinanceBanks v-if="tab === 'banks'" :params="params" :period="data.period" />
        <FinancePending
          v-else-if="tab === 'pending'"
          :key="pendingSession"
          :params="params"
          v-bind="pendingSelection"
          @receivable-scope="changeReceivableScope"
          @selection="
            pendingSelection = $event;
            activePending = $event;
          "
        />
        <div v-else class="overflow-x-auto">
          <table class="compact-table min-w-[700px]">
            <thead>
              <tr v-if="tab !== 'series'">
                <th scope="col" class="!pl-4">Conta contábil</th>
                <th scope="col">Tipo</th>
                <th scope="col" class="text-right">Débitos</th>
                <th scope="col" class="text-right">Créditos</th>
                <th scope="col" class="text-right">{{ tab === "ledger" ? "Variação (crédito − débito)" : "Valor líquido" }}</th>
                <th scope="col" class="!pr-4 text-right">Lançamentos</th>
              </tr>
              <tr v-else>
                <th scope="col" class="!pl-4">Período</th>
                <th scope="col" class="text-right">Receitas</th>
                <th scope="col" class="text-right">Despesas</th>
                <th scope="col" class="!pr-4 text-right">Resultado</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <template v-if="tab !== 'series'"
                ><tr v-for="account in pageAccounts" :key="account.id" class="hover:bg-slate-50">
                  <td class="max-w-64 !pl-4">
                    <strong class="block truncate font-semibold" :title="account.name">{{ account.name }}</strong
                    ><span class="compact-secondary">#{{ account.id }} · {{ account.classification || "Sem classificação" }}</span>
                  </td>
                  <td>
                    <span
                      class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                      :class="
                        account.type === 'R'
                          ? 'bg-emerald-50 text-emerald-700'
                          : account.type === 'D'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-slate-100 text-slate-500'
                      "
                      >{{ accountType(account.type) }}</span
                    >
                  </td>
                  <td class="whitespace-nowrap text-right">{{ money(account.debit) }}</td>
                  <td class="whitespace-nowrap text-right">{{ money(account.credit) }}</td>
                  <td class="whitespace-nowrap text-right font-semibold">{{ money(account.value) }}</td>
                  <td class="!pr-4 text-right">{{ account.records }}</td>
                </tr></template
              >
              <template v-else
                ><tr v-for="item in pageSeries" :key="item.date">
                  <td class="!pl-4">{{ date(item.date) }}</td>
                  <td class="text-right">{{ money(item.revenue) }}</td>
                  <td class="text-right">{{ money(item.expense) }}</td>
                  <td class="!pr-4 text-right font-semibold">{{ money(item.result) }}</td>
                </tr></template
              >
              <tr v-if="!rows.length">
                <td :colspan="tab !== 'series' ? 6 : 4" class="!py-10 text-center text-slate-500">Nenhum registro encontrado.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer
          v-if="tab !== 'banks' && tab !== 'pending'"
          class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500"
        >
          <span
            >{{ rows.length.toLocaleString("pt-BR") }} registros · Consultado em {{ formatConsulted(data.queriedAt) }} · Brasília ·
            {{ (data.durationMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) }} s</span
          >
          <div class="flex flex-wrap items-center gap-2">
            <select
              v-model="tableLimit"
              aria-label="Registros por página"
              class="rounded-lg border border-slate-200 bg-white px-2 py-1"
              @change="tablePage = 1"
            >
              <option :value="10">10 por página</option>
              <option :value="25">25 por página</option></select
            ><span>{{ tablePage }} / {{ totalPages }}</span
            ><button type="button" class="button-secondary" :disabled="tablePage <= 1" @click="tablePage--">Anterior</button
            ><button type="button" class="button-secondary" :disabled="tablePage >= totalPages" @click="tablePage++">Próxima</button>
          </div>
        </footer>
      </section>
      <p class="mt-3 flex items-start gap-1.5 text-[11px] text-slate-500">
        <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" focusable="false" />O resultado considera receitas/despesas no regime
        selecionado e separa transferências internas. Títulos cancelados, estornados e antigos títulos renegociados não compõem os saldos em
        aberto. Os vencimentos do período e a inadimplência atual são indicadores distintos; não são somados.
        {{
          data.quality.transferRecords ? `${data.quality.transferRecords} lançamentos de transferência foram separados do resultado.` : ""
        }}
      </p>
    </template>
  </div>
</template>
