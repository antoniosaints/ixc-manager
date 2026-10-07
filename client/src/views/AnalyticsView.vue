<script setup lang="ts">
import { ChartNoAxesCombined, ChartPie } from "lucide-vue-next";

import { computed, onMounted, ref } from "vue";
import DonutChart from "../components/DonutChart.vue";
import { api } from "../api";

const dimensions = [
  { key: "cities", label: "Risco por localidade", measure: "Clientes alto/crítico" },
  { key: "plans", label: "Risco por plano", measure: "Clientes alto/crítico" },
  { key: "network-regions", label: "Risco por concentrador", measure: "Clientes alto/crítico" },
  { key: "cancellation-reasons", label: "Motivos de cancelamento", measure: "Cancelamentos" },
] as const;
const palette = ["#ef4444", "#f97316", "#f59e0b", "#14b8a6", "#06b6d4", "#6366f1", "#8b5cf6", "#94a3b8"];
const data = ref<Record<string, any[]>>({});
const error = ref("");
const loading = ref(true);
const valueFor = (dimension: string, row: any) => Number(dimension === "cancellation-reasons" ? row.total : (row.highRisk ?? 0));
const chartRows = computed<Record<string, Array<{ label: string; value: number }>>>(() =>
  Object.fromEntries(
    dimensions.map((dimension) => {
      const items = (data.value[dimension.key] ?? [])
        .map((row) => ({ label: String(row.label ?? "Não informado"), value: valueFor(dimension.key, row) }))
        .filter((row) => row.value > 0);
      const top = items.slice(0, 7);
      const remaining = items.slice(7).reduce((sum, row) => sum + row.value, 0);
      if (remaining) top.push({ label: "Outros", value: remaining });
      return [dimension.key, top];
    })
  )
);
const totalFor = (dimension: string) => (chartRows.value[dimension] ?? []).reduce((sum, row) => sum + row.value, 0);
onMounted(async () => {
  try {
    const results = await Promise.all(dimensions.map((dimension) => api.analytics(dimension.key)));
    data.value = Object.fromEntries(dimensions.map((dimension, index) => [dimension.key, results[index]?.items ?? []]));
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Falha ao carregar análise";
  } finally {
    loading.value = false;
  }
});
</script>
<template>
  <section class="mb-7">
    <p class="mb-2 text-sm font-semibold uppercase tracking-[.18em] text-cyan-700">Análise de retenção</p>
    <h1 class="text-3xl font-extrabold">
      <ChartNoAxesCombined class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />Sinais coletivos e histórico
    </h1>
    <p class="mt-1 text-slate-500">Distribuição dos principais grupos para priorizar as ações de retenção.</p>
  </section>
  <p v-if="error" class="text-red-600">{{ error }}</p>
  <div v-else class="grid gap-6 lg:grid-cols-2">
    <section v-for="dimension in dimensions" :key="dimension.key" class="panel overflow-hidden p-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-bold">
            <ChartPie class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />{{ dimension.label }}
          </h2>
          <p class="mt-1 text-sm text-slate-500">{{ dimension.measure }}</p>
        </div>
        <strong class="text-2xl text-ink">{{ totalFor(dimension.key).toLocaleString("pt-BR") }}</strong>
      </div>
      <div v-if="loading" class="grid h-60 place-items-center text-sm text-slate-500">
        <div class="flex flex-col items-center gap-2">
          <img src="/analytics-loader.svg" alt="" class="h-14 w-14" /><span>Carregando gráfico…</span>
        </div>
      </div>
      <DonutChart
        v-else-if="chartRows[dimension.key]?.length"
        :labels="chartRows[dimension.key].map((row) => row.label)"
        :values="chartRows[dimension.key].map((row) => row.value)"
        :colors="chartRows[dimension.key].map((_, index) => palette[index % palette.length])"
      />
      <p v-else class="grid h-60 place-items-center text-sm text-slate-500">Sem dados suficientes.</p>
      <ul v-if="!loading && chartRows[dimension.key]?.length" class="space-y-2 border-t border-slate-100 pt-4">
        <li v-for="(row, index) in chartRows[dimension.key]" :key="row.label" class="flex items-center justify-between gap-3 text-sm">
          <span class="flex min-w-0 items-center gap-2"
            ><i class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ backgroundColor: palette[index % palette.length] }" /><span
              class="truncate"
              >{{ row.label }}</span
            ></span
          >
          <strong>{{ row.value.toLocaleString("pt-BR") }}</strong>
        </li>
      </ul>
    </section>
  </div>
</template>
