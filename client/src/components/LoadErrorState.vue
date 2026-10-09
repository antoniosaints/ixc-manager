<script setup lang="ts">
import { AlertTriangle, RefreshCw } from "lucide-vue-next";
import { computed } from "vue";
import { queryErrorMessage } from "../queryErrorMessage";
const props = withDefaults(defineProps<{ error: string; title?: string; hint?: string; retrying?: boolean }>(), {
  title: "Não foi possível carregar os dados",
  hint: "Tente novamente para atualizar esta consulta.",
  retrying: false,
});
defineEmits<{ retry: [] }>();
const message = computed(() => queryErrorMessage(props.error));
</script>
<template>
  <div role="alert" class="load-error-state">
    <div class="load-error-content">
      <span class="load-error-icon"><AlertTriangle class="h-5 w-5" aria-hidden="true" /></span>
      <div class="min-w-0">
        <h3 class="text-sm font-bold">{{ title }}</h3>
        <p class="load-error-message">{{ message }}</p>
        <p class="load-error-hint">{{ hint }}</p>
        <button type="button" class="button-secondary mt-3" :disabled="retrying" @click="$emit('retry')">
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': retrying }" aria-hidden="true" />
          {{ retrying ? "Tentando novamente…" : "Tentar novamente" }}
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.load-error-state {
  display: flex;
  min-height: 11rem;
  align-items: center;
  padding: 1.5rem 1rem;
  color: var(--appearance-text);
}
.load-error-content {
  display: flex;
  width: min(100%, 40rem);
  gap: 0.85rem;
  margin: auto;
}
.load-error-icon {
  display: flex;
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  color: #b45309;
  background: #f59e0b18;
}
:global(html[data-theme="dark"] .load-error-icon) {
  color: #fbbf24;
}
.load-error-message {
  margin-top: 0.35rem;
  color: var(--appearance-secondary);
  font-size: 0.8rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.load-error-hint {
  margin-top: 0.4rem;
  color: var(--appearance-secondary);
  font-size: 0.7rem;
  line-height: 1.5;
}
</style>
