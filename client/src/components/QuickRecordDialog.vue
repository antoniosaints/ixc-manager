<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import { FileText, Network, Headset, Wrench, ReceiptText } from "lucide-vue-next";
import { type RecordTarget } from "../recordNavigation";
import RecordDetailDialog from "./RecordDetailDialog.vue";
const props = defineProps<{ target: RecordTarget }>();
const emit = defineEmits<{ close: [] }>();
const Box = defineAsyncComponent(() => import("./NetworkBoxDialog.vue"));
const Contract = defineAsyncComponent(() => import("./SupportContractDetail.vue"));
const Login = defineAsyncComponent(() => import("./QuickLoginDetail.vue"));
const Case = defineAsyncComponent(() => import("./SupportCaseDetail.vue"));
const Collection = defineAsyncComponent(() => import("./CollectionCustomerDetail.vue"));
const title = computed(
  () =>
    `${{ box: "Caixa", contract: "Contrato", login: "Login", orders: "Ordem de serviço", tickets: "Atendimento", collection: "Cobranças do cliente" }[props.target.kind]} #${props.target.id}`
);
const icon = computed(
  () => ({ box: Network, contract: FileText, login: Network, orders: Wrench, tickets: Headset, collection: ReceiptText })[props.target.kind]
);
</script>
<template>
  <Box v-if="target.kind === 'box'" :box-id="target.id" :box-name="target.name ?? `Caixa #${target.id}`" @close="emit('close')" />
  <RecordDetailDialog
    v-else
    :title="title"
    subtitle="Acesso rápido · Feche para voltar ao registro anterior"
    :icon="icon"
    :module="target.kind === 'collection' ? 'collections' : target.kind === 'contract' ? target.module : 'support'"
    @close="emit('close')"
  >
    <Contract v-if="target.kind === 'contract'" :contract-id="String(target.id)" :module="target.module" />
    <Login v-else-if="target.kind === 'login'" :contract-id="target.contractId" :login-id="target.id" />
    <Case
      v-else-if="target.kind === 'orders' || target.kind === 'tickets'"
      :customer-id="String(target.customerId)"
      :kind="target.kind"
      :case-id="target.id"
    />
    <Collection v-else-if="target.kind === 'collection'" :customer-id="target.id" :filters="{ scope: 'open', status: 'all' }" />
  </RecordDetailDialog>
</template>
