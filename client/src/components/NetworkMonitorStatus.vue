<script setup lang="ts">
import { computed } from "vue";
import { Radio } from "lucide-vue-next";
import { formatConsulted } from "../upgradesApi";
const props = defineProps<{ state: string; checkedAt: string | null; message?: string }>();
const labels: Record<string, string> = {
  connected: "Ao vivo · 1 s",
  connecting: "Conectando monitor",
  reconnecting: "Reconectando monitor",
  unavailable: "Monitor indisponível",
  paused: "Monitor pausado",
  forbidden: "Monitor sem acesso",
  stale: "Aguardando atualização",
};
const label = computed(() => labels[props.state]);
</script>
<template>
  <span
    v-if="state !== 'disabled'"
    class="network-monitor-status"
    role="status"
    :title="
      message ||
      (checkedAt
        ? `Última verificação: ${formatConsulted(checkedAt)} (Brasília). Conexão informada pelo IXC, consultada a cada 1 segundo na aba ou modal em foco.`
        : 'Conectando ao acompanhamento de conexões.')
    "
  >
    <Radio class="h-3.5 w-3.5" :class="state === 'connected' ? 'text-emerald-600' : 'text-amber-600'" aria-hidden="true" />{{ label }}
  </span>
</template>
