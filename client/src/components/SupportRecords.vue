<script setup lang="ts">
import { FileText, RefreshCw, Network, Wrench, Headset, ChevronRight } from "lucide-vue-next";

import { computed, ref, watch } from "vue";

import { supportApi, contractStatus, type SupportContract, type SupportCase } from "../supportApi";
import { formatDate, formatIxcDateTime, internetStatus, type UpgradeLogin, type LivePage } from "../upgradesApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import SupportContractDetail from "./SupportContractDetail.vue";
import LoginRecordList from "./LoginRecordList.vue";
import TechnicalStatus from "./TechnicalStatus.vue";
import SupportCaseDetail from "./SupportCaseDetail.vue";
import SupportCaseStatus from "./SupportCaseStatus.vue";
import LiveQueryState from "./LiveQueryState.vue";
import LivePagination from "./LivePagination.vue";
import RecordDetailDialog from "./RecordDetailDialog.vue";
import NetworkMonitorStatus from "./NetworkMonitorStatus.vue";
import { useNetworkMonitor, applyConnectionUpdate } from "../composables/useNetworkMonitor";
const props = defineProps<{ customerId: string; kind: "contracts" | "logins" | "orders" | "tickets" }>();
const selected = ref<SupportContract | SupportCase | null>(null);
const selectedContract = computed(() => (props.kind === "contracts" ? (selected.value as SupportContract | null) : null));
const selectedCase = computed(() => (props.kind === "orders" || props.kind === "tickets" ? (selected.value as SupportCase | null) : null));
const caseTitle = (item: SupportCase) =>
  (props.kind === "orders" ? (item.subjectName ?? item.title) : (item.title ?? item.subjectName)) ??
  (item.subjectId ? `Assunto #${item.subjectId}` : props.kind === "orders" ? "Ordem de serviço" : "Atendimento");
const dialogTitle = computed(() =>
  selectedContract.value
    ? `Contrato #${selectedContract.value.id}`
    : `${props.kind === "orders" ? "Ordem de serviço" : "Atendimento"} #${selectedCase.value?.id}`
);
const dialogSubtitle = computed(
  () => `Cliente #${props.customerId} · ${selectedContract.value?.name ?? (selectedCase.value ? caseTitle(selectedCase.value) : "")}`
);
watch(
  () => [props.customerId, props.kind],
  () => {
    selected.value = null;
  }
);

const page = ref(1),
  limit = ref(10);
