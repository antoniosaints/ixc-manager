<script setup lang="ts">
import { FileText, RefreshCw, Network, Wrench, Headset, ChevronDown } from "lucide-vue-next";

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
const props = defineProps<{ customerId: string; kind: "contracts" | "logins" | "orders" | "tickets" }>();
const expanded = ref(new Set<number>());
function toggleCase(event: Event, id: number) {
  const next = new Set(expanded.value);
  if ((event.target as HTMLDetailsElement).open) next.add(id);
  else next.delete(id);
  expanded.value = next;
}

const page = ref(1),
  limit = ref(10);
const params = computed(() => new URLSearchParams({ page: String(page.value), limit: String(limit.value) }));
const { data, loading, error, reload } = useLiveQuery<LivePage<SupportContract | UpgradeLogin | SupportCase>>((signal) => {
  if (props.kind === "contracts") return supportApi.contracts(props.customerId, params.value, signal);
  if (props.kind === "logins") return supportApi.customerLogins(props.customerId, params.value, signal);
  return supportApi.cases(props.customerId, props.kind, params.value, signal);
});
const contracts = computed(() => (props.kind === "contracts" ? (data.value?.items as SupportContract[]) : []));
const logins = computed(() => (props.kind === "logins" ? (data.value?.items as UpgradeLogin[]) : []));
const cases = computed(() => (["orders", "tickets"].includes(props.kind) ? (data.value?.items as SupportCase[]) : []));
const title = computed(
  () =>
    ({ contracts: "Contratos do cliente", logins: "Logins do cliente", orders: "Ordens de serviço", tickets: "Atendimentos" })[props.kind]
);
const sectionIcon = computed(() => ({ contracts: FileText, logins: Network, orders: Wrench, tickets: Headset })[props.kind]);
watch([page, limit], reload);
</script>
<template>
  <section class="panel overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
      <div>
        <h3 class="text-sm font-bold">
          <component :is="sectionIcon" class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />
          {{ title }}<span v-if="data" class="ml-2 text-xs font-normal text-slate-400">{{ data.total }} encontrados</span>
        </h3>
        <p class="mt-1 text-[11px] text-slate-500">
          {{
            kind === "contracts" || kind === "logins"
              ? "Inclui ativos e inativos. Expanda um registro para consultar os detalhes."
              : "Inclui registros abertos e encerrados. Expanda um registro para ler os detalhes."
          }}
        </p>
      </div>
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
          <details
            v-for="contract in contracts"
            :key="contract.id"
            class="support-case-disclosure"
            @toggle="toggleCase($event, contract.id)"
          >
            <summary class="support-case-summary">
              <span class="support-case-summary-icon" aria-hidden="true"><FileText class="h-4 w-4" /></span>
              <span class="min-w-0 flex-1"
                ><strong class="break-words text-xs">#{{ contract.id }} · {{ contract.name }}</strong
                ><span class="mt-0.5 block text-[10px] text-slate-500"
                  >{{ internetStatus(contract.internetStatus) }} · Permanência {{ formatDate(contract.expiresAt)
                  }}{{ contract.address ? ` · ${contract.address}` : "" }}</span
                ></span
              >
              <TechnicalStatus
                :label="contractStatus(contract.status)"
                :tone="contract.status === 'A' ? 'success' : contract.status === 'N' ? 'danger' : 'neutral'"
              />
              <span class="support-case-expand-label"
                ><span class="support-case-expand">Ver detalhes</span><span class="support-case-collapse">Recolher</span></span
              ><ChevronDown class="support-case-chevron h-4 w-4 shrink-0" aria-hidden="true" />
            </summary>
            <SupportContractDetail v-if="expanded.has(contract.id)" :contract-id="String(contract.id)" />
          </details>
        </div>
        <LoginRecordList v-else-if="kind === 'logins'" :items="logins" module="support" />
        <div v-else class="divide-y divide-slate-100">
          <details v-for="item in cases" :key="item.id" class="support-case-disclosure" @toggle="toggleCase($event, item.id)">
            <summary class="support-case-summary">
              <span class="support-case-summary-icon" aria-hidden="true"
                ><component :is="kind === 'orders' ? Wrench : Headset" class="h-4 w-4"
              /></span>
              <span class="min-w-0 flex-1"
                ><span class="break-words font-semibold text-xs"
                  >#{{ item.id }} ·
                  {{
                    (kind === "orders" ? (item.subjectName ?? item.title) : (item.title ?? item.subjectName)) ??
                    (item.subjectId ? `Assunto #${item.subjectId}` : kind === "orders" ? "Ordem de serviço" : "Atendimento")
                  }}</span
                ><span class="mt-0.5 block text-[10px] text-slate-400"
                  >{{ item.protocol ? `Protocolo ${item.protocol} · ` : "" }}{{ formatIxcDateTime(item.openedAt)
                  }}{{ item.contractId ? ` · Contrato #${item.contractId}` : "" }}</span
                ></span
              >
              <SupportCaseStatus :status="item.status" :kind="kind === 'orders' ? 'orders' : 'tickets'" />
              <span class="support-case-expand-label"
                ><span class="support-case-expand">Ver detalhes</span><span class="support-case-collapse">Recolher</span></span
              >
              <ChevronDown class="support-case-chevron h-4 w-4 shrink-0" aria-hidden="true" />
            </summary>
            <SupportCaseDetail
              v-if="expanded.has(item.id) && (kind === 'orders' || kind === 'tickets')"
              :customer-id="customerId"
              :kind="kind"
              :case-id="item.id"
            />
          </details>
        </div>
      </div>
      <p v-if="!data.items.length" class="px-4 py-8 text-center text-xs text-slate-500">
        {{ data.total ? "Nenhum registro nesta página." : "Nenhum registro vinculado a este cliente no IXC." }}
      </p>
      <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt" />
    </template>
  </section>
</template>
