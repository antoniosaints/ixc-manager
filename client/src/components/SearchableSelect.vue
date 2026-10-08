<script setup lang="ts">
import { computed, ref, useId, watch, onBeforeUnmount, onMounted } from "vue";
import { ChevronDown, Check, Search } from "lucide-vue-next";
export interface SearchableOption {
  value: number | string;
  label: string;
  description?: string;
  disabled?: boolean;
}
const props = withDefaults(
  defineProps<{
    modelValue: number | string;
    options: SearchableOption[];
    label: string;
    placeholder?: string;
    disabled?: boolean;
    loading?: boolean;
    remote?: boolean;
    hint?: string;
    emptyMessage?: string;
  }>(),
  { placeholder: "Selecione", disabled: false, loading: false, remote: false }
);
const emit = defineEmits<{ "update:modelValue": [value: number | string]; search: [query: string] }>();
const id = useId(),
  root = ref<HTMLElement>(),
  input = ref<HTMLInputElement>(),
  open = ref(false),
  query = ref(""),
  active = ref(-1);
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const selected = ref<SearchableOption>();
watch(
  () => [props.modelValue, props.options] as const,
  () => {
    const match = props.options.find((o) => o.value === props.modelValue);
    if (match) selected.value = match;
    else if (selected.value?.value !== props.modelValue) selected.value = undefined;
  },
  { immediate: true }
);
const filtered = computed(() =>
  props.remote
    ? props.options
    : props.options.filter((o) => normalize(`${o.label} ${o.description ?? ""}`).includes(normalize(query.value)))
);
watch(filtered, () => {
  active.value = filtered.value.findIndex((o) => !o.disabled);
});
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) close();
  }
);
function close() {
  open.value = false;
  query.value = "";
}
function expand() {
  if (props.disabled) return;
  open.value = true;
  query.value = "";
  active.value = filtered.value.findIndex((o) => !o.disabled);
  if (props.remote) emit("search", "");
}
function choose(option: SearchableOption) {
  if (option.disabled || props.loading || props.disabled) return;
  emit("update:modelValue", option.value);
  close();
  input.value?.focus();
}
function keydown(event: KeyboardEvent) {
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    if (!open.value) {
      expand();
      return;
    }
    const direction = event.key === "ArrowDown" ? 1 : -1;
    for (let i = 0; i < filtered.value.length; i++) {
      active.value = (active.value + direction + filtered.value.length) % filtered.value.length;
      if (!filtered.value[active.value]?.disabled) break;
    }
    root.value?.querySelector(`#${CSS.escape(id)}-option-${active.value}`)?.scrollIntoView({ block: "nearest" });
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (open.value && active.value >= 0 && filtered.value[active.value]) choose(filtered.value[active.value]);
    else expand();
  } else if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    close();
  } else if (event.key === "Tab") close();
}
function outside(event: Event) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close();
}
onMounted(() => document.addEventListener("pointerdown", outside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
</script>
<template>
  <div ref="root" class="searchable-select relative min-w-0">
    <label :for="id" class="mb-1 block text-xs text-slate-500">{{ label }}</label>
    <div class="relative">
      <input
        ref="input"
        :id="id"
        role="combobox"
        :aria-label="label"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="`${id}-list`"
        :aria-activedescendant="open && active >= 0 ? `${id}-option-${active}` : undefined"
        :aria-describedby="hint ? `${id}-hint` : undefined"
        :value="open ? query : (selected?.label ?? '')"
        :placeholder="selected?.label ?? placeholder"
        :disabled="disabled"
        autocomplete="off"
        class="input w-full !h-8 !min-h-8 !py-1 !pl-2.5 !pr-8 !text-xs"
        @click="!open && expand()"
        @input="
          query = ($event.target as HTMLInputElement).value;
          open = true;
          if (remote) emit('search', query);
        "
        @keydown="keydown"
      />
      <Search v-if="open" class="pointer-events-none absolute right-2.5 top-2 h-4 w-4 text-slate-500" aria-hidden="true" /><ChevronDown
        v-else
        class="pointer-events-none absolute right-2.5 top-2 h-4 w-4 text-slate-500"
        aria-hidden="true"
      />
    </div>
    <div v-if="open" class="searchable-options panel absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border shadow-lg">
      <p v-if="loading" class="p-3 text-xs text-slate-500" role="status">Buscando…</p>
      <ul :id="`${id}-list`" role="listbox" :aria-label="label" :aria-busy="loading">
        <li
          v-for="(option, index) in filtered"
          :id="`${id}-option-${index}`"
          :key="option.value"
          role="option"
          :aria-selected="modelValue === option.value"
          :aria-disabled="option.disabled || loading"
          :class="{ 'searchable-active': index === active, 'opacity-50': option.disabled || loading }"
          class="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs"
          @pointerdown.prevent="!loading && choose(option)"
          @pointermove="active = index"
        >
          <div class="min-w-0 flex-1">
            <span class="block break-words font-medium">{{ option.label }}</span
            ><span v-if="option.description" class="mt-0.5 block break-words text-[11px] text-slate-500">{{ option.description }}</span>
          </div>
          <Check v-if="modelValue === option.value" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </li>
      </ul>
      <p v-if="!loading && !filtered.length" class="p-3 text-xs text-slate-500" role="status">
        {{ emptyMessage ?? (remote && !query ? "Digite para buscar." : "Nenhuma opção encontrada.") }}
      </p>
    </div>
    <p v-if="hint" :id="`${id}-hint`" class="mt-1 text-[11px] text-slate-500">{{ hint }}</p>
  </div>
</template>
<style scoped>
.searchable-options {
  background: var(--appearance-surface);
  border-color: var(--appearance-border);
}
.searchable-active {
  background: var(--appearance-muted);
}
</style>
