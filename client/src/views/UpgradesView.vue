<script setup lang="ts">
import {
  FileText,
  TrendingUp,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  CircleHelp,
  Clock3,
  Search,
  SlidersHorizontal,
  X,
  Download,
  ChevronLeft,
  RotateCcw,
  PackageOpen,
} from "lucide-vue-next";

import { useAuthStore } from "../stores/auth";
const auth = useAuthStore();
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { upgradesApi, formatDate, formatConsulted, internetStatus } from "../upgradesApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import LiveQueryState from "../components/LiveQueryState.vue";
import UpgradeExportDialog from "../components/UpgradeExportDialog.vue";
import type { UpgradeContract } from "../upgradesApi";

const route = useRoute();
const router = useRouter();
const planFromRoute = () => {
  const value = route.query.planId;
  return typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? value : "";
};
const selectedPlanName = computed(() => {
  const name = route.query.planName;
  return applied.value.planId === planFromRoute() && typeof name === "string" ? name.trim().slice(0, 200) : "";
});
const defaults = () => ({ status: "eligible", days: "30", search: "", searchBy: "name", plan: "", planId: planFromRoute(), branchId: "" });
const form = reactive(defaults());
const applied = ref({ ...form });
const page = ref(1);
const limit = ref("10");
const validationError = ref("");
const moreFilters = ref(false);
const selected = ref(new Map<number, number>());
const exportOpen = ref(false);
const exportFilters = ref<Record<string, string>>({});
const selectedClients = computed(() => new Set(selected.value.values()).size);
const allPageSelected = computed(
  () => Boolean(data.value?.items.length) && data.value!.items.every((item) => selected.value.has(item.contractId))
);
const toggleContract = (contract: UpgradeContract) => {
  if (selected.value.has(contract.contractId)) selected.value.delete(contract.contractId);
  else if (selected.value.size < 200) selected.value.set(contract.contractId, contract.customerId);
  else validationError.value = "Selecione no máximo 200 contratos por exportação.";
};
const togglePage = () => {
  const remove = allPageSelected.value;
  for (const item of data.value?.items ?? []) {
    if (remove) selected.value.delete(item.contractId);
    else if (!selected.value.has(item.contractId)) toggleContract(item);
  }
};
const openExport = () => {
  exportFilters.value = Object.fromEntries(params());
  exportOpen.value = true;
};
const compactPermanence = (contract: UpgradeContract) =>
  contract.daysRemaining === null
    ? "Sem data"
    : contract.daysRemaining < 0
      ? `Vencida · ${Math.abs(contract.daysRemaining)}d`
      : contract.daysRemaining === 0
        ? "Hoje"
        : `Em ${contract.daysRemaining}d`;
