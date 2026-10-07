<script setup lang="ts">
import { ref } from "vue";
import { Network, ChevronDown } from "lucide-vue-next";
import { type UpgradeLogin } from "../upgradesApi";
import { loginStatus } from "../supportApi";
import LoginDetails from "./LoginDetails.vue";
import TechnicalStatus from "./TechnicalStatus.vue";
defineProps<{ items: UpgradeLogin[]; module: "support" | "upgrades" }>();
const expanded = ref(new Set<number>());
function toggle(e: Event, id: number) {
  const next = new Set(expanded.value);
  if ((e.target as HTMLDetailsElement).open) next.add(id);
  else next.delete(id);
  expanded.value = next;
}
</script>
<template>
  <div class="divide-y divide-slate-100">
    <details v-for="login in items" :key="login.id" class="support-case-disclosure" @toggle="toggle($event, login.id)">
      <summary class="support-case-summary">
        <span class="support-case-summary-icon" aria-hidden="true"><Network class="h-4 w-4" /></span>
        <span class="min-w-0 flex-1"
          ><strong class="break-all text-xs">{{ login.login ?? "Login não informado" }}</strong
          ><span class="mt-0.5 block text-[10px] text-slate-500"
            >Login #{{ login.id }} · {{ login.contractId ? `Contrato #${login.contractId}` : "Sem contrato vinculado" }} ·
            {{ login.ip ?? "Sem IP" }}</span
          ></span
        >
        <TechnicalStatus
          :label="loginStatus(login.status)"
          :tone="login.status === 'online' ? 'success' : login.status === 'offline' ? 'danger' : 'neutral'"
          connection
        />
        <span class="support-case-expand-label"
          ><span class="support-case-expand">Ver detalhes</span><span class="support-case-collapse">Recolher</span></span
        ><ChevronDown class="support-case-chevron h-4 w-4 shrink-0" aria-hidden="true" />
      </summary>
      <div v-if="expanded.has(login.id)" class="support-case-detail">
        <LoginDetails :key="`${module}-${login.id}`" :login="login" :module="module" :contract-id="String(login.contractId ?? '')" />
      </div>
    </details>
  </div>
</template>
