<script setup lang="ts">
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from "chart.js";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);
import { useAppearanceStore } from "../stores/appearance";
const appearance = useAppearanceStore();
const palette = computed(() => (appearance.dark ? appearance.value.dark : appearance.value.light));
const props = defineProps<{ labels: string[]; values: number[]; color?: string }>();
const data = computed(() => ({
  labels: props.labels,
  datasets: [
    {
      data: props.values,
      borderColor: props.color ?? palette.value.churn,
      backgroundColor: `${props.color ?? palette.value.churn}20`,
      fill: true,
      tension: 0.35,
      pointRadius: 2,
    },
  ],
}));
const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: palette.value.surface,
      titleColor: palette.value.text,
      bodyColor: palette.value.text,
      borderColor: palette.value.border,
      borderWidth: 1,
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { maxTicksLimit: 6, color: palette.value.secondary }, border: { color: palette.value.border } },
    y: {
      beginAtZero: true,
      grid: { color: palette.value.border },
      ticks: { color: palette.value.secondary },
      border: { color: palette.value.border },
    },
  },
}));
</script>
<template>
  <div class="h-52"><Line :data="data" :options="options" /></div>
</template>
