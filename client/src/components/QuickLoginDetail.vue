<script setup lang="ts">
import { watch } from "vue";
import { supportApi } from "../supportApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import LoginDetails from "./LoginDetails.vue";
import LiveQueryState from "./LiveQueryState.vue";
const props = defineProps<{ contractId: number; loginId: number }>();
const emit = defineEmits<{ loaded: [login: string] }>();
const { data, loading, error, reload } = useLiveQuery((signal) => supportApi.login(String(props.contractId), props.loginId, signal));
watch(data, (value) => {
  if (value) emit("loaded", value.login.login ?? "");
});
</script>
<template>
  <LiveQueryState :loading="loading" :error="error" @retry="reload" />
  <LoginDetails v-if="data && !loading && !error" :login="data.login" module="support" :contract-id="String(contractId)" />
</template>
