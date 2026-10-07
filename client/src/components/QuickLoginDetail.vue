<script setup lang="ts">
import { supportApi } from "../supportApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import LoginDetails from "./LoginDetails.vue";
import LiveQueryState from "./LiveQueryState.vue";
const props = defineProps<{ contractId: number; loginId: number }>();
const { data, loading, error, reload } = useLiveQuery((signal) => supportApi.login(String(props.contractId), props.loginId, signal));
</script>
<template>
  <LiveQueryState :loading="loading" :error="error" @retry="reload" />
  <LoginDetails v-if="data && !loading && !error" :login="data.login" module="support" :contract-id="String(contractId)" />
</template>
