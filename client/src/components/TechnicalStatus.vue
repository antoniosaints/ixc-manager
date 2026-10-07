<script setup lang="ts">
import { CheckCircle2, CircleAlert, CircleDashed, Wifi, WifiOff } from "lucide-vue-next";
import { computed } from "vue";
const props = defineProps<{ label: string; tone?: "success" | "danger" | "active" | "neutral"; connection?: boolean }>();
const icon = computed(() =>
  props.connection
    ? props.tone === "success"
      ? Wifi
      : props.tone === "danger"
        ? WifiOff
        : CircleDashed
    : props.tone === "success"
      ? CheckCircle2
      : props.tone === "danger"
        ? CircleAlert
        : CircleDashed
);
</script>
<template>
  <span class="support-case-badge" :data-tone="tone ?? 'neutral'"
    ><component :is="icon" class="h-3 w-3 shrink-0" aria-hidden="true" />{{ label }}</span
  >
</template>
