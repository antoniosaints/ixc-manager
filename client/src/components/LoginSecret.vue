<script setup lang="ts">
import { toast } from "../notifications/toast";
import { onBeforeUnmount, ref, watch } from "vue";
import { Copy, Eye, EyeOff, LoaderCircle } from "lucide-vue-next";
import { upgradesApi, type LoginSecretField } from "../upgradesApi";
import { supportApi } from "../supportApi";
defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    module?: "upgrades" | "support";
    contractId: string;
    loginId: number;
    field: LoginSecretField;
    label: string;
    available: boolean;
  }>(),
  { module: "upgrades" }
);
const value = ref<string | null>(null);
const loading = ref(false);
const message = ref("");
let controller: AbortController | undefined;
let version = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
function clear() {
  version++;
  controller?.abort();
  clearTimeout(timer);
  value.value = null;
  loading.value = false;
  message.value = "";
}
async function read(copy: boolean) {
  if (value.value !== null && !copy) {
    clear();
    return;
  }
  controller?.abort();
  controller = new AbortController();
  const current = ++version;
  loading.value = true;
  message.value = "";
  try {
    const result =
      value.value !== null
        ? { value: value.value }
        : await (props.module === "support" ? supportApi : upgradesApi).loginSecret(
            props.contractId,
            props.loginId,
            props.field,
            controller.signal
          );
    if (current !== version) return;
    if (result.value === null) {
      message.value = "Senha não informada no IXC.";
      return;
    }
    if (copy) {
      await navigator.clipboard.writeText(result.value);
      if (current === version) message.value = "Senha copiada.";
    } else {
      value.value = result.value;
      timer = setTimeout(clear, 120_000);
    }
  } catch (reason) {
    if (current === version && !controller.signal.aborted)
      message.value = copy
        ? "Não foi possível copiar a senha. Revele e copie manualmente."
        : reason instanceof Error
          ? reason.message
          : "Falha ao consultar a senha.";
  } finally {
    if (current === version) loading.value = false;
  }
}
watch(message, (value) => {
  if (!value) return;
  toast.show({
    title: value === "Senha copiada." ? "Senha copiada" : "Aviso de credenciais",
    message: value === "Senha copiada." ? undefined : value,
    type: value === "Senha copiada." ? "success" : value === "Senha não informada no IXC." ? "warning" : "error",
    key: "login-secret-feedback",
  });
});
onBeforeUnmount(clear);
</script>
<template>
  <div class="min-w-0 rounded-lg border border-slate-200 px-3 py-2">
    <p class="mb-1 text-[11px] text-slate-500">{{ label }}</p>
    <div class="flex min-h-7 items-center gap-2">
      <span
        class="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-sm"
        :aria-label="value === null && available ? 'Senha oculta' : undefined"
        >{{ value ?? (available ? "••••••••" : "Não informada") }}</span
      >
      <button
        v-if="available"
        type="button"
        class="rounded-md p-1.5 text-violet-600 hover:bg-violet-50 disabled:opacity-50"
        :disabled="loading"
        :aria-label="`${value === null ? 'Revelar' : 'Ocultar'} ${label}`"
        :title="value === null ? 'Revelar por até 2 minutos' : 'Ocultar senha'"
        @click="read(false)"
      >
        <LoaderCircle v-if="loading" class="h-4 w-4 animate-spin" aria-hidden="true" focusable="false" /><Eye
          v-else-if="value === null"
          class="h-4 w-4"
          aria-hidden="true"
          focusable="false"
        /><EyeOff v-else class="h-4 w-4" aria-hidden="true" focusable="false" />
      </button>
      <button
        v-if="available"
        type="button"
        class="rounded-md p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        :disabled="loading"
        :aria-label="`Copiar ${label}`"
        title="Copiar senha"
        @click="read(true)"
      >
        <Copy class="h-4 w-4" aria-hidden="true" focusable="false" />
      </button>
    </div>
  </div>
</template>
