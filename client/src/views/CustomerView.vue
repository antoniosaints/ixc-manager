<script setup lang="ts">
import CustomerQuickLinks from "../components/CustomerQuickLinks.vue";
import RecordQuickLink from "../components/RecordQuickLink.vue";
import { toast } from "../notifications/toast";
import {
  ListChecks,
  MessageSquareText,
  UserRound,
  WifiOff,
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  Download,
  History,
  Headset,
  MessageCircle,
  Phone,
  RefreshCw,
  RotateCcw,
  Send,
  Siren,
  Smile,
  WalletCards,
  Wifi,
} from "lucide-vue-next";

import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";

import { api } from "../api";
import RiskBadge from "../components/RiskBadge.vue";
import TrendChart from "../components/TrendChart.vue";
import { useAuthStore } from "../stores/auth";

const props = defineProps<{ id: string }>();
const route = useRoute();
const auth = useAuthStore();
const data = ref<any>();
const timeline = ref<any[]>([]);
const error = ref("");
const activeTab = ref<"risk" | "history" | "service">("risk");
const recalculating = ref(false);
const recalculationMessage = ref("");
const nameCopied = ref(false);
const noteText = ref("");
const savingNote = ref(false);
const workflowSaving = ref(false);
const attentionSaving = ref(false);
const selectedContractId = computed(() => {
  const value = Array.isArray(route.query.contractId) ? route.query.contractId[0] : route.query.contractId;
  const contractId = Number(value);
  return Number.isSafeInteger(contractId) && contractId > 0 ? contractId : undefined;
});

const scoreTone = (value: number, max: number) => {
  const ratio = value / max;
  if (ratio >= 0.7) return { bar: "bg-red-500", icon: "text-red-600 bg-red-50", value: "text-red-700" };
  if (ratio >= 0.4) return { bar: "bg-orange-500", icon: "text-orange-600 bg-orange-50", value: "text-orange-700" };
  if (ratio > 0) return { bar: "bg-amber-400", icon: "text-amber-600 bg-amber-50", value: "text-amber-700" };
  return { bar: "bg-emerald-500", icon: "text-emerald-600 bg-emerald-50", value: "text-emerald-700" };
};
const loading = ref(false);
const timelineError = ref("");
const actionError = ref("");
const exporting = ref(false);
let scope = 0;
let loadVersion = 0;
let profileRequest: AbortController | undefined;
let pdfRequest: AbortController | undefined;
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
const readableError = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir a ação.");
const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não disponível";
const eventLabel = (type: string) =>
  ({ FINANCIAL: "Financeiro", TICKET: "Atendimento", SERVICE_ORDER: "Ordem de serviço", CONNECTION: "Conexão", CONTRACT: "Contrato" })[
    type
  ] ?? type;
