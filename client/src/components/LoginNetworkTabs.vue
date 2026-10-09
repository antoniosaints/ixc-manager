<script setup lang="ts">
import { ref, useId } from "vue";
import { Network, ChartNoAxesCombined } from "lucide-vue-next";
import LoginConsumption from "./LoginConsumption.vue";
import type { LoginToolScope } from "../loginToolsApi";
defineProps<{ loginId: number; scope: LoginToolScope }>();
const tab = ref<"connection" | "consumption">("connection"),
  id = useId();
function keyboard(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  tab.value =
    event.key === "Home" ? "connection" : event.key === "End" ? "consumption" : tab.value === "connection" ? "consumption" : "connection";
  (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`[data-tab="${tab.value}"]`)?.focus();
}
</script>
<template>
  <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
    <div class="support-case-tabs w-fit" role="tablist" aria-label="Dados do login" @keydown="keyboard">
      <button
        v-for="item in [
          { id: 'connection', label: 'Conexão', icon: Network },
          { id: 'consumption', label: 'Consumo', icon: ChartNoAxesCombined },
        ] as const"
        :id="`${id}-${item.id}`"
        :key="item.id"
        type="button"
        role="tab"
        :data-tab="item.id"
        :aria-controls="`${id}-panel`"
        :aria-selected="tab === item.id"
        :tabindex="tab === item.id ? 0 : -1"
        :class="{ 'is-active': tab === item.id }"
        @click="tab = item.id"
      >
        <component :is="item.icon" class="h-3.5 w-3.5" aria-hidden="true" />{{ item.label }}
      </button>
    </div>
    <div v-if="$slots.actions" class="ml-auto"><slot name="actions" /></div>
  </div>
  <div :id="`${id}-panel`" role="tabpanel" :aria-labelledby="`${id}-${tab}`">
    <LoginConsumption v-if="tab === 'consumption'" :login-id="loginId" :scope="scope" /><slot v-else />
  </div>
</template>
