<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ArrowUpRight } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";
import { canOpenRecord, type RecordTarget } from "../recordNavigation";
defineOptions({ inheritAttrs: false });
const props = defineProps<{ target: RecordTarget; label: string }>();
const auth = useAuthStore(),
  route = useRoute(),
  open = ref(false);
const allowed = computed(() => canOpenRecord(props.target, auth.can));
const Detail = defineAsyncComponent(() => import("./QuickRecordDialog.vue"));
watch([allowed, () => route.fullPath, () => JSON.stringify(props.target)], () => {
  open.value = false;
});
</script>
<template>
  <button
    v-if="allowed"
    v-bind="$attrs"
    type="button"
    class="record-quick-link"
    aria-haspopup="dialog"
    :aria-label="label"
    @click.stop="open = true"
  >
    <slot>{{ label }}</slot
    ><ArrowUpRight class="h-3 w-3 shrink-0" aria-hidden="true" />
  </button>
  <Detail v-if="open && allowed" :target="target" @close="open = false" />
</template>
