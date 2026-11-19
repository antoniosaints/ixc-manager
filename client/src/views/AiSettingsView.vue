<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Sparkles, Save, PlugZap, Loader2, ShieldCheck } from "lucide-vue-next";
import { settingsApi, type AiProvider, type AiSettings, type AiSettingsDraft, type AiConnectionTest } from "../settingsApi";
import { queryErrorMessage } from "../queryErrorMessage";
import { toast } from "../notifications/toast";

const settings = ref<AiSettings | null>(null),
  provider = ref<AiProvider>("openai"),
  model = ref(""),
  apiKey = ref(""),
  removeKey = ref(false);
const loading = ref(true),
  saving = ref(false),
  testing = ref(false),
  error = ref(""),
  testResult = ref<AiConnectionTest | null>(null);
const labels = { openai: "OpenAI", gemini: "Google Gemini" };
const current = computed(() => settings.value?.providers[provider.value]);
const options = computed(() => [
  ...new Set([...(settings.value?.modelSuggestions[provider.value] ?? []), ...(current.value?.model ? [current.value.model] : [])]),
]);
const busy = computed(() => loading.value || saving.value || testing.value);
const valid = computed(
  () =>
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(model.value.trim().replace(/^models\//, "")) &&
    (!apiKey.value || !/\s/.test(apiKey.value.trim()))
);
const dirty = computed(
  () =>
    !!settings.value &&
    (provider.value !== settings.value.provider || model.value !== current.value?.model || !!apiKey.value || removeKey.value)
);
const canTest = computed(() => valid.value && !removeKey.value && (!!apiKey.value.trim() || current.value?.configured));
let controller: AbortController | undefined;
function resetForm() {
  model.value = current.value?.model ?? "";
  apiKey.value = "";
  removeKey.value = false;
  testResult.value = null;
}
watch(provider, () => {
  resetForm();
  error.value = "";
});
watch([model, apiKey, removeKey], () => {
  testResult.value = null;
});
function draft(): AiSettingsDraft {
  return {
    provider: provider.value,
    model: model.value.trim(),
    keyAction: removeKey.value ? "remove" : apiKey.value.trim() ? "replace" : "keep",
    apiKey: removeKey.value ? "" : apiKey.value.trim(),
  };
}
async function load() {
  controller?.abort();
  const active = (controller = new AbortController());
  loading.value = true;
  error.value = "";
  try {
    const data = await settingsApi.ai(active.signal);
    if (active.signal.aborted) return;
    settings.value = data;
    provider.value = data.provider;
    resetForm();
  } catch (e) {
    if (!active.signal.aborted) error.value = queryErrorMessage(e);
  } finally {
    if (controller === active) loading.value = false;
  }
}
async function save() {
  if (busy.value || !valid.value || !settings.value) return;
  const active = (controller = new AbortController());
  saving.value = true;
  error.value = "";
  try {
    const data = await settingsApi.saveAi({ revision: settings.value.revision, configuration: draft() }, active.signal);
    if (active.signal.aborted) return;
    settings.value = data;
    resetForm();
    toast.success("Configuração de IA salva", "O provedor e o modelo serão usados na próxima análise de OS.");
  } catch (e) {
    if (!active.signal.aborted) error.value = queryErrorMessage(e);
  } finally {
    if (controller === active) saving.value = false;
  }
}
async function test() {
  if (busy.value || !canTest.value) return;
  const active = (controller = new AbortController());
  testing.value = true;
  error.value = "";
  testResult.value = null;
  try {
    const data = await settingsApi.testAi(draft(), active.signal);
    if (!active.signal.aborted) testResult.value = data;
  } catch (e) {
    if (!active.signal.aborted) error.value = queryErrorMessage(e);
  } finally {
    if (controller === active) testing.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  controller?.abort();
  apiKey.value = "";
});
</script>
<template>
  <section class="panel max-w-4xl p-5" aria-labelledby="ai-settings-title" :aria-busy="busy">
    <header class="mb-5">
      <h2 id="ai-settings-title" class="flex items-center gap-2 text-lg font-bold">
        <Sparkles class="h-5 w-5 text-indigo-600" aria-hidden="true" />Inteligência artificial
      </h2>
      <p class="mt-2 text-sm text-slate-500">
        Configure o provedor usado para revisar ordens de serviço, mensagens e recorrências. As alterações salvas valem na próxima análise.
      </p>
    </header>
    <p v-if="loading" role="status" class="py-6 text-sm text-slate-500">Carregando configurações de IA…</p>
    <form v-else-if="settings" class="space-y-5" @submit.prevent="save">
      <div class="rounded-lg bg-slate-50 p-3 text-sm">
        <strong>Provedor ativo:</strong> {{ labels[settings.provider] }} · {{ settings.providers[settings.provider].model
        }}<span class="mt-1 block text-xs text-slate-500">{{
          settings.providers[settings.provider].configured ? "Chave configurada." : "Cadastre uma chave para habilitar o resumo por IA."
        }}</span>
      </div>
      <fieldset class="grid gap-4 sm:grid-cols-2" :disabled="busy">
        <legend class="sr-only">Provedor e modelo de IA</legend>
        <label class="block text-sm font-medium"
          >Provedor<select v-model="provider" class="input mt-1">
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini API</option>
          </select></label
        >
        <label class="block text-sm font-medium"
          >Modelo<input
            v-model="model"
            list="ai-model-options"
            class="input mt-1"
            required
            maxlength="127"
            autocomplete="off"
            spellcheck="false"
            aria-describedby="ai-model-hint" /><datalist id="ai-model-options">
            <option v-for="option in options" :key="option" :value="option" /></datalist
        ></label>
      </fieldset>
      <p id="ai-model-hint" class="!mt-2 text-xs text-slate-500">
        Escolha uma sugestão ou digite o identificador de outro modelo disponível na sua conta. O teste verifica o suporte à geração de JSON
        exigida pela análise.
      </p>
      <fieldset :disabled="busy" class="space-y-3">
        <legend class="mb-2 text-sm font-semibold">Chave da API · {{ labels[provider] }}</legend>
        <p v-if="current?.configured" class="text-xs text-slate-500">
          {{
            current.keySource === "environment"
              ? "Existe uma chave herdada da configuração anterior. Você pode substituí-la por uma chave cadastrada aqui."
              : "Existe uma chave cadastrada para este provedor. Deixe o campo vazio para mantê-la."
          }}
        </p>
        <label class="block text-sm font-medium"
          >{{ current?.configured ? "Nova chave da API (opcional)" : "Chave da API"
          }}<input
            v-model="apiKey"
            type="password"
            class="input mt-1"
            :disabled="removeKey"
            maxlength="4096"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :placeholder="current?.configured ? 'Chave existente protegida' : 'Cole a chave do provedor selecionado'"
            aria-describedby="ai-key-hint"
        /></label>
        <p id="ai-key-hint" class="text-xs text-slate-500">
          Cada provedor mantém sua própria chave. Após salvar, a chave não é devolvida ao navegador.
        </p>
        <label v-if="current?.configured" class="flex items-center gap-2 text-sm"
          ><input v-model="removeKey" type="checkbox" @change="apiKey = ''" />Remover a chave deste provedor ao salvar</label
        >
      </fieldset>
      <p v-if="removeKey" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        Ao salvar, o provedor selecionado ficará sem chave e não poderá gerar resumos até cadastrar outra.
      </p>
      <p v-if="!valid" class="text-sm text-red-700" role="alert">Informe um identificador de modelo válido e uma chave sem espaços.</p>
      <div class="flex flex-wrap gap-3">
        <button type="button" class="button-secondary min-h-11" :disabled="busy || !canTest" @click="test">
          <Loader2 v-if="testing" class="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /><PlugZap
            v-else
            class="h-4 w-4"
            aria-hidden="true"
          />{{ testing ? "Testando conexão…" : "Testar conexão" }}</button
        ><button type="submit" class="button-primary min-h-11" :disabled="busy || !valid || !dirty">
          <Save class="h-4 w-4" aria-hidden="true" />{{ saving ? "Salvando…" : "Salvar e usar este provedor" }}
        </button>
      </div>
      <p class="text-xs text-slate-500">
        O teste usa os dados preenchidos, sem salvar e sem enviar ordens de serviço. Ele faz uma geração pequena, que pode consumir cota da
        API. Salvar ativa o provedor escolhido e preserva a chave do outro provedor.
      </p>
      <div
        v-if="testResult"
        role="status"
        aria-live="polite"
        class="rounded-lg p-4 text-sm"
        :class="testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'"
      >
        <strong>{{ testResult.ok ? "Conexão validada" : "Não foi possível validar a conexão" }}</strong>
        <p class="mt-1">{{ testResult.message }}</p>
        <p class="mt-2 text-xs">
          {{ labels[testResult.provider] }} · {{ testResult.model }} · {{ (testResult.durationMs / 1000).toFixed(1) }} s
        </p>
      </div>
      <div class="flex items-start gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
        <ShieldCheck class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Cadastro e teste exclusivos de administradores. As chaves são criptografadas no backend e não ficam no armazenamento do navegador.
        </p>
      </div>
    </form>
    <div v-if="error" role="alert" class="mt-4 flex flex-wrap items-center gap-3 text-sm text-red-700">
      <span>{{ error }}</span
      ><button type="button" class="button-secondary" :disabled="busy" @click="load">Recarregar configurações</button>
    </div>
  </section>
</template>
