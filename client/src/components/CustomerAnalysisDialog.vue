<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Headset,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Smile,
  Wallet,
  Wifi,
  X,
} from "lucide-vue-next";
import { supportApi, type CustomerAnalysis, type AnalysisCategory } from "../supportApi";
import { formatConsulted } from "../upgradesApi";
import RiskBadge from "./RiskBadge.vue";

const props = defineProps<{ customerId: string; customerName: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLElement>();
const analysis = ref<CustomerAnalysis | null>(null);
const selectedId = ref<number>();
const loading = ref(true),
  error = ref("");
const selected = computed(() => analysis.value?.contracts.find((contract) => contract.id === selectedId.value));
const returnFocus = document.activeElement as HTMLElement | null;
const appRoot = document.getElementById("app");
const previousInert = appRoot?.inert ?? false;
const previousOverflow = document.body.style.overflow;
let controller: AbortController | undefined;
const categories = [
  {
    key: "financial",
    label: "Financeiro",
    max: 30,
    icon: Wallet,
    sources: ["financial"],
    action:
      "Valide as faturas e os bloqueios recentes. Entenda a dificuldade de pagamento e as opções disponíveis antes de oferecer uma solução.",
  },
  {
    key: "support",
    label: "Suporte",
    max: 25,
    icon: Headset,
    sources: ["tickets", "orders"],
    action: "Revise os atendimentos recorrentes, pendências e prazos. Combine um próximo passo claro e acompanhe a resolução do problema.",
  },
  {
    key: "network",
    label: "Conexão",
    max: 25,
    icon: Wifi,
    sources: ["logins", "sessions", "usage"],
    action:
      "Verifique o estado dos logins, as sessões e os motivos de desconexão. Confirme com o cliente o impacto da instabilidade antes de concluir o diagnóstico.",
  },
  {
    key: "contract",
    label: "Contrato",
    max: 10,
    icon: FileText,
    sources: ["contracts"],
    action: "Confirme a permanência e os bloqueios ou suspensões. Converse sobre a adequação do plano e a necessidade atual do cliente.",
  },
  {
    key: "satisfaction",
    label: "Satisfação",
    max: 10,
    icon: Smile,
    sources: ["customer"],
    action: "Investigue o motivo da insatisfação e registre uma expectativa objetiva para o próximo atendimento no fluxo habitual.",
  },
] as const;
const incomplete = (key: AnalysisCategory) =>
  categories
    .find((category) => category.key === key)
    ?.sources.some((key) => analysis.value?.sources.some((source) => source.key === key && source.status === "unavailable"));
const priorities = computed(() =>
  categories
    .filter((category) => selected.value?.reasons.some((reason) => reason.category === category.key))
    .sort((a, b) => (selected.value?.factors[b.key] ?? 0) - (selected.value?.factors[a.key] ?? 0))
);
const load = async () => {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  analysis.value = null;
  error.value = "";
  loading.value = true;
  try {
    const result = await supportApi.analyze(props.customerId, request.signal);
    if (request.signal.aborted) return;
    analysis.value = result;
    selectedId.value = result.contracts[0]?.id;
  } catch (reason) {
    if (!request.signal.aborted) error.value = reason instanceof Error ? reason.message : "Não foi possível analisar o cliente.";
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
};
const close = () => {
  controller?.abort();
  analysis.value = null;
  emit("close");
};
onMounted(async () => {
  if (appRoot) appRoot.inert = true;
  document.body.style.overflow = "hidden";
  await nextTick();
  dialog.value?.querySelector<HTMLButtonElement>("button")?.focus();
  void load();
});
onUnmounted(() => {
  controller?.abort();
  analysis.value = null;
  if (appRoot) appRoot.inert = previousInert;
  document.body.style.overflow = previousOverflow;
  if (returnFocus?.isConnected) returnFocus.focus();
});
const keydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "Tab") return;
  const items = [
    ...(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') ?? []),
  ].filter((element) => element.getClientRects().length);
  const first = items[0],
    last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
};
</script>
<template>
  <Teleport to="body">
    <div
      data-module="support"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm sm:p-5"
      @click.self="close"
      @keydown="keydown"
    >
      <section
        ref="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-analysis-title"
        aria-describedby="customer-analysis-discard"
        class="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <header class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div class="min-w-0">
            <h2 id="customer-analysis-title" class="flex items-center gap-2 text-base font-bold">
              <ShieldAlert class="h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />Análise de risco de cancelamento
            </h2>
            <p class="mt-1 break-words text-xs text-slate-500">{{ customerName }} · Cliente #{{ customerId }}</p>
          </div>
          <button
            type="button"
            class="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Fechar e descartar análise"
            @click="close"
          >
            <X class="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div class="overflow-y-auto px-4 py-4 sm:px-5">
          <p
            id="customer-analysis-discard"
            class="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
          >
            <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span
              >Consulta ao vivo, sem salvar dados. Ao fechar, esta análise será perdida. Para vê-la novamente, será necessário consultar o
              IXC outra vez.</span
            >
          </p>
          <div v-if="loading" role="status" class="flex min-h-44 flex-col items-center justify-center gap-3 text-sm text-slate-500">
            <LoaderCircle class="h-6 w-6 animate-spin text-indigo-600" aria-hidden="true" />
            <p>Consultando as fontes do Churn no IXC…</p>
            <p class="text-xs">Cadastro, contratos, financeiro, suporte e conexão.</p>
          </div>
          <div v-else-if="error" role="alert" class="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <p>{{ error }}</p>
            <button type="button" class="button-secondary mt-3 text-xs" @click="load">
              <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Tentar novamente
            </button>
          </div>
          <template v-else-if="analysis">
            <p v-if="analysis.message" class="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{{ analysis.message }}</p>
            <p v-if="analysis.partial" role="alert" class="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <strong>Análise parcial.</strong> Algumas fontes não puderam ser consultadas. O score contém somente os sinais disponíveis e
              pode subestimar o risco; consulte as fontes abaixo.
            </p>
            <template v-if="selected">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div class="w-full min-w-0 sm:w-auto sm:flex-1">
                  <label v-if="analysis.contracts.length > 1" class="block text-xs font-semibold text-slate-500"
                    >Contrato analisado<select v-model="selectedId" class="input mt-1 !py-2 text-xs">
                      <option v-for="contract in analysis.contracts" :key="contract.id" :value="contract.id">
                        #{{ contract.id }} · {{ contract.name }} · Score {{ contract.score }}
                      </option>
                    </select></label
                  >
                  <template v-else
                    ><p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Contrato #{{ selected.id }}</p>
                    <p class="mt-1 break-words text-sm font-semibold">{{ selected.name }}</p></template
                  >
                </div>
                <div class="flex items-center gap-3">
                  <div>
                    <p class="text-[10px] font-semibold uppercase text-slate-500">
                      {{ analysis.partial ? "Score parcial" : "Risco atual" }}
                    </p>
                    <span class="text-3xl font-extrabold tabular-nums">{{ selected.score }}</span
                    ><span class="text-xs text-slate-400"> / 100</span>
                  </div>
                  <RiskBadge v-if="!analysis.partial" :level="selected.level" />
                  <span v-else class="pill bg-amber-100 text-amber-700">INCOMPLETO</span>
                </div>
              </div>
              <p class="mb-3 text-[11px] leading-relaxed text-slate-500">
                Indicador calculado pelas mesmas regras do Churn; não representa uma probabilidade em %. Financeiro e permanência são do
                contrato. Suporte, conexão e satisfação consideram o cliente e seus logins ativos.
              </p>
              <div class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div v-for="category in categories" :key="category.key" class="rounded-xl border border-slate-200 px-3 py-2.5">
                  <p class="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <component :is="category.icon" class="h-3.5 w-3.5" aria-hidden="true" />{{ category.label }}
                  </p>
                  <p class="mt-1 text-lg font-bold tabular-nums">
                    {{ selected.factors[category.key] }}<span class="text-[11px] font-normal text-slate-400"> / {{ category.max }}</span>
                  </p>
                  <p v-if="incomplete(category.key)" class="mt-1 text-[10px] text-amber-700">Dados parciais</p>
                </div>
              </div>
              <div class="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
                <section class="min-w-0">
                  <h3 class="mb-2 flex items-center gap-2 text-sm font-bold">
                    <Activity class="h-4 w-4 text-indigo-600" aria-hidden="true" />Motivos do risco
                  </h3>
                  <ul v-if="selected.reasons.length" class="space-y-1.5">
                    <li
                      v-for="reason in selected.reasons"
                      :key="reason.code"
                      class="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                    >
                      <span class="shrink-0 rounded-md bg-rose-100 px-1.5 py-0.5 font-bold text-rose-700">+{{ reason.points }}</span>
                      <div>
                        <p class="leading-relaxed">{{ reason.description }}</p>
                        <p class="mt-0.5 text-[10px] text-slate-400">
                          {{ categories.find((category) => category.key === reason.category)?.label }}
                        </p>
                      </div>
                    </li>
                  </ul>
                  <p v-else class="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                    Nenhum motivo pontuado nas informações disponíveis. Isso não garante ausência de risco de cancelamento.
                  </p>
                  <p class="mt-2 text-[10px] leading-relaxed text-slate-400">
                    Os limites por categoria podem reduzir a soma dos pontos dos motivos. Sessões e consumo seguem as métricas atuais do
                    Churn.
                  </p>
                </section>
                <section class="min-w-0">
                  <h3 class="mb-2 flex items-center gap-2 text-sm font-bold">
                    <ClipboardList class="h-4 w-4 text-indigo-600" aria-hidden="true" />Prioridades para o atendimento
                  </h3>
                  <div v-for="category in priorities" :key="category.key" class="mb-2 rounded-lg border border-slate-200 p-3">
                    <p class="mb-1 text-xs font-bold">{{ category.label }}</p>
                    <p class="text-[11px] leading-relaxed text-slate-500">{{ category.action }}</p>
                  </div>
                  <p v-if="analysis.partial" class="mb-2 text-xs leading-relaxed text-amber-700">
                    Consulte novamente as fontes indisponíveis antes de concluir a avaliação de risco.
                  </p>
                  <p v-if="!priorities.length" class="text-xs leading-relaxed text-slate-500">
                    Confirme a experiência atual do cliente e suas necessidades antes de encerrar a validação.
                  </p>
                </section>
              </div>
            </template>
            <details :open="analysis.partial" class="mt-4 rounded-xl border border-slate-200 px-3 py-2">
              <summary class="cursor-pointer text-xs font-semibold">
                Fontes consultadas · {{ analysis.sources.filter((source) => source.status === "ok").length }}/{{
                  analysis.sources.length
                }}
                disponíveis{{ analysis.warnings.length ? ` · ${analysis.warnings.length} observações` : "" }}
              </summary>
              <ul class="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
                <li v-for="source in analysis.sources" :key="source.key" class="flex items-start gap-1.5">
                  <CheckCircle2
                    v-if="source.status === 'ok'"
                    class="h-3.5 w-3.5 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  /><AlertTriangle v-else class="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" /><span
                    >{{ source.label }} ·
                    {{ source.status === "ok" ? `${source.count} registros` : "Indisponível ou consulta incompleta" }}</span
                  >
                </li>
              </ul>
              <ul v-if="analysis.warnings.length" class="mt-3 space-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                <li v-for="warning in analysis.warnings" :key="warning">{{ warning }}</li>
              </ul>
            </details>
            <p class="mt-3 text-[10px] text-slate-400">Consultado em {{ formatConsulted(analysis.queriedAt) }} · Brasília</p>
          </template>
        </div>
        <footer class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          <span class="text-[10px] text-slate-400">Análise temporária · Consulta somente leitura</span
          ><button type="button" class="button-primary text-xs" @click="close">
            {{ loading ? "Cancelar consulta" : "Fechar e descartar" }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
