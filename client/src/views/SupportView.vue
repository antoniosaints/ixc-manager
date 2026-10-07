<script setup lang="ts">
import { Users, ArrowUpRight, Headset, Search, RotateCcw } from "lucide-vue-next";

import { computed, ref, watch } from "vue";

import { useRoute, useRouter } from "vue-router";
import { supportApi } from "../supportApi";
import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import LiveQueryState from "../components/LiveQueryState.vue";
import LivePagination from "../components/LivePagination.vue";
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore();
const status = ref(String(route.query.status ?? "active")),
  searchBy = ref(String(route.query.searchBy ?? "name")),
  search = ref(String(route.query.search ?? ""));
const page = ref(1),
  limit = ref(10);
const searchPlaceholders: Record<string, string> = {
  name: "Digite pelo menos 3 caracteres",
  id: "ID do cliente no IXC",
  login: "Login de internet · ao menos 3 caracteres",
  document: "CPF ou CNPJ completo, com ou sem pontuação",
  address: "Rua ou endereço · ao menos 3 caracteres",
};
const searchPlaceholder = computed(() => searchPlaceholders[searchBy.value] ?? "Digite sua busca");
const applied = ref({ status: status.value, searchBy: searchBy.value, search: search.value });
const params = computed(() => new URLSearchParams({ ...applied.value, page: String(page.value), limit: String(limit.value) }));
const { data, loading, error, reload } = useLiveQuery((signal) => supportApi.customers(params.value, signal));
watch([page, limit], reload);
watch(
  () => route.query,
  () => {
    status.value = String(route.query.status ?? "active");
    searchBy.value = String(route.query.searchBy ?? "name");
    search.value = String(route.query.search ?? "");
    applied.value = { status: status.value, searchBy: searchBy.value, search: search.value };
    page.value = 1;
    reload();
  }
);
function apply() {
  const filters = { status: status.value, searchBy: searchBy.value, search: search.value.trim() };
  if (
    Object.entries(filters).every(
      ([key, value]) => String(route.query[key] ?? (key === "status" ? "active" : key === "searchBy" ? "name" : "")) === value
    )
  )
    reload();
  else router.replace({ query: filters });
}
function clear() {
  status.value = "active";
  searchBy.value = "name";
  search.value = "";
  apply();
}
</script>
<template>
  <div class="compact-view">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-indigo-600">Central de suporte</p>
        <h1 class="text-2xl font-extrabold tracking-tight">
          <Users class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />Clientes
        </h1>
        <p class="mt-1 text-xs text-slate-500">Consulte o cadastro, contratos e histórico para validar o atendimento.</p>
      </div>
      <span
        class="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700"
        ><span class="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>Consulta direta ao IXC</span
      >
    </div>
    <section class="panel overflow-hidden">
      <div class="relative border-b border-slate-100 px-4 py-3">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <Headset class="h-4 w-4 text-indigo-600" aria-hidden="true" focusable="false" />
          <h2 class="text-sm font-bold">Clientes para atendimento</h2>
          <span class="text-[11px] text-slate-400">{{
            data ? `${data.total.toLocaleString("pt-BR")} encontrados` : "Clientes no IXC"
          }}</span>
        </div>
        <form class="flex flex-wrap items-center gap-2" @submit.prevent="apply">
          <label class="sr-only" for="support-status">Cadastro</label>
          <select id="support-status" v-model="status" class="input !w-auto flex-1 sm:flex-none" @change="apply">
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="all">Todos os clientes</option>
          </select>
          <div class="flex min-w-[240px] flex-1 gap-1">
            <label class="sr-only" for="support-search-by">Buscar por</label>
            <select id="support-search-by" v-model="searchBy" class="input !w-auto !px-2">
              <option value="name">Nome do cliente</option>
              <option value="id">ID do cliente</option>
              <option value="login">Login de internet</option>
              <option value="document">CPF / CNPJ</option>
              <option value="address">Endereço</option>
            </select>
            <div class="relative min-w-0 flex-1">
              <label class="sr-only" for="support-search">Busca de clientes</label>
              <Search class="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" aria-hidden="true" focusable="false" />
              <input id="support-search" v-model="search" class="input !pl-8" :placeholder="searchPlaceholder" maxlength="120" />
            </div>
          </div>
          <button class="button-primary" type="submit"><Search class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Buscar</button
          ><button type="button" class="text-xs text-slate-500 hover:text-indigo-700" @click="clear">
            <RotateCcw class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Limpar
          </button>
        </form>
      </div>
      <LiveQueryState :loading="loading" :error="error" @retry="reload" />
      <template v-if="data && !loading && !error">
        <div class="relative overflow-x-auto">
          <table class="compact-table min-w-[720px]">
            <thead>
              <tr>
                <th scope="col" class="!pl-4">Cliente / ID</th>
                <th scope="col">Cadastro</th>
                <th scope="col">Localidade</th>
                <th scope="col">Contato</th>
                <th scope="col" class="w-12 !pr-4"><span class="sr-only">Ações do cliente</span></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="customer in data.items"
                :key="customer.id"
                :class="auth.can('support.customer.view') ? 'cursor-pointer hover:bg-slate-50' : ''"
                @click="auth.can('support.customer.view') && router.push(`/support/customers/${customer.id}`)"
              >
                <td class="max-w-64 !pl-4">
                  <RouterLink
                    v-if="auth.can('support.customer.view')"
                    :to="`/support/customers/${customer.id}`"
                    class="block truncate font-semibold hover:text-indigo-700 hover:underline"
                    :title="customer.name"
                    @click.stop
                    >{{ customer.name }}</RouterLink
                  ><strong v-else class="block truncate font-semibold" :title="customer.name">{{ customer.name }}</strong
                  ><span class="compact-secondary">Cliente #{{ customer.id }}</span>
                  <span v-if="applied.searchBy === 'document' && customer.document" class="compact-secondary">{{ customer.document }}</span>
                </td>
                <td class="whitespace-nowrap">
                  <span
                    class="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-3"
                    :class="customer.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'"
                    >{{ customer.active === null ? "Sem status" : customer.active ? "Ativo" : "Inativo" }}</span
                  >
                </td>
                <td class="max-w-44">
                  <span class="block truncate" :title="customer.city ?? ''">{{ customer.city ?? "—" }}</span>
                  <span v-if="customer.neighborhood" class="compact-secondary truncate" :title="customer.neighborhood">{{
                    customer.neighborhood
                  }}</span>
                  <span
                    v-if="applied.searchBy === 'address' && customer.address"
                    class="compact-secondary truncate"
                    :title="customer.address"
                    >{{ customer.address }}</span
                  >
                </td>
                <td class="whitespace-nowrap">{{ customer.phone ?? "—" }}</td>
                <td class="!pr-4 text-right">
                  <RouterLink
                    v-if="auth.can('support.customer.view')"
                    :to="`/support/customers/${customer.id}`"
                    :aria-label="`Abrir cliente ${customer.name}, ID ${customer.id}`"
                    title="Abrir cliente"
                    class="inline-flex rounded p-1 text-indigo-600 hover:bg-slate-100"
                    @click.stop
                    ><ArrowUpRight class="h-4 w-4" aria-hidden="true" focusable="false"
                  /></RouterLink>
                </td>
              </tr>
              <tr v-if="!data.items.length">
                <td colspan="5" class="!px-4 !py-10 text-center text-slate-500">
                  {{
                    data.total ? "Não há clientes nesta página. Volte à página anterior." : "Nenhum cliente encontrado com estes filtros."
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
