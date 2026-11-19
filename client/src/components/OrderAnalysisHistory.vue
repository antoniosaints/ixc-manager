<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { History, ArrowLeft, Search, RefreshCw, Sparkles } from "lucide-vue-next";
import SearchableSelect from "./SearchableSelect.vue";
import LivePagination from "./LivePagination.vue";
import { orderAnalysisApi, type OrderAnalysisHistoryPage, type OrderAnalysisSnapshot, type OrderAnalysis } from "../orderAnalysisApi";
import { queryErrorMessage } from "../queryErrorMessage";
const emit = defineEmits<{ reuse: [filters: OrderAnalysis["filters"]] }>();
const route = useRoute(),
  router = useRouter();
const filters = reactive({ subjectId: 0, from: "", to: "" });
const page = ref(1),
  limit = ref(10),
  data = ref<OrderAnalysisHistoryPage | null>(null),
  loading = ref(false),
  error = ref("");
const record = ref<{ id: string; createdAt: string; snapshot: OrderAnalysisSnapshot } | null>(null),
  detailLoading = ref(false),
  detailError = ref("");
const selectedId = computed(() => (typeof route.query.history === "string" ? route.query.history : ""));
const subjectOptions = computed(() => [
  { value: 0, label: "Todos os assuntos" },
  ...(data.value?.subjects ?? []).map((s) => ({ value: s.id, label: s.name })),
]);
const labels = { openai: "OpenAI", gemini: "Google Gemini" };
const severity = { low: "Baixa", medium: "Média", high: "Alta" };
const timestamp = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const period = (value: string) => value.split("-").reverse().join("/");
let listController: AbortController | undefined, detailController: AbortController | undefined;
async function load() {
  listController?.abort();
  const active = (listController = new AbortController());
  loading.value = true;
  error.value = "";
  if (filters.from && filters.to && filters.from > filters.to) {
    error.value = "Revise o período informado.";
    loading.value = false;
    return;
  }
  try {
    const query = new URLSearchParams({
      ...filters,
      subjectId: String(filters.subjectId),
      page: String(page.value),
      limit: String(limit.value),
    });
    const result = await orderAnalysisApi.history(query, active.signal);
    if (!active.signal.aborted) data.value = result;
  } catch (e) {
    if (!active.signal.aborted) error.value = queryErrorMessage(e);
  } finally {
    if (listController === active) loading.value = false;
  }
}
function apply() {
  if (page.value === 1) void load();
  else page.value = 1;
}
async function loadDetail(id: string) {
  detailController?.abort();
  const active = (detailController = new AbortController());
  record.value = null;
  detailError.value = "";
  if (!id) {
    detailLoading.value = false;
    return;
  }
  detailLoading.value = true;
  try {
    const value = await orderAnalysisApi.saved(id, active.signal);
    if (!active.signal.aborted) record.value = value;
  } catch (e) {
    if (!active.signal.aborted) detailError.value = queryErrorMessage(e);
  } finally {
    if (detailController === active) detailLoading.value = false;
  }
}
function open(id: string) {
  void router.push({ path: route.path, query: { view: "history", history: id } });
}
function back() {
  void router.push({ path: route.path, query: { view: "history" } });
}
watch([page, limit], load);
watch(
  selectedId,
  (id) => {
    if (id) {
      listController?.abort();
      void loadDetail(id);
    } else {
      detailController?.abort();
      record.value = null;
      void load();
    }
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  listController?.abort();
  detailController?.abort();
});
</script>
<template>
  <section v-if="!selectedId" class="panel overflow-hidden" aria-labelledby="history-title" :aria-busy="loading">
    <header class="flex flex-wrap items-start justify-between gap-3 p-4">
      <div>
        <h2 id="history-title" class="flex items-center gap-2 text-sm font-bold">
          <History class="h-4 w-4" aria-hidden="true" />Histórico de análises de OS
        </h2>
        <p class="mt-1 text-xs text-slate-500">Consulte relatórios salvos sem consultar o IXC ou gerar outro resumo.</p>
      </div>
      <button type="button" class="button-secondary" :disabled="loading" @click="load">
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar histórico
      </button>
    </header>
    <form class="grid items-end gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]" @submit.prevent="apply">
      <SearchableSelect v-model="filters.subjectId" :options="subjectOptions" label="Assunto" /><label class="text-xs text-slate-500"
        >Período analisado de<input v-model="filters.from" type="date" class="input mt-1 !h-8" :max="filters.to || undefined" /></label
      ><label class="text-xs text-slate-500"
        >Até<input v-model="filters.to" type="date" class="input mt-1 !h-8" :min="filters.from || undefined" /></label
      ><button type="submit" class="button-primary" :disabled="loading"><Search class="h-3.5 w-3.5" aria-hidden="true" />Filtrar</button>
    </form>
    <p v-if="error" role="alert" class="px-4 pb-4 text-xs text-red-700">{{ error }}</p>
    <p v-if="loading" role="status" class="px-4 py-6 text-xs text-slate-500">Carregando histórico salvo…</p>
    <template v-else-if="data && !error"
      ><div class="overflow-x-auto">
        <table class="compact-table">
          <thead>
            <tr>
              <th scope="col">Assunto e período</th>
              <th scope="col">Gerada em</th>
              <th scope="col">Provedor / modelo</th>
              <th scope="col">OS</th>
              <th scope="col">Resumo salvo</th>
              <th scope="col">Consulta</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in data.items" :key="item.id" class="border-t border-slate-100">
              <td>
                <strong class="block">{{ item.subject.name }}</strong
                ><span class="compact-secondary whitespace-nowrap">{{ period(item.filters.from) }} a {{ period(item.filters.to) }}</span>
              </td>
              <td class="whitespace-nowrap">{{ timestamp(item.generatedAt) }}</td>
              <td>
                <span class="block">{{ item.provider === "gemini" ? "Google Gemini" : "OpenAI" }}</span
                ><span class="compact-secondary break-all">{{ item.model }}</span>
              </td>
              <td>{{ item.totalOrders }}</td>
              <td class="min-w-52 max-w-sm">
                <p class="line-clamp-3">{{ item.summary }}</p>
              </td>
              <td>
                <button type="button" class="button-secondary whitespace-nowrap !px-3 !py-1.5" @click="open(item.id)">Abrir resumo</button>
              </td>
            </tr>
            <tr v-if="!data.items.length">
              <td colspan="6" class="!py-10 text-center text-slate-500">
                Nenhuma análise salva para estes filtros. As próximas análises concluídas por IA aparecerão aqui.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt"
    /></template>
  </section>
  <section v-else class="panel space-y-4 p-4" :aria-busy="detailLoading" aria-labelledby="saved-analysis-title">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <button type="button" class="button-secondary" @click="back">
        <ArrowLeft class="h-3.5 w-3.5" aria-hidden="true" />Voltar ao histórico</button
      ><button v-if="record" type="button" class="button-secondary" @click="emit('reuse', record.snapshot.filters)">
        Usar filtros em nova análise
      </button>
    </div>
    <p v-if="detailLoading" role="status" class="py-6 text-xs text-slate-500">Abrindo resumo salvo…</p>
    <p v-if="detailError" role="alert" class="text-xs text-red-700">
      {{ detailError }} <button type="button" class="underline" @click="loadDetail(selectedId)">Tentar novamente</button>
    </p>
    <template v-if="record"
      ><header>
        <p class="mb-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600">Análise salva</p>
        <h2 id="saved-analysis-title" class="text-lg font-bold">{{ record.snapshot.subject.name }}</h2>
        <p class="mt-1 text-xs text-slate-500">
          {{ period(record.snapshot.filters.from) }} a {{ period(record.snapshot.filters.to) }} · Gerada em
          {{ timestamp(record.snapshot.queriedAt) }} · {{ labels[record.snapshot.ai.provider] }} · {{ record.snapshot.ai.model }}
        </p>
      </header>
      <p class="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        Este é o relatório registrado na data da análise. Os indicadores não foram atualizados. Nenhuma nova consulta ao IXC ou geração por
        IA foi realizada ao abrir.
      </p>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div
          v-for="metric in [
            { label: 'Ordens', value: record.snapshot.totals.orders },
            { label: 'Clientes', value: record.snapshot.totals.customers },
            { label: 'Clientes recorrentes', value: record.snapshot.totals.recurringCustomers },
            { label: 'Cidades', value: record.snapshot.totals.cities },
          ]"
          :key="metric.label"
          class="rounded-lg border border-slate-200 p-3"
        >
          <span class="text-xs text-slate-500">{{ metric.label }}</span
          ><strong class="mt-1 block text-xl">{{ metric.value }}</strong>
        </div>
      </div>
      <h3 class="flex items-center gap-2 text-sm font-bold"><Sparkles class="h-4 w-4" aria-hidden="true" />Resumo da IA</h3>
      <p class="whitespace-pre-wrap break-words text-sm leading-relaxed">{{ record.snapshot.ai.report.summary }}</p>
      <article v-for="(finding, i) in record.snapshot.ai.report.findings" :key="i" class="rounded-lg border border-slate-200 p-3">
        <div class="flex flex-wrap justify-between gap-2">
          <h4 class="text-sm font-bold">{{ finding.title }}</h4>
          <span class="pill bg-slate-100 text-slate-700">Prioridade {{ severity[finding.severity] }}</span>
        </div>
        <p class="mt-2 whitespace-pre-wrap break-words text-sm">{{ finding.assessment }}</p>
        <p class="mt-2 text-xs text-slate-500">OS citadas: {{ finding.orderIds.map((id) => `#${id}`).join(", ") }}</p>
      </article>
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <h3 class="text-sm font-bold">Ações sugeridas</h3>
          <ul class="mt-2 list-disc space-y-1 pl-5 text-xs">
            <li v-for="item in record.snapshot.ai.report.actions" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div>
          <h3 class="text-sm font-bold">Limitações</h3>
          <ul class="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li v-for="item in [...record.snapshot.warnings, ...record.snapshot.ai.report.limitations]" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
      <p class="border-t border-slate-200 pt-3 text-xs text-slate-500">
        Salva em {{ timestamp(record.createdAt) }}. O histórico preserva o relatório e indicadores; as mensagens brutas e a conexão atual
        dos clientes não são armazenadas aqui.
      </p>
    </template>
  </section>
</template>