const params = () => {
  const p = new URLSearchParams({ ...applied.value, page: String(page.value), limit: limit.value });
  if (!applied.value.planId) p.delete("planId");
  if (!applied.value.branchId) p.delete("branchId");
  return p;
};
const { data, loading, error, reload } = useLiveQuery((signal) => upgradesApi.opportunities(params(), signal));
const summary = useLiveQuery((signal) => upgradesApi.summary(params(), signal));
const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / Number(limit.value))));
const cards = computed(() => [
  {
    key: "expired" as const,
    label: "Vencidos",
    icon: Clock3,
    status: "expired",
    days: "30",
    color: "text-amber-700 bg-amber-50",
  },
  {
    key: "next30" as const,
    label: "Até 30 dias",
    icon: CalendarClock,
    status: "expiring",
    days: "30",
    color: "text-violet-700 bg-violet-50",
  },
  {
    key: "next60" as const,
    label: "Até 60 dias",
    icon: CalendarDays,
    status: "expiring",
    days: "60",
    color: "text-indigo-700 bg-indigo-50",
  },
  {
    key: "next90" as const,
    label: "Até 90 dias",
    icon: CalendarDays,
    status: "expiring",
    days: "90",
    color: "text-sky-700 bg-sky-50",
  },
  {
    key: "missing" as const,
    label: "Sem data",
    icon: CircleHelp,
    status: "missing",
    days: "30",
    color: "text-slate-600 bg-slate-100",
  },
]);
const queryList = (filters: typeof form) => {
  applied.value = { ...filters };
  selected.value.clear();
  page.value = 1;
  void reload();
  void summary.reload();
};
const apply = () => {
  validationError.value = "";
  const search = form.search.trim();
  if (search && form.searchBy === "name" && search.length < 3) {
    validationError.value = "Digite ao menos 3 caracteres para buscar pelo nome.";
    return;
  }
  if (search && form.searchBy !== "name" && !/^[1-9]\d*$/.test(search)) {
    validationError.value = "Informe um ID válido para a busca.";
    return;
  }
  if (form.branchId && (!/^[1-9]\d*$/.test(form.branchId) || !Number.isSafeInteger(Number(form.branchId)))) {
    validationError.value = "Informe um ID de filial válido.";
    return;
  }
  queryList({ ...form, search, plan: form.planId ? "" : form.plan.trim() });
};
const removePlanFilter = () => {
  form.planId = "";
  form.plan = "";
  validationError.value = "";
  queryList({ ...applied.value, planId: "", plan: "" });
  void router.replace({ path: route.path, query: { ...route.query, planId: undefined, planName: undefined } });
};
const clear = () => {
  Object.assign(form, defaults(), { planId: "" });
  void router.replace({ path: route.path, query: { ...route.query, planId: undefined, planName: undefined } });
  apply();
};
const selectCard = (status: string, days: string) => {
  form.status = status;
  form.days = days;
  validationError.value = "";
  queryList({ ...applied.value, status, days });
};
const changePage = (next: number) => {
  page.value = Math.max(1, Math.min(next, totalPages.value));
  void reload();
};
watch(
  () => route.query.planId,
  () => {
    const next = planFromRoute();
    form.planId = next;
    form.plan = "";
    if (applied.value.planId !== next) {
      validationError.value = "";
      queryList({ ...applied.value, planId: next, plan: "" });
    }
  }
);
</script>
<template>
  <div class="compact-view">
    <section class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-violet-600">Evolução de planos</p>
        <h1 class="text-2xl font-extrabold tracking-tight">
          <TrendingUp class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />Oportunidades de upgrade
        </h1>
        <p class="mt-1 text-xs text-slate-500">Contratos com permanência vencida ou próxima do fim.</p>
      </div>
      <span
        class="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700"
        ><span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>Consulta direta ao IXC</span
      >
    </section>
    <section class="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" aria-label="Resumo de permanência">
      <button
        v-for="card in cards"
        :key="card.key"
        type="button"
        class="panel flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition hover:border-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        :class="
          applied.status === card.status && (card.status !== 'expiring' || applied.days === card.days)
            ? 'border-violet-300 ring-1 ring-violet-100'
            : ''
        "
        @click="selectCard(card.status, card.days)"
      >
        <component
          :is="card.icon"
          class="hidden h-7 w-7 shrink-0 rounded-lg p-1.5 sm:block"
          :class="card.color"
          aria-hidden="true"
          focusable="false"
        />
        <span class="min-w-0 flex-1 text-[11px] font-medium text-slate-500">{{ card.label }}</span>
        <strong class="text-xl">{{
          summary.loading.value ? "…" : summary.data.value ? summary.data.value.counts[card.key].toLocaleString("pt-BR") : "—"
        }}</strong>
      </button>
    </section>
    <p class="mb-3 text-[10px] text-slate-400">
      30, 60 e 90 dias incluem hoje e são cumulativos. Indicadores respeitam busca, plano e filial.
    </p>
    <div
      v-if="summary.error.value"
      role="alert"
      class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
    >
      <span>Indicadores indisponíveis: {{ summary.error.value }}</span
      ><button class="shrink-0 font-semibold underline" type="button" @click="summary.reload()">Consultar indicadores</button>
    </div>
    <section class="panel overflow-hidden">
      <div class="relative border-b border-slate-100 px-4 py-3">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm font-bold">
              <FileText class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Contratos para trabalhar
            </h2>
            <span class="text-[11px] text-slate-400">{{
              data ? `${data.total.toLocaleString("pt-BR")} encontrados` : "Contratos ativos no IXC"
            }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span v-if="selected.size" class="text-xs font-medium text-violet-700"
              >{{ selectedClients }} clientes selecionados<button
                type="button"
                class="ml-2 text-slate-400 underline"
                @click="selected.clear()"
              >
                Limpar seleção
              </button></span
            ><button
              type="button"
              class="button-upgrades"
              :disabled="loading || !!error || !data?.total"
              v-if="auth.can('upgrades.export')"
              @click="openExport"
            >
              <Download class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Exportar PDF
            </button>
          </div>
        </div>
        <div v-if="applied.planId" class="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700">
          <PackageOpen class="h-4 w-4 shrink-0" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <strong class="block truncate" :title="selectedPlanName || undefined">{{
              selectedPlanName || `Plano #${applied.planId}`
            }}</strong>
            <span class="text-[10px]">Plano #{{ applied.planId }} · Contratos ativos com permanência no período selecionado</span>
          </div>
          <RouterLink v-if="auth.can('upgrades.plans.view')" to="/upgrades/plans" class="whitespace-nowrap font-semibold hover:underline"
            >Trocar plano</RouterLink
          >
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded px-2 py-1 font-semibold hover:underline"
            aria-label="Remover filtro de plano"
            @click="removePlanFilter"
          >
            <X class="h-3.5 w-3.5" aria-hidden="true" />Remover
          </button>
        </div>
        <form class="flex flex-wrap items-center gap-2" @submit.prevent="apply">
          <label class="sr-only" for="upgrade-status">Situação da permanência</label
          ><select id="upgrade-status" v-model="form.status" class="input !w-auto flex-1 sm:flex-none" @change="apply">
            <option value="eligible">Vencidos e próximos do fim</option>
            <option value="expired">Permanência vencida</option>
            <option value="expiring">Permanência a vencer</option>
            <option value="missing">Sem data de permanência</option>
          </select>
          <label class="sr-only" for="upgrade-days">Horizonte</label
          ><select
            id="upgrade-days"
            v-model="form.days"
            class="input !w-auto"
            :disabled="form.status === 'expired' || form.status === 'missing'"
            @change="apply"
          >
            <option value="30">Até 30 dias</option>
            <option value="60">Até 60 dias</option>
            <option value="90">Até 90 dias</option>
          </select>
          <div class="flex min-w-[240px] flex-1 gap-1">
            <label class="sr-only" for="upgrade-search-by">Buscar por</label
            ><select id="upgrade-search-by" v-model="form.searchBy" class="input !w-auto !px-2">
              <option value="name">Nome</option>
              <option value="customerId">ID cliente</option>
              <option value="contractId">ID contrato</option>
            </select>
            <div class="relative min-w-0 flex-1">
              <label class="sr-only" for="upgrade-search">Cliente ou contrato</label
              ><Search class="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" aria-hidden="true" focusable="false" /><input
                id="upgrade-search"
                v-model="form.search"
                class="input !pl-8"
                :placeholder="form.searchBy === 'name' ? 'Buscar cliente (mín. 3 letras)' : 'Digite o ID'"
              />
            </div>
          </div>
          <button class="button-upgrades" type="submit">
            <Search class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Buscar</button
          ><button
            class="button-secondary"
            type="button"
            :aria-expanded="moreFilters"
            aria-controls="upgrade-more-filters"
            @click="moreFilters = !moreFilters"
          >
            <SlidersHorizontal class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Mais filtros<span
              v-if="applied.plan || applied.branchId || applied.planId"
              class="h-1.5 w-1.5 rounded-full bg-violet-500"
            ></span></button
          ><button class="text-xs text-slate-500 hover:text-violet-700" type="button" @click="clear">
            <RotateCcw class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Limpar
          </button>
          <div v-if="moreFilters" id="upgrade-more-filters" class="flex w-full flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2">
            <label class="flex-1 text-[11px] text-slate-500"
              >Nome do plano no IXC<input
                v-model="form.plan"
                maxlength="100"
                :disabled="!!form.planId"
                class="input mt-1"
                :placeholder="form.planId ? 'Plano exato selecionado no catálogo' : 'Buscar pelo nome cadastrado do plano'" /></label
            ><label class="w-36 text-[11px] text-slate-500"
              >Filial<input v-model="form.branchId" type="number" min="1" step="1" class="input mt-1" placeholder="ID · todas" /></label
            ><button type="submit" class="button-secondary">Aplicar filtros</button>
          </div>
        </form>
        <p v-if="validationError" role="alert" class="mt-2 text-xs text-red-600">{{ validationError }}</p>
      </div>
      <LiveQueryState :loading="loading" :error="error" @retry="reload" />
      <div v-if="data && !loading && !error" class="relative overflow-x-auto">
        <table class="w-full min-w-[980px] text-left text-xs leading-4">
          <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th v-if="auth.can('upgrades.export')" class="w-9 pl-4 pr-2 py-2">
                <input
                  type="checkbox"
                  :checked="allPageSelected"
                  :indeterminate="!allPageSelected && data.items.some((item) => selected.has(item.contractId))"
                  :disabled="!data.items.length"
                  aria-label="Selecionar contratos desta página"
                  class="accent-violet-600"
                  @change="togglePage"
                />
              </th>
              <th class="py-2 pr-3">Cliente / contrato</th>
              <th class="px-3 py-2">Plano atual</th>
              <th class="px-3 py-2">Localidade</th>
              <th class="px-3 py-2">Contato</th>
              <th class="px-3 py-2">Permanência</th>
              <th class="px-3 py-2">Acesso</th>
              <th v-if="auth.can('upgrades.contract.view')" class="pr-4 py-2"><span class="sr-only">Detalhes</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr
              v-for="contract in data.items"
              :key="contract.contractId"
              class="hover:bg-violet-50/40"
              :class="selected.has(contract.contractId) ? 'bg-violet-50/50' : ''"
            >
              <td v-if="auth.can('upgrades.export')" class="pl-4 pr-2 py-1.5">
                <input
                  type="checkbox"
                  :checked="selected.has(contract.contractId)"
                  :aria-label="`Selecionar ${contract.customerName}, contrato ${contract.contractId}`"
                  class="accent-violet-600"
                  @change="toggleContract(contract)"
                />
              </td>
              <td class="max-w-60 py-1.5 pr-3">
                <RouterLink
                  v-if="auth.can('upgrades.contract.view')"
                  :to="`/upgrades/contracts/${contract.contractId}`"
                  class="block truncate font-semibold hover:text-violet-700 hover:underline"
                  :title="contract.customerName"
                  >{{ contract.customerName }}</RouterLink
                ><strong v-else>{{ contract.customerName }}</strong>
                <p class="mt-0.5 text-[10px] leading-3 text-slate-400">
                  Cliente #{{ contract.customerId }} · Contrato #{{ contract.contractId }}
                </p>
              </td>
              <td class="max-w-48 px-3 py-1.5">
                <span class="block truncate font-medium" :title="contract.planName">{{ contract.planName }}</span
                ><span class="block text-[10px] leading-3 text-slate-400">Plano #{{ contract.planId ?? "—" }}</span>
              </td>
              <td class="max-w-44 px-3 py-1.5">
                <span class="block truncate" :title="contract.city ?? ''">{{ contract.city ?? "Não informada" }}</span>
                <p class="mt-0.5 truncate text-[10px] leading-3 text-slate-400" :title="contract.neighborhood ?? ''">
                  {{ contract.neighborhood }}
                </p>
              </td>
              <td class="whitespace-nowrap px-3 py-1.5">{{ contract.phone ?? contract.whatsapp ?? "Não informado" }}</td>
              <td
                class="whitespace-nowrap px-3 py-1.5"
                :title="contract.fidelityMonths !== null ? `${contract.fidelityMonths} meses de fidelidade` : 'Prazo não informado'"
              >
                <div class="flex items-center gap-2">
                  <span>{{ contract.expiresAt ? formatDate(contract.expiresAt) : "—" }}</span
                  ><span
                    class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    :class="
                      contract.permanenceStatus === 'expired'
                        ? 'bg-amber-50 text-amber-700'
                        : contract.permanenceStatus === 'missing'
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-violet-50 text-violet-700'
                    "
                    >{{ compactPermanence(contract) }}</span
                  >
                </div>
              </td>
              <td class="px-3 py-1.5 text-[10px] text-slate-500">
                {{ contract.suspended ? "Suspenso" : internetStatus(contract.internetStatus) }}
              </td>
              <td v-if="auth.can('upgrades.contract.view')" class="pr-4 py-1.5">
                <RouterLink
                  v-if="auth.can('upgrades.contract.view')"
                  :to="`/upgrades/contracts/${contract.contractId}`"
                  :aria-label="`Ver contrato ${contract.contractId} de ${contract.customerName}`"
                  title="Ver contrato"
                  class="inline-flex rounded p-1 text-violet-700 hover:bg-violet-100"
                  ><ArrowUpRight class="h-4 w-4" aria-hidden="true" focusable="false"
                /></RouterLink>
              </td>
            </tr>
            <tr v-if="!data.items.length">
              <td
                :colspan="6 + Number(auth.can('upgrades.export')) + Number(auth.can('upgrades.contract.view'))"
                class="px-4 py-10 text-center text-slate-500"
              >
                <p>Nenhuma oportunidade encontrada para estes filtros{{ applied.planId ? ` no plano #${applied.planId}` : "" }}.</p>
                <button
                  v-if="applied.status !== 'eligible' || applied.days !== '90'"
                  type="button"
                  class="mt-2 inline-flex items-center gap-1 font-semibold text-violet-700 hover:underline"
                  @click="selectCard('eligible', '90')"
                >
                  <CalendarDays class="h-3.5 w-3.5" aria-hidden="true" />Ver vencidos e próximos de até 90 dias
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        class="relative flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500"
      >
        <span>{{ data ? `Consultado em ${formatConsulted(data.queriedAt)} · Brasília` : "Atualize para consultar o IXC." }}</span>
        <div class="flex flex-wrap items-center gap-2">
          <label class="sr-only" for="upgrades-limit">Registros por página</label
          ><select
            id="upgrades-limit"
            v-model="limit"
            class="rounded-lg border border-slate-200 bg-white px-2 py-1"
            @change="
              page = 1;
              reload();
            "
          >
            <option value="10">10 por página</option>
            <option value="25">25 por página</option></select
          ><span v-if="data">{{ page }} / {{ totalPages }}</span
          ><button class="button-secondary" type="button" :disabled="loading || page <= 1" @click="changePage(page - 1)">
            <ChevronLeft class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Anterior</button
          ><button class="button-secondary" type="button" :disabled="loading || !data || page >= totalPages" @click="changePage(page + 1)">
            Próxima
          </button>
        </div>
      </div>
    </section>
  </div>
  <UpgradeExportDialog
    v-if="exportOpen && auth.can('upgrades.export')"
    :filters="exportFilters"
    :contract-ids="[...selected.keys()]"
    :selected-clients="selectedClients"
    :total="data?.total ?? 0"
    @close="exportOpen = false"
  />
</template>
