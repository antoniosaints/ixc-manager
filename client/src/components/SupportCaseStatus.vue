<script setup lang="ts">
import { computed } from "vue";
import { CheckCircle2, CircleAlert, Clock3, CircleDashed } from "lucide-vue-next";
import { caseStatus } from "../supportApi";
const props = defineProps<{ status: string; kind: "orders" | "tickets" }>();
const tone = computed(() => {
  if ((props.kind === "orders" && props.status === "F") || (props.kind === "tickets" && props.status === "S")) return "success";
  if (props.kind === "tickets" && props.status === "C") return "danger";
  if (
    (props.kind === "orders" && ["AN", "EN", "AS", "AG", "EX", "RAG", "DS"].includes(props.status)) ||
    (props.kind === "tickets" && ["P", "EP"].includes(props.status))
  )
    return "active";
  return "neutral";
});
const icon = computed(() => ({ success: CheckCircle2, danger: CircleAlert, active: Clock3, neutral: CircleDashed })[tone.value]);
</script>
<template>
  <span class="support-case-badge" :data-tone="tone">
    <component :is="icon" class="h-3 w-3 shrink-0" aria-hidden="true" />{{ caseStatus(status, kind) }}
  </span>
</template>
