<script setup lang="ts">
import { ClipboardList, CheckCircle2, Search, Siren, ChevronLeft, RefreshCw } from "lucide-vue-next";

import { computed, onMounted, ref, watch } from "vue";

import { api, type Customer } from "../api";
import ChurnCustomerTable from "../components/ChurnCustomerTable.vue";

import { useAuthStore } from "../stores/auth";
const auth = useAuthStore();
const props = defineProps<{ mode: "resolved" | "attention" }>();
const customers = ref<Customer[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref("");
const search = ref("");
const page = ref(1);
const limit = 10;
let latestRequest = 0;
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const isAttention = computed(() => props.mode === "attention");
const title = computed(() => (isAttention.value ? "Fila de atenção" : "Clientes resolvidos"));
const description = computed(() =>
  isAttention.value
    ? "Clientes priorizados manualmente para tratamento pela equipe."
    : "Consulta rápida dos clientes cuja tratativa foi concluída."
);

async function load(resetPage = false) {
  if (resetPage) page.value = 1;
  const requestId = ++latestRequest;
  loading.value = true;
  error.value = "";
  try {
    const query = new URLSearchParams({ page: String(page.value), limit: String(limit) });
    if (search.value.trim()) query.set("search", search.value.trim());
    if (isAttention.value) query.set("attentionOnly", "true");
    else query.set("workflowStatus", "RESOLVED");
    const result = await api.customers(query);
    if (requestId !== latestRequest) return;
    customers.value = result.items;
    total.value = result.total;
  } catch (caughtError) {
    if (requestId !== latestRequest) return;
    error.value = caughtError instanceof Error ? caughtError.message : "Não foi possível carregar a fila.";
  } finally {
    if (requestId === latestRequest) loading.value = false;
  }
}

function changePage(next: number) {
  page.value = Math.min(Math.max(1, next), totalPages.value);
  load();
}

onMounted(load);
watch(
  () => props.mode,
  () => {
    search.value = "";
    load(true);
  }
);
</script>

<template>
  <div class="compact-view">
    <section class="mb-4">
      <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em]" :class="isAttention ? 'text-red-700' : 'text-emerald-700'">
        {{ isAttention ? "Prioridade operacional" : "Histórico operacional" }}
      </p>
      <h1 class="text-2xl font-extrabold tracking-tight">
        <ClipboardList class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />{{ title }}
      </h1>
      <p class="mt-1 text-xs text-slate-500">{{ description }}</p>
    </section>
    <section class="panel overflow-hidden">
      <div class="relative flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div class="flex items-center gap-2">
          <span :class="isAttention ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'" class="rounded-lg p-1.5"
            ><Siren v-if="isAttention" class="h-4 w-4" aria-hidden="true" focusable="false" /><CheckCircle2
              v-else
              class="h-4 w-4"
              aria-hidden="true"
              focusable="false"
          /></span>
          <h2 class="text-sm font-bold">{{ total.toLocaleString("pt-BR") }} cliente{{ total === 1 ? "" : "s" }}</h2>
          <span class="text-[11px] text-slate-400">{{ isAttention ? "em atenção" : "resolvidos" }}</span>
        </div>
        <form class="flex w-full gap-2 sm:w-auto" @submit.prevent="load(true)">
          <label class="relative min-w-0 flex-1"
            ><span class="sr-only">Buscar cliente ou ID</span
            ><Search class="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" aria-hidden="true" focusable="false" /><input
              v-model="search"
              placeholder="Buscar cliente ou ID"
              class="input !pl-8 sm:w-64" /></label
          ><button type="submit" class="button-primary">
            <Search class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Buscar
          </button>
        </form>
      </div>
      <div v-if="error" role="alert" class="flex flex-wrap items-center justify-between gap-3 p-4 text-xs text-red-600">
        <span>{{ error }}</span
        ><button class="button-secondary" type="button" @click="load()">
          <RefreshCw class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Tentar novamente
        </button>
      </div>
      <div v-else-if="loading" role="status" class="flex min-h-40 flex-col items-center justify-center gap-1 text-xs text-slate-500">
        <img src="/infinite-spinner.svg" alt="" class="h-12 w-20" />Carregando clientes…
      </div>
      <ChurnCustomerTable
        v-else
        :customers="customers"
        :can-view-details="auth.canViewCustomerDetails"
        :empty-message="isAttention ? 'Nenhum cliente foi marcado para atenção.' : 'Nenhuma tratativa resolvida encontrada.'"
      />
      <footer class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
        <span>{{ limit }} por página</span>
        <div class="flex items-center gap-2">
          <span>{{ page }} / {{ totalPages }}</span
          ><button type="button" :disabled="page === 1 || loading" @click="changePage(page - 1)" class="button-secondary">
            <ChevronLeft class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Anterior</button
          ><button type="button" :disabled="page >= totalPages || loading" @click="changePage(page + 1)" class="button-secondary">
            Próxima
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>
