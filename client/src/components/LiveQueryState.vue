<script setup lang="ts">
import { AlertCircle, RefreshCw } from "lucide-vue-next";
defineProps<{ loading: boolean; error: string }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <div v-if="loading" role="status" class="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-sm text-slate-500">
    <RefreshCw class="h-6 w-6 animate-spin text-violet-600" aria-hidden="true" focusable="false" />
    Consultando dados atuais no IXC…
  </div>
  <div v-else-if="error" role="alert" class="flex flex-col items-center justify-center gap-3 p-8 text-center">
    <AlertCircle class="h-7 w-7 text-amber-600" aria-hidden="true" focusable="false" />
    <p class="max-w-lg text-sm text-slate-600">{{ error }}</p>
    <button type="button" class="button-secondary" @click="$emit('retry')">
      <RefreshCw class="h-4 w-4" aria-hidden="true" focusable="false" />Tentar novamente
    </button>
  </div>
</template>
