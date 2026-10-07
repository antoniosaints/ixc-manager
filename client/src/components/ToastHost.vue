<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, watch } from "vue";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X, LoaderCircle } from "lucide-vue-next";
import { toast, toastPositions, restoreToastPreferences } from "../notifications/toast";
import { activeRecordDialogTarget } from "../composables/recordDialog";
const icons = { success: CheckCircle2, error: CircleAlert, warning: TriangleAlert, info: Info };
const groups = computed(() =>
  toastPositions
    .map((position) => ({ position, items: toast.items.filter((item) => item.position === position) }))
    .filter((group) => group.items.length)
);
const visibility = () => toast.visibility(document.hidden);
const origins = new Map<number, HTMLElement>();
watch(
  () => toast.items.map((item) => item.id),
  (ids) => {
    for (const id of origins.keys()) if (!ids.includes(id)) origins.delete(id);
  }
);
function focusIn(event: FocusEvent, id: number) {
  toast.pause(id, "focus");
  if (event.relatedTarget instanceof HTMLElement && !(event.currentTarget as HTMLElement).contains(event.relatedTarget))
    origins.set(id, event.relatedTarget);
}
async function interact(id: number, action?: number) {
  const origin = origins.get(id);
  if (action === undefined) toast.dismiss(id);
  else await toast.act(id, action);
  await nextTick();
  if (!toast.items.some((item) => item.id === id) && origin?.isConnected) origin.focus();
}
onMounted(() => {
  restoreToastPreferences();
  visibility();
  document.addEventListener("visibilitychange", visibility);
});
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", visibility);
  toast.clear();
});
function focusOut(event: FocusEvent, id: number) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) toast.resume(id, "focus");
}
</script>
<template>
  <Teleport :to="activeRecordDialogTarget">
    <div
      v-for="group in groups"
      :key="group.position"
      class="toast-stack"
      :data-position="group.position"
      role="region"
      aria-label="Notificações do sistema"
    >
      <TransitionGroup name="toast">
        <article
          v-for="item in group.items"
          :key="item.id"
          class="toast-card"
          :data-type="item.type"
          :aria-label="item.confirmation ? `Confirmação: ${item.title}` : item.title"
          :aria-busy="item.busy"
          @mouseenter="toast.pause(item.id, 'hover')"
          @mouseleave="toast.resume(item.id, 'hover')"
          @focusin="focusIn($event, item.id)"
          @focusout="focusOut($event, item.id)"
          @keydown.esc.stop.prevent="interact(item.id)"
        >
          <component :is="icons[item.type]" class="toast-icon h-5 w-5 shrink-0" aria-hidden="true" focusable="false" />
          <div class="min-w-0 flex-1">
            <div :role="item.type === 'error' || item.confirmation ? 'alert' : 'status'" aria-atomic="true">
              <p class="text-sm font-semibold leading-5">{{ item.title }}</p>
              <p v-if="item.message" class="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">{{ item.message }}</p>
            </div>
            <div v-if="item.actions?.length" class="mt-2 flex flex-wrap gap-2">
              <button
                v-for="(action, index) in item.actions"
                :key="index"
                type="button"
                class="toast-action"
                :disabled="item.busy"
                @click="interact(item.id, index)"
              >
                <LoaderCircle
                  v-if="item.busy && index === item.busyAction"
                  class="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                  focusable="false"
                />{{ action.label }}
              </button>
            </div>
          </div>
          <button
            type="button"
            class="toast-close"
            :disabled="item.busy"
            :aria-label="`Fechar aviso: ${item.title}`"
            title="Fechar aviso"
            @click="interact(item.id)"
          >
            <X class="h-4 w-4" aria-hidden="true" focusable="false" />
          </button>
        </article>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
