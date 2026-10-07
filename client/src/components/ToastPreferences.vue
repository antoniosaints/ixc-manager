<script setup lang="ts">
import { Bell, Play, MessageSquare } from "lucide-vue-next";
import { toast, configureToast, toastPositions, type ToastPosition, type ToastType } from "../notifications/toast";
import { ref } from "vue";
const type = ref<ToastType>("success");
const positionLabels: Record<ToastPosition, string> = {
  "top-right": "Superior direito",
  "top-center": "Superior central",
  "top-left": "Superior esquerdo",
  "bottom-right": "Inferior direito",
  "bottom-center": "Inferior central",
  "bottom-left": "Inferior esquerdo",
};
const typeLabels = { success: "Sucesso", error: "Erro", warning: "Atenção", info: "Informação" };
function preview() {
  toast.show({
    title: `${typeLabels[type.value]} · aviso de demonstração`,
    message: "Os avisos seguem o tema atual. Você pode fechá-los pelo botão × ou pela tecla Esc ao focar uma ação.",
    type: type.value,
    key: "toast-preview",
  });
}
async function confirmation() {
  const accepted = await toast.confirm({
    title: "Testar confirmação",
    message: "Esta é uma demonstração. Nenhum dado será alterado.",
    key: "toast-confirm-preview",
    confirmLabel: "Confirmar teste",
  });
  if (accepted) toast.success("Confirmação recebida", "O botão de ação funciona com a mesma aparência do aviso.");
}
</script>
<template>
  <section class="panel p-4">
    <h2 class="mb-1 text-sm font-bold">
      <Bell class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Notificações
    </h2>
    <p class="mb-3 text-xs text-slate-500">
      Preferências deste navegador, aplicadas ao selecionar. Não alteram as configurações dos outros usuários.
    </p>
    <div class="flex flex-wrap items-end gap-3">
      <label class="min-w-44 flex-1 text-xs text-slate-500"
        >Posição dos avisos<select
          :value="toast.settings.position"
          class="input mt-1"
          @change="configureToast({ position: ($event.target as HTMLSelectElement).value as ToastPosition })"
        >
          <option v-for="position in toastPositions" :key="position" :value="position">{{ positionLabels[position] }}</option>
        </select></label
      >
      <label class="min-w-36 flex-1 text-xs text-slate-500"
        >Duração dos avisos<select
          :value="toast.settings.duration"
          class="input mt-1"
          @change="configureToast({ duration: Number(($event.target as HTMLSelectElement).value) })"
        >
          <option :value="3000">3 segundos</option>
          <option :value="5000">5 segundos</option>
          <option :value="8000">8 segundos</option>
          <option :value="15000">15 segundos</option>
        </select></label
      >
      <label class="min-w-32 flex-1 text-xs text-slate-500"
        >Tipo de teste<select v-model="type" class="input mt-1">
          <option v-for="(label, value) in typeLabels" :key="value" :value="value">{{ label }}</option>
        </select></label
      >
      <button type="button" class="button-secondary text-xs" @click="preview">
        <Play class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Testar aviso
      </button>
      <button type="button" class="button-secondary text-xs" @click="confirmation">
        <MessageSquare class="h-3.5 w-3.5" aria-hidden="true" focusable="false" />Testar confirmação
      </button>
    </div>
    <p class="mt-2 text-[11px] text-slate-500">
      Confirmações e avisos com ações permanecem até sua resposta. Erros ficam visíveis por pelo menos 8 segundos.
    </p>
  </section>
</template>
