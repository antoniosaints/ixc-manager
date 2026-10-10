<script setup lang="ts">
import { computed, watch } from "vue";
import { RefreshCw } from "lucide-vue-next";
import { financeTitle } from "../financeApi";
import { financialTitleStatus } from "../financialTitleStatus";
import { useLiveQuery } from "../composables/useLiveQuery";
import { formatConsulted } from "../upgradesApi";
import LiveQueryState from "./LiveQueryState.vue";
import RecordQuickLink from "./RecordQuickLink.vue";
import { useAuthStore } from "../stores/auth";
const props = defineProps<{ titleId: number; customerId: number }>();
const auth = useAuthStore();
const { data, loading, error, reload } = useLiveQuery((signal) => financeTitle(props.titleId, props.customerId, signal));
watch(
  () => [props.titleId, props.customerId],
  () => void reload()
);
const status = computed(() => financialTitleStatus(data.value?.status));
const money = (n: number | null) => (n === null ? "Não informado" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const date = (s: string | null) =>
  s ? new Date(`${s}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não informada";
</script>
<template>
  <LiveQueryState :loading="loading" :error="error" @retry="reload" />
  <div v-if="data && !loading && !error" class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="rounded-full px-3 py-1 text-xs font-semibold" :class="status.tone" :title="`Status IXC: ${status.code}`">{{
        status.label
      }}</span>
      <button class="button-secondary" @click="reload"><RefreshCw class="h-4 w-4" />Atualizar título</button>
    </div>
    <section class="panel p-4">
      <h2 class="mb-3 text-sm font-bold">Cliente e identificação</h2>
      <dl class="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-xs text-slate-500">Cliente</dt>
          <dd class="mt-1 font-semibold">{{ data.customerName || `Cliente #${data.customerId}` }}</dd>
        </div>
        <div>
          <dt class="text-xs text-slate-500">Documento</dt>
          <dd class="mt-1">{{ data.document || "Não informado" }}</dd>
        </div>
        <div>
          <dt class="text-xs text-slate-500">Contrato</dt>
          <dd class="mt-1">
            <RecordQuickLink
              v-if="data.contractId && (auth.can('support.contract.view') || auth.can('upgrades.contract.view'))"
              :target="{ kind: 'contract', id: data.contractId, module: auth.can('support.contract.view') ? 'support' : 'upgrades' }"
              :label="`Ver contrato #${data.contractId}`"
            /><span v-else>{{ data.contractId ? `#${data.contractId}` : "Sem contrato vinculado" }}</span
            ><span class="compact-secondary">{{ data.contractName }}</span>
          </dd>
        </div>
        <div>
          <dt class="text-xs text-slate-500">Conta contábil / filial</dt>
          <dd class="mt-1">
            {{ data.accountName || "Conta não informada"
            }}<span class="compact-secondary">{{ data.branchName || "Filial não informada" }}</span>
          </dd>
        </div>
      </dl>
    </section>
    <section class="panel p-4">
      <h2 class="mb-3 text-sm font-bold">Valores do título</h2>
      <dl class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          v-for="item in [
            { label: 'Valor', value: data.amount },
            { label: 'Recebido', value: data.received },
            { label: 'Em aberto', value: data.balance },
          ]"
          :key="item.label"
        >
          <dt class="text-xs text-slate-500">{{ item.label }}</dt>
          <dd class="mt-1 text-lg font-bold">{{ money(item.value) }}</dd>
        </div>
      </dl>
      <div class="mt-4 flex flex-wrap gap-2 text-xs">
        <span v-if="data.reversed" class="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Estornado</span
        ><span v-if="data.renegotiated" class="rounded-full bg-blue-50 px-2 py-1 text-blue-700">Título renegociado</span>
      </div>
    </section>
    <section class="panel p-4">
      <h2 class="mb-3 text-sm font-bold">Datas</h2>
      <dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div
          v-for="item in [
            { label: 'Emissão', value: data.issuedDate },
            { label: 'Vencimento', value: data.dueDate },
            { label: 'Pagamento', value: data.paymentDate },
            { label: 'Cancelamento', value: data.cancelledDate },
          ]"
          :key="item.label"
        >
          <dt class="text-xs text-slate-500">{{ item.label }}</dt>
          <dd class="mt-1">{{ date(item.value) }}</dd>
        </div>
      </dl>
    </section>
    <p class="text-xs text-slate-500">Banco IXC · Somente leitura · Consultado em {{ formatConsulted(data.queriedAt) }}</p>
  </div>
</template>
