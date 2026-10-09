<script setup lang="ts">
import { computed, defineAsyncComponent, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Wrench, Search, RotateCcw, ArrowUpRight, ListFilter, Clock3, Flag, ClipboardList } from "lucide-vue-next";
import { supportApi, caseStatus, type SupportOrderListItem } from "../supportApi";
import { formatIxcDateTime } from "../upgradesApi";
import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import LiveQueryState from "../components/LiveQueryState.vue";
import LivePagination from "../components/LivePagination.vue";
import SearchableSelect from "../components/SearchableSelect.vue";
import SupportCaseStatus from "../components/SupportCaseStatus.vue";
import RecordQuickLink from "../components/RecordQuickLink.vue";
import { canOpenRecord, type RecordTarget } from "../recordNavigation";
const QuickRecordDialog = defineAsyncComponent(() => import("../components/QuickRecordDialog.vue"));
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore();
const defaults = {
  status: "open",
  priority: "all",
  subjectId: "0",
  technicianId: "0",
  branchId: "0",
  searchBy: "customer",
  search: "",
  dateBy: "opened",
  from: "",
  to: "",
  order: "newest",
  overdue: "all",
};
function routeFilters() {
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [key, typeof route.query[key] === "string" ? route.query[key] : fallback])
  ) as typeof defaults;
}
const draft = reactive(routeFilters()),
  applied = ref(routeFilters()),
  page = ref(1),
  limit = ref(10);