const tabs = [
  { key: "risk", label: "Análise de risco", icon: BarChart3 },
  { key: "history", label: "Histórico e conexão", icon: History },
  { key: "service", label: "Atendimento", icon: ClipboardList },
] as const;
const loadProfile = async () => {
  const version = ++loadVersion;
  profileRequest?.abort();
  const controller = new AbortController();
  profileRequest = controller;
  loading.value = true;
  error.value = "";
  const [profile, events] = await Promise.allSettled([
    api.customer(Number(props.id), selectedContractId.value, controller.signal),
    api.timeline(Number(props.id), controller.signal),
  ]);
  if (version !== loadVersion || controller.signal.aborted) return;
  if (profile.status === "fulfilled") data.value = profile.value;
  else if (data.value) actionError.value = readableError(profile.reason);
  else error.value = readableError(profile.reason);
  timelineError.value = events.status === "rejected" ? "Não foi possível carregar o histórico. Tente novamente." : "";
  timeline.value = events.status === "fulfilled" ? events.value.events : [];
  loading.value = false;
};
const resetScope = () => {
  scope++;
  loadVersion++;
  profileRequest?.abort();
  pdfRequest?.abort();
  clearTimeout(copiedTimer);
};
watch(
  () => [props.id, selectedContractId.value],
  () => {
    resetScope();
    data.value = undefined;
    timeline.value = [];
    noteText.value = "";
    actionError.value = recalculationMessage.value = "";
    nameCopied.value = exporting.value = savingNote.value = workflowSaving.value = attentionSaving.value = recalculating.value = false;
    activeTab.value = "risk";
    void loadProfile();
  },
  { immediate: true }
);
onBeforeUnmount(resetScope);
const recalculate = async () => {
  const current = scope;
  recalculating.value = true;
  actionError.value = "";
  recalculationMessage.value = "Enfileirando recálculo…";
  try {
    const result = await api.recalculate(Number(props.id));
    if (current !== scope) return;
    toast.info("Recálculo solicitado", "Acompanhe o progresso nesta tela.");
    if (!auth.can("churn.jobs.view")) {
      recalculationMessage.value = "Recálculo solicitado. Atualize a página após a conclusão.";
      return;
    }
    for (let attempt = 0; attempt < 180; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      if (current !== scope) return;
      const job = await api.job(result.jobId);
      if (current !== scope) return;
      if (job.state === "completed") {
        await loadProfile();
        if (current === scope) {
          recalculationMessage.value = "Score atualizado com os dados disponíveis.";
          toast.success("Score atualizado");
        }
        return;
      }
      if (job.state === "failed") throw new Error("Não foi possível recalcular o score. Consulte o andamento em Processos.");
      recalculationMessage.value = job.state === "waiting" || job.state === "delayed" ? "Aguardando a vez na fila…" : "Recalculando score…";
    }
    recalculationMessage.value = "O recálculo continua na fila. Atualize a página após a conclusão.";
  } catch (e) {
    if (current === scope) {
      recalculationMessage.value = readableError(e);
      toast.error("Falha ao recalcular score", recalculationMessage.value);
    }
  } finally {
    if (current === scope) recalculating.value = false;
  }
};
const runAction = async (
  busy: typeof savingNote,
  action: () => Promise<unknown>,
  after?: () => void,
  successTitle = "Atualização salva"
) => {
  const current = scope;
  busy.value = true;
  actionError.value = "";
  try {
    await action();
    if (current !== scope) return;
    after?.();
    toast.success(successTitle);
    await loadProfile();
  } catch (e) {
    if (current === scope) {
      actionError.value = readableError(e);
      toast.error("Não foi possível concluir a operação", actionError.value);
    }
  } finally {
    if (current === scope) busy.value = false;
  }
};
const copyCustomerName = async () => {
  const current = scope;
  try {
    await navigator.clipboard.writeText(String(data.value.customer.name));
    if (current !== scope) return;
    toast.success("Nome copiado");
    nameCopied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (nameCopied.value = false), 1_800);
  } catch {
    if (current === scope) {
      actionError.value = "Não foi possível copiar o nome.";
      toast.error("Falha ao copiar", actionError.value);
    }
  }
};
const saveNote = () => {
  const content = noteText.value.trim();
  if (!content || savingNote.value) return;
  return runAction(
    savingNote,
    () => api.addCustomerNote(Number(props.id), content),
    () => {
      if (noteText.value.trim() === content) noteText.value = "";
    },
    "Anotação salva"
  );
};
const updateWorkflow = (status: "OPEN" | "RESOLVED") =>
  runAction(
    workflowSaving,
    () => api.updateCustomerWorkflow(Number(props.id), status),
    undefined,
    status === "RESOLVED" ? "Tratativa marcada como resolvida" : "Tratativa reaberta"
  );
const updateAttention = (critical: boolean) =>
  runAction(
    attentionSaving,
    () => api.updateCustomerAttention(Number(props.id), Number(data.value.customer.contract_id), critical),
    undefined,
    critical ? "Cliente marcado como crítico" : "Atenção crítica removida"
  );
