<script setup lang="ts">
defineProps<{ level: string }>();
const colors: Record<string, string> = {
  LOW: "bg-emerald-100 text-emerald-700",
  ATTENTION: "bg-amber-100 text-amber-700",
  MEDIUM: "bg-orange-100 text-orange-700",
  HIGH: "bg-rose-100 text-rose-700",
  CRITICAL: "bg-red-100 text-red-700",
};
const labels: Record<string, string> = { LOW: "BAIXO", ATTENTION: "ATENÇÃO", MEDIUM: "MÉDIO", HIGH: "ALTO", CRITICAL: "CRÍTICO" };
</script>
<template>
  <span class="pill" :class="colors[level] ?? 'bg-slate-100 text-slate-700'">{{ labels[level] ?? level }}</span>
</template>
