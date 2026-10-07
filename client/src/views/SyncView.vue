<script setup lang="ts">
import { toast } from "../notifications/toast";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Activity, CheckCircle2, CircleAlert, Clock3, LoaderCircle, RefreshCw, TimerReset } from "lucide-vue-next";
import { api, type SyncJob, type SyncStatus } from "../api";

import { useAuthStore } from "../stores/auth";
const auth = useAuthStore();
const status = ref<SyncStatus>();
const error = ref("");
const refreshing = ref(false);
const loading = ref(false);
const lastUpdatedAt = ref<Date | null>(null);
let poller: number | undefined;

const load = async () => {
  // A slow response must not be overtaken by later polling requests, nor
  // should it erase the last confirmed state of an active worker.
  if (loading.value) return;
  loading.value = true;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    status.value = await api.syncStatus(controller.signal);
    lastUpdatedAt.value = new Date();
    error.value = "";
  } catch {
    error.value = status.value
      ? "Não foi possível atualizar agora. Exibindo o último estado confirmado."
      : "Não foi possível consultar o backend. Nova tentativa automática em até 5 segundos.";
  } finally {
    window.clearTimeout(timeout);
    loading.value = false;
  }
};
const runSync = async () => {
  refreshing.value = true;
  try {
    const result = await api.sync();
    toast.info(
      result.status === "queued" ? "Sincronização enfileirada" : "Sincronização já em andamento",
      "Acompanhe a execução nesta tela."
    );
    await load();
  } catch (error) {
    toast.error("Falha ao solicitar sincronização", error instanceof Error ? error.message : "Tente novamente.");
  } finally {
    refreshing.value = false;
  }
};
onMounted(() => {
  load();
  poller = window.setInterval(load, 5_000);
});
onUnmounted(() => poller && window.clearInterval(poller));

