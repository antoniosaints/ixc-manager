<script setup lang="ts">
import { permanenceLabel, type UpgradeContract } from "../upgradesApi";
defineProps<{ contract: UpgradeContract }>();
</script>
<template>
  <span
    class="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold"
    :class="
      contract.permanenceStatus === 'expired'
        ? 'bg-amber-50 text-amber-800'
        : contract.permanenceStatus === 'missing'
          ? 'bg-slate-100 text-slate-500'
          : 'bg-violet-50 text-violet-700'
    "
    >{{ permanenceLabel(contract) }}</span
  >
</template>
