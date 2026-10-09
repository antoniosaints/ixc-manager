<script setup lang="ts">
import { ref, watch } from "vue";
import { Network, ChevronRight } from "lucide-vue-next";
import { type UpgradeLogin } from "../upgradesApi";
import { loginStatus } from "../supportApi";
import LoginDetails from "./LoginDetails.vue";
import LoginTechnologyBadge from "./LoginTechnologyBadge.vue";
import TechnicalStatus from "./TechnicalStatus.vue";
import RecordDetailDialog from "./RecordDetailDialog.vue";
const props = withDefaults(
  defineProps<{
    items: UpgradeLogin[];
    module: "support" | "upgrades";
    initialLogin?: UpgradeLogin | null;
    initialTab?: "overview" | "equipment";
  }>(),
  { initialTab: "overview" }
);
const emit = defineEmits<{ close: []; "focus-change": [focused: boolean] }>();
const selected = ref<UpgradeLogin | null>(null);
watch(
  () => props.module,
  () => {
    selected.value = null;
  }
);
watch(
  () => props.items,
  (items) => {
    if (selected.value) selected.value = items.find((item) => item.id === selected.value!.id) ?? selected.value;
  }
);
watch(
  () => selected.value?.id,
  (id) => emit("focus-change", !!id)
);
watch(
  () => props.initialLogin,
  (value) => {
    selected.value = value ?? null;
  },
  { immediate: true }
);
function close() {
  selected.value = null;
  emit("close");
}
</script>
<template>
  <div class="divide-y divide-slate-100">
    <button
      v-for="login in items"
      :key="login.id"
      type="button"
      class="support-case-summary support-record-trigger"
      aria-haspopup="dialog"
      :aria-label="`Ver detalhes do login #${login.id} · ${login.login ?? 'Login não informado'}`"
      @click="selected = login"
    >
      <span class="support-case-summary-icon" aria-hidden="true"><Network class="h-4 w-4" /></span>
      <span class="min-w-0 flex-1"
        ><strong class="block truncate text-xs" :title="login.login ?? undefined">{{ login.login ?? "Login não informado" }}</strong
        ><span class="block truncate text-[10px] text-slate-500"
          >Login #{{ login.id }} · {{ login.contractId ? `Contrato #${login.contractId}` : "Sem contrato vinculado" }} ·
          {{ login.ip ?? "Sem IP" }}</span
        ></span
      >
      <LoginTechnologyBadge :technology="login.technology" />
      <TechnicalStatus
        :label="loginStatus(login.status)"
        :tone="login.status === 'online' ? 'success' : login.status === 'offline' ? 'danger' : 'neutral'"
        connection
      />
      <span class="support-case-expand-label">Ver detalhes</span>
      <ChevronRight class="support-case-chevron h-4 w-4 shrink-0" aria-hidden="true" />
    </button>
  </div>
  <RecordDetailDialog
    v-if="selected"
    :key="`${module}-${selected.id}`"
    :title="`Login #${selected.id}${selected.login ? ` · ${selected.login}` : ''}`"
    :subtitle="selected.contractId ? `Contrato #${selected.contractId}` : 'Sem contrato vinculado'"
    :icon="Network"
    :module="module"
    @close="close"
  >
    <template #title-badge><LoginTechnologyBadge :technology="selected.technology" /></template>
    <div class="support-case-detail">
      <LoginDetails :login="selected" :module="module" :contract-id="String(selected.contractId ?? '')" :initial-tab="initialTab" />
    </div>
  </RecordDetailDialog>
</template>
