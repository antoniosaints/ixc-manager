<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Info,
  MessageSquareText,
  History,
  RefreshCw,
  Flag,
  CalendarDays,
  Clock3,
  UserRound,
  MapPin,
  FileText,
  Network,
  ArrowUpRight,
  ClipboardCheck,
  CircleAlert,
  Building2,
} from "lucide-vue-next";
import { supportApi } from "../supportApi";
import { formatIxcDateTime, formatConsulted } from "../upgradesApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import { useAuthStore } from "../stores/auth";
import LiveQueryState from "./LiveQueryState.vue";
import SupportCaseHistory from "./SupportCaseHistory.vue";
import SupportCaseStatus from "./SupportCaseStatus.vue";
const props = defineProps<{ customerId: string; kind: "orders" | "tickets"; caseId: number }>();
const auth = useAuthStore(),
  tab = ref<"overview" | "messages" | "movements">("overview");
const tabs = [
  { id: "overview", label: "Visão geral", icon: Info },
  { id: "messages", label: "Mensagens", icon: MessageSquareText },
  { id: "movements", label: "Movimentações", icon: History },
] as const;
const { data, loading, error, reload } = useLiveQuery((signal) =>
  supportApi.caseDetail(props.customerId, props.kind, props.caseId, signal)
);
const record = computed(() => data.value?.record);
const priority = (s: string | null) =>
  s ? (({ B: "Baixa", N: "Normal", M: "Média", A: "Alta", C: "Crítica" } as Record<string, string>)[s] ?? s) : "Não informada";
