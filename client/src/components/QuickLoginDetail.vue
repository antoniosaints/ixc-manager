<script setup lang="ts">
import { watch } from "vue";
import { supportApi } from "../supportApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import LoginDetails from "./LoginDetails.vue";
import LiveQueryState from "./LiveQueryState.vue";
import type { UpgradeLogin } from "../upgradesApi";
const props = defineProps<{ contractId?: number; customerId?: number; loginId: number }>();
const emit = defineEmits<{ loaded: [login: string, technology: UpgradeLogin["technology"]] }>();
const { data, loading, error, reload } = useLiveQuery((signal) =>
  props.customerId !== undefined
    ? supportApi.customerLogin(String(props.customerId), props.loginId, signal)
    : supportApi.login(String(props.contractId), props.loginId, signal)
);
watch(data, (value) => {
  if (value) emit("loaded", value.login.login ?? "", value.login.technology);
});
</script>
<template>
  <LiveQueryState :loading="loading" :error="error" @retry="reload" />
  <LoginDetails v-if="data && !loading && !error" :login="data.login" module="support" :contract-id="String(data.login.contractId ?? '')" />
</template>