const params = computed(() => new URLSearchParams({ ...applied.value, page: String(page.value), limit: String(limit.value) }));
const { data, loading, error, reload } = useLiveQuery((signal) => supportApi.orders(params.value, signal));
const {
  data: filters,
  loading: filtersLoading,
  error: filtersError,
  reload: reloadFilters,
} = useLiveQuery((signal) => supportApi.orderFilters(signal));
watch(params, reload);
const selected = ref<RecordTarget | null>(null);
watch(
  () => route.query,
  () => {
    Object.assign(draft, routeFilters());
    applied.value = routeFilters();
    page.value = 1;
    selected.value = null;
  }
);
function apply() {
  const values = { ...draft, search: draft.search.trim() };
  if (Object.entries(values).every(([key, value]) => value === applied.value[key as keyof typeof defaults])) {
    if (page.value !== 1) page.value = 1;
    else reload();
  } else
    router.replace({
      query: Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== defaults[key as keyof typeof defaults])),
    });
}
function clear() {
  Object.assign(draft, defaults);
  apply();
}
const statuses = ["A", "AN", "EN", "AS", "AG", "EX", "RAG", "DS", "F"];
const priorities: Record<string, string> = { B: "Baixa", N: "Normal", A: "Alta", C: "Crítica" };
const placeholders: Record<string, string> = {
  customer: "Nome do cliente",
  id: "ID da ordem de serviço",
  protocol: "Protocolo da OS",
  customerId: "ID do cliente",
  contractId: "ID do contrato",
  login: "Login de internet",
};
const choices = (items: { id: number; name: string }[] | undefined, label: string) => [
  { value: "0", label },
  ...(items ?? []).map((i) => ({ value: String(i.id), label: `${i.name} · #${i.id}` })),
];
function target(row: SupportOrderListItem): RecordTarget {
  return { kind: "orders", id: row.id, customerId: row.customerId ?? 0 };
}
function canOpen(row: SupportOrderListItem) {
  return canOpenRecord(target(row), auth.can);
}
function open(row: SupportOrderListItem) {
  if (canOpen(row)) selected.value = target(row);
}
watch(
  () => auth.user,
  () => {
    if (selected.value && !canOpenRecord(selected.value, auth.can)) selected.value = null;
  }
);
</script>
<template>
  <div class="compact-view">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-indigo-600">Central de suporte</p>
        <h1 class="text-2xl font-extrabold tracking-tight"><Wrench class="mr-2 inline h-5 w-5" aria-hidden="true" />Ordens de serviço</h1>
        <p class="mt-1 text-xs text-slate-500">Acompanhe a fila, os agendamentos e o histórico das OS do IXC.</p>
      </div>
      <span class="pill bg-emerald-50 text-emerald-700">Banco IXC · somente leitura</span>
    </div>
    <section class="panel mb-4 p-4" aria-label="Filtros de ordens de serviço">
      <h2 class="mb-3 flex items-center gap-2 text-sm font-bold">
        <ListFilter class="h-4 w-4 text-indigo-600" aria-hidden="true" />Consultar ordens de serviço
      </h2>
      <form @submit.prevent="apply">
        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <label class="text-xs text-slate-500"
            >Status<select v-model="draft.status" class="input mt-1 !h-8 !min-h-8" @change="apply">
              <option value="open">Em aberto (todos os estágios)</option>
              <option value="all">Todos os status</option>
              <option v-for="s in statuses" :key="s" :value="s">{{ caseStatus(s, "orders") }}</option>
            </select></label
          >
          <SearchableSelect
            v-model="draft.subjectId"
            label="Assunto"
            :options="choices(filters?.subjects, 'Todos os assuntos')"
            :loading="filtersLoading"
            @update:model-value="apply"
          />
          <SearchableSelect
            v-model="draft.technicianId"
            label="Técnico"
            :options="choices(filters?.technicians, 'Todos os técnicos')"
            :loading="filtersLoading"
            @update:model-value="apply"
          />
          <SearchableSelect
            v-model="draft.branchId"
            label="Filial"
            :options="choices(filters?.branches, 'Todas as filiais')"
            :loading="filtersLoading"
            @update:model-value="apply"
          />
          <label class="text-xs text-slate-500"
            >Prioridade<select v-model="draft.priority" class="input mt-1 !h-8 !min-h-8" @change="apply">
              <option value="all">Todas as prioridades</option>
              <option v-for="(label, value) in priorities" :key="value" :value="value">{{ label }}</option>
            </select></label
          >
        </div>
        <div class="mt-3 grid items-end gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <label class="text-xs text-slate-500"
            >Data de<select v-model="draft.dateBy" class="input mt-1 !h-8 !min-h-8">
              <option value="opened">Abertura</option>
              <option value="scheduled">Agendamento</option>
              <option value="closed">Finalização</option>
            </select></label
          >
          <label class="text-xs text-slate-500"
            >De<input v-model="draft.from" type="date" class="input mt-1 !h-8 !min-h-8" :max="draft.to || undefined"
          /></label>
          <label class="text-xs text-slate-500"
            >Até<input v-model="draft.to" type="date" class="input mt-1 !h-8 !min-h-8" :min="draft.from || undefined"
          /></label>
          <label class="text-xs text-slate-500"
            >Agenda<select v-model="draft.overdue" class="input mt-1 !h-8 !min-h-8" @change="apply">
              <option value="all">Todos os agendamentos</option>
              <option value="yes">Agendamento vencido</option>
            </select></label
          >
          <label class="text-xs text-slate-500"
            >Ordenar<select v-model="draft.order" class="input mt-1 !h-8 !min-h-8" @change="apply">
              <option value="newest">Mais recentes</option>
              <option value="oldest">Mais antigas</option>
              <option value="scheduled">Agendamento (mais antigo)</option>
            </select></label
          >
          <label class="text-xs text-slate-500"
            >Buscar por<select v-model="draft.searchBy" class="input mt-1 !h-8 !min-h-8">
              <option value="customer">Nome do cliente</option>
              <option value="id">ID da OS</option>
              <option value="protocol">Protocolo</option>
              <option value="customerId">ID do cliente</option>
              <option value="contractId">ID do contrato</option>
              <option value="login">Login</option>
            </select></label
          >
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <label class="sr-only" for="order-search">{{ placeholders[draft.searchBy] }}</label>
          <input
            id="order-search"
            v-model="draft.search"
            :placeholder="placeholders[draft.searchBy]"
            class="input !h-8 !min-h-8 min-w-40 flex-1"
            maxlength="120"
          />
          <button type="submit" class="button-primary !h-8 !px-3 !py-1 !text-xs" :disabled="loading">
            <Search class="h-3.5 w-3.5" aria-hidden="true" />Buscar
          </button>
          <button type="button" class="button-secondary !h-8 !px-3 !py-1 !text-xs" @click="clear">
            <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />Limpar
          </button>
        </div>
      </form>
      <div v-if="filtersError" role="alert" class="mt-2 text-xs text-amber-700">
        Não foi possível carregar os assuntos, técnicos e filiais.
        <button type="button" class="underline" @click="reloadFilters">Tentar novamente</button>
      </div>
      <p class="mt-2 text-[11px] text-slate-500">
        Sem período, a consulta inclui todo o histórico no status escolhido. Agenda vencida: OS em aberto com agendamento anterior ao
        horário atual de Brasília.
      </p>
    </section>
    <div v-if="data && !loading && !error" class="mb-4 grid gap-2 sm:grid-cols-3" aria-label="Resumo dos filtros aplicados">
      <div class="panel p-3">
        <span class="flex items-center gap-1.5 text-xs text-slate-500"
          ><ClipboardList class="h-3.5 w-3.5" aria-hidden="true" />Em aberto</span
        ><strong class="mt-1 block text-xl">{{ data.summary.open.toLocaleString("pt-BR") }}</strong>
      </div>
      <div class="panel p-3">
        <span class="flex items-center gap-1.5 text-xs text-slate-500"
          ><Clock3 class="h-3.5 w-3.5" aria-hidden="true" />Agendamento vencido</span
        ><strong class="mt-1 block text-xl text-amber-700">{{ data.summary.overdue.toLocaleString("pt-BR") }}</strong>
      </div>
      <div class="panel p-3">
        <span class="flex items-center gap-1.5 text-xs text-slate-500"
          ><Flag class="h-3.5 w-3.5" aria-hidden="true" />Em aberto · alta / crítica</span
        ><strong class="mt-1 block text-xl">{{ data.summary.urgent.toLocaleString("pt-BR") }}</strong>
      </div>
    </div>
    <section class="panel overflow-hidden" aria-label="Lista de ordens de serviço" :aria-busy="loading">
      <div class="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Wrench class="h-4 w-4 text-indigo-600" aria-hidden="true" />
        <h2 class="text-sm font-bold">Ordens de serviço</h2>
        <span class="text-[11px] text-slate-500">{{
          data ? `${data.total.toLocaleString("pt-BR")} encontradas · resumo conforme os filtros` : "Consulta ao IXC"
        }}</span>
      </div>
      <LiveQueryState :loading="loading" :error="error" @retry="reload" />
      <template v-if="data && !loading && !error">
        <div class="overflow-x-auto">
          <table class="compact-table">
            <caption class="sr-only">
              Ordens de serviço correspondentes aos filtros aplicados
            </caption>
            <thead>
              <tr>
                <th scope="col">OS / assunto</th>
                <th scope="col">Cliente / contrato</th>
                <th scope="col">Status / prioridade</th>
                <th scope="col">Técnico / filial</th>
                <th scope="col">Abertura / agendamento</th>
                <th scope="col"><span class="sr-only">Detalhes</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="row in data.items" :key="row.id" :class="{ 'cursor-pointer': canOpen(row) }" @click="open(row)">
                <td class="min-w-48 max-w-xs">
                  <button
                    v-if="canOpen(row)"
                    type="button"
                    class="text-left font-semibold text-indigo-600 hover:underline"
                    aria-haspopup="dialog"
                    @click.stop="open(row)"
                  >
                    #{{ row.id }} · {{ row.subjectName ?? "Assunto não informado" }}</button
                  ><span v-else class="font-semibold">#{{ row.id }} · {{ row.subjectName ?? "Assunto não informado" }}</span
                  ><span class="mt-0.5 block text-[10px] text-slate-500">{{
                    row.protocol ? `Protocolo ${row.protocol}` : "Sem protocolo"
                  }}</span>
                </td>
                <td class="min-w-44 max-w-xs">
                  <RouterLink
                    v-if="row.customerId && auth.can('support.customer.view')"
                    :to="`/support/customers/${row.customerId}`"
                    class="font-medium hover:underline"
                    @click.stop
                    >{{ row.customerName ?? `Cliente #${row.customerId}` }}
                    <ArrowUpRight class="inline h-3 w-3" aria-hidden="true" /></RouterLink
                  ><span v-else>{{ row.customerName ?? "Sem cliente vinculado" }}</span
                  >
                  <div class="flex flex-wrap items-center gap-1">
                  <span class="mt-0.5 block text-[10px] text-slate-500"
                    >{{ row.customerId ? `Cliente #${row.customerId}` : "Cliente não localizado"
                    }}<span v-if="row.customerActive === false"> · Inativo</span></span
                  ><RecordQuickLink
                    v-if="row.contractId"
                    :target="{ kind: 'contract', id: row.contractId, module: 'support' }"
                    :label="`Contrato #${row.contractId}`"
                    class="mt-0.5 text-[10px] text-indigo-600"
                  />
                  </div>
                </td>
                <td class="whitespace-nowrap">
                  <SupportCaseStatus :status="row.status" kind="orders" /><span
                    class="block text-[10px]"
                    :class="['A', 'C'].includes(row.priority ?? '') ? 'font-semibold text-amber-700' : 'text-slate-500'"
                    >Prioridade {{ priorities[row.priority ?? ""] ?? row.priority ?? "não informada" }}</span
                  >
                </td>
                <td class="min-w-36">
                  <span>{{ row.technician ?? "Sem técnico" }}</span
                  ><span class="mt-0.5 block text-[10px] text-slate-500">{{ row.branch ?? "Filial não informada" }}</span>
                </td>
                <td class="whitespace-nowrap">
                  <span>{{ formatIxcDateTime(row.openedAt) }}</span
                  ><span
                    v-if="row.scheduledAt"
                    class="mt-0.5 block text-[10px]"
                    :class="row.overdue ? 'font-semibold text-amber-700' : 'text-slate-500'"
                    >Agenda {{ formatIxcDateTime(row.scheduledAt) }}{{ row.overdue ? " · Vencida" : "" }}</span
                  ><span v-if="row.status === 'F' && row.closedAt" class="mt-0.5 block text-[10px] text-slate-500"
                    >Finalizada {{ formatIxcDateTime(row.closedAt) }}</span
                  >
                </td>
                <td><ArrowUpRight v-if="canOpen(row)" class="h-4 w-4 text-indigo-600" aria-hidden="true" /></td>
              </tr>
              <tr v-if="!data.items.length">
                <td colspan="6" class="!py-10 text-center text-slate-500">Nenhuma ordem de serviço encontrada para esses filtros.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt" />
      </template>
    </section>
    <QuickRecordDialog v-if="selected" :key="`${selected.kind}-${selected.id}`" :target="selected" @close="selected = null" />
  </div>
</template>