const chronologicalStages = computed(() => [...(record.value?.stages ?? [])].sort((a, b) => a.date.localeCompare(b.date)));
function keyboard(e: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const i = tabs.findIndex((t) => t.id === tab.value);
  tab.value = tabs[e.key === "Home" ? 0 : e.key === "End" ? 2 : (i + (e.key === "ArrowRight" ? 1 : -1) + 3) % 3]!.id;
  (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`#case-${props.kind}-${props.caseId}-${tab.value}`)?.focus();
}
</script>
<template>
  <div class="support-case-detail">
    <LiveQueryState :loading="loading" :error="error" @retry="reload" />
    <template v-if="record && !loading && !error">
      <div class="support-case-snapshot">
        <div><span class="support-case-caption">Situação atual</span><SupportCaseStatus :status="record.status" :kind="kind" /></div>
        <div>
          <span class="support-case-caption"><Flag aria-hidden="true" />Prioridade</span
          ><strong :class="['A', 'C'].includes(record.priority ?? '') ? 'text-amber-700' : ''">{{ priority(record.priority) }}</strong>
        </div>
        <div>
          <span class="support-case-caption"><CalendarDays aria-hidden="true" />Abertura</span
          ><strong>{{ formatIxcDateTime(record.openedAt) }}</strong>
        </div>
        <div>
          <span class="support-case-caption"><Clock3 aria-hidden="true" />Última alteração</span
          ><strong>{{ formatIxcDateTime(record.updatedAt) }}</strong>
        </div>
      </div>
    </template>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div
        role="tablist"
        :aria-label="`Detalhes ${kind === 'orders' ? 'da OS' : 'do atendimento'} ${caseId}`"
        class="support-case-tabs"
        @keydown="keyboard"
      >
        <button
          v-for="item in tabs"
          :id="`case-${kind}-${caseId}-${item.id}`"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="tab === item.id"
          :aria-controls="`case-panel-${kind}-${caseId}`"
          :tabindex="tab === item.id ? 0 : -1"
          @click="tab = item.id"
        >
          <component :is="item.icon" class="h-3.5 w-3.5" aria-hidden="true" />{{ item.label }}
        </button>
      </div>
      <button type="button" class="button-secondary" :disabled="loading" @click="reload">
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar registro
      </button>
    </div>
    <div :id="`case-panel-${kind}-${caseId}`" role="tabpanel" :aria-labelledby="`case-${kind}-${caseId}-${tab}`" tabindex="0">
      <template v-if="tab === 'overview' && record && !loading && !error">
        <div class="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div class="min-w-0 space-y-3">
            <section class="support-case-card">
              <h4 class="support-case-heading"><MessageSquareText aria-hidden="true" />Solicitação do cliente</h4>
              <p
                class="support-case-text"
                :tabindex="(record.message?.length ?? 0) > 600 ? 0 : undefined"
                aria-label="Descrição da solicitação"
              >
                {{ record.message ?? "Sem descrição registrada no IXC." }}
              </p>
              <p v-if="record.messageTruncated" class="mt-2 text-[10px] text-amber-700">
                Exibindo os primeiros 16.000 caracteres; texto completo no IXC.
              </p>
            </section>
            <section class="support-case-card support-case-response">
              <h4 class="support-case-heading">
                <ClipboardCheck aria-hidden="true" />{{ kind === "orders" ? "Resposta e execução" : "Resposta do atendimento" }}
              </h4>
              <p
                class="support-case-text"
                :tabindex="(record.response?.length ?? 0) > 600 ? 0 : undefined"
                aria-label="Resposta registrada"
              >
                {{ record.response ?? "Nenhuma resposta registrada no IXC." }}
              </p>
              <div v-if="record.diagnosis" class="mt-3 border-t border-slate-100 pt-2 text-xs">
                <span class="support-case-caption">Diagnóstico</span>
                <p class="mt-1 break-words">{{ record.diagnosis }}</p>
              </div>
            </section>
            <div
              v-if="record.reopenReason"
              class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700"
            >
              <CircleAlert class="h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <strong>Motivo da reabertura</strong>
                <p class="mt-1 whitespace-pre-wrap break-words">{{ record.reopenReason }}</p>
              </div>
            </div>
            <section v-if="chronologicalStages.length" class="support-case-card">
              <h4 class="support-case-heading"><History aria-hidden="true" />Datas registradas</h4>
              <ol class="support-case-stages">
                <li v-for="(stage, index) in chronologicalStages" :key="`${stage.label}-${index}`">
                  <span class="support-case-stage-dot" aria-hidden="true"></span><strong>{{ stage.label }}</strong
                  ><span>{{ formatIxcDateTime(stage.date) }}</span>
                </li>
              </ol>
            </section>
          </div>
          <aside class="min-w-0 space-y-3" aria-label="Contexto do registro">
            <section class="support-case-card">
              <h4 class="support-case-heading"><UserRound aria-hidden="true" />Equipe e local</h4>
              <dl class="space-y-3 text-xs">
                <div>
                  <dt class="support-case-caption">{{ kind === "orders" ? "Técnico responsável" : "Responsável registrado" }}</dt>
                  <dd class="mt-1 font-semibold break-words">{{ record.technician ?? "Não informado" }}</dd>
                </div>
                <div>
                  <dt class="support-case-caption">Setor</dt>
                  <dd class="mt-1">{{ record.sector ?? "Não informado" }}</dd>
                </div>
                <div>
                  <dt class="support-case-caption"><MapPin aria-hidden="true" />Endereço</dt>
                  <dd class="mt-1 break-words">{{ record.address ?? "Não informado" }}</dd>
                </div>
                <div>
                  <dt class="support-case-caption"><Building2 aria-hidden="true" />Filial</dt>
                  <dd class="mt-1">{{ record.branchId ? `#${record.branchId}` : "Não informada" }}</dd>
                </div>
              </dl>
            </section>
            <section class="support-case-card">
              <h4 class="support-case-heading"><FileText aria-hidden="true" />Referências do registro</h4>
              <dl class="mb-2 text-xs">
                <dt class="support-case-caption">Protocolo</dt>
                <dd class="mt-1 break-all font-mono text-[11px]">{{ record.protocol ?? "Não informado" }}</dd>
              </dl>
              <RouterLink
                v-if="record.contractId && auth.can('support.contract.view')"
                class="support-case-link"
                :to="`/support/contracts/${record.contractId}`"
                ><FileText aria-hidden="true" />Contrato #{{ record.contractId }}<ArrowUpRight class="ml-auto" aria-hidden="true"
              /></RouterLink>
              <RouterLink
                v-if="record.contractId && record.loginId && auth.can('support.contract.view') && auth.can('support.logins.view')"
                class="support-case-link"
                :to="{ path: `/support/contracts/${record.contractId}`, query: { tab: 'logins', loginId: String(record.loginId) } }"
                ><Network aria-hidden="true" />Login #{{ record.loginId }}<ArrowUpRight class="ml-auto" aria-hidden="true"
              /></RouterLink>
              <p v-if="record.ticketId" class="mt-2 text-[11px] text-slate-500">Atendimento vinculado #{{ record.ticketId }}</p>
            </section>
          </aside>
        </div>
      </template>
      <SupportCaseHistory
        v-else-if="tab !== 'overview'"
        :key="tab"
        :customer-id="customerId"
        :kind="kind"
        :case-id="caseId"
        :section="tab"
      />
    </div>
    <p v-if="data" class="mt-3 text-[10px] text-slate-500">
      Consulta direta ao banco IXC · {{ formatConsulted(data.queriedAt) }} · Brasília
    </p>
  </div>
</template>
