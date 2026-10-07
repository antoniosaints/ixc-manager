<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  Users,
  Siren,
  ShieldAlert,
  LockKeyhole,
  UserMinus,
  Search,
  SlidersHorizontal,
  RefreshCw,
  ChevronLeft,
  RotateCcw,
} from "lucide-vue-next";
import { useRetentionStore } from "../stores/retention";
import ChurnCustomerTable from "../components/ChurnCustomerTable.vue";
import { useAuthStore } from "../stores/auth";
import { api } from "../api";
import { toast } from "../notifications/toast";
const store = useRetentionStore();
const auth = useAuthStore();
const filterStorageKey = "retencao-cas.dashboard-filters";
const savedFilters = (() => {
  try {
    return JSON.parse(localStorage.getItem(filterStorageKey) ?? "{}") as Record<string, string | number>;
  } catch {
    return {};
  }
})();
const search = ref(String(savedFilters.search ?? ""));
const level = ref(String(savedFilters.level ?? ""));
const blocked = ref(String(savedFilters.blocked ?? ""));
const overdue = ref(String(savedFilters.overdue ?? ""));
const openSupport = ref(String(savedFilters.openSupport ?? ""));
const workflowStatus = ref(String(savedFilters.workflowStatus ?? "OPEN"));
const page = ref(1);
const limit = ref(Number(savedFilters.limit) === 25 ? 25 : 10);
const attentionSaving = ref<number | null>(null);
const moreFilters = ref(false);
const secondaryCount = computed(() => [blocked.value, overdue.value, openSupport.value].filter(Boolean).length);
const clearFilters = () => {
  search.value = "";
  level.value = "";
  blocked.value = "";
  overdue.value = "";
  openSupport.value = "";
  workflowStatus.value = "OPEN";
  load(true);
};
const totalPages = computed(() => Math.max(1, Math.ceil(store.total / limit.value)));
const cards = computed(() => [
  { label: "Ativos", value: store.summary.activeCustomers ?? 0, icon: Users, color: "text-cyan-600 bg-cyan-50" },
  { label: "Críticos", value: store.summary.critical ?? 0, icon: Siren, color: "text-red-600 bg-red-50" },
  { label: "Risco alto", value: store.summary.highRisk ?? 0, icon: ShieldAlert, color: "text-orange-600 bg-orange-50" },
  { label: "Bloqueados", value: store.summary.blocked ?? 0, icon: LockKeyhole, color: "text-violet-600 bg-violet-50" },
  {
    label: "Cancelamentos / mês",
    value: store.summary.cancellationsThisMonth ?? 0,
    icon: UserMinus,
    color: "text-slate-700 bg-slate-100",
  },
]);
const load = (resetPage = false) => {
  if (resetPage) page.value = 1;
  localStorage.setItem(
    filterStorageKey,
    JSON.stringify({
      search: search.value,
      level: level.value,
      blocked: blocked.value,
      overdue: overdue.value,
      openSupport: openSupport.value,
      workflowStatus: workflowStatus.value,
      limit: limit.value,
    })
  );
  const q = new URLSearchParams();
  if (search.value) q.set("search", search.value);
  if (level.value) q.set("riskLevel", level.value);
  if (blocked.value) q.set("blocked", blocked.value);
  if (overdue.value) q.set("overdue", overdue.value);
  if (openSupport.value) q.set("openSupport", openSupport.value);
  q.set("workflowStatus", workflowStatus.value);
  q.set("page", String(page.value));
  q.set("limit", String(limit.value));
  return store.loadDashboard(q);
};
const changePage = (next: number) => {
  page.value = Math.min(Math.max(1, next), totalPages.value);
  load();
};
const toggleAttention = async (customer: { customer_id: number; contract_id: number; attention_critical: boolean }) => {
  attentionSaving.value = customer.customer_id;
  try {
    await api.updateCustomerAttention(customer.customer_id, customer.contract_id, !customer.attention_critical);
    toast.success(customer.attention_critical ? "Atenção crítica removida" : "Cliente marcado como crítico");
    await load();
  } catch (error) {
    toast.error("Falha ao atualizar atenção", error instanceof Error ? error.message : "Tente novamente.");
  } finally {
    attentionSaving.value = null;
  }
};
onMounted(load);
</script>
<template>
  <div class="compact-view">
    <section class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-cyan-700">Prevenção de churn</p>
        <h1 class="text-2xl font-extrabold tracking-tight">
          <ShieldAlert class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />Clientes que precisam de atenção
        </h1>
        <p class="mt-1 text-xs text-slate-500">Score explicável: financeiro, suporte, conexão, contrato e satisfação.</p>
      </div>
      <button type="button" @click="load()" class="button-secondary" :disabled="store.loading">
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Atualizar painel
      </button>
    </section>
    <section class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" aria-label="Resumo do Churn">
      <article v-for="card in cards" :key="card.label" class="panel flex items-center gap-2 rounded-xl px-3 py-2.5">
        <component
          :is="card.icon"
          class="hidden h-7 w-7 shrink-0 rounded-lg p-1.5 sm:block"
          :class="card.color"
          aria-hidden="true"
          focusable="false"
        /><span class="min-w-0 flex-1 text-[11px] font-medium text-slate-500">{{ card.label }}</span
        ><strong class="text-xl">{{ Number(card.value).toLocaleString("pt-BR") }}</strong>
      </article>
    </section>
    <section class="panel overflow-hidden">
      <div class="relative border-b border-slate-100 px-4 py-3">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-bold">Clientes em risco</h2>
          <span class="text-[11px] text-slate-400">{{ store.total.toLocaleString("pt-BR") }} encontrados · maior score primeiro</span>
        </div>
        <form class="flex flex-wrap items-center gap-2" @submit.prevent="load(true)">
          <label class="sr-only" for="churn-level">Nível de risco</label
          ><select id="churn-level" v-model="level" @change="load(true)" class="input !w-auto">
            <option value="">Todos os níveis</option>
            <option value="CRITICAL">Crítico</option>
            <option value="HIGH">Alto</option>
            <option value="MEDIUM">Médio</option>
            <option value="ATTENTION">Atenção</option>
          </select>
          <label class="sr-only" for="churn-workflow">Situação da tratativa</label
          ><select id="churn-workflow" v-model="workflowStatus" @change="load(true)" class="input !w-auto">
            <option value="OPEN">Tratativas pendentes</option>
            <option value="RESOLVED">Tratativas resolvidas</option>
            <option value="ALL">Todas as tratativas</option>
          </select>
          <div class="relative min-w-[210px] flex-1">
            <label class="sr-only" for="churn-search">Buscar cliente ou ID</label
            ><Search class="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" aria-hidden="true" focusable="false" /><input
              id="churn-search"
              v-model="search"
              placeholder="Buscar cliente ou ID"
              class="input !pl-8"
            />
          </div>
          <button class="button-primary" type="submit">
            <Search class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Buscar</button
          ><button
            type="button"
            class="button-secondary"
            :aria-expanded="moreFilters"
            aria-controls="churn-more-filters"
            @click="moreFilters = !moreFilters"
          >
            <SlidersHorizontal class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Mais filtros<span
              v-if="secondaryCount"
              class="rounded-full bg-cyan-50 px-1.5 text-[10px] text-cyan-700"
              >{{ secondaryCount }}</span
            ></button
          ><button type="button" class="text-xs text-slate-500 hover:text-cyan-700" @click="clearFilters">
            <RotateCcw class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Limpar
          </button>
          <div v-if="moreFilters" id="churn-more-filters" class="flex w-full flex-wrap gap-2 rounded-lg bg-slate-50 p-2">
            <label class="min-w-[170px] flex-1 text-[11px] text-slate-500"
              >Conexão<select v-model="blocked" @change="load(true)" class="input mt-1">
                <option value="">Todas as conexões</option>
                <option value="true">Somente bloqueados</option>
                <option value="false">Somente desbloqueados</option>
              </select></label
            >
            <label class="min-w-[170px] flex-1 text-[11px] text-slate-500"
              >Financeiro<select v-model="overdue" @change="load(true)" class="input mt-1">
                <option value="">Financeiro: todos</option>
                <option value="true">Com fatura vencida</option>
              </select></label
            >
            <label class="min-w-[200px] flex-1 text-[11px] text-slate-500"
              >Atendimento<select v-model="openSupport" @change="load(true)" class="input mt-1">
                <option value="">Atendimento: todos</option>
                <option value="true">Chamado ou OS em aberto</option>
              </select></label
            >
          </div>
        </form>
      </div>
      <div v-if="store.error" role="alert" class="flex flex-wrap items-center justify-between gap-3 p-4 text-xs text-red-600">
        <span>{{ store.error }}</span
        ><button type="button" class="button-secondary" @click="load()">
          <RefreshCw class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Tentar novamente
        </button>
      </div>
      <div v-else-if="store.loading" role="status" class="flex min-h-40 flex-col items-center justify-center gap-1 text-xs text-slate-500">
        <img src="/infinite-spinner.svg" alt="" class="h-12 w-20" />Carregando dados analíticos…
      </div>
      <ChurnCustomerTable
        v-else
        :customers="store.customers"
        :can-view-details="auth.canViewCustomerDetails"
        empty-message="Não há scores calculados para estes filtros. Atualize os filtros ou inicie uma sincronização e recálculo."
      >
        <template #actions="{ customer }"
          ><button
            v-if="auth.canMarkAttention && customer.workflow_status !== 'RESOLVED'"
            type="button"
            :disabled="attentionSaving === customer.customer_id"
            @click.stop="toggleAttention(customer)"
            :class="
              customer.attention_critical
                ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
            "
            class="rounded-lg border px-2 py-1 text-[10px] font-semibold disabled:opacity-60"
          >
            {{
              attentionSaving === customer.customer_id ? "Salvando…" : customer.attention_critical ? "Remover atenção" : "Marcar crítico"
            }}
          </button></template
        >
      </ChurnCustomerTable>
      <footer
        class="relative flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500"
      >
        <span>Ordenado pelo maior score</span>
        <div class="flex flex-wrap items-center gap-2">
          <label class="sr-only" for="churn-limit">Registros por página</label
          ><select
            id="churn-limit"
            v-model.number="limit"
            @change="load(true)"
            class="rounded-lg border border-slate-200 bg-white px-2 py-1"
          >
            <option :value="10">10 por página</option>
            <option :value="25">25 por página</option></select
          ><span>{{ page }} / {{ totalPages }}</span
          ><button type="button" :disabled="page === 1 || store.loading" @click="changePage(page - 1)" class="button-secondary">
            <ChevronLeft class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Anterior</button
          ><button type="button" :disabled="page >= totalPages || store.loading" @click="changePage(page + 1)" class="button-secondary">
            Próxima
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>
