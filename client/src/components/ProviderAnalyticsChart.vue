<script setup lang="ts">
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import { useAppearanceStore } from "../stores/appearance";
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
const props = defineProps<{
  labels: string[];
  first: (number | null)[];
  second: (number | null)[];
  names: [string, string];
  money?: boolean;
  monthly?: boolean;
  yearly?: boolean;
  smooth?: boolean;
  balance?: (number | null)[];
  balanceName?: string;
  percentage?: (number | null)[];
  percentageName?: string;
}>();
const appearance = useAppearanceStore();
const palette = computed(() => (appearance.dark ? appearance.value.dark : appearance.value.light));
const format = (n: number) =>
  props.money ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : n.toLocaleString("pt-BR");
const formatPercent = (n: number) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
const percentageLabel = computed(() => props.percentageName ?? "Crescimento (%)");
const balanceLabel = computed(() => props.balanceName ?? "Saldo");
const seriesNames = computed(() => [
  ...props.names,
  ...(props.balance ? [balanceLabel.value] : []),
  ...(props.percentage ? [percentageLabel.value] : []),
]);
const lineStyle = computed(() => ({
  cubicInterpolationMode: props.smooth ? ("monotone" as const) : ("default" as const),
  tension: props.smooth ? 0 : 0.1,
  spanGaps: false,
  borderCapStyle: "round" as const,
  borderJoinStyle: "round" as const,
  pointRadius: props.labels.length > 62 ? 0 : 2,
}));
const data = computed(() => ({
  labels: props.labels,
  datasets: [
    {
      label: props.names[0],
      data: props.first,
      borderColor: appearance.dark ? "#34d399" : "#047857",
      ...lineStyle.value,
      yAxisID: "y",
    },
    {
      label: props.names[1],
      data: props.second,
      borderColor: appearance.dark ? "#fb7185" : "#be123c",
      ...lineStyle.value,
      yAxisID: "y",
    },
    ...(props.balance
      ? [
          {
            label: balanceLabel.value,
            data: props.balance,
            borderColor: appearance.dark ? "#c4b5fd" : "#7c3aed",
            ...lineStyle.value,
            yAxisID: "y",
          },
        ]
      : []),
    ...(props.percentage
      ? [
          {
            label: percentageLabel.value,
            data: props.percentage,
            borderColor: appearance.dark ? "#60a5fa" : "#2563eb",
            borderDash: [5, 4],
            ...lineStyle.value,
            yAxisID: "percentage",
          },
        ]
      : []),
  ],
}));
const options = computed(() => ({
  animation: false as const,
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: "index" as const },
  plugins: {
    legend: { position: "bottom" as const, labels: { color: palette.value.secondary, usePointStyle: true, boxWidth: 7 } },
    tooltip: {
      backgroundColor: palette.value.surface,
      titleColor: palette.value.text,
      bodyColor: palette.value.text,
      borderColor: palette.value.border,
      borderWidth: 1,
      callbacks: {
        label: (ctx: { dataset: { label?: string; yAxisID?: string }; parsed: { y: number | null } }) =>
          `${ctx.dataset.label}: ${ctx.parsed.y == null ? "Sem base de comparação" : ctx.dataset.yAxisID === "percentage" ? formatPercent(ctx.parsed.y) : format(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: palette.value.secondary, maxTicksLimit: props.monthly || props.yearly ? 12 : 8 },
      border: { color: palette.value.border },
    },
    y: {
      beginAtZero: true,
      grid: { color: palette.value.border },
      ticks: {
        color: palette.value.secondary,
        precision: props.money ? undefined : 0,
        callback: (value: string | number) => format(Number(value)),
      },
      border: { display: false },
    },
    ...(props.percentage
      ? {
          percentage: {
            type: "linear" as const,
            position: "right" as const,
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            ticks: {
              color: appearance.dark ? "#60a5fa" : "#2563eb",
              maxTicksLimit: 6,
              callback: (value: string | number) => formatPercent(Number(value)),
            },
            title: { display: true, text: percentageLabel.value, color: palette.value.secondary },
            border: { display: false },
          },
        }
      : {}),
  },
}));
</script>
<template>
  <div>
    <div class="h-60" role="img" :aria-label="`Evolução de ${seriesNames.join(' e ')} no período; valores disponíveis na tabela abaixo.`">
      <Line :data="data" :options="options" />
    </div>
    <details class="analytics-chart-values">
      <summary>Ver valores do gráfico</summary>
      <div class="analytics-chart-table">
        <table>
          <caption class="sr-only">
            Evolução de
            {{
              seriesNames.join(" e ")
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ yearly ? "Ano" : monthly ? "Mês" : "Data" }}</th>
              <th scope="col">{{ names[0] }}</th>
              <th scope="col">{{ names[1] }}</th>
              <th v-if="balance" scope="col">{{ balanceLabel }}</th>
              <th v-if="percentage" scope="col">{{ percentageLabel }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(label, i) in labels" :key="i">
              <th scope="row">{{ label }}</th>
              <td>
                {{
                  first[i] == null
                    ? "—"
                    : money
                      ? first[i]?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : first[i]?.toLocaleString("pt-BR")
                }}
              </td>
              <td>
                {{
                  second[i] == null
                    ? "—"
                    : money
                      ? second[i]?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : second[i]?.toLocaleString("pt-BR")
                }}
              </td>
              <td v-if="balance">{{ balance[i] == null ? "—" : format(balance[i]!) }}</td>
              <td v-if="percentage">{{ percentage[i] == null ? "—" : formatPercent(percentage[i]!) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>
<style scoped>
.analytics-chart-values {
  font-size: 0.65rem;
  color: var(--appearance-secondary);
  margin-top: 0.35rem;
}
.analytics-chart-values summary {
  cursor: pointer;
  color: var(--appearance-primary-text);
}
.analytics-chart-table {
  max-height: 190px;
  overflow: auto;
  margin-top: 0.5rem;
  border: 1px solid var(--appearance-border);
  border-radius: 0.5rem;
}
.analytics-chart-table table {
  width: 100%;
  border-collapse: collapse;
}
.analytics-chart-table th,
.analytics-chart-table td {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--appearance-border);
  text-align: right;
}
.analytics-chart-table th:first-child {
  text-align: left;
}
.analytics-chart-table thead {
  background: var(--appearance-muted);
  color: var(--appearance-text);
  position: sticky;
  top: 0;
}
.analytics-chart-table tbody th {
  font-weight: 500;
}
.analytics-chart-table tbody tr:hover {
  background: var(--appearance-muted);
}
</style>
