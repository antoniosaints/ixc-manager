<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { Sparkles, Loader2, Search, Users, MapPin, Repeat2, Wrench, X } from "lucide-vue-next";
import SearchableSelect from "../components/SearchableSelect.vue";
import SupportCaseStatus from "../components/SupportCaseStatus.vue";
import { orderAnalysisApi, type OrderAnalysis } from "../orderAnalysisApi";
import { formatIxcDateTime } from "../upgradesApi";
import { queryErrorMessage } from "../queryErrorMessage";
import { useAuthStore } from "../stores/auth";
import { upgradesRefreshKey } from "../composables/useLiveQuery";

const provider = ref<"openai" | "gemini">("openai");
const providerLabel = computed(() => (provider.value === "gemini" ? "Google Gemini" : "OpenAI"));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(
  new Date()
);
const start = new Date(`${today}T12:00:00Z`);
start.setUTCDate(start.getUTCDate() - 29);
const filters = reactive({ subjectId: 0, from: start.toISOString().slice(0, 10), to: today });
const auth = useAuthStore();
const subjects = ref<{ id: number; name: string }[]>([]),
  configured = ref(false),
  loadingSubjects = ref(false),
  loading = ref(false);
const error = ref(""),
  subjectError = ref(""),
  result = ref<OrderAnalysis | null>(null);
const page = ref(1),
  customerPage = ref(1),
  selectedIds = ref<number[] | null>(null),
  evidenceLabel = ref("");
const search = ref(""),
  expanded = ref<number | null>(null),
  recurringOnly = ref(false);
const clusterScope = ref<"city" | "branch">("branch"),
  clusterPage = ref(1);
