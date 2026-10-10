<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { FileText, Network, Package, ListPlus, RefreshCw, ArrowUpRight } from "lucide-vue-next";
import CustomerQuickLinks from "./CustomerQuickLinks.vue";
import { upgradesApi } from "../upgradesApi";
import { supportApi } from "../supportApi";
import { formatConsulted } from "../upgradesApi";
import { useAuthStore } from "../stores/auth";
import { useLiveQuery } from "../composables/useLiveQuery";
import ContractOverview from "./ContractOverview.vue";
import ContractLogins from "./ContractLogins.vue";
import ContractItemsTab from "./ContractItemsTab.vue";
import SupportComodato from "./SupportComodato.vue";
import LiveQueryState from "./LiveQueryState.vue";
const props = withDefaults(defineProps<{ contractId: string; module?: "support" | "upgrades" }>(), { module: "support" });
const auth = useAuthStore(),
  tab = ref("overview");
const { data, loading, error, reload } = useLiveQuery((signal) =>
  (props.module === "support" ? supportApi : upgradesApi).contract(props.contractId, signal)
);
const tabs = computed(() => [
  { id: "overview", label: "Visão geral", icon: FileText },
  ...(auth.can(`${props.module}.contract.view`)
    ? [
        { id: "products", label: "Produtos", icon: Package },
        { id: "additional-services", label: "Serviços adicionais", icon: ListPlus },
      ]
    : []),
  ...(props.module === "support" && auth.can("support.logins.view") ? [{ id: "logins", label: "Logins", icon: Network }] : []),
  ...(props.module === "support" && auth.can("support.comodato.view") ? [{ id: "comodato", label: "Comodatos", icon: Package }] : []),
]);
watch(tabs, (value) => {
  if (!value.some((item) => item.id === tab.value)) tab.value = "overview";
});
function keyboard(e: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const i = tabs.value.findIndex((item) => item.id === tab.value);
  tab.value =
    tabs.value[
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? tabs.value.length - 1
          : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.value.length) % tabs.value.length
    ]!.id;
  (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`#contract-${props.contractId}-${tab.value}`)?.focus();
}
</script>
<template>
  <div class="support-case-detail">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="support-case-tabs" role="tablist" :aria-label="`Informações do contrato ${contractId}`" @keydown="keyboard">
        <button
          v-for="item in tabs"
          :id="`contract-${contractId}-${item.id}`"
          :key="item.id"
          role="tab"
          type="button"
          :aria-selected="tab === item.id"
          :aria-controls="`contract-panel-${contractId}`"
          :tabindex="tab === item.id ? 0 : -1"
          @click="tab = item.id"
        >
          <component :is="item.icon" class="h-3.5 w-3.5" aria-hidden="true" />{{ item.label }}
        </button>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="button-secondary" :disabled="loading" @click="reload">
          <RefreshCw aria-hidden="true" />Atualizar contrato</button
        ><RouterLink :to="`/${module}/contracts/${contractId}`" class="button-secondary"
          >Abrir contrato<ArrowUpRight aria-hidden="true"
        /></RouterLink>
      </div>
    </div>
    <CustomerQuickLinks v-if="data" class="mb-3" :customer-id="data.contract.customerId" :contract-id="Number(contractId)" />
    <div :id="`contract-panel-${contractId}`" role="tabpanel" :aria-labelledby="`contract-${contractId}-${tab}`" tabindex="0">
      <template v-if="tab === 'overview'"
        ><LiveQueryState :loading="loading" :error="error" @retry="reload" /><ContractOverview
          v-if="data && !loading && !error"
          :contract="data.contract"
      /></template>
      <ContractItemsTab
        v-else-if="(tab === 'products' || tab === 'additional-services') && auth.can(`${module}.contract.view`)"
        :key="`${module}-${contractId}-${tab}`"
        :contract-id="contractId"
        :module="module"
        :kind="tab"
      />
      <ContractLogins v-else-if="tab === 'logins' && auth.can('support.logins.view')" :contract-id="contractId" />
      <SupportComodato v-else-if="tab === 'comodato' && auth.can('support.comodato.view')" :contract-id="contractId" />
    </div>
    <p v-if="data" class="mt-3 text-[10px] text-slate-500">
      Consultado em {{ formatConsulted(data.queriedAt) }} · Brasília · Consulta direta ao IXC
    </p>
  </div>
</template>
