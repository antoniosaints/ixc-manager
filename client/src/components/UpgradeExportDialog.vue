<script setup lang="ts">
import { toast } from "../notifications/toast";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Download, FileText, LoaderCircle, X } from "lucide-vue-next";
import { upgradesApi } from "../upgradesApi";
import { useAppearanceStore } from "../stores/appearance";

const appearance = useAppearanceStore();

const props = defineProps<{ filters: Record<string, string>; contractIds: number[]; selectedClients: number; total: number }>();
const emit = defineEmits<{ close: [] }>();
const mode = ref(props.contractIds.length ? "selected" : "filtered");
const people = ref(props.contractIds.length ? 1 : 5);
const perPerson = ref(props.contractIds.length ? Math.min(10, props.selectedClients) : 10);
const names = ref<string[]>([]);
const includeNotes = ref(true);
const busy = ref(false);
const error = ref("");
const dialog = ref<HTMLElement>();
const returnFocus = document.activeElement as HTMLElement | null;
const appRoot = document.getElementById("app");
const previousInert = appRoot?.inert ?? false;
const previousOverflow = document.body.style.overflow;
let controller: AbortController | undefined;
const count = computed(() => (Number.isInteger(people.value) ? Math.min(20, Math.max(0, people.value)) : 0));
const required = computed(() => people.value * perPerson.value);
const valid = computed(
  () =>
    count.value > 0 &&
    people.value <= 20 &&
    Number.isInteger(perPerson.value) &&
    perPerson.value >= 1 &&
    perPerson.value <= 20 &&
    required.value <= 200
);
const available = computed(() => (mode.value === "selected" ? props.selectedClients : props.total));
const insufficient = computed(() => valid.value && required.value > available.value);
watch([people, perPerson, mode], () => {
  error.value = "";
});
onMounted(async () => {
  if (appRoot) appRoot.inert = true;
  document.body.style.overflow = "hidden";
  await nextTick();
  dialog.value?.querySelector<HTMLInputElement>('input[type="number"]')?.focus();
});
onUnmounted(() => {
  controller?.abort();
  if (appRoot) appRoot.inert = previousInert;
  document.body.style.overflow = previousOverflow;
  returnFocus?.focus();
});
const close = () => {
  controller?.abort();
  emit("close");
};
const keydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
  if (event.key !== "Tab") return;
  const elements = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []
  );
  const first = elements[0],
    last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
};
const download = async () => {
  if (!valid.value || insufficient.value || busy.value) return;
  busy.value = true;
  error.value = "";
  controller = new AbortController();
  try {
    const blob = await upgradesApi.export(
      {
        filters: props.filters,
        themeMode: appearance.dark ? "dark" : "light",
        includeNotes: includeNotes.value,
        peopleCount: people.value,
        clientsPerPerson: perPerson.value,
        names: Array.from({ length: people.value }, (_, index) => names.value[index]?.trim() ?? ""),
        ...(mode.value === "selected" ? { contractIds: props.contractIds } : {}),
      },
      controller.signal
    );
    if (controller.signal.aborted) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lista-de-upgrades.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("PDF gerado", "O download da lista de upgrades foi solicitado.");
    emit("close");
  } catch (reason) {
    if (!controller.signal.aborted) {
      error.value = reason instanceof Error ? reason.message : "Não foi possível gerar o PDF.";
      toast.error("Falha ao exportar PDF", error.value);
    }
  } finally {
    busy.value = false;
  }
};
</script>
<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      @mousedown.self.prevent
      @keydown="keydown"
    >
      <section
        ref="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-export-title"
        class="flex max-h-[90dvh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl"
      >
        <header class="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id="upgrade-export-title" class="flex items-center gap-2 text-lg font-bold">
              <FileText class="h-5 w-5 text-violet-600" aria-hidden="true" focusable="false" />Exportar lista de upgrades
            </h2>
            <p class="mt-1 text-xs text-slate-500">Uma página por pessoa, pronta para distribuir.</p>
          </div>
          <button type="button" class="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar exportação" @click="close">
            <X class="h-5 w-5" aria-hidden="true" focusable="false" />
          </button>
        </header>
        <form class="overflow-y-auto px-6 py-5" @submit.prevent="download">
          <fieldset :disabled="busy" class="space-y-5">
            <div>
              <p class="mb-2 text-xs font-semibold text-slate-600">Origem dos clientes</p>
              <div class="grid grid-cols-2 gap-2">
                <label
                  class="flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm"
                  :class="mode === 'filtered' ? 'border-violet-300 bg-violet-50' : 'border-slate-200'"
                  ><input v-model="mode" type="radio" value="filtered" name="export-mode" class="mt-1 accent-violet-600" /><span
                    class="font-semibold"
                    >Lista filtrada<span class="mt-1 block text-xs font-normal text-slate-500"
                      >Todas as páginas · {{ total }} contratos</span
                    ></span
                  ></label
                >
                <label
                  class="flex items-start gap-2 rounded-xl border p-3 text-sm"
                  :class="mode === 'selected' ? 'border-violet-300 bg-violet-50' : 'border-slate-200'"
                  ><input
                    v-model="mode"
                    type="radio"
                    value="selected"
                    name="export-mode"
                    :disabled="!contractIds.length"
                    class="mt-1 accent-violet-600"
                  /><span class="font-semibold"
                    >Selecionados<span class="mt-1 block text-xs font-normal text-slate-500"
                      >{{ selectedClients }} clientes · {{ contractIds.length }} contratos</span
                    ></span
                  ></label
                >
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <label class="text-xs font-semibold text-slate-600"
                >Quantidade de pessoas<input v-model.number="people" type="number" min="1" max="20" required class="input mt-1"
              /></label>
              <label class="text-xs font-semibold text-slate-600"
                >Clientes por pessoa<input v-model.number="perPerson" type="number" min="1" max="20" required class="input mt-1"
              /></label>
            </div>
            <div class="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
              <strong>{{ valid ? people : "—" }} {{ people === 1 ? "página" : "páginas" }}</strong> · {{ valid ? perPerson : "—" }} clientes
              em cada ·
              <strong>{{ valid ? required : "—" }} clientes no total</strong>
            </div>
            <p v-if="mode === 'selected' && valid && selectedClients > required" class="!mt-2 text-xs text-slate-500">
              Entram os primeiros {{ required }} clientes; {{ selectedClients - required }} ficam fora desta exportação.
            </p>
            <label class="flex items-start gap-2 text-sm"
              ><input v-model="includeNotes" type="checkbox" class="mt-1 accent-violet-600" /><span
                >Linha para anotações em cada cliente<small class="mt-1 block text-slate-500"
                  >Layout compacto. Até 15 clientes por página oferece mais espaço para escrever.</small
                ></span
              ></label
            >
            <div>
              <p class="mb-2 text-xs font-semibold text-slate-600">
                Nomes dos responsáveis <span class="font-normal text-slate-400">(opcional)</span>
              </p>
              <div class="grid gap-2 sm:grid-cols-2">
                <label v-for="(_, index) in count" :key="index" class="text-xs text-slate-500"
                  >Pessoa {{ index + 1
                  }}<input v-model="names[index]" :placeholder="`Responsável ${index + 1}`" maxlength="80" class="input mt-1 !py-2"
                /></label>
              </div>
            </div>
          </fieldset>
          <p class="mt-4 text-xs leading-relaxed text-slate-500">
            Usa os filtros aplicados e prioriza o fim da permanência mais antigo. Cada cliente aparece uma vez neste PDF; quando há vários
            contratos, entra o primeiro elegível. Limite: 20 pessoas, 20 clientes por pessoa e 200 clientes no total.
          </p>
          <p v-if="!valid" role="alert" class="mt-3 text-sm text-amber-700">Revise as quantidades e respeite o limite de 200 clientes.</p>
          <p v-else-if="insufficient" role="alert" class="mt-3 text-sm text-amber-700">
            A lista tem menos clientes que o solicitado. Reduza as quantidades ou amplie a lista.
          </p>
          <p v-if="error" role="alert" class="mt-3 text-sm text-red-600">{{ error }}</p>
          <footer class="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <span class="text-[11px] text-slate-400">Nova consulta ao IXC ao gerar</span>
            <div class="flex gap-2">
              <button type="button" class="button-secondary" @click="close">Cancelar</button
              ><button class="button-upgrades" type="submit" :disabled="!valid || insufficient || busy">
                <LoaderCircle v-if="busy" class="h-4 w-4 animate-spin" aria-hidden="true" focusable="false" /><Download
                  v-else
                  class="h-4 w-4"
                  aria-hidden="true"
                  focusable="false"
                />{{ busy ? "Gerando…" : "Baixar PDF" }}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>