let controller: AbortController | undefined, subjectController: AbortController | undefined;
const subjectOptions = computed(() => subjects.value.map((s) => ({ value: s.id, label: s.name })));
const changed = computed(() => result.value && JSON.stringify(filters) !== JSON.stringify(result.value.filters));
const canAnalyze = computed(() => filters.subjectId > 0 && !!filters.from && !!filters.to && filters.from <= filters.to);
const filteredOrders = computed(() => {
  const selected = selectedIds.value ? new Set(selectedIds.value) : null;
  const term = search.value.trim().toLocaleLowerCase("pt-BR");
  return (result.value?.orders ?? []).filter(
    (o) =>
      (!selected || selected.has(o.id)) &&
      (!term || `${o.id} ${o.customerName ?? ""} ${o.city ?? ""} ${o.networkBranch ?? ""}`.toLocaleLowerCase("pt-BR").includes(term))
  );
});
const orders = computed(() => filteredOrders.value.slice((page.value - 1) * 20, page.value * 20));
const customers = computed(() => (result.value?.customers ?? []).filter((c) => !recurringOnly.value || c.recurring));
const clusters = computed(() =>
  (result.value?.clusters ?? []).filter((c) => (clusterScope.value === "branch" ? !!c.networkBranch : !c.networkBranch))
);
const severity = { low: "Baixa", medium: "Média", high: "Alta" };
watch([search, selectedIds], () => {
  page.value = 1;
  expanded.value = null;
});
watch(recurringOnly, () => {
  customerPage.value = 1;
});
watch(clusterScope, () => {
  clusterPage.value = 1;
});
async function loadSubjects() {
  subjectController?.abort();
  subjectController = new AbortController();
  const active = subjectController;
  loadingSubjects.value = true;
  subjectError.value = "";
  try {
    const data = await orderAnalysisApi.subjects(active.signal);
    if (active.signal.aborted) return;
    subjects.value = data.subjects;
    configured.value = data.configured;
    provider.value = data.provider;
  } catch (e) {
    if (!active.signal.aborted) subjectError.value = queryErrorMessage(e);
  } finally {
    if (subjectController === active) loadingSubjects.value = false;
  }
}
async function analyze() {
  if (!canAnalyze.value || loading.value) return;
  if (Date.parse(filters.to) - Date.parse(filters.from) > 365 * 86400000) {
    error.value = "Selecione um período de até 366 dias.";
    return;
  }
  controller = new AbortController();
  const active = controller;
  loading.value = true;
  error.value = "";
  try {
    const data = await orderAnalysisApi.analyze({ ...filters }, active.signal);
    if (active.signal.aborted) return;
    result.value = data;
    selectedIds.value = null;
    search.value = "";
    page.value = 1;
    customerPage.value = 1;
    clusterPage.value = 1;
    expanded.value = null;
  } catch (e) {
    if (!active.signal.aborted) error.value = queryErrorMessage(e);
  } finally {
    if (controller === active) loading.value = false;
  }
}
function cancel() {
  controller?.abort();
  loading.value = false;
}
function showEvidence(ids: number[], label: string) {
  selectedIds.value = ids;
  evidenceLabel.value = label;
  document.getElementById("analysis-evidence")?.scrollIntoView({ behavior: "auto", block: "start" });
}
// Refreshing the header must not silently start another paid AI request.
const refresh = inject(upgradesRefreshKey, ref(0));
watch(refresh, () => {
  if (!loading.value) void loadSubjects();
});
onMounted(loadSubjects);
onBeforeUnmount(() => {
  controller?.abort();
  subjectController?.abort();
});
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Inteligência de suporte</p>
        <h1 class="flex items-center gap-2 text-2xl font-bold">
          <Sparkles class="h-6 w-6 text-indigo-600" aria-hidden="true" />Análise de ordens de serviço
        </h1>
        <p class="mt-2 max-w-3xl text-sm text-slate-500">
          Revise relatos, identifique clientes com recorrência e investigue concentrações por cidade e ramal de rede.
        </p>
      </div>
      <span class="pill bg-slate-100 text-slate-700">Consulta sob demanda</span>
    </div>

    <form class="panel space-y-4 p-5" @submit.prevent="analyze" :aria-busy="loading">
      <div class="grid items-end gap-4 md:grid-cols-[minmax(220px,2fr)_1fr_1fr_auto]">
        <SearchableSelect
          v-model="filters.subjectId"
          :options="subjectOptions"
          label="Assunto da OS"
          placeholder="Selecione um assunto"
          :loading="loadingSubjects"
          :disabled="loading"
        />
        <label class="block text-sm font-medium"
          >Abertas de<input v-model="filters.from" type="date" required class="input mt-1" :max="filters.to" :disabled="loading"
        /></label>
        <label class="block text-sm font-medium"
          >Até<input v-model="filters.to" type="date" required class="input mt-1" :min="filters.from" :disabled="loading"
        /></label>
        <button type="submit" class="button-primary min-h-11" :disabled="!canAnalyze || loading || loadingSubjects">
          <Loader2 v-if="loading" class="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /><Sparkles
            v-else
            class="h-4 w-4"
            aria-hidden="true"
          />{{ loading ? "Analisando…" : "Analisar ordens" }}
        </button>
      </div>
      <p class="text-xs text-slate-500">
        Período pela data de abertura, em Brasília. Inclui todos os status. Até 366 dias e 5.000 OS. O resumo por IA processa as mensagens
        em lotes e pode levar alguns minutos.
      </p>
      <p class="text-xs text-slate-500">
        Ao analisar, os textos são enviados ao provedor configurado ({{ providerLabel }}) com redução de dados pessoais. Nomes e contatos
        estruturados não são enviados; a remoção de dados dentro das mensagens é automática e pode ser incompleta.
      </p>
      <div v-if="subjectError" role="alert" class="flex flex-wrap items-center gap-3 text-sm text-red-700">
        {{ subjectError }}<button type="button" class="button-secondary" @click="loadSubjects">Recarregar assuntos</button>
      </div>
      <p v-if="!loadingSubjects && !subjectError && !configured" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        IA ainda não configurada. É possível consultar recorrências e vínculos; cadastre a chave em Configurações → Inteligência artificial.
        <RouterLink v-if="auth.isAdmin" to="/settings/ai" class="font-semibold underline">Configurar IA</RouterLink>
      </p>
      <p v-if="error" role="alert" class="text-sm text-red-700">{{ error }}</p>
      <div v-if="loading" role="status" class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4 text-sm">
        <span>Coletando OS, revisando mensagens e consolidando o relatório. Aguarde a conclusão.</span
        ><button type="button" class="button-secondary" @click="cancel"><X class="h-4 w-4" aria-hidden="true" />Cancelar</button>
      </div>
    </form>

    <div v-if="changed" role="status" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
      Os filtros foram alterados. O relatório abaixo ainda corresponde a {{ result?.subject.name }}, de {{ result?.filters.from }} até
      {{ result?.filters.to }}. Clique em Analisar ordens para atualizar.
    </div>
    <template v-if="result">
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span
          >{{ result.subject.name }} · {{ result.filters.from }} a {{ result.filters.to }} · {{ result.messageCount }} mensagens de
          histórico</span
        ><span>Consultado em {{ new Date(result.queriedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) }}</span>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div
          v-for="card in [
            { label: 'Ordens encontradas', value: result.totals.orders, icon: Wrench },
            { label: 'Clientes vinculados', value: result.totals.customers, icon: Users },
            { label: 'Clientes com 2 ou mais OS', value: result.totals.recurringCustomers, icon: Repeat2 },
            { label: 'Cidades identificadas', value: result.clusters.filter((c) => !c.networkBranch).length, icon: MapPin },
          ]"
          :key="card.label"
          class="panel p-4"
        >
          <div class="flex items-center justify-between gap-2 text-sm text-slate-500">
            {{ card.label }}<component :is="card.icon" class="h-4 w-4" aria-hidden="true" />
          </div>
          <strong class="mt-2 block text-3xl">{{ card.value.toLocaleString("pt-BR") }}</strong>
        </div>
      </div>
      <section v-if="!result.totals.orders" class="panel p-10 text-center">
        <Search class="mx-auto mb-3 h-8 w-8 text-slate-400" aria-hidden="true" />
        <h2 class="font-semibold">Nenhuma OS encontrada</h2>
        <p class="mt-2 text-sm text-slate-500">Escolha outro assunto ou amplie o período.</p>
      </section>
      <template v-else>
        <section class="panel space-y-4 p-5" aria-labelledby="ai-report-title">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 id="ai-report-title" class="flex items-center gap-2 text-lg font-semibold">
              <Sparkles class="h-5 w-5 text-indigo-600" aria-hidden="true" />Revisão por IA
            </h2>
            <span v-if="result.ai.status === 'completed'" class="text-xs text-slate-500"
              >{{ result.ai.provider === "gemini" ? "Google Gemini" : "OpenAI" }} · {{ result.ai.model }} ·
              {{ result.ai.batches }} lote(s)</span
            >
          </div>
          <p v-if="result.ai.message" role="status" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{{ result.ai.message }}</p>
          <template v-if="result.ai.report">
            <p class="whitespace-pre-wrap text-sm leading-relaxed">{{ result.ai.report.summary }}</p>
            <div class="grid gap-3 lg:grid-cols-2">
              <article v-for="(finding, i) in result.ai.report.findings" :key="i" class="rounded-xl border border-slate-200 p-4">
                <div class="flex items-start justify-between gap-3">
                  <h3 class="font-semibold">{{ finding.title }}</h3>
                  <span class="pill shrink-0 bg-slate-100 text-slate-700">Prioridade {{ severity[finding.severity] }}</span>
                </div>
                <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{{ finding.assessment }}</p>
                <button type="button" class="button-secondary mt-3 !px-3 !py-2" @click="showEvidence(finding.orderIds, finding.title)">
                  Ver {{ finding.orderIds.length }} OS de evidência
                </button>
              </article>
            </div>
            <div class="grid gap-5 md:grid-cols-2">
              <div v-if="result.ai.report.actions.length">
                <h3 class="font-semibold">Próximas ações</h3>
                <ul class="mt-2 list-disc space-y-2 pl-5 text-sm">
                  <li v-for="action in result.ai.report.actions" :key="action">{{ action }}</li>
                </ul>
              </div>
              <div v-if="result.ai.report.limitations.length">
                <h3 class="font-semibold">Limitações da revisão</h3>
                <ul class="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-500">
                  <li v-for="limitation in result.ai.report.limitations" :key="limitation">{{ limitation }}</li>
                </ul>
              </div>
            </div>
          </template>
          <p class="border-t border-slate-200 pt-3 text-xs text-slate-500">
            Recorrência é a repetição de OS do mesmo assunto por cliente no período. Coincidências de cidade ou ramal sugerem investigação;
            a causa depende de confirmação técnica. A conexão e os vínculos de rede representam o cadastro atual.
          </p>
          <ul v-if="result.warnings.length" class="list-disc space-y-1 pl-5 text-xs text-amber-800">
            <li v-for="warning in result.warnings" :key="warning">{{ warning }}</li>
          </ul>
          <p v-if="result.totals.withoutText || result.totals.missingCustomer" class="text-xs text-slate-500">
            {{ result.totals.withoutText }} OS sem texto para revisão · {{ result.totals.missingCustomer }} sem cliente localizado.
          </p>
        </section>

        <section class="panel overflow-hidden" aria-labelledby="analysis-clusters-title">
          <div class="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h2 id="analysis-clusters-title" class="font-semibold">Concentração por localização</h2>
              <p class="mt-1 text-xs text-slate-500">
                Ramal identificado como transmissor:ramal da ONU do login da OS. Vínculos ausentes ou ambíguos ficam sem agrupamento.
              </p>
            </div>
            <label class="text-sm"
              >Agrupar por<select v-model="clusterScope" class="input mt-1">
                <option value="branch">Cidade e ramal</option>
                <option value="city">Cidade</option>
              </select></label
            >
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th class="px-5 py-3" scope="col">Cidade / ramal</th>
                  <th class="px-5 py-3" scope="col">Clientes distintos</th>
                  <th class="px-5 py-3" scope="col">OS</th>
                  <th class="px-5 py-3" scope="col">Evidências</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="(group, i) in clusters.slice((clusterPage - 1) * 10, clusterPage * 10)" :key="i">
                  <td class="px-5 py-3">
                    {{ group.city
                    }}<span v-if="group.networkBranch" class="mt-1 block text-xs text-slate-500">Ramal {{ group.networkBranch }}</span>
                  </td>
                  <td class="px-5 py-3">{{ group.customers }}</td>
                  <td class="px-5 py-3">{{ group.orders }}</td>
                  <td class="px-5 py-3">
                    <button
                      class="button-secondary !px-3 !py-1.5"
                      type="button"
                      @click="showEvidence(group.orderIds, `${group.city} ${group.networkBranch ?? ''}`)"
                    >
                      Ver OS
                    </button>
                  </td>
                </tr>
                <tr v-if="!clusters.length">
                  <td colspan="4" class="px-5 py-6 text-center text-slate-500">Nenhum vínculo confirmado para este agrupamento.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="clusters.length > 10" class="flex items-center justify-end gap-3 p-3 text-sm">
            <button type="button" class="button-secondary" :disabled="clusterPage === 1" @click="clusterPage--">Anterior</button
            ><span>{{ clusterPage }} / {{ Math.ceil(clusters.length / 10) }}</span
            ><button type="button" class="button-secondary" :disabled="clusterPage * 10 >= clusters.length" @click="clusterPage++">
              Próxima
            </button>
          </div>
        </section>

        <section class="panel overflow-hidden" aria-labelledby="analysis-customers-title">
          <div class="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h2 id="analysis-customers-title" class="font-semibold">Acompanhamento dos clientes</h2>
              <p class="mt-1 text-xs text-slate-500">
                Conexão atual apenas dos logins vinculados às OS. Atualize a análise para consultar novamente.
              </p>
            </div>
            <label class="flex items-center gap-2 text-sm"><input v-model="recurringOnly" type="checkbox" />Somente recorrentes</label>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th scope="col" class="px-5 py-3">Cliente</th>
                  <th scope="col" class="px-5 py-3">OS no período</th>
                  <th scope="col" class="px-5 py-3">Última abertura</th>
                  <th scope="col" class="px-5 py-3">Logins vinculados agora</th>
                  <th scope="col" class="px-5 py-3">Evidências</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="customer in customers.slice((customerPage - 1) * 10, customerPage * 10)" :key="customer.id">
                  <td class="px-5 py-3">
                    <RouterLink
                      v-if="auth.can('support.customer.view')"
                      :to="`/support/customers/${customer.id}`"
                      class="font-medium text-indigo-600 underline"
                      >{{ customer.name ?? `Cliente #${customer.id}` }}</RouterLink
                    ><span v-else>{{ customer.name ?? `Cliente #${customer.id}` }}</span>
                  </td>
                  <td class="px-5 py-3">
                    {{ customer.total }}<span v-if="customer.recurring" class="mt-1 block text-xs text-amber-800">Recorrente</span>
                  </td>
                  <td class="whitespace-nowrap px-5 py-3">{{ formatIxcDateTime(customer.lastOpenedAt) }}</td>
                  <td class="px-5 py-3 text-xs">
                    <template v-if="customer.linkedLogins"
                      >{{ customer.online }} online · {{ customer.offline }} offline · {{ customer.unknownConnection }} sem
                      informação</template
                    ><span v-else class="text-slate-500">Sem login confirmado</span>
                  </td>
                  <td class="px-5 py-3">
                    <button
                      type="button"
                      class="button-secondary !px-3 !py-1.5"
                      @click="showEvidence(customer.orderIds, customer.name ?? `Cliente #${customer.id}`)"
                    >
                      Ver OS
                    </button>
                  </td>
                </tr>
                <tr v-if="!customers.length">
                  <td colspan="5" class="px-5 py-6 text-center text-slate-500">Nenhum cliente para este filtro.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="customers.length > 10" class="flex items-center justify-end gap-3 p-3 text-sm">
            <button type="button" class="button-secondary" :disabled="customerPage === 1" @click="customerPage--">Anterior</button
            ><span>{{ customerPage }} / {{ Math.ceil(customers.length / 10) }}</span
            ><button type="button" class="button-secondary" :disabled="customerPage * 10 >= customers.length" @click="customerPage++">
              Próxima
            </button>
          </div>
        </section>

        <section id="analysis-evidence" class="panel scroll-mt-4 p-5" aria-labelledby="analysis-evidence-title">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 id="analysis-evidence-title" class="font-semibold">Ordens e mensagens de evidência</h2>
            <label class="flex items-center gap-2 text-sm"
              ><Search class="h-4 w-4" aria-hidden="true" /><span class="sr-only">Buscar OS por ID, cliente, cidade ou ramal</span
              ><input v-model="search" class="input" placeholder="Buscar nas OS coletadas" type="search"
            /></label>
          </div>
          <div v-if="selectedIds" class="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span>Filtro: {{ evidenceLabel }}</span
            ><button type="button" class="button-secondary !py-1" @click="selectedIds = null">Mostrar todas</button>
          </div>
          <p class="my-3 text-xs text-slate-500">
            {{ filteredOrders.length }} OS · clique em uma ordem para revisar descrição, resposta e histórico.
          </p>
          <div class="divide-y divide-slate-200">
            <article v-for="order in orders" :key="order.id" class="py-3">
              <button
                type="button"
                class="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                :aria-expanded="expanded === order.id"
                :aria-controls="`order-evidence-${order.id}`"
                @click="expanded = expanded === order.id ? null : order.id"
              >
                <span
                  ><strong>OS #{{ order.id }}</strong> · {{ order.customerName ?? "Cliente não localizado"
                  }}<span class="mt-1 block text-xs text-slate-500"
                    >{{ order.city ?? "Cidade não informada" }} · Ramal {{ order.networkBranch ?? "não confirmado" }} ·
                    {{ formatIxcDateTime(order.openedAt) }}</span
                  ></span
                ><span class="flex items-center gap-3"
                  ><SupportCaseStatus :status="order.status" kind="orders" /><span class="text-xs text-indigo-600">{{
                    expanded === order.id ? "Recolher" : "Ver mensagens"
                  }}</span></span
                >
              </button>
              <div
                v-if="expanded === order.id"
                :id="`order-evidence-${order.id}`"
                class="mt-3 space-y-4 rounded-lg bg-slate-50 p-4 text-sm"
              >
                <p v-if="order.truncated" class="text-xs text-amber-800">Há textos abreviados a 6.000 caracteres nesta OS.</p>
                <div>
                  <h3 class="font-semibold">Descrição</h3>
                  <p class="mt-1 whitespace-pre-wrap break-words">{{ order.message ?? "Não informada." }}</p>
                </div>
                <div>
                  <h3 class="font-semibold">Resposta / execução</h3>
                  <p class="mt-1 whitespace-pre-wrap break-words">{{ order.response ?? "Não informada." }}</p>
                </div>
                <div>
                  <h3 class="font-semibold">Histórico de mensagens ({{ order.messages.length }})</h3>
                  <ol class="mt-2 space-y-3">
                    <li v-for="(message, i) in order.messages" :key="i" class="border-l-2 border-slate-300 pl-3">
                      <time class="text-xs text-slate-500">{{ formatIxcDateTime(message.date) }}</time>
                      <p class="mt-1 whitespace-pre-wrap break-words">{{ message.body ?? "Sem texto." }}</p>
                    </li>
                  </ol>
                  <p v-if="!order.messages.length" class="mt-1 text-slate-500">Nenhuma mensagem de histórico.</p>
                </div>
              </div>
            </article>
          </div>
          <p v-if="!orders.length" class="py-5 text-center text-sm text-slate-500">Nenhuma OS para esta busca.</p>
          <div v-if="filteredOrders.length > 20" class="mt-3 flex flex-wrap items-center justify-end gap-3 text-sm">
            <button
              type="button"
              class="button-secondary"
              :disabled="page === 1"
              @click="
                page--;
                expanded = null;
              "
            >
              Anterior</button
            ><span>{{ page }} / {{ Math.ceil(filteredOrders.length / 20) }}</span
            ><button
              type="button"
              class="button-secondary"
              :disabled="page * 20 >= filteredOrders.length"
              @click="
                page++;
                expanded = null;
              "
            >
              Próxima
            </button>
          </div>
        </section>
      </template>
    </template>
    <section v-else-if="!loading" class="panel p-10 text-center">
      <Sparkles class="mx-auto mb-3 h-9 w-9 text-indigo-600" aria-hidden="true" />
      <h2 class="font-semibold">Um assunto, todas as evidências do período</h2>
      <p class="mx-auto mt-2 max-w-xl text-sm text-slate-500">
        Selecione o assunto e as datas para cruzar os relatos com os clientes e a rede. A análise começa quando você clicar em Analisar
        ordens.
      </p>
    </section>
  </div>
</template>
