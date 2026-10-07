<script setup lang="ts">
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import { useAppearanceStore } from "../stores/appearance";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
const props = defineProps<{ series: { date: string; revenue: number; expense: number }[] }>();
const appearance = useAppearanceStore();
const palette = computed(() => (appearance.dark ? appearance.value.dark : appearance.value.light));
const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const chart = computed(() => ({
  labels: props.series.map((item) =>
    item.date.length === 7 ? `${item.date.slice(5)}/${item.date.slice(0, 4)}` : `${item.date.slice(8)}/${item.date.slice(5, 7)}`
  ),
  datasets: [
    {
      label: "Receitas",
      data: props.series.map((item) => item.revenue),
      borderColor: appearance.dark ? "#6ee7b7" : "#047857",
      pointRadius: props.series.length > 31 ? 0 : 2,
      tension: 0.2,
    },
    {
      label: "Despesas",
      data: props.series.map((item) => item.expense),
      borderColor: appearance.dark ? "#fca5a5" : "#b91c1c",
      pointRadius: props.series.length > 31 ? 0 : 2,
      tension: 0.2,
    },
  ],
}));
const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  plugins: {
    legend: { labels: { color: palette.value.secondary, usePointStyle: true, boxWidth: 8 } },
    tooltip: {
      callbacks: {
        label: (context: { dataset: { label?: string }; parsed: { y: number | null } }) =>
          `${context.dataset.label}: ${currency(context.parsed.y ?? 0)}`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: palette.value.secondary, maxTicksLimit: 12 } },
    y: {
      ticks: { color: palette.value.secondary, callback: (value: string | number) => currency(Number(value)) },
      grid: { color: palette.value.border },
    },
  },
}));
</script>
<template>
  <div class="h-64 min-w-0">
    <Line
      :data="chart"
      :options="options"
      role="img"
      aria-label="Evolução de receitas e despesas. Os valores completos também estão disponíveis na tabela Evolução por período."
    />
  </div>
</template>
