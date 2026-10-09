<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { Paperclip, FileImage, FileText, Download, RefreshCw, Inbox, LoaderCircle } from "lucide-vue-next";
import { supportApi, type SupportOrderFile } from "../supportApi";
import { formatIxcDateTime } from "../upgradesApi";
import { useLiveQuery } from "../composables/useLiveQuery";
import { toast } from "../notifications/toast";
import LiveQueryState from "./LiveQueryState.vue";
import LivePagination from "./LivePagination.vue";
const props = defineProps<{ customerId: string; caseId: number }>();
const page = ref(1),
  limit = ref(10);
const params = computed(() => new URLSearchParams({ page: String(page.value), limit: String(limit.value) }));
const { data, loading, error, reload } = useLiveQuery((signal) =>
  supportApi.orderFiles(props.customerId, props.caseId, params.value, signal)
);
const selected = shallowRef<SupportOrderFile | null>(null),
  blob = shallowRef<Blob | null>(null);
const url = ref(""),
  opening = ref(false),
  fileError = ref("");
let controller: AbortController | undefined,
  version = 0;
function clear() {
  version++;
  controller?.abort();
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = "";
  blob.value = null;
  selected.value = null;
  opening.value = false;
  fileError.value = "";
}
async function refresh() {
  clear();
  await reload();
}
defineExpose({ reload: refresh });
watch([page, limit], refresh);
watch(data, (value) => {
  if (selected.value && !value?.items.some((item) => item.id === selected.value?.id)) clear();
});
onBeforeUnmount(clear);
async function open(file: SupportOrderFile) {
  clear();
  selected.value = file;
  opening.value = true;
  controller = new AbortController();
  const current = version;
  try {
    const result = await supportApi.orderFileContent(props.customerId, props.caseId, file.id, controller.signal);
    if (current !== version) return;
    blob.value = result;
    url.value = URL.createObjectURL(result);
  } catch (reason) {
    if (current === version) fileError.value = reason instanceof Error ? reason.message : "Não foi possível abrir o arquivo.";
  } finally {
    if (current === version) opening.value = false;
  }
}
function download() {
  if (!url.value || !selected.value) return;
  const link = document.createElement("a");
  link.href = url.value;
  link.download = selected.value.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast.success("Download iniciado", selected.value.name);
}
const image = computed(() => ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(blob.value?.type ?? ""));
const pdf = computed(() => blob.value?.type === "application/pdf");
const fileIcon = (file: SupportOrderFile) => (["png", "jpg", "jpeg", "webp", "gif"].includes(file.extension ?? "") ? FileImage : FileText);
</script>
<template>
  <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
    <h4 class="flex items-center gap-1.5 text-xs font-semibold">
      <Paperclip class="h-3.5 w-3.5" aria-hidden="true" />Arquivos da ordem de serviço
      <span v-if="data" class="font-normal text-slate-500">· {{ data.total }} anexos</span>
    </h4>
    <button type="button" class="button-secondary" :disabled="loading" @click="refresh">
      <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Atualizar arquivos
    </button>
  </div>
  <LiveQueryState :loading="loading" :error="error" @retry="refresh" />
  <template v-if="data && !loading && !error">
    <div v-if="!data.items.length" class="support-case-empty">
      <Inbox class="h-6 w-6" aria-hidden="true" /><strong>Nenhum arquivo anexado</strong>
      <p>O IXC não retornou arquivos para esta ordem de serviço.</p>
    </div>
    <div v-else class="grid min-w-0 items-start gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div class="min-w-0 space-y-2" aria-label="Anexos da OS">
        <button
          v-for="file in data.items"
          :key="file.id"
          type="button"
          class="support-case-card flex w-full items-start gap-2 text-left"
          :class="selected?.id === file.id ? 'border-current ring-1 ring-current' : ''"
          :aria-pressed="selected?.id === file.id"
          :aria-label="`Visualizar arquivo ${file.name}`"
          @click="open(file)"
        >
          <component :is="fileIcon(file)" class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span class="min-w-0 flex-1"
            ><strong class="block break-words text-xs">{{ file.description ?? file.name }}</strong>
            <span v-if="file.description && file.description !== file.name" class="mt-1 block break-all text-[11px] text-slate-500">{{
              file.name
            }}</span>
            <span class="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500"
              ><span>{{ file.extension?.toUpperCase() ?? "Arquivo" }}</span
              ><span>{{ formatIxcDateTime(file.uploadedAt) }}</span></span
            >
            <span class="mt-1 block text-[10px] text-slate-500"
              >Anexo #{{ file.id }}<template v-if="file.messageId"> · Interação #{{ file.messageId }}</template></span
            >
          </span>
        </button>
      </div>
      <section class="support-case-card min-w-0" aria-label="Visualização do anexo" aria-live="polite" :aria-busy="opening">
        <header v-if="selected" class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <h5 class="min-w-0 break-all text-xs font-semibold">{{ selected.name }}</h5>
          <button type="button" class="button-secondary" :disabled="!blob || opening" @click="download">
            <Download class="h-3.5 w-3.5" aria-hidden="true" />Baixar arquivo
          </button>
        </header>
        <div v-if="opening" class="support-case-empty">
          <LoaderCircle class="h-6 w-6 animate-spin" aria-hidden="true" /><strong>Carregando arquivo do IXC...</strong>
        </div>
        <div v-else-if="fileError" role="alert" class="support-case-empty">
          <strong>{{ fileError }}</strong
          ><button v-if="selected" type="button" class="button-secondary" @click="open(selected)">Tentar novamente</button>
        </div>
        <img
          v-else-if="image && url"
          :src="url"
          :alt="selected?.description ?? selected?.name ?? 'Anexo da OS'"
          class="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain"
        />
        <iframe
          v-else-if="pdf && url"
          :src="url"
          :title="`PDF: ${selected?.name}`"
          class="h-[65vh] w-full rounded-lg border border-slate-200"
          referrerpolicy="no-referrer"
        ></iframe>
        <div v-else class="support-case-empty">
          <FileText class="h-6 w-6" aria-hidden="true" /><strong>{{
            blob ? "Arquivo disponível para download" : "Selecione um arquivo para visualizar"
          }}</strong>
          <p>
            {{
              blob
                ? "Este formato deve ser aberto em um aplicativo compatível."
                : "Imagens e PDFs aparecem aqui. Outros formatos podem ser baixados."
            }}
          </p>
        </div>
      </section>
    </div>
    <LivePagination v-model:page="page" v-model:limit="limit" :total="data.total" :queried-at="data.queriedAt" />
    <p class="mt-2 text-[10px] text-slate-500">Consulta pela API IXC · Arquivos carregados sob demanda · Limite de 20 MB por arquivo.</p>
  </template>
</template>
