<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { TrendingUp } from "lucide-vue-next";
import { portfolioEvolution, type PortfolioMode, type PortfolioYear } from "../providerAnalyticsApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import ProviderAnalyticsChart from "./ProviderAnalyticsChart.vue";
import LiveQueryState from "./LiveQueryState.vue";
const props = defineProps<{ year: PortfolioYear; mode: PortfolioMode }>();
const emit = defineEmits<{ "update:year": [year: PortfolioYear]; "update:mode": [mode: PortfolioMode] }>();
const currentYear = Number(
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date()).slice(0, 4)
);
const earliestYear = ref(currentYear);
const { data, loading, error, reload } = useLiveQuery((signal) => portfolioEvolution(props.year, signal, props.mode));
watch(() => [props.year, props.mode], reload);
watch(data, (value) => {
  if (value) earliestYear.value = value.earliestYear;
});
const years = computed(() =>
  Array.from(
    { length: currentYear - Math.min(earliestYear.value, props.year === "all" ? currentYear : props.year) + 1 },
    (_, i) => currentYear - i
  )
);
const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const number = (n: number) => n.toLocaleString("pt-BR");
const entryLabel = computed(() => (props.mode === "general" ? "Ativações acumuladas" : "Ativações"));
const cancellationLabel = computed(() => (props.mode === "general" ? "Churn acumulado (IXC)" : "Churn (IXC)"));
const percentageLabel = computed(() => (props.mode === "general" ? "Crescimento acumulado (%)" : "Crescimento do mês (%)"));
const balanceLabel = computed(() => (props.mode === "general" ? "Saldo acumulado" : "Saldo do mês"));
const labels = computed(() => (data.value?.granularity === "year" ? data.value.series.map((row) => row.month) : months));
const balances = computed(
  () =>
    data.value?.series.map((row) =>
      row.activations === null || row.cancellations === null ? null : row.activations - row.cancellations
    ) ?? []
);
function selectMode(mode: PortfolioMode) {
  emit("update:mode", mode);
  if (mode === "general") emit("update:year", "all");
  else if (props.year === "all") emit("update:year", currentYear);
}
function selectYear(event: Event) {
  const year = (event.target as HTMLSelectElement).value;
  emit("update:year", year === "all" ? "all" : Number(year));
}
</script>
<template>
  <div class="portfolio-year-header">
    <TrendingUp class="h-4 w-4" aria-hidden="true" />
    <h2>Evolução da carteira</h2>
    <div class="portfolio-mode-control" role="group" aria-label="Critério da evolução da carteira">
      <button type="button" :aria-pressed="mode === 'general'" @click="selectMode('general')">Geral</button>
      <button type="button" :aria-pressed="mode === 'activation'" @click="selectMode('activation')">Ativação</button>
    </div>
    <label class="portfolio-year-control">
      <span>Ano</span>
      <select class="input" :value="year" @change="selectYear">
        <option v-if="mode === 'general'" value="all">Todos</option>
        <option v-for="option in years" :key="option" :value="option">{{ option }}</option>
      </select>
    </label>
  </div>
  <LiveQueryState :loading="loading" :error="error" @retry="reload" />
  <template v-if="data && !loading && !error">
    <div class="portfolio-year-stats">
      <div>
        <small>{{
          mode === "general"
            ? "Ativações acumuladas"
            : data.activationDefinition.source === "serviceOrders"
              ? "Ativações · OS finalizadas"
              : "Ativações registradas"
        }}</small
        ><strong>{{ number(data.activations) }}</strong>
      </div>
      <div>
        <small>{{ mode === "general" ? "Churn acumulado (IXC)" : "Churn no IXC" }}</small
        ><strong>{{ number(data.cancellations) }}</strong>
      </div>
      <div>
        <small>{{ mode === "general" ? "Saldo acumulado" : "Saldo de eventos" }}</small
        ><strong>{{ data.eventBalance > 0 ? "+" : "" }}{{ number(data.eventBalance) }}</strong>
      </div>
    </div>
    <ProviderAnalyticsChart
      :labels="labels"
      :first="data.series.map((row) => row.activations)"
      :second="data.series.map((row) => row.cancellations)"
      :names="[entryLabel, cancellationLabel]"
      :balance="balances"
      :balance-name="balanceLabel"
      :percentage="data.series.map((row) => row.growth ?? null)"
      :percentage-name="percentageLabel"
      :monthly="data.granularity === 'month'"
      :yearly="data.granularity === 'year'"
      smooth
    />
    <details class="portfolio-growth-explanation portfolio-year-caption">
      <summary>Como calculamos o crescimento</summary>
      <p class="mt-2">
        <template v-if="mode === 'general'">
          (Ativações acumuladas − churn acumulado) ÷ ativações acumuladas × 100. Cada
          {{ data.granularity === "year" ? "ano" : "mês" }} inclui todo o histórico até seu encerramento, inclusive os anos anteriores. Sem
          percentual quando não há ativações acumuladas.
        </template>
        <template v-else>
          (Ativações do mês − churn do mês) ÷ ativações do mês × 100. Compara somente os eventos do próprio mês; sem percentual quando não
          há ativações.
        </template>
        <template v-if="data.year === 'all' || data.year === data.currentYear"
          >O período atual considera somente os dados até hoje.</template
        >
        O percentual representa o saldo sobre os contratos considerados, sem ser uma taxa de churn.
      </p>
    </details>
    <p class="portfolio-year-caption">
      <template v-if="data.granularity === 'year'"
        >Evolução por anos · {{ data.earliestYear }} a {{ data.currentYear }}. Ano atual parcial até
        {{ data.through.split("-").reverse().join("/") }}.</template
      >
      <template v-else>Janeiro a dezembro de {{ data.year }} · independente do período do painel.</template>
      <template v-if="data.year === data.currentYear"
        >Até {{ data.through.split("-").reverse().join("/") }}; mês atual parcial e meses futuros sem dados.</template
      >
    </p>
    <p class="portfolio-year-caption">
      <template v-if="mode === 'general'">
        Geral: ativações e churn acumulados até cada {{ data.granularity === "year" ? "ano" : "mês" }}, incluindo anos anteriores. Os
        indicadores acima mostram o acumulado até {{ data.through.split("-").reverse().join("/") }}; os valores do gráfico não são somados
        novamente.
      </template>
      <template v-else-if="data.activationDefinition.source === 'serviceOrders'">
        Ativações: OS finalizadas dos assuntos selecionados pelo administrador, pela data de fechamento. Cada OS conta um evento.
      </template>
      <template v-if="mode === 'general' || data.activationDefinition.source === 'contracts'">
        Ativações: contratos ativos ou cancelados pela data de ativação.
      </template>
      Churn IXC: contratos cancelados pela data de desativação do acesso, com motivo marcado para considerar churn. Sem substituir datas
      ausentes por cadastro ou cancelamento. Saldo líquido: ativações menos churn; não representa clientes únicos.
    </p>
  </template>
