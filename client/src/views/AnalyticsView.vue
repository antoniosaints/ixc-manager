<script setup lang="ts">
import { ChartNoAxesCombined, ChartPie, RefreshCw } from "lucide-vue-next";

import { computed, onMounted, onUnmounted } from "vue";
import DonutChart from "../components/DonutChart.vue";
import LoadErrorState from "../components/LoadErrorState.vue";
import { useChurnAnalytics, type ChurnAnalyticsDimension, type ChurnAnalyticsRow } from "../composables/useChurnAnalytics";

const dimensions = [
  { key: "cities", label: "Risco por localidade", measure: "Clientes alto/crítico" },
  { key: "plans", label: "Risco por plano", measure: "Clientes alto/crítico" },
  { key: "network-regions", label: "Risco por concentrador", measure: "Clientes alto/crítico" },
  { key: "cancellation-reasons", label: "Motivos de cancelamento", measure: "Cancelamentos" },
] as const;
const palette = ["#ef4444", "#f97316", "#f59e0b", "#14b8a6", "#06b6d4", "#6366f1", "#8b5cf6", "#94a3b8"];
const { cards, loading, load, loadAll, dispose } = useChurnAnalytics();
const valueFor = (dimension: string, row: ChurnAnalyticsRow) =>
  Number(dimension === "cancellation-reasons" ? row.total : (row.highRisk ?? 0));
const chartRows = computed<Record<string, Array<{ label: string; value: number }>>>(() =>
  Object.fromEntries(
    dimensions.map((dimension) => {
      const items = cards.value[dimension.key].items
        .map((row) => ({ label: String(row.label ?? "Não informado"), value: valueFor(dimension.key, row) }))
        .filter((row) => row.value > 0);
      const top = items.slice(0, 7);
      const remaining = items.slice(7).reduce((sum, row) => sum + row.value, 0);
      if (remaining) top.push({ label: "Outros", value: remaining });
      return [dimension.key, top];
    })
  )
);
const totalFor = (dimension: ChurnAnalyticsDimension) =>
  cards.value[dimension].loading || cards.value[dimension].error
    ? "—"
    : (chartRows.value[dimension] ?? []).reduce((sum, row) => sum + row.value, 0).toLocaleString("pt-BR");
onMounted(() => {
  void loadAll();
});
onUnmounted(dispose);
</script>
<template>
  <section class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-cyan-700">Análise de retenção</p>
      <h1 class="text-2xl font-extrabold tracking-tight">
        <ChartNoAxesCombined class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />Sinais coletivos e histórico
      </h1>
      <p class="mt-1 text-xs text-slate-500">Distribuição dos principais grupos para priorizar as ações de retenção.</p>
    </div>
    <button type="button" class="button-secondary" :disabled="loading" @click="loadAll">
      <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" aria-hidden="true" />
      {{ loading ? "Carregando análises…" : "Atualizar análises" }}
    </button>
  </section>
  <div class="grid gap-3 lg:grid-cols-2">
    <section
      v-for="dimension in dimensions"
      :key="dimension.key"
      class="panel analytics-card overflow-hidden"
      :aria-busy="cards[dimension.key].loading"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-bold">
            <ChartPie class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />{{ dimension.label }}
          </h2>
          <p class="mt-0.5 text-[11px] text-slate-500">{{ dimension.measure }}</p>
        </div>
        <strong class="text-xl tabular-nums text-ink">{{ totalFor(dimension.key) }}</strong>
      </div>
      <div v-if="cards[dimension.key].loading" class="grid h-44 place-items-center text-xs text-slate-500">
        <div class="flex flex-col items-center gap-2">
          <img src="/analytics-loader.svg" alt="" class="h-9 w-9" /><span>Carregando gráfico…</span>
        </div>
      </div>
      <LoadErrorState
        v-else-if="cards[dimension.key].error"
        :error="cards[dimension.key].error"
        title="Não foi possível carregar este gráfico"
        hint="Tente novamente para atualizar apenas este gráfico."
        @retry="load(dimension.key)"
      />
      <div v-else-if="chartRows[dimension.key]?.length" class="analytics-body">
        <div class="analytics-chart">
          <DonutChart
            :labels="chartRows[dimension.key].map((row) => row.label)"
            :values="chartRows[dimension.key].map((row) => row.value)"
            :colors="chartRows[dimension.key].map((_, index) => palette[index % palette.length])"
          />
        </div>
        <ul class="analytics-legend" :aria-label="`Valores de ${dimension.label.toLowerCase()}`" tabindex="0">
          <li v-for="(row, index) in chartRows[dimension.key]" :key="row.label" class="analytics-legend-row">
            <span class="flex min-w-0 items-center gap-2"
              ><i class="h-2 w-2 shrink-0 rounded-full" :style="{ backgroundColor: palette[index % palette.length] }" /><span
                class="analytics-legend-label"
                >{{ row.label }}</span
              ></span
            >
            <strong class="shrink-0 tabular-nums">{{ row.value.toLocaleString("pt-BR") }}</strong>
          </li>
        </ul>
      </div>
      <p v-else class="grid h-44 place-items-center text-xs text-slate-500">Sem dados suficientes.</p>
    </section>
  </div>
</template>
<style scoped>
.analytics-card {
  padding: 1rem;
}
.analytics-body {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
  min-height: 180px;
}
.analytics-chart {
  height: 160px;
  min-width: 0;
}
.analytics-legend {
  max-height: 180px;
  overflow-y: auto;
  padding-right: 0.25rem;
}
.analytics-legend-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.3rem 0;
  font-size: 0.75rem;
  line-height: 1rem;
}
.analytics-legend-label {
  overflow-wrap: anywhere;
}
@media (max-width: 639px) {
  .analytics-body {
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 0.75rem;
  }
  .analytics-chart {
    height: 120px;
  }
}
@media (max-width: 479px) {
  .analytics-body {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }
  .analytics-chart {
    width: 132px;
    height: 132px;
    justify-self: center;
  }
  .analytics-legend {
    max-height: none;
  }
}
</style>
