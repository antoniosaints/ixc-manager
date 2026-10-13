<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, RotateCcw } from "lucide-vue-next";
import type { TableSort, SortDirection } from "../utils/tableSort";
const props = defineProps<{ column: string; sort: TableSort | null; label?: string }>();
const emit = defineEmits<{ change: [value: TableSort | null] }>();
const trigger = ref<HTMLButtonElement>();
const menu = ref<HTMLElement>();
const opened = ref(false);
const position = ref({ left: "0px", top: "0px" });
function close(restoreFocus = false) {
  if (menu.value?.matches(":popover-open")) menu.value.hidePopover();
  if (restoreFocus) trigger.value?.focus();
}
async function open() {
  if (opened.value) return close();
  const rect = trigger.value!.getBoundingClientRect();
  position.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 248))}px`,
    top: `${rect.bottom + 156 > window.innerHeight ? Math.max(8, rect.top - 156) : rect.bottom + 4}px`,
  };
  menu.value?.showPopover();
  await nextTick();
  (
    menu.value?.querySelector<HTMLButtonElement>("button[aria-checked='true']") ?? menu.value?.querySelector<HTMLButtonElement>("button")
  )?.focus();
}
function select(direction: SortDirection | null) {
  emit("change", direction ? { column: props.column, direction } : null);
  close(true);
}
function move(event: KeyboardEvent) {
  const buttons = [...(menu.value?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  } else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close(true);
  } else if (event.key === "Tab") close();
}
function dismiss(event: Event) {
  if (event.target instanceof Node && menu.value?.contains(event.target)) return;
  close();
}
function toggle(event: Event) {
  opened.value = (event as ToggleEvent).newState === "open";
  const action = opened.value ? "addEventListener" : "removeEventListener";
  window[action]("resize", dismiss);
  window[action]("scroll", dismiss, true);
}
onBeforeUnmount(() => {
  window.removeEventListener("resize", dismiss);
  window.removeEventListener("scroll", dismiss, true);
});
</script>
<template>
  <th
    scope="col"
    :aria-sort="sort?.column === column ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'"
    @click.self="open"
  >
    <button
      ref="trigger"
      type="button"
      class="table-sort-trigger"
      aria-haspopup="menu"
      :aria-expanded="opened"
      :aria-label="`Ordenar por ${label ?? column}`"
      :title="`Ordenar por ${label ?? column}`"
      @click.stop="open"
      @keydown.down.prevent="open"
    >
      <span><slot /></span>
      <ArrowUp v-if="sort?.column === column && sort.direction === 'asc'" class="table-sort-active" aria-hidden="true" />
      <ArrowDown v-else-if="sort?.column === column" class="table-sort-active" aria-hidden="true" />
      <ArrowUpDown v-else aria-hidden="true" />
    </button>
    <div
      ref="menu"
      popover="auto"
      role="menu"
      class="table-sort-menu"
      :style="position"
      :aria-label="`Ordenação: ${label ?? column}`"
      @toggle="toggle"
      @keydown="move"
      @click.stop
    >
      <button type="button" role="menuitemradio" :aria-checked="sort?.column === column && sort.direction === 'asc'" @click="select('asc')">
        <ArrowUp aria-hidden="true" /><span>Do menor para o maior</span
        ><Check v-if="sort?.column === column && sort.direction === 'asc'" aria-hidden="true" />
      </button>
      <button
        type="button"
        role="menuitemradio"
        :aria-checked="sort?.column === column && sort.direction === 'desc'"
        @click="select('desc')"
      >
        <ArrowDown aria-hidden="true" /><span>Do maior para o menor</span
        ><Check v-if="sort?.column === column && sort.direction === 'desc'" aria-hidden="true" />
      </button>
      <button type="button" role="menuitem" @click="select(null)"><RotateCcw aria-hidden="true" /><span>Limpar ordenação</span></button>
    </div>
  </th>
</template>
<style>
.table-sort-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: inherit;
  gap: 0.4rem;
  width: 100%;
  text-align: inherit;
  font: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  color: inherit;
  cursor: pointer;
  border-radius: 0.2rem;
}
.text-right > .table-sort-trigger {
  justify-content: flex-end;
}
.table-sort-trigger svg {
  width: 0.85rem;
  height: 0.85rem;
  flex-shrink: 0;
  opacity: 0.6;
}
.table-sort-trigger .table-sort-active {
  color: var(--appearance-primary-text);
  opacity: 1;
}
.table-sort-trigger:hover,
.table-sort-trigger:focus-visible {
  color: var(--appearance-primary-text);
}
.table-sort-trigger:focus-visible {
  outline: 2px solid var(--appearance-primary-text);
  outline-offset: 3px;
}
.table-sort-menu {
  position: fixed;
  margin: 0;
  width: 240px;
  padding: 0.3rem;
  border: 1px solid var(--appearance-border);
  border-radius: 0.6rem;
  background: var(--appearance-surface, white);
  color: var(--appearance-text, #334155);
  box-shadow: 0 8px 30px #0003;
  font-size: 0.75rem;
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
}
.table-sort-menu button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.65rem 0.5rem;
  text-align: left;
  border-radius: 0.35rem;
}
.table-sort-menu button:hover,
.table-sort-menu button:focus-visible {
  background: var(--appearance-muted, #f1f5f9);
  outline: none;
}
.table-sort-menu button[aria-checked="true"] {
  color: var(--appearance-primary-text);
  font-weight: 600;
}
.table-sort-menu svg {
  width: 0.9rem;
  height: 0.9rem;
  flex-shrink: 0;
}
.table-sort-menu span {
  flex: 1;
}
.table-sort-menu button:last-child {
  border-top: 1px solid var(--appearance-border);
  border-radius: 0 0 0.35rem 0.35rem;
}
</style>