const cards = computed(() => [
  { label: "Em execução", value: status.value?.counts.active ?? 0, icon: LoaderCircle, color: "text-cyan-600 bg-cyan-50" },
  {
    label: "Na fila",
    value: (status.value?.counts.waiting ?? 0) + (status.value?.counts.delayed ?? 0),
    icon: Clock3,
    color: "text-amber-600 bg-amber-50",
  },
  { label: "Concluídos", value: status.value?.counts.completed ?? 0, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  { label: "Com falha", value: status.value?.counts.failed ?? 0, icon: CircleAlert, color: "text-red-600 bg-red-50" },
]);
const syncInFlight = computed(
  () =>
    (status.value?.jobs.active ?? []).some((job) => job.name === "full-sync") ||
    (status.value?.jobs.waiting ?? []).some((job) => job.name === "full-sync")
);
const progress = (job: SyncJob) => (typeof job.progress === "object" ? job.progress : undefined);
const percentage = (job: SyncJob) => {
  const value = progress(job);
  return value?.total ? Math.round(((value.completed ?? 0) / value.total) * 100) : job.state === "completed" ? 100 : 0;
};
const stages = (job: SyncJob) => progress(job)?.total ?? 10;
const currentStage = (job: SyncJob) => {
  const value = progress(job);
  if (value?.phase === "calculating") return stages(job);
  return Math.min((value?.completed ?? 0) + 1, stages(job));
};
const processDescription = (job: SyncJob) => {
  const current = progress(job);
  if (current?.phase === "calculating")
    return current.completed && current.completed < (current.total ?? 0)
      ? "Calculando scores com os dados sincronizados"
      : "Finalizando cálculo dos scores de risco";
  return `Sincronizando: ${resourceLabel(current?.currentResource)}`;
};
const processActivity = (job: SyncJob) =>
  progress(job)?.phase === "calculating"
    ? "Atualizando scores dos clientes…"
    : `Carregando dados de ${resourceLabel(progress(job)?.currentResource)}…`;
const scorePercentage = (job: SyncJob) => {
  const value = progress(job);
  return value?.scoreTotal ? Math.min(100, Math.round(((value.scoreProcessed ?? 0) / value.scoreTotal) * 100)) : null;
};
const updatedLabel = computed(() =>
  lastUpdatedAt.value ? `Última atualização: ${lastUpdatedAt.value.toLocaleTimeString("pt-BR")}` : "Conectando ao backend…"
);
const labels: Record<string, string> = {
  customers: "Clientes",
  contracts: "Contratos",
  "contract-history": "Histórico contratual",
  financial: "Financeiro",
  tickets: "Atendimentos",
  "service-orders": "Ordens de serviço",
  subjects: "Assuntos",
  "radius-users": "Logins Radius",
  "radius-history": "Histórico Radius",
  usage: "Consumo",
};
const resourceLabel = (value?: string | null) => labels[value ?? ""] ?? value;
const jobLabel = (job: SyncJob) => (job.id.startsWith("repeat:") ? "Sincronização automática" : `Sincronização #${job.id}`);
const formatted = (value: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");
</script>

<template>
  <section class="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="mb-2 text-sm font-semibold uppercase tracking-[.18em] text-cyan-700">Operação</p>
      <h1 class="text-3xl font-extrabold tracking-tight">
        <Activity class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />Processos de retenção
      </h1>
      <p class="mt-1 text-slate-500">Atualização automática a cada 5 segundos · {{ updatedLabel }}</p>
    </div>
    <div class="flex gap-2">
      <button :disabled="loading" @click="load" class="button-secondary">
        <RefreshCw class="mr-1 inline h-4 w-4" :class="{ 'animate-spin': loading }" aria-hidden="true" focusable="false" />
        Atualizar</button
      ><button
        v-if="auth.can('churn.sync')"
        :disabled="refreshing || syncInFlight"
        @click="runSync"
        class="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        <TimerReset class="mr-1 inline h-4 w-4" aria-hidden="true" focusable="false" />
        {{ syncInFlight ? "Sincronização em andamento" : refreshing ? "Enfileirando…" : "Nova sincronização" }}
      </button>
    </div>
  </section>
  <section class="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <article v-for="card in cards" :key="card.label" class="metric">
      <div class="flex items-start justify-between">
        <span class="label">{{ card.label }}</span
        ><component
          :is="card.icon"
          class="h-6 w-6 rounded-lg p-1"
          :class="[card.color, card.label === 'Em execução' && card.value ? 'animate-spin' : '']"
          aria-hidden="true"
          focusable="false"
        />
      </div>
      <p class="mt-4 text-3xl font-extrabold">{{ status ? card.value : "—" }}</p>
    </article>
  </section>
  <p v-if="error" class="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{{ error }}</p>
  <section class="panel overflow-hidden">
    <div class="border-b border-slate-100 p-5">
      <h2 class="font-bold"><LoaderCircle class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Em execução</h2>
      <p class="text-sm text-slate-500">A etapa indica qual fonte está sendo sincronizada no momento.</p>
    </div>
    <div v-if="!status" class="p-8 text-center text-slate-500">
      <LoaderCircle class="mr-2 inline h-5 w-5 animate-spin" aria-hidden="true" focusable="false" /> Consultando o worker…
    </div>
    <div v-else-if="!status.jobs.active.length" class="p-8 text-center text-slate-500">Nenhum processo ativo.</div>
    <div v-else class="divide-y divide-slate-100">
      <article v-for="job in status.jobs.active" :key="job.id" class="p-5">
        <div class="flex flex-wrap justify-between gap-3">
          <div class="flex gap-3">
            <Activity class="mt-0.5 h-5 w-5 text-cyan-600" aria-hidden="true" focusable="false" />
            <div>
              <p class="font-bold">{{ jobLabel(job) }}</p>
              <p class="mt-1 text-sm text-slate-500">
                {{ processDescription(job) }}
              </p>
            </div>
          </div>
          <span class="pill bg-cyan-100 text-cyan-700">{{ percentage(job) }}%</span>
        </div>
        <div class="mt-5 flex items-center justify-between text-xs font-medium">
          <span class="flex items-center gap-2 text-cyan-700"><i class="sync-live-dot" /> {{ processActivity(job) }}</span>
          <span class="text-slate-500">Etapa {{ currentStage(job) }} de {{ stages(job) }}</span>
        </div>
        <div class="mt-2 grid gap-1.5" :style="{ gridTemplateColumns: `repeat(${stages(job)}, minmax(0, 1fr))` }">
          <span
            v-for="stage in stages(job)"
            :key="stage"
            class="sync-stage"
            :class="{
              'sync-stage-complete': stage <= (progress(job)?.completed ?? 0),
              'sync-stage-active': stage === currentStage(job),
            }"
          />
        </div>
        <p class="mt-2 text-xs text-slate-400">
          <template v-if="progress(job)?.resourceTotal"
            >{{ Number(progress(job)?.resourceProcessed ?? 0).toLocaleString("pt-BR") }} de
            {{ Number(progress(job)?.resourceTotal).toLocaleString("pt-BR") }} registros nesta fonte · </template
          >Iniciado em {{ formatted(job.processedAt) }} · {{ percentage(job) }}% das fontes concluídas
        </p>
        <div v-if="progress(job)?.phase === 'calculating' && progress(job)?.scoreTotal" class="mt-4 rounded-lg bg-cyan-50 p-3">
          <div class="flex items-center justify-between gap-3 text-xs font-semibold text-cyan-900">
            <span>Scores calculados</span>
            <span
              >{{ Number(progress(job)?.scoreProcessed ?? 0).toLocaleString("pt-BR") }} de
              {{ Number(progress(job)?.scoreTotal).toLocaleString("pt-BR") }} · {{ scorePercentage(job) }}%</span
            >
          </div>
          <div class="mt-2 h-2 overflow-hidden rounded-full bg-cyan-100">
            <div
              class="h-full rounded-full bg-cyan-600 transition-[width] duration-500"
              :style="{ width: `${scorePercentage(job) ?? 0}%` }"
            />
          </div>
        </div>
      </article>
    </div>
  </section>
  <section class="mt-6 grid gap-6 lg:grid-cols-2">
    <div class="panel overflow-hidden">
      <div class="border-b border-slate-100 p-5">
        <h2 class="font-bold">
          <Clock3 class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Aguardando execução
        </h2>
      </div>
      <div v-if="!status" class="p-7 text-center text-sm text-slate-500">Consultando fila…</div>
      <div v-else-if="!(status.jobs.waiting.length || status.jobs.delayed.length)" class="p-7 text-center text-sm text-slate-500">
        Fila vazia.
      </div>
      <ul v-else class="divide-y divide-slate-100">
        <li
          v-for="job in [...(status?.jobs.waiting ?? []), ...(status?.jobs.delayed ?? [])]"
          :key="job.id"
          class="flex items-center justify-between p-4"
        >
          <span class="font-medium">{{ jobLabel(job) }}</span
          ><span class="text-sm text-slate-500">Criado em {{ formatted(job.createdAt) }}</span>
        </li>
      </ul>
    </div>
    <div class="panel overflow-hidden">
      <div class="border-b border-slate-100 p-5">
        <h2 class="font-bold">
          <CircleAlert class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Falhas recentes
        </h2>
      </div>
      <div v-if="!status" class="p-7 text-center text-sm text-slate-500">Consultando histórico…</div>
      <div v-else-if="!status.jobs.failed.length" class="p-7 text-center text-sm text-slate-500">Nenhuma falha recente.</div>
      <ul v-else class="divide-y divide-slate-100">
        <li v-for="job in status.jobs.failed" :key="job.id" class="p-4">
          <div class="flex items-center justify-between">
            <strong>{{ jobLabel(job) }}</strong
            ><span class="text-xs text-slate-400">{{ formatted(job.finishedAt) }}</span>
          </div>
          <p class="mt-1 break-words text-sm text-red-600">{{ job.failedReason }}</p>
        </li>
      </ul>
    </div>
  </section>
</template>