</template>
<style scoped>
.portfolio-year-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.9rem;
}
.portfolio-year-header h2 {
  font-size: 0.9rem;
  font-weight: 700;
}
.portfolio-year-control {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.65rem;
  color: var(--appearance-secondary);
}
.portfolio-mode-control {
  display: flex;
  gap: 0.15rem;
  margin-left: auto;
  padding: 0.15rem;
  background: var(--appearance-muted);
  border: 1px solid var(--appearance-border);
  border-radius: 0.5rem;
}
.portfolio-mode-control button {
  padding: 0.25rem 0.6rem;
  border-radius: 0.35rem;
  color: var(--appearance-secondary);
  font-size: 0.65rem;
  font-weight: 600;
}
.portfolio-mode-control button[aria-pressed="true"] {
  color: var(--appearance-primary-text);
  background: var(--appearance-surface);
  box-shadow: 0 1px 3px rgb(0 0 0 / 8%);
}
.portfolio-mode-control button:focus-visible {
  outline: 2px solid var(--appearance-primary);
  outline-offset: 1px;
}
.portfolio-year-control .input {
  height: 30px;
  min-height: 30px;
  width: 88px;
  padding: 0.2rem 0.5rem;
  font-size: 0.75rem;
  color: var(--appearance-text);
}
.portfolio-year-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
  margin-bottom: 0.85rem;
}
.portfolio-year-stats small {
  display: block;
  font-size: 0.65rem;
  color: var(--appearance-secondary);
}
.portfolio-year-stats strong {
  display: block;
  margin-top: 0.3rem;
  font-size: 1.1rem;
}
.portfolio-year-caption {
  margin-top: 0.7rem;
  font-size: 0.65rem;
  line-height: 1.6;
  color: var(--appearance-secondary);
}
.portfolio-growth-explanation summary {
  cursor: pointer;
  color: var(--appearance-primary-text);
}
</style>
