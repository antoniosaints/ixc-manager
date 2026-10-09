<script setup lang="ts">
import { RefreshCw } from "lucide-vue-next";
import LoadErrorState from "./LoadErrorState.vue";
defineProps<{ loading: boolean; error: string }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <div v-if="loading" role="status" class="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-sm text-slate-500">
    <RefreshCw class="h-6 w-6 animate-spin text-violet-600" aria-hidden="true" focusable="false" />
    Consultando dados atuais no IXC…
  </div>
  <LoadErrorState v-else-if="error" :error="error" @retry="$emit('retry')" />
</template>
