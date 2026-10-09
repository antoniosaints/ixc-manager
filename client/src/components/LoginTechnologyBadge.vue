<script setup lang="ts">
import { Cable, Radio, Network } from "lucide-vue-next";
defineProps<{ technology?: { label: string; kind: string; code: string | null } }>();
</script>
<template>
  <span
    class="support-case-badge"
    :data-tone="technology?.kind === 'fiber' ? 'active' : technology?.kind === 'radio' ? 'warning' : 'neutral'"
    :title="technology?.code ? `Tecnologia cadastrada no IXC (${technology.code})` : 'Tecnologia não informada no IXC'"
    ><component
      :is="technology?.kind === 'fiber' ? Cable : technology?.kind === 'radio' ? Radio : Network"
      class="h-3 w-3"
      aria-hidden="true"
    />{{ technology?.label ?? "Não informado" }}</span
  >
</template>