const params = computed(() => new URLSearchParams({ page: String(page.value), limit: String(limit.value) }));
const { data, loading, error, reload } = useLiveQuery<LivePage<SupportContract | UpgradeLogin | SupportCase>>((signal) => {
  if (props.kind === "contracts") return supportApi.contracts(props.customerId, params.value, signal);
  if (props.kind === "logins") return supportApi.customerLogins(props.customerId, params.value, signal);
  return supportApi.cases(props.customerId, props.kind, params.value, signal);
});
const contracts = computed(() => (props.kind === "contracts" ? ((data.value?.items ?? []) as SupportContract[]) : []));
const logins = computed(() => (props.kind === "logins" ? ((data.value?.items ?? []) as UpgradeLogin[]) : []));
const loginFocused = ref(false);
const monitor = useNetworkMonitor({
  scope: () =>
    props.kind === "logins" && logins.value.length
      ? {
          scope: "customer",
          module: "support",
          customerId: Number(props.customerId),
          loginIds: logins.value.map((login) => login.id!).filter((id) => id > 0),
        }
      : null,
  enabled: () => props.kind === "logins" && !loginFocused.value,
  connections: (updates) => {
    if (!data.value || props.kind !== "logins") return;
    const items = (data.value.items as UpgradeLogin[]).map((login) => {
      const update = updates.find((item) => item.id === login.id);
      return update ? applyConnectionUpdate(login, update) : login;
    });
    data.value = { ...data.value, items };
  },
});
const cases = computed(() => (["orders", "tickets"].includes(props.kind) ? ((data.value?.items ?? []) as SupportCase[]) : []));
const title = computed(
  () =>
    ({ contracts: "Contratos do cliente", logins: "Logins do cliente", orders: "Ordens de serviço", tickets: "Atendimentos" })[props.kind]
);
const sectionIcon = computed(() => ({ contracts: FileText, logins: Network, orders: Wrench, tickets: Headset })[props.kind]);
watch([page, limit], reload);
</script>
<template>
  <section class="panel overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
      <div>
        <h3 class="text-sm font-bold">
          <component :is="sectionIcon" class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />
          {{ title }}<span v-if="data" class="ml-2 text-xs font-normal text-slate-400">{{ data.total }} encontrados</span>
        </h3>
        <p class="mt-0.5 text-[10px] text-slate-500">
          {{
            kind === "contracts" || kind === "logins"
              ? "Inclui ativos e inativos. Clique em um registro para abrir os detalhes."
              : "Inclui registros abertos e encerrados. Clique em um registro para abrir os detalhes."
          }}
        </p>
      </div>
      <NetworkMonitorStatus
        v-if="kind === 'logins'"
        :state="monitor.state.value"
        :checked-at="monitor.checkedAt.value"
        :message="monitor.message.value"
      />
      <button
        type="button"
        class="button-secondary text-xs"
        :aria-label="`Atualizar ${title.toLowerCase()}`"
        :disabled="loading"
        @click="reload"
      >
        <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Atualizar
      </button>
    </div>
    <div v-if="loading || error" class="p-4"><LiveQueryState :loading="loading" :error="error" @retry="reload" /></div>
    <template v-else-if="data">
      <div class="overflow-x-auto">
        <div v-if="kind === 'contracts'" class="divide-y divide-slate-100">
          <button
            v-for="contract in contracts"
            :key="contract.id"
            type="button"
            class="support-case-summary support-record-trigger"
            aria-haspopup="dialog"
            :aria-label="`Ver detalhes do contrato #${contract.id} · ${contract.name}`"
            @click="selected = contract"
          >
            <span class="support-case-summary-icon" aria-hidden="true"><FileText class="h-4 w-4" /></span>
            <span class="min-w-0 flex-1"
              ><strong class="block truncate text-xs" :title="`#${contract.id} · ${contract.name}`"
                >#{{ contract.id }} · {{ contract.name }}</strong
              ><span class="block truncate text-[10px] text-slate-500"
                >{{ internetStatus(contract.internetStatus) }} · Permanência {{ formatDate(contract.expiresAt)
                }}{{ contract.address ? ` · ${contract.address}` : "" }}</span
              ></span
            >
            <TechnicalStatus
              :label="contractStatus(contract.status)"
              :tone="contract.status === 'A' ? 'success' : contract.status === 'N' ? 'danger' : 'neutral'"
            />
            <span class="support-case-expand-label">Ver detalhes</span>
            <ChevronRight class="support-case-chevron h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        </div>
        <LoginRecordList v-else-if="kind === 'logins'" :items="logins" module="support" @focus-change="loginFocused = $event" />
        <div v-else class="divide-y divide-slate-100">
          <button
            v-for="item in cases"
            :key="item.id"
            type="button"
            class="support-case-summary support-record-trigger"
            aria-haspopup="dialog"
            :aria-label="`Ver detalhes ${kind === 'orders' ? 'da ordem de serviço' : 'do atendimento'} #${item.id} · ${caseTitle(item)}`"
            @click="selected = item"
          >
            <span class="support-case-summary-icon" aria-hidden="true"
              ><component :is="kind === 'orders' ? Wrench : Headset" class="h-4 w-4"
            /></span>
            <span class="min-w-0 flex-1"
              ><span class="block truncate font-semibold text-xs" :title="item.subjectName ?? item.title ?? undefined"
                >#{{ item.id }} · {{ caseTitle(item) }}</span
              ><span class="block truncate text-[10px] text-slate-400"
                >{{ item.protocol ? `Protocolo ${item.protocol} · ` : "" }}{{ formatIxcDateTime(item.openedAt)
                }}{{ item.contractId ? ` · Contrato #${item.contractId}` : "" }}</span
              ></span
            >
            <SupportCaseStatus :status="item.status" :kind="kind === 'orders' ? 'orders' : 'tickets'" />
            <span class="support-case-expand-label">Ver detalhes</span>
            <ChevronRight class="support-case-chevron h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p v-if="!data.items.length" class="px-4 py-8 text-center text-xs text-slate-500">
        {{ data.total ? "Nenhum registro nesta página." : "Nenhum registro vinculado a este cliente no IXC." }}
      </p>
      <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt" />
    </template>
  </section>
  <RecordDetailDialog
    v-if="selected"
    :key="`${kind}-${selected.id}`"
    :title="dialogTitle"
    :subtitle="dialogSubtitle"
    :icon="sectionIcon"
    module="support"
    @close="selected = null"
  >
    <SupportContractDetail v-if="selectedContract" :contract-id="String(selectedContract.id)" />
    <SupportCaseDetail
      v-else-if="selectedCase && (kind === 'orders' || kind === 'tickets')"
      :customer-id="customerId"
      :kind="kind"
      :case-id="selectedCase.id"
    />
  </RecordDetailDialog>
</template>