const exportPdf = async () => {
  const current = scope;
  const customerId = Number(data.value.customer.id),
    contractId = Number(data.value.customer.contract_id);
  exporting.value = true;
  actionError.value = "";
  pdfRequest = new AbortController();
  try {
    const blob = await api.customerPdf(customerId, contractId, pdfRequest.signal);
    if (current !== scope) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `churn-cliente-${customerId}-contrato-${contractId}.pdf`;
    link.click();
    toast.success("PDF do cliente gerado", "O download foi solicitado.");
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  } catch (e) {
    if (current === scope) {
      actionError.value = readableError(e);
      toast.error("Não foi possível concluir a operação", actionError.value);
    }
  } finally {
    if (current === scope) exporting.value = false;
  }
};
const scores = computed(() => {
  if (!data.value) return [];
  const entries = [
    { label: "Financeiro", value: Number(data.value.customer.financial_score), max: 30, icon: WalletCards },
    { label: "Suporte", value: Number(data.value.customer.support_score), max: 25, icon: Headset },
    { label: "Conexão", value: Number(data.value.customer.network_score), max: 25, icon: Wifi },
    { label: "Contrato", value: Number(data.value.customer.contract_score), max: 10, icon: FileText },
    { label: "Satisfação", value: Number(data.value.customer.satisfaction_score), max: 10, icon: Smile },
  ];
  return entries.map((item) => ({ ...item, tone: scoreTone(item.value, item.max) }));
});
const contactChannels = computed(() => {
  const customer = data.value?.customer;
  const raw = [
    { label: "Telefone", value: customer?.phone, icon: Phone, kind: "phone" },
    { label: "Celular", value: customer?.mobile_phone, icon: Phone, kind: "phone" },
    { label: "Comercial", value: customer?.commercial_phone, icon: Phone, kind: "phone" },
    { label: "WhatsApp", value: customer?.whatsapp, icon: MessageCircle, kind: "whatsapp" },
  ].filter((entry) => entry.value && String(entry.value).trim());
  return raw.map((entry) => {
    let digits = String(entry.value).replace(/\D/g, "");
    if (entry.kind === "whatsapp" && [10, 11].includes(digits.length)) digits = `55${digits}`;
    return { ...entry, href: entry.kind === "whatsapp" ? `https://wa.me/${digits}` : `tel:${digits}` };
  });
});
const connection = computed(() => data.value?.connection ?? []);
const usage = computed(() => data.value?.usage ?? []);
const workflowStatus = computed(() => data.value?.workflow?.status ?? "OPEN");
const attentionCritical = computed(() => Boolean(data.value?.workflow?.attentionCritical));
const averageMbps = (entry: any) => {
  const date = new Date(entry.date);
  const days = new Date(date.getUTCFullYear(), date.getUTCMonth() + 1, 0).getDate();
  return (Number(entry.download_consumption) * 8) / (days * 86_400 * 1_000_000);
};
const eventTone = (type: string) =>
  ({
    FINANCIAL: "bg-red-500 ring-red-100",
    TICKET: "bg-orange-500 ring-orange-100",
    SERVICE_ORDER: "bg-cyan-500 ring-cyan-100",
    CONNECTION: "bg-violet-500 ring-violet-100",
    CONTRACT: "bg-lime-500 ring-lime-100",
  })[type] ?? "bg-slate-400 ring-slate-100";
