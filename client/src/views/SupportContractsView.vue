<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { FileText, Search, RotateCcw, ArrowUpRight } from "lucide-vue-next";
import { supportApi, contractStatus } from "../supportApi";
import { internetStatus, formatDate } from "../upgradesApi";
import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import LiveQueryState from "../components/LiveQueryState.vue";
import LivePagination from "../components/LivePagination.vue";
import TechnicalStatus from "../components/TechnicalStatus.vue";
import SearchableSelect from "../components/SearchableSelect.vue";
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore();
const defaults = { status: "A", access: "all", branchId: "0", planId: "0", searchBy: "customer", search: "" };
const readFilters = () =>
  Object.fromEntries(
    Object.entries(defaults).map(([k, v]) => [k, typeof route.query[k] === "string" ? route.query[k] : v])
  ) as typeof defaults;
const draft = reactive(readFilters()),
  applied = ref(readFilters()),
  page = ref(1),
  limit = ref(10);
const params = computed(() => new URLSearchParams({ ...applied.value, page: String(page.value), limit: String(limit.value) }));
const { data, loading, error, reload } = useLiveQuery((signal) => supportApi.contractList(params.value, signal));
const {
  data: filters,
  loading: filtersLoading,
  error: filtersError,
  reload: reloadFilters,
} = useLiveQuery((signal) => supportApi.contractFilters(signal));
watch(params, reload);
watch(
  () => route.query,
  () => {
    Object.assign(draft, readFilters());
    applied.value = readFilters();
    page.value = 1;
  }
);
function apply() {
  const next = { ...draft, search: draft.search.trim() };
  if (Object.entries(next).every(([k, v]) => applied.value[k as keyof typeof defaults] === v)) {
    if (page.value !== 1) page.value = 1;
    else void reload();
  } else
    void router.replace({ query: Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== defaults[k as keyof typeof defaults])) });
}
function clear() {
  Object.assign(draft, defaults);
  apply();
}
const choices = (items: { id: number; name: string }[] | undefined, label: string) => [
  { value: "0", label },
  ...(items ?? []).map((i) => ({ value: String(i.id), label: `${i.name} · #${i.id}` })),
];
const placeholders: Record<string, string> = {
  customer: "Nome do cliente · ao menos 3 caracteres",
  id: "ID do contrato",
  customerId: "ID do cliente",
  document: "CPF ou CNPJ completo, com ou sem pontuação",
  login: "Login de internet · ao menos 3 caracteres",
  contract: "Nome do contrato · ao menos 3 caracteres",
};
</script>
<template>
  <div class="compact-view">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-indigo-600">Central de suporte</p>
        <h1 class="text-2xl font-extrabold tracking-tight"><FileText class="mr-2 inline h-5 w-5" aria-hidden="true" />Contratos</h1>
        <p class="mt-1 text-xs text-slate-500">Consulte contratos, planos e situação do acesso para validar o atendimento.</p>
      </div>
      <span class="pill bg-emerald-50 text-emerald-700">Banco IXC · somente leitura</span>
    </div>
    <section class="panel">
      <div class="border-b border-slate-100 px-4 py-3">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <FileText class="h-4 w-4 text-indigo-600" aria-hidden="true" />
          <h2 class="text-sm font-bold">Contratos para atendimento</h2>
          <span class="text-[11px] text-slate-400">{{
            data ? `${data.total.toLocaleString("pt-BR")} encontrados` : "Contratos no IXC"
          }}</span>
        </div>
        <form @submit.prevent="apply">
          <div class="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label class="text-xs text-slate-500"
              >Contrato<select v-model="draft.status" class="input mt-1 !h-8 !min-h-8" @change="apply">
                <option value="A">Ativos</option>
                <option value="all">Todos os contratos</option>
                <option v-for="s in ['I', 'P', 'N', 'D']" :key="s" :value="s">{{ contractStatus(s) }}</option>
              </select></label
            >
            <label class="text-xs text-slate-500"
              >Acesso<select v-model="draft.access" class="input mt-1 !h-8 !min-h-8" @change="apply">
                <option value="all">Todos os acessos</option>
                <option v-for="s in ['A', 'CA', 'CM', 'FA', 'AA', 'D']" :key="s" :value="s">{{ internetStatus(s) }}</option>
                <option value="suspended">Suspenso</option>
              </select></label
            >
            <SearchableSelect
              v-model="draft.branchId"
              label="Filial"
              :options="choices(filters?.branches, 'Todas as filiais')"
              :loading="filtersLoading"
              @update:model-value="apply"
            />
            <SearchableSelect
              v-model="draft.planId"
              label="Plano"
              :options="choices(filters?.plans, 'Todos os planos')"
              :loading="filtersLoading"
              @update:model-value="apply"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <label class="sr-only" for="contracts-search-by">Buscar por</label>
            <select id="contracts-search-by" v-model="draft.searchBy" class="input !w-auto">
              <option value="customer">Nome do cliente</option>
              <option value="id">ID do contrato</option>
              <option value="customerId">ID do cliente</option>
              <option value="document">CPF / CNPJ</option>
              <option value="login">Login de internet</option>
              <option value="contract">Nome do contrato</option>
            </select>
            <div class="relative min-w-48 flex-1">
              <label class="sr-only" for="contracts-search">Busca de contratos</label>
              <Search class="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <input
                id="contracts-search"
                v-model="draft.search"
                class="input !pl-8"
                :placeholder="placeholders[draft.searchBy]"
                maxlength="120"
              />
            </div>
            <button type="submit" class="button-primary"><Search class="h-3.5 w-3.5" aria-hidden="true" />Buscar</button>
            <button type="button" class="text-xs text-slate-500 hover:text-indigo-700" @click="clear">
              <RotateCcw class="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Limpar
            </button>
          </div>
        </form>
        <p v-if="filtersError" role="alert" class="mt-2 text-xs text-red-600">
          Não foi possível carregar os planos e filiais.
          <button type="button" class="underline" @click="reloadFilters">Tentar novamente</button>
        </p>
      </div>
      <LiveQueryState :loading="loading" :error="error" @retry="reload" />
      <template v-if="data && !loading && !error">
        <div class="overflow-x-auto">
          <table class="compact-table min-w-[1020px]">
            <thead>
              <tr>
                <th scope="col" class="!pl-4">Cliente / contrato</th>
                <th scope="col">Plano</th>
                <th scope="col">Contrato</th>
                <th scope="col">Acesso</th>
                <th scope="col">Localidade / filial</th>
                <th scope="col">Contato / ativação</th>
                <th scope="col" class="w-12 !pr-4"><span class="sr-only">Detalhes do contrato</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="contract in data.items" :key="contract.id">
                <td class="max-w-64 !pl-4">
                  <RouterLink
                    v-if="contract.customerId && auth.can('support.customer.view')"
                    :to="`/support/customers/${contract.customerId}`"
                    class="block truncate font-semibold hover:text-indigo-700 hover:underline"
                    :title="contract.customerName ?? ''"
                    >{{ contract.customerName ?? "Cliente não encontrado" }}</RouterLink
                  >
                  <strong v-else class="block truncate">{{ contract.customerName ?? "Cliente não encontrado" }}</strong>
                  <RouterLink
                    :to="{ path: `/support/contracts/${contract.id}`, query: { from: 'contracts' } }"
                    class="compact-secondary hover:text-indigo-700 hover:underline"
                    >Contrato #{{ contract.id }}{{ contract.customerId ? ` · Cliente #${contract.customerId}` : "" }}</RouterLink
                  >
                  <span v-if="applied.searchBy === 'document'" class="compact-secondary">{{ contract.document }}</span>
                </td>
                <td class="max-w-52">
                  <span class="block truncate" :title="contract.planName ?? contract.name ?? ''">{{
                    contract.planName ?? contract.name ?? "Não informado"
                  }}</span
                  ><span class="compact-secondary truncate" :title="contract.name ?? ''"
                    >{{ contract.name }}{{ contract.planId ? ` · Plano #${contract.planId}` : "" }}</span
                  >
                </td>
                <td class="whitespace-nowrap">
                  <TechnicalStatus
                    :label="contractStatus(contract.status)"
                    :tone="contract.status === 'A' ? 'success' : ['I', 'N', 'D'].includes(contract.status) ? 'danger' : 'neutral'"
                  />
                </td>
                <td class="whitespace-nowrap">
                  <TechnicalStatus
                    :label="contract.suspended ? 'Suspenso' : internetStatus(contract.internetStatus)"
                    :tone="
                      contract.suspended || ['CA', 'CM', 'FA', 'D'].includes(contract.internetStatus)
                        ? 'danger'
                        : contract.internetStatus === 'A'
                          ? 'success'
                          : 'neutral'
                    "
                  />
                </td>
                <td class="max-w-44">
                  <span class="block truncate" :title="contract.city ?? ''">{{ contract.city ?? "—" }}</span
                  ><span class="compact-secondary truncate">{{ contract.neighborhood ?? "—" }}</span
                  >
                </td>
                <td class="whitespace-nowrap">
                  {{ contract.phone ?? "—" }}<span class="compact-secondary">Ativação: {{ formatDate(contract.activatedAt) }}</span>
                </td>
                <td class="!pr-4 text-right">
                  <RouterLink
                    :to="{ path: `/support/contracts/${contract.id}`, query: { from: 'contracts' } }"
                    class="inline-flex rounded p-1 text-indigo-600 hover:bg-slate-100"
                    :aria-label="`Abrir contrato ${contract.id}`"
                    title="Abrir contrato"
                    ><ArrowUpRight class="h-4 w-4" aria-hidden="true"
                  /></RouterLink>
                </td>
              </tr>
              <tr v-if="!data.items.length">
                <td colspan="7" class="!px-4 !py-10 text-center text-slate-500">
                  {{
                    data.total ? "Não há contratos nesta página. Volte à página anterior." : "Nenhum contrato encontrado com estes filtros."
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt" class="!py-2" />
      </template>
    </section>
  </div>
</template>
