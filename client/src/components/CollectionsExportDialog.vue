<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from "vue";
import { FileText, Download, LoaderCircle } from "lucide-vue-next";
import RecordDetailDialog from "./RecordDetailDialog.vue";
import { collectionsApi } from "../collectionsApi";
import { useAppearanceStore } from "../stores/appearance";
import { toast } from "../notifications/toast";
const props = defineProps<{ filters: Record<string, string>; customerIds: number[]; total: number }>(),
  emit = defineEmits<{ close: [] }>();
const appearance = useAppearanceStore(),
  mode = ref(props.customerIds.length ? "selected" : "filtered"),
  people = ref(props.customerIds.length ? 1 : Math.min(5, Math.max(1, Math.floor(props.total / 10)))),
  perPerson = ref(Math.min(10, props.customerIds.length || props.total || 10)),
  names = ref<string[]>([]),
  notes = ref(true),
  busy = ref(false),
  error = ref("");
let controller: AbortController | undefined;
onBeforeUnmount(() => controller?.abort());
const required = computed(() => people.value * perPerson.value),
  count = computed(() => (Number.isInteger(people.value) ? Math.min(20, Math.max(0, people.value)) : 0));
const valid = computed(
  () =>
    Number.isInteger(people.value) &&
    people.value >= 1 &&
    people.value <= 20 &&
    Number.isInteger(perPerson.value) &&
    perPerson.value >= 1 &&
    perPerson.value <= 20 &&
    required.value <= 200
);
const insufficient = computed(() => required.value > (mode.value === "selected" ? props.customerIds.length : props.total));
async function download() {
  if (!valid.value || insufficient.value || busy.value) return;
  busy.value = true;
  error.value = "";
  controller = new AbortController();
  try {
    const blob = await collectionsApi.export(
      {
        filters: props.filters,
        peopleCount: people.value,
        clientsPerPerson: perPerson.value,
        names: Array.from({ length: people.value }, (_, i) => names.value[i]?.trim() ?? ""),
        includeNotes: notes.value,
        themeMode: appearance.dark ? "dark" : "light",
        ...(mode.value === "selected" ? { customerIds: props.customerIds } : {}),
      },
      controller.signal
    );
    if (controller.signal.aborted) return;
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "lista-de-cobrancas.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("PDF gerado", "O download da lista de cobranças foi solicitado.");
    emit("close");
  } catch (e) {
    if (!controller.signal.aborted) {
      error.value = e instanceof Error ? e.message : "Falha ao gerar PDF.";
      toast.error("Não foi possível exportar", error.value);
    }
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <RecordDetailDialog
    title="Exportar lista de cobranças"
    subtitle="Uma página por responsável, sem repetir clientes."
    :icon="FileText"
    module="collections"
    compact
    :close-on-backdrop="false"
    @close="emit('close')"
  >
    <form class="space-y-4" @submit.prevent="download">
      <fieldset :disabled="busy" class="space-y-4">
        <legend class="sr-only">Configurar distribuição</legend>
        <div class="flex flex-wrap gap-4 text-xs">
          <label class="flex items-center gap-2"
            ><input v-model="mode" type="radio" value="filtered" name="collection-export-mode" />Lista filtrada ({{
              total
            }}
            clientes)</label
          ><label class="flex items-center gap-2"
            ><input
              v-model="mode"
              type="radio"
              value="selected"
              name="collection-export-mode"
              :disabled="!customerIds.length"
            />Selecionados ({{ customerIds.length }})</label
          >
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="text-xs text-slate-500"
            >Pessoas<input v-model.number="people" class="input mt-1" type="number" min="1" max="20" required /></label
          ><label class="text-xs text-slate-500"
            >Clientes por pessoa<input v-model.number="perPerson" class="input mt-1" type="number" min="1" max="20" required
          /></label>
        </div>
        <p class="rounded-lg bg-slate-100 px-3 py-2 text-sm">
          <strong>{{ valid ? people : "—" }} páginas</strong> · {{ valid ? perPerson : "—" }} clientes em cada ·
          {{ valid ? required : "—" }} no total
        </p>
        <label class="flex items-center gap-2 text-xs"><input v-model="notes" type="checkbox" />Linha para anotações em cada cliente</label>
        <div class="grid gap-2 sm:grid-cols-2">
          <label v-for="i in count" :key="i" class="text-xs text-slate-500"
            >Pessoa {{ i }}<input v-model="names[i - 1]" class="input mt-1" maxlength="80" :placeholder="`Responsável ${i}`"
          /></label>
        </div>
      </fieldset>
      <p class="text-xs text-slate-500">
        Nova consulta ao banco ao gerar. Mantém os filtros e a ordenação aplicados e começa no primeiro cliente, incluindo outras páginas.
        Limite: 200 clientes, até 20 pessoas e 20 clientes por pessoa.
      </p>
      <p v-if="!valid || insufficient" role="alert" class="text-xs text-amber-700">
        {{
          !valid
            ? "Revise as quantidades; limite de 200 clientes."
            : "Quantidade acima dos clientes disponíveis. Reduza ou amplie os filtros."
        }}
      </p>
      <p v-if="error" role="alert" class="text-xs text-red-600">{{ error }}</p>
      <footer class="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" class="button-secondary" @click="emit('close')">Cancelar</button
        ><button type="submit" class="button-primary" :disabled="busy || !valid || insufficient">
          <LoaderCircle v-if="busy" class="animate-spin" aria-hidden="true" /><Download v-else aria-hidden="true" />{{
            busy ? "Gerando…" : "Baixar PDF"
          }}
        </button>
      </footer>
    </form>
  </RecordDetailDialog>
</template>
