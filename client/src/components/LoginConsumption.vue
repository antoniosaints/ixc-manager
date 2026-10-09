<script setup lang="ts">
import { ref, computed } from "vue";
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, RefreshCw } from "lucide-vue-next";
import { loginToolsApi, type LoginToolScope } from "../loginToolsApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import LiveQueryState from "./LiveQueryState.vue";
import { formatConsulted } from "../upgradesApi";
const props = defineProps<{ loginId: number; scope: LoginToolScope }>();
const localDate = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const now = new Date(),
  start = new Date(now);
start.setDate(start.getDate() - 29);
const from = ref(localDate(start)),
  to = ref(localDate(now)),
  period = ref({ from: from.value, to: to.value }),
  mode = ref<"daily" | "monthly">("daily");
const { data, loading, error, reload } = useLiveQuery((signal) =>
  loginToolsApi.consumption(props.loginId, props.scope, period.value.from, period.value.to, signal)
);
const rows = computed(() => data.value?.[mode.value] ?? []);
const formatBytes = (value: string | null | undefined) =>
  value == null ? "Não disponível" : `${(Number(value) / 1_000_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;
const total = (download: string | null, upload: string | null) =>
  download === null || upload === null ? null : (BigInt(download) + BigInt(upload)).toString();
const max = computed(() => Math.max(1, ...rows.value.map((r) => Number(r.downloadBytes ?? 0) + Number(r.uploadBytes ?? 0))));
function apply() {
  period.value = { from: from.value, to: to.value };
  void reload();
}
const dateLabel = (value: string) =>
  value.length === 7 ? `${value.slice(5, 7)}/${value.slice(0, 4)}` : value.split("-").reverse().join("/");
</script>
<template>
  <section class="support-case-card">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 class="support-case-heading !mb-0"><CalendarDays aria-hidden="true" />Consumo do login</h3>
      <button class="button-secondary" type="button" :disabled="loading" @click="reload">
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar consumo
      </button>
    </div>
    <form class="network-controls mb-3 flex flex-wrap items-end gap-2" @submit.prevent="apply">
      <label class="flex flex-col text-[11px] text-slate-500"
        >De<input v-model="from" type="date" class="input mt-1 !w-auto" required :max="to" /></label
      ><label class="flex flex-col text-[11px] text-slate-500"
        >Até<input v-model="to" type="date" class="input mt-1 !w-auto" required :min="from" :max="localDate(now)" /></label
      ><button class="button-primary" :disabled="loading">Consultar</button
      ><span class="text-[10px] text-slate-500">Diário: até 90 dias · Mensal: 6 meses até a data final</span>
    </form>
    <LiveQueryState :loading="loading" :error="error" @retry="reload" />
    <template v-if="data && !loading && !error">
      <div class="mb-3 grid grid-cols-2 gap-2">
        <div class="rounded-lg border border-slate-200 p-3">
          <span class="support-case-caption"
            ><ArrowDownToLine class="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Download no período diário</span
          ><strong class="block text-lg">{{ data.daily.length ? formatBytes(data.totals.downloadBytes) : "Sem registros" }}</strong>
        </div>
        <div class="rounded-lg border border-slate-200 p-3">
          <span class="support-case-caption"
            ><ArrowUpFromLine class="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Upload no período diário</span
          ><strong class="block text-lg">{{ data.daily.length ? formatBytes(data.totals.uploadBytes) : "Sem registros" }}</strong>
        </div>
      </div>
      <div class="mb-3 flex gap-2" role="group" aria-label="Agrupamento do consumo">
        <button
          :class="mode === 'daily' ? 'button-primary' : 'button-secondary'"
          type="button"
          :aria-pressed="mode === 'daily'"
          @click="mode = 'daily'"
        >
          Por dia</button
        ><button
          :class="mode === 'monthly' ? 'button-primary' : 'button-secondary'"
          type="button"
          :aria-pressed="mode === 'monthly'"
          @click="mode = 'monthly'"
        >
          Por mês
        </button>
      </div>
      <p v-if="data.duplicatePeriods" role="alert" class="mb-2 text-xs text-amber-700">
        Há períodos com registros duplicados no IXC. Os valores desses períodos foram omitidos para evitar somas incorretas.
      </p>
      <p v-if="!rows.length" class="py-6 text-center text-xs text-slate-500">Nenhum consumo registrado para este login no período.</p>
      <div v-else class="overflow-x-auto">
        <table class="compact-table w-full min-w-[480px]">
          <thead>
            <tr>
              <th scope="col">{{ mode === "daily" ? "Dia" : "Mês" }}</th>
              <th scope="col">Download</th>
              <th scope="col">Upload</th>
              <th scope="col">Total</th>
              <th scope="col">Volume</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.date">
              <th scope="row" class="text-left text-xs">{{ dateLabel(row.date) }}</th>
              <td>{{ formatBytes(row.downloadBytes) }}</td>
              <td>{{ formatBytes(row.uploadBytes) }}</td>
              <td class="font-semibold">{{ formatBytes(total(row.downloadBytes, row.uploadBytes)) }}</td>
              <td>
                <div class="flex h-2 min-w-24 overflow-hidden rounded bg-slate-100" aria-hidden="true">
                  <span class="bg-sky-500" :style="{ width: `${(Number(row.downloadBytes ?? 0) / max) * 100}%` }" /><span
                    class="bg-emerald-500"
                    :style="{ width: `${(Number(row.uploadBytes ?? 0) / max) * 100}%` }"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-[10px] text-slate-500">
        Download em azul · Upload em verde. 1 GB = 1.000.000.000 bytes. Registros diários e mensais são bases separadas e não são somados
        entre si. Dias sem registros não indicam consumo zero. O dia/mês atual pode estar incompleto.
      </p>
      <p class="mt-1 text-[10px] text-slate-500">Banco IXC · Consultado em {{ formatConsulted(data.queriedAt) }}</p>
    </template>
  </section>
</template>
