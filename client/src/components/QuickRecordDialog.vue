<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { FileText, Network, Headset, Wrench, ReceiptText } from "lucide-vue-next";
import { type RecordTarget } from "../recordNavigation";
import RecordDetailDialog from "./RecordDetailDialog.vue";
import LoginTechnologyBadge from "./LoginTechnologyBadge.vue";
import type { UpgradeLogin } from "../upgradesApi";
const props = defineProps<{ target: RecordTarget }>();
const emit = defineEmits<{ close: [] }>();
const Box = defineAsyncComponent(() => import("./NetworkBoxDialog.vue"));
const Contract = defineAsyncComponent(() => import("./SupportContractDetail.vue"));
const Login = defineAsyncComponent(() => import("./QuickLoginDetail.vue"));
const Case = defineAsyncComponent(() => import("./SupportCaseDetail.vue"));
const Collection = defineAsyncComponent(() => import("./CollectionCustomerDetail.vue"));
const Receivable = defineAsyncComponent(() => import("./FinanceTitleDetail.vue"));
const loginName = ref("");
const loginTechnology = ref<UpgradeLogin["technology"]>();
function loginLoaded(name: string, technology: UpgradeLogin["technology"]) {
  loginName.value = name;
  loginTechnology.value = technology;
}
watch(
  () => props.target,
  () => {
    loginName.value = "";
    loginTechnology.value = undefined;
  }
);
const title = computed(
  () =>
    `${{ box: "Caixa", contract: "Contrato", login: "Login", orders: "Ordem de serviço", tickets: "Atendimento", collection: "Cobranças do cliente", receivable: "Título" }[props.target.kind]} #${props.target.id}${props.target.kind === "login" && loginName.value ? ` · ${loginName.value}` : ""}`
);
const icon = computed(
  () =>
    ({
      box: Network,
      contract: FileText,
      login: Network,
      orders: Wrench,
      tickets: Headset,
      collection: ReceiptText,
      receivable: ReceiptText,
    })[props.target.kind]
);
</script>
<template>
  <Box v-if="target.kind === 'box'" :box-id="target.id" :box-name="target.name ?? `Caixa #${target.id}`" @close="emit('close')" />
  <RecordDetailDialog
    v-else
    :title="title"
    subtitle="Acesso rápido · Feche para voltar ao registro anterior"
    :icon="icon"
    :module="
      target.kind === 'receivable'
        ? 'finance'
        : target.kind === 'collection'
          ? 'collections'
          : target.kind === 'contract'
            ? target.module
            : 'support'
    "
    @close="emit('close')"
  >
    <template #title-badge
      ><LoginTechnologyBadge v-if="target.kind === 'login' && loginTechnology" :technology="loginTechnology"
    /></template>
    <Contract v-if="target.kind === 'contract'" :contract-id="String(target.id)" :module="target.module" />
    <Login
      v-else-if="target.kind === 'login'"
      :key="`${target.contractId}-${target.id}`"
      :contract-id="target.contractId"
      :login-id="target.id"
      @loaded="loginLoaded"
    />
    <Case
      v-else-if="target.kind === 'orders' || target.kind === 'tickets'"
      :customer-id="String(target.customerId)"
      :kind="target.kind"
      :case-id="target.id"
    />
    <Receivable v-else-if="target.kind === 'receivable'" :title-id="target.id" :customer-id="target.customerId" />
    <Collection v-else-if="target.kind === 'collection'" :customer-id="target.id" :filters="{ scope: 'open', status: 'all' }" />
  </RecordDetailDialog>
</template>