</script>
<template>
  <RouterLink :to="auth.home" class="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-ink"
    ><ArrowLeft class="h-3.5 w-3.5" aria-hidden="true" focusable="false" /> Voltar à listagem</RouterLink
  >
  <div v-if="error" class="panel p-4 text-sm text-red-600" role="alert">
    {{ error }}
    <button @click="loadProfile" class="ml-2 underline">
      <RefreshCw class="inline h-3.5 w-3.5 shrink-0 align-middle" aria-hidden="true" focusable="false" /> Tentar novamente
    </button>
  </div>
  <p v-else-if="!data" class="text-sm text-slate-500" role="status">Carregando cliente…</p>
  <template v-else>
    <section class="panel mb-3 p-3 sm:p-4" :aria-busy="loading">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1 basis-72">
          <p class="text-[10px] font-semibold uppercase tracking-widest text-cyan-700">
            Cliente #{{ data.customer.id }} · Contrato #{{ data.customer.contract_id }}
          </p>
          <div class="mt-1 flex items-start gap-2">
            <h1 class="break-words text-xl font-bold leading-tight sm:text-2xl">
              <UserRound class="mr-2 inline h-5 w-5 align-middle" aria-hidden="true" focusable="false" />{{ data.customer.name }}
            </h1>
            <button
              @click="copyCustomerName"
              :aria-label="nameCopied ? 'Nome copiado' : 'Copiar nome do cliente'"
              class="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <Check v-if="nameCopied" class="h-4 w-4 text-emerald-600" aria-hidden="true" focusable="false" /><Copy
                v-else
                class="h-4 w-4"
                aria-hidden="true"
                focusable="false"
              />
            </button>
          </div>
          <p class="mt-1 break-words text-xs text-slate-500">
            {{
              [data.customer.city, data.customer.neighborhood, data.customer.plan_name].filter(Boolean).join(" · ") ||
              "Plano e localidade não informados"
            }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-[10px] font-semibold uppercase text-slate-500">Risco atual</span>
          <strong class="text-2xl tabular-nums leading-none"
            >{{ data.customer.score ?? "—" }}<span class="ml-1 text-xs font-medium text-slate-500">/100</span></strong
          >
          <RiskBadge v-if="data.customer.risk_level" :level="data.customer.risk_level" />
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <CustomerQuickLinks :customer-id="Number(data.customer.id)" :contract-id="Number(data.customer.contract_id)" />
        <RecordQuickLink
          :target="{
            kind: 'contract',
            id: Number(data.customer.contract_id),
            module: auth.can('support.contract.view') ? 'support' : 'upgrades',
          }"
          :label="`Ver contrato #${data.customer.contract_id}`"
        />
      </div>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p class="text-[11px] text-slate-500">
          Análise: {{ dateTime(data.customer.calculated_at) }} · Brasília <span v-if="loading">· Atualizando…</span>
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-if="auth.can('churn.customer.export')"
            @click="exportPdf"
            :disabled="exporting || loading"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            <Download class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />{{ exporting ? "Exportando…" : "Exportar PDF" }}
          </button>
          <button
            v-if="auth.can('churn.recalculate')"
            @click="recalculate"
            :disabled="recalculating || loading"
            class="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="recalculating ? 'animate-spin' : ''" aria-hidden="true" focusable="false" />{{
              recalculating ? "Atualizando…" : "Atualizar score"
            }}
          </button>
          <button
            v-if="auth.canMarkAttention && workflowStatus !== 'RESOLVED'"
            @click="updateAttention(!attentionCritical)"
            :disabled="attentionSaving || workflowSaving || loading"
            class="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"
          >
            <Siren class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />{{
              attentionCritical ? "Remover atenção crítica" : "Marcar como crítico"
            }}
          </button>
          <button
            v-if="workflowStatus !== 'RESOLVED' && auth.can('churn.workflow.resolve')"
            @click="updateWorkflow('RESOLVED')"
            :disabled="workflowSaving || attentionSaving || loading"
            class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <CheckCircle2 class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Marcar resolvido
          </button>
          <button
            v-else-if="
              workflowStatus === 'RESOLVED' &&
              auth.can('churn.workflow.reopen') &&
              (auth.isAdmin || Number(data.workflow.resolvedByUserId) === auth.user?.id)
            "
            @click="updateWorkflow('OPEN')"
            :disabled="workflowSaving || loading"
            class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Reabrir tratativa
          </button>
        </div>
      </div>
    </section>
    <p v-if="actionError" role="alert" class="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {{ actionError }}
    </p>
    <p v-if="recalculationMessage" role="status" class="mb-3 text-xs text-slate-500">{{ recalculationMessage }}</p>
    <nav aria-label="Seções do cliente" class="mb-3 flex flex-wrap gap-1">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="activeTab = tab.key"
        :aria-pressed="activeTab === tab.key"
        class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
        :class="activeTab === tab.key ? 'bg-ink text-white' : 'text-slate-500 hover:bg-slate-100'"
      >
        <component :is="tab.icon" class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />{{ tab.label }}
      </button>
    </nav>
    <template v-if="activeTab === 'risk'">
      <section aria-label="Score por categoria" class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <article v-for="item in scores" :key="item.label" class="panel px-3 py-2.5">
          <div class="flex items-center justify-between gap-2">
            <span class="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"
              ><component :is="item.icon" class="h-3.5 w-3.5 shrink-0" :class="item.tone.value" aria-hidden="true" focusable="false" />{{
                item.label
              }}</span
            >
            <span class="whitespace-nowrap text-base font-bold tabular-nums" :class="item.tone.value"
              >{{ data.customer.score == null ? "—" : item.value
              }}<span class="text-[10px] font-medium text-slate-400"> /{{ item.max }}</span></span
            >
          </div>
          <div class="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
            <div
              class="h-full rounded-full"
              :class="item.tone.bar"
              :style="{ width: `${Math.min(100, Math.max(0, (item.value / item.max) * 100))}%` }"
            />
          </div>
        </article>
      </section>
      <div class="grid items-start gap-3 lg:grid-cols-3">
        <section class="panel overflow-hidden lg:col-span-2">
          <div class="border-b border-slate-100 px-4 py-3">
            <h2 class="text-sm font-bold">
              <ListChecks class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Principais motivos
              <span class="ml-1 text-xs font-normal text-slate-400">{{ data.reasons.length }} fatores</span>
            </h2>
            <p class="mt-1 text-[11px] text-slate-500">
              Regras por pontuação. Cada categoria tem um limite; a soma dos motivos pode superar o score.
            </p>
          </div>
          <ul class="divide-y divide-slate-100">
            <li v-for="(reason, index) in data.reasons" :key="index" class="flex items-start gap-2.5 px-4 py-2.5">
              <span class="min-w-8 shrink-0 rounded-md bg-red-50 px-1.5 py-0.5 text-center text-xs font-bold text-red-700"
                >{{ Number(reason.points) >= 0 ? "+" : "" }}{{ reason.points }}</span
              >
              <p class="break-words text-xs leading-5">{{ reason.description }}</p>
            </li>
            <li v-if="!data.reasons.length" class="px-4 py-5 text-xs text-slate-500">
              {{ data.customer.score == null ? "Análise ainda não disponível." : "Nenhum fator de risco registrado." }}
            </li>
          </ul>
        </section>
        <section class="panel p-4">
          <h2 class="mb-3 text-sm font-bold">
            <ClipboardList class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Resumo da tratativa
          </h2>
          <div class="flex flex-wrap gap-2 text-[11px] font-semibold">
            <span
              class="rounded-md px-2 py-1"
              :class="workflowStatus === 'RESOLVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'"
              >{{ workflowStatus === "RESOLVED" ? "Resolvido" : "Em aberto" }}</span
            ><span v-if="attentionCritical" class="rounded-md bg-red-50 px-2 py-1 text-red-700">Atenção crítica</span>
          </div>
          <p v-if="workflowStatus === 'RESOLVED'" class="mt-2 text-[11px] text-slate-500">
            Resolvido em {{ dateTime(data.workflow.resolvedAt) }}.
          </p>
          <p class="mt-3 text-xs leading-5 text-slate-500">
            {{
              attentionCritical
                ? "A atenção crítica foi marcada manualmente e não altera o score."
                : "Use os motivos para orientar o próximo contato."
            }}
          </p>
          <button @click="activeTab = 'service'" class="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700">
            <Phone class="h-3.5 w-3.5" aria-hidden="true" focusable="false" /> Contatos e anotações
          </button>
        </section>
      </div>
    </template>
    <section v-else-if="activeTab === 'history'" class="grid items-start gap-3 lg:grid-cols-2">
      <section class="panel overflow-hidden">
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 class="text-sm font-bold">
            <History class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Histórico do cliente
          </h2>
          <span class="text-[11px] text-slate-500">Últimos 90 dias · {{ timeline.length }} eventos</span>
        </div>
        <p v-if="timelineError" role="alert" class="p-4 text-xs text-red-600">
          {{ timelineError }} <button @click="loadProfile" class="underline">Recarregar</button>
        </p>
        <ol v-else class="max-h-[480px] divide-y divide-slate-100 overflow-y-auto">
          <li v-for="(event, index) in timeline" :key="index" class="flex items-start gap-2 px-4 py-2.5">
            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :class="eventTone(event.type)" />
            <div class="min-w-0">
              <p class="text-[10px] font-medium text-slate-500">
                {{ new Date(event.at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) }} · {{ eventLabel(event.type) }}
              </p>
              <p class="mt-0.5 break-words text-xs leading-5">{{ event.description }}</p>
            </div>
          </li>
          <li v-if="!timeline.length" class="p-5 text-xs text-slate-500">Sem eventos disponíveis.</li>
        </ol>
      </section>
      <div class="space-y-3">
        <section class="panel p-4">
          <h2 class="mb-2 text-sm font-bold">
            <WifiOff class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Desconexões · últimos 30 dias
          </h2>
          <TrendChart
            v-if="connection.length"
            :labels="connection.map((entry: any) => new Date(entry.date).toLocaleDateString('pt-BR'))"
            :values="connection.map((entry: any) => Number(entry.disconnects))"
          />
          <p v-else class="text-xs text-slate-500">Sem dados de conexão.</p>
        </section>
        <section class="panel p-4">
          <h2 class="text-sm font-bold">
            <Download class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Consumo médio de download · Mbit/s
          </h2>
          <p class="mb-2 mt-1 text-[11px] text-slate-500">Média mensal, convertida de bytes para Mbit/s.</p>
          <TrendChart
            v-if="usage.length"
            :labels="usage.map((entry: any) => new Date(entry.date).toLocaleDateString('pt-BR', { month: 'short' }))"
            :values="usage.map(averageMbps)"
            color="#a3e635"
          />
          <p v-else class="text-xs text-slate-500">Sem dados de consumo.</p>
        </section>
      </div>
    </section>
    <section v-else class="grid items-start gap-3 lg:grid-cols-3">
      <section class="panel p-4">
        <h2 class="text-sm font-bold">
          <Phone class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Canais de contato
        </h2>
        <p class="mb-3 mt-1 text-[11px] text-slate-500">Números sincronizados do cadastro IXC.</p>
        <div v-if="contactChannels.length" class="divide-y divide-slate-100">
          <a
            v-for="contact in contactChannels"
            :key="contact.label"
            :href="contact.href"
            target="_blank"
            rel="noopener noreferrer"
            class="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
            ><span class="flex items-center gap-1.5 text-slate-500"
              ><component :is="contact.icon" class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />{{ contact.label }}</span
            ><strong>{{ contact.value }}</strong></a
          >
        </div>
        <p v-else class="text-xs text-slate-500">Nenhum telefone informado no cadastro.</p>
      </section>
      <section class="panel p-4 lg:col-span-2">
        <h2 class="text-sm font-bold">
          <MessageSquareText class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Anotações do atendimento
        </h2>
        <p class="mb-3 mt-1 text-[11px] text-slate-500">Registre contatos, negociações e próximos passos.</p>
        <form v-if="auth.can('churn.notes.create')" @submit.prevent="saveNote" class="mb-4">
          <label for="customer-note" class="sr-only">Nova anotação</label
          ><textarea
            id="customer-note"
            v-model="noteText"
            maxlength="2000"
            rows="3"
            placeholder="Descreva o contato e o próximo passo…"
            class="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-cyan-500"
          />
          <div class="mt-1 flex items-center justify-between gap-2">
            <span class="text-[10px] text-slate-400">{{ noteText.length }}/2000</span
            ><button
              :disabled="savingNote || !noteText.trim()"
              class="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Send class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />{{ savingNote ? "Salvando…" : "Adicionar anotação" }}
            </button>
          </div>
        </form>
        <ol class="space-y-2">
          <li v-for="note in data.notes" :key="note.id" class="rounded-lg bg-slate-50 p-3">
            <p class="whitespace-pre-wrap break-words text-xs leading-5">{{ note.content }}</p>
            <p class="mt-1 text-[10px] text-slate-400">{{ dateTime(note.created_at) }} · Brasília</p>
          </li>
          <li v-if="!data.notes.length" class="py-3 text-xs text-slate-500">Ainda não há anotações para este cliente.</li>
        </ol>
      </section>
    </section>
  </template>
</template>
