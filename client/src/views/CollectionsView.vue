<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Banknote, Users, Clock3, CalendarClock, Search, SlidersHorizontal, Download, ArrowUpRight, RotateCcw } from "lucide-vue-next";
import {
  collectionsApi,
  collectionMoney as money,
  collectionBucketLabels as bucketLabels,
  type CollectionCustomer,
} from "../collectionsApi";
import { formatDate } from "../upgradesApi";
import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import LiveQueryState from "../components/LiveQueryState.vue";
import LivePagination from "../components/LivePagination.vue";
import RecordDetailDialog from "../components/RecordDetailDialog.vue";
import CollectionCustomerDetail from "../components/CollectionCustomerDetail.vue";
import CollectionsExportDialog from "../components/CollectionsExportDialog.vue";
import { toast } from "../notifications/toast";
const auth = useAuthStore();
const defaults = () => ({
  scope: "overdue",
  bucket: "all",
  status: "all",
  branchId: "",
  accountId: "",
  from: "",
  to: "",
  search: "",
  searchBy: "name",
  sort: "oldest",
});
const form = reactive(defaults()),
  applied = ref({ ...form }),
  page = ref(1),
  limit = ref(10),
  moreFilters = ref(false),
  selected = ref(new Set<number>()),
  detail = ref<CollectionCustomer | null>(null),
  exportOpen = ref(false),
  validation = ref("");
