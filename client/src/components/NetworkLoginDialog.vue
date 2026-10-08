<script setup lang="ts">
import { Network, Copy, RefreshCw } from "lucide-vue-next";
import { ref } from "vue";
import { networkApi, type NetworkLoginRow } from "../networkApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import { useNetworkMonitor, applyConnectionUpdate } from "../composables/useNetworkMonitor";
import { useAuthStore } from "../stores/auth";
import { formatIxcDateTime } from "../upgradesApi";
import { toast } from "../notifications/toast";
import RecordDetailDialog from "./RecordDetailDialog.vue";
import LiveQueryState from "./LiveQueryState.vue";
import ContractFields from "./ContractFields.vue";
import TechnicalStatus from "./TechnicalStatus.vue";
import NetworkMonitorStatus from "./NetworkMonitorStatus.vue";
import RecordQuickLink from "./RecordQuickLink.vue";
import CustomerQuickLinks from "./CustomerQuickLinks.vue";
import LoginSignalCard from "./LoginSignalCard.vue";
const props = defineProps<{ login: NetworkLoginRow }>();
const emit = defineEmits<{ close: [] }>();
const auth = useAuthStore();
const dialog = ref<InstanceType<typeof RecordDetailDialog>>();
const { data, loading, error, reload, refreshInBackground } = useLiveQuery((signal) => networkApi.directLogin(props.login.id, signal));
const monitor = useNetworkMonitor({
  scope: () => ({ scope: "login-list", loginIds: [props.login.id] }),
  dialogTarget: () => dialog.value?.target,
  refresh: refreshInBackground,
  connections: (updates) => {
    if (data.value) {
      const update = updates.find((row) => row.id === props.login.id);
      if (update) data.value = { ...data.value, login: applyConnectionUpdate(data.value.login, update) };
    }
  },
});
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("IP copiado");
  } catch {
    toast.error("Não foi possível copiar o IP");
  }
}
</script>
<template>
  <RecordDetailDialog
    ref="dialog"
    :title="`Login #${login.id}${data?.login.login || login.login ? ` · ${data?.login.login || login.login}` : ''}`"
    subtitle="Dados de conexão"
    :icon="Network"
    module="network"
    @close="emit('close')"
  >
    <LiveQueryState :loading="loading" :error="error" @retry="reload" />
    <template v-if="data && !loading && !error">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <TechnicalStatus
          :label="data.login.status === 'online' ? 'Online' : 'Offline'"
          :tone="data.login.status === 'online' ? 'success' : 'danger'"
          connection
        />
        <TechnicalStatus :label="data.login.active ? 'Ativo' : 'Inativo'" :tone="data.login.active ? 'success' : 'neutral'" />
        <NetworkMonitorStatus :state="monitor.state.value" :checked-at="monitor.checkedAt.value" :message="monitor.message.value" />
        <button v-if="data.login.ip" type="button" class="button-secondary ml-auto" @click="copy(data.login.ip)">
          <Copy class="h-3.5 w-3.5" aria-hidden="true" />Copiar IP
        </button>
        <button type="button" class="button-secondary" @click="reload">
          <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar login
        </button>
      </div>
      <p class="mb-3 text-[11px] text-slate-500">Com IP: online. Sem IP: offline. A conexão independe de vínculo com ONU.</p>
      <div class="mb-3 grid gap-3 lg:grid-cols-2">
        <ContractFields
          title="Cliente e contrato"
          :icon="Network"
          :fields="[
            { label: 'Cliente', value: data.login.customerName },
            { label: 'ID do cliente', value: data.login.customerId },
            { label: 'CPF / CNPJ', value: data.login.customerDocument },
            { label: 'Contrato', value: data.login.contractName },
            { label: 'ID do contrato', value: data.login.contractId },
            {
              label: 'Status do contrato',
              value:
                data.login.contractStatus === 'A' ? 'Ativo' : data.login.contractStatus === 'I' ? 'Inativo' : data.login.contractStatus,
            },
          ]"
        />
        <ContractFields
          title="Rede e localização"
          :fields="[
            { label: 'IP', value: data.login.ip },
            { label: 'MAC', value: data.login.mac },
            { label: 'Caixa FTTH', value: data.login.ftthBoxName ?? (data.login.ftthBoxId ? `#${data.login.ftthBoxId}` : null) },
            { label: 'Porta', value: data.login.port },
            { label: 'Cidade', value: data.login.city },
            { label: 'Filial', value: data.login.branch },
            { label: 'Concentrador', value: data.login.concentrator },
            {
              label: 'Vínculo da caixa',
              value: data.login.ftthBoxId ? (data.login.ftthBoxSource === 'onu' ? 'ONU compatível' : 'Cadastro do login') : null,
            },
          ]"
        />
      </div>
      <div class="mb-3 flex flex-wrap gap-3">
        <RecordQuickLink
          v-if="data.login.ftthBoxId"
          :target="{ kind: 'box', id: data.login.ftthBoxId, name: data.login.ftthBoxName ?? undefined }"
          label="Ver caixa FTTH"
        />
        <RecordQuickLink
          v-if="data.login.contractId"
          :target="{ kind: 'contract', id: data.login.contractId, module: auth.can('support.contract.view') ? 'support' : 'upgrades' }"
          :label="`Ver contrato #${data.login.contractId}`"
        />
        <RecordQuickLink
          v-if="data.login.contractId"
          :target="{ kind: 'login', id: data.login.id, contractId: data.login.contractId }"
          label="Dados completos no Suporte"
        />
        <CustomerQuickLinks
          v-if="data.login.customerId"
          :customer-id="data.login.customerId"
          :contract-id="data.login.contractId ?? undefined"
        />
      </div>
      <LoginSignalCard module="network" :login-id="login.id" direct />
      <div class="mt-3">
        <ContractFields
          title="Histórico recente da conexão"
          :fields="[
            { label: 'Última conexão', value: formatIxcDateTime(data.login.lastConnectedAt) },
            { label: 'Última desconexão', value: formatIxcDateTime(data.login.lastDisconnectedAt) },
            { label: 'Motivo da desconexão', value: data.login.disconnectReason },
            { label: 'Sinal do último atendimento', value: data.login.lastServiceSignal },
          ]"
        />
      </div>
    </template>
  </RecordDetailDialog>
</template>
