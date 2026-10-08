<script setup lang="ts">
import { onMounted, onBeforeUnmount, provide, ref, useId, type Component } from "vue";
import { X } from "lucide-vue-next";
import { recordDialogPortal, registerRecordDialog } from "../composables/recordDialog";

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    icon: Component;
    module: "support" | "upgrades" | "collections" | "network" | "finance";
    compact?: boolean;
    closeOnBackdrop?: boolean;
  }>(),
  { closeOnBackdrop: true }
);
const emit = defineEmits<{ close: [] }>();
const id = `record-dialog-${useId()}`;
defineExpose({ target: `#${id}` });
const dialog = ref<HTMLDialogElement>();
const returnFocus = document.activeElement as HTMLElement | null;
provide(recordDialogPortal, `#${id}`);
let unregister: (() => void) | undefined;
onMounted(() => {
  unregister = registerRecordDialog(`#${id}`);
  dialog.value?.showModal();
});
onBeforeUnmount(() => {
  unregister?.();
  dialog.value?.close();
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
});
function backdrop(event: MouseEvent) {
  if (!props.closeOnBackdrop || event.target !== dialog.value) return;
  const rect = dialog.value.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) emit("close");
}
function keyboard(event: KeyboardEvent) {
  if (event.key !== "Tab") return;
  const elements = [
    ...(dialog.value?.querySelectorAll<HTMLElement>(
      "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]"
    ) ?? []),
  ].filter((element) => element.tabIndex >= 0 && element.getClientRects().length && !element.closest("[inert]"));
  const first = elements[0],
    last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
</script>
<template>
  <Teleport to="body">
    <dialog
      :id="id"
      ref="dialog"
      :data-module="module"
      class="record-detail-dialog"
      :class="{ 'record-detail-dialog-compact': compact }"
      aria-modal="true"
      :aria-labelledby="`${id}-title`"
      :aria-describedby="subtitle ? `${id}-context` : undefined"
      @cancel.prevent="emit('close')"
      @click="backdrop"
      @keydown="keyboard"
    >
      <header class="record-detail-dialog-header">
        <span class="support-case-summary-icon !h-9 !w-9 !rounded-lg" aria-hidden="true"><component :is="icon" class="h-5 w-5" /></span>
        <div class="min-w-0 flex-1">
          <h2 :id="`${id}-title`" class="break-words text-base font-bold">{{ title }}</h2>
          <p v-if="subtitle" :id="`${id}-context`" class="mt-0.5 break-words text-xs text-slate-500">{{ subtitle }}</p>
        </div>
        <button type="button" autofocus class="record-detail-dialog-close" :aria-label="`Fechar ${title}`" @click="emit('close')">
          <X class="h-4 w-4" aria-hidden="true" /><span>Fechar</span>
        </button>
      </header>
      <div class="record-detail-dialog-body"><slot /></div>
    </dialog>
  </Teleport>
</template>