const filters = computed(() => Object.fromEntries(Object.entries(applied.value).filter(([, v]) => v !== "")));
const params = computed(() => new URLSearchParams({ ...filters.value, page: String(page.value), limit: String(limit.value) }));
const availableBuckets = computed(() =>
  Object.fromEntries(Object.entries(bucketLabels).filter(([key]) => key !== "upcoming" || form.scope === "open"))
);
const { data, loading, error, reload } = useLiveQuery((signal) => collectionsApi.list(params.value, signal));
const options = useLiveQuery((signal) => collectionsApi.options(signal));
watch([page, limit], reload);
const cards = computed(() => [
  {
    key: "all",
    label: applied.value.scope === "overdue" ? "Total vencido" : "Total em aberto",
    icon: Banknote,
    customers: data.value?.summary.customers ?? 0,
    balance: data.value?.summary.balance ?? 0,
  },
  ...(data.value?.summary.buckets ?? [])
    .filter((b) => applied.value.scope === "open" || b.key !== "upcoming")
    .map((b) => ({ ...b, label: bucketLabels[b.key], icon: b.key === "upcoming" ? CalendarClock : Clock3 })),
]);
const allSelected = computed(() => !!data.value?.items.length && data.value.items.every((c) => selected.value.has(c.id)));
function toggle(customer: CollectionCustomer) {
  if (selected.value.has(customer.id)) selected.value.delete(customer.id);
  else if (selected.value.size < 200) selected.value.add(customer.id);
  else toast.info("Limite de seleção", "Selecione no máximo 200 clientes.");
}
function togglePage() {
  const remove = allSelected.value;
  for (const item of data.value?.items ?? []) {
    if (remove) selected.value.delete(item.id);
    else if (!selected.value.has(item.id)) toggle(item);
  }
}
function apply() {
  validation.value = "";
  if (form.scope === "overdue" && form.bucket === "upcoming") form.bucket = "all";
  if ((form.from && !form.to) || (form.to && !form.from) || (form.from && form.to && form.from > form.to)) {
    validation.value = "Informe início e fim do período em ordem crescente.";
    return;
  }
  if (form.search && ["customerId", "titleId", "contractId"].includes(form.searchBy) && !/^[1-9]\d*$/.test(form.search)) {
    validation.value = "Informe um ID positivo.";
    return;
  }
  if (form.search && form.searchBy === "document" && ![11, 14].includes(form.search.replace(/\D/g, "").length)) {
    validation.value = "Informe um CPF ou CNPJ completo.";
    return;
  }
  applied.value = { ...form };
  selected.value.clear();
  if (page.value !== 1) page.value = 1;
  else void reload();
}
function card(key: string) {
  form.bucket = key;
  apply();
}
function reset() {
  Object.assign(form, defaults());
  apply();
}
</script>
<template>
  <section class="compact-view space-y-3">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] collection-link">GESTÃO DE PENDÊNCIAS</p>
        <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight"><Banknote class="h-6 w-6" aria-hidden="true" />Cobranças</h1>
        <p class="mt-1 text-xs text-slate-500">Pendências de contratos ativos, agrupadas por cliente para facilitar o contato.</p>
      </div>
      <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700"
        >Consulta direta ao banco IXC</span
      >
    </header>
    <div class="grid gap-2 sm:grid-cols-2" :class="applied.scope === 'open' ? 'xl:grid-cols-6' : 'xl:grid-cols-5'">
      <button
        v-for="item in cards"
        :key="item.key"
        type="button"
        class="collection-card panel flex items-center gap-2 p-3 text-left"
        :aria-pressed="applied.bucket === item.key"
        :disabled="loading"
        @click="card(item.key)"
      >
        <component :is="item.icon" class="h-4 w-4 shrink-0 collection-link" aria-hidden="true" /><span class="min-w-0 flex-1"
          ><span class="block text-[11px] text-slate-500">{{ item.label }}</span
          ><strong class="mt-1 block text-base">{{ loading ? "—" : money(item.balance) }}</strong
          ><span class="block text-[10px] text-slate-500">{{ item.customers.toLocaleString("pt-BR") }} clientes</span></span
        >
      </button>
    </div>
    <p class="text-[10px] text-slate-500">
      Apenas títulos em aberto de contratos ativos do próprio cliente. Cards consideram os filtros, exceto a faixa de atraso; um cliente
      pode aparecer em mais de uma faixa. Vence hoje entra em “a vencer”.
    </p>
    <p
      v-for="warning in data?.warnings ?? []"
      :key="warning"
      role="status"
      class="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"
    >
      {{ warning }}
    </p>
    <section class="panel overflow-hidden">
      <div class="border-b border-slate-100 px-4 py-3">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="flex items-center gap-2 text-sm font-bold">
            <Users class="h-4 w-4 collection-link" aria-hidden="true" />Clientes para cobrança
            <span v-if="data" class="text-xs font-normal text-slate-500">{{ data.total.toLocaleString("pt-BR") }} encontrados</span>
          </h2>
          <div v-if="auth.can('collections.export')" class="flex items-center gap-2">
            <span v-if="selected.size" class="text-[11px] text-slate-500">{{ selected.size }} selecionados</span
            ><button type="button" class="button-secondary" :disabled="loading || !data?.total" @click="exportOpen = true">
              <Download aria-hidden="true" />Exportar PDF
            </button>
          </div>
        </div>
        <form class="space-y-2" @submit.prevent="apply">
          <div class="flex flex-wrap items-center gap-2">
            <select v-model="form.scope" aria-label="Situação dos títulos" class="input !w-auto" @change="apply">
              <option value="overdue">Títulos vencidos</option>
              <option value="open">Todos em aberto</option>
            </select>
            <select v-model="form.bucket" aria-label="Faixa de atraso" class="input !w-auto" @change="apply">
              <option v-for="(label, key) in availableBuckets" :key="key" :value="key">
                {{ key === "all" && form.scope === "open" ? "Todas as pendências" : label }}
              </option>
            </select>
            <select v-model="form.status" aria-label="Cadastro do cliente" class="input !w-auto" @change="apply">
              <option value="all">Ativos e inativos</option>
              <option value="active">Clientes ativos</option>
              <option value="inactive">Clientes inativos</option>
            </select>
            <select v-model="form.searchBy" aria-label="Buscar por" class="input !w-auto">
              <option value="name">Nome do cliente</option>
              <option value="document">CPF / CNPJ</option>
              <option value="customerId">ID do cliente</option>
              <option value="contractId">ID do contrato</option>
              <option value="titleId">ID do título</option>
            </select>
            <input
              v-model="form.search"
              aria-label="Termo da busca"
              class="input min-w-40 flex-1"
              maxlength="120"
              placeholder="Buscar nome, documento ou ID"
            />
            <button type="submit" class="button-primary" :disabled="loading"><Search aria-hidden="true" />Buscar</button
            ><button
              type="button"
              class="button-secondary"
              :aria-expanded="moreFilters"
              aria-controls="collection-extra-filters"
              @click="moreFilters = !moreFilters"
            >
              <SlidersHorizontal aria-hidden="true" />Filtros</button
            ><button type="button" class="button-secondary" @click="reset"><RotateCcw aria-hidden="true" />Limpar</button>
          </div>
          <div v-if="moreFilters" id="collection-extra-filters" class="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <label class="text-[11px] text-slate-500"
              >Filial<select v-model="form.branchId" class="input mt-1">
                <option value="">Todas as filiais</option>
                <option v-for="branch in options.data.value?.branches ?? []" :key="branch.id" :value="String(branch.id)">
                  {{ branch.name }} (#{{ branch.id }})
                </option>
              </select></label
            >
            <label class="text-[11px] text-slate-500"
              >Conta<select v-model="form.accountId" class="input mt-1">
                <option value="">Todas as contas</option>
                <option v-for="account in options.data.value?.accounts ?? []" :key="account.id" :value="String(account.id)">
                  {{ account.name }}
                </option>
              </select></label
            >
            <label class="text-[11px] text-slate-500">Vencimento de<input v-model="form.from" type="date" class="input mt-1" /></label
            ><label class="text-[11px] text-slate-500">Vencimento até<input v-model="form.to" type="date" class="input mt-1" /></label>
            <label class="text-[11px] text-slate-500"
              >Ordenação<select v-model="form.sort" class="input mt-1">
                <option value="oldest">Vencimento mais antigo</option>
                <option value="balance">Maior saldo aberto</option>
                <option value="name">Nome do cliente</option>
              </select></label
            >
          </div>
          <p v-if="options.error.value && moreFilters" role="alert" class="text-xs text-amber-700">
            {{ options.error.value }} <button type="button" class="underline" @click="options.reload">Recarregar filtros</button>
          </p>
          <p v-if="validation" role="alert" class="text-xs text-red-600">{{ validation }}</p>
        </form>
      </div>
      <LiveQueryState :loading="loading" :error="error" @retry="reload" />
      <template v-if="data && !loading && !error"
        ><div class="overflow-x-auto">
          <table class="compact-table min-w-[900px]">
            <thead>
              <tr>
                <th v-if="auth.can('collections.export')" scope="col" class="!w-8">
                  <input type="checkbox" :checked="allSelected" aria-label="Selecionar clientes desta página" @change="togglePage" />
                </th>
                <th scope="col">Cliente / cadastro</th>
                <th scope="col">Contato</th>
                <th scope="col">Localidade</th>
                <th scope="col">Mais antigo / atraso</th>
                <th scope="col" class="text-right">Títulos</th>
                <th scope="col" class="text-right">Saldo aberto</th>
                <th scope="col" class="text-right">Saldo vencido</th>
                <th v-if="auth.can('collections.customer.view')" scope="col"><span class="sr-only">Detalhes</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="customer in data.items"
                :key="customer.id"
                class="hover:bg-slate-50"
                :class="auth.can('collections.customer.view') ? 'cursor-pointer' : ''"
                @click="auth.can('collections.customer.view') && (detail = customer)"
              >
                <td v-if="auth.can('collections.export')" @click.stop>
                  <input
                    type="checkbox"
                    :checked="selected.has(customer.id)"
                    :aria-label="`Selecionar ${customer.name}`"
                    @change="toggle(customer)"
                  />
                </td>
                <td class="max-w-72">
                  <button
                    v-if="auth.can('collections.customer.view')"
                    type="button"
                    class="text-left text-xs font-semibold hover:underline"
                    @click.stop="detail = customer"
                  >
                    {{ customer.name }}</button
                  ><strong v-else class="text-xs font-semibold">{{ customer.name }}</strong
                  ><span class="compact-secondary"
                    >#{{ customer.id }} ·
                    {{ customer.active === true ? "Ativo" : customer.active === false ? "Inativo" : "Cadastro não informado" }}</span
                  >
                </td>
                <td class="whitespace-nowrap">
                  {{ customer.contacts.find((c) => c.whatsappUrl)?.number || customer.contacts[0]?.number || "Sem telefone" }}
                </td>
                <td>
                  {{ customer.city || "Não informada"
                  }}<span class="compact-secondary">{{ customer.neighborhood || "Bairro não informado" }}</span>
                </td>
                <td class="whitespace-nowrap">
                  {{ formatDate(customer.oldestDue)
                  }}<span class="compact-secondary">{{
                    customer.daysLate ? `${customer.daysLate} dias de atraso` : "Vence hoje / a vencer"
                  }}</span>
                </td>
                <td class="text-right">
                  {{ customer.titles }}<span class="compact-secondary">{{ customer.overdueTitles }} vencidos</span>
                </td>
                <td class="text-right whitespace-nowrap font-semibold">{{ money(customer.balance) }}</td>
                <td class="text-right whitespace-nowrap">{{ money(customer.overdueBalance) }}</td>
                <td v-if="auth.can('collections.customer.view')"><ArrowUpRight class="h-4 w-4 collection-link" aria-hidden="true" /></td>
              </tr>
              <tr v-if="!data.items.length">
                <td
                  :colspan="7 + Number(auth.can('collections.export')) + Number(auth.can('collections.customer.view'))"
                  class="!py-8 text-center text-slate-500"
                >
                  Nenhum cliente com pendências para estes filtros.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt"
      /></template>
    </section>
    <RecordDetailDialog
      v-if="detail"
      :title="detail.name"
      :subtitle="`Cobrança · Cliente #${detail.id}`"
      :icon="Banknote"
      module="collections"
      @close="detail = null"
      ><CollectionCustomerDetail :customer-id="detail.id" :filters="filters"
    /></RecordDetailDialog>
    <CollectionsExportDialog
      v-if="exportOpen && data"
      :filters="filters"
      :customer-ids="[...selected]"
      :total="data.total"
      @close="exportOpen = false"
    />
  </section>
</template>
