<script setup lang="ts">
import { computed } from "vue";
import { Doughnut } from "vue-chartjs";
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";

ChartJS.register(ArcElement, Legend, Tooltip);

import { useAppearanceStore } from "../stores/appearance";
const appearance = useAppearanceStore();
const palette = computed(() => (appearance.dark ? appearance.value.dark : appearance.value.light));
const props = defineProps<{ labels: string[]; values: number[]; colors: string[] }>();
const data = computed(() => ({
  labels: props.labels,
  datasets: [{ data: props.values, backgroundColor: props.colors, borderColor: palette.value.surface, borderWidth: 3, hoverOffset: 6 }],
}));
const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: "62%",
  plugins: {
    legend: { display: false },
    tooltip: {
      padding: 10,
      displayColors: true,
      backgroundColor: palette.value.surface,
      titleColor: palette.value.text,
      bodyColor: palette.value.text,
      borderColor: palette.value.border,
      borderWidth: 1,
    },
  },
}));
</script>
<template>
  <div class="h-full w-full"><Doughnut :data="data" :options="options" /></div>
</template>
