<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ChartNoAxesCombined, Search, Save, Wrench, X, CircleAlert } from "lucide-vue-next";
import { settingsApi, type ActivationSettings } from "../settingsApi";
import { toast } from "../notifications/toast";
import LiveQueryState from "../components/LiveQueryState.vue";
const form = reactive<ActivationSettings>({ source: "contracts", subjectIds: [] });
const subjects = ref<{ id: number; name: string }[]>([]),
  search = ref(""),
  loading = ref(true),
  saving = ref(false),
  error = ref(""),
  saved = ref("");
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const filtered = computed(() => subjects.value.filter((s) => normalize(`${s.id} ${s.name}`).includes(normalize(search.value.trim()))));
const selected = computed(() =>
  form.subjectIds.map((id) => subjects.value.find((s) => s.id === id) ?? { id, name: "Assunto não encontrado no IXC" })
);
const missing = computed(() => form.subjectIds.some((id) => !subjects.value.some((s) => s.id === id)));
const dirty = computed(() => JSON.stringify(form) !== saved.value);
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const response = await settingsApi.analytics();
    Object.assign(form, response.configuration);
    subjects.value = response.subjects;
    saved.value = JSON.stringify(form);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Não foi possível consultar os assuntos.";
  } finally {
    loading.value = false;
  }
}
function toggle(id: number) {
  if (form.subjectIds.includes(id)) form.subjectIds = form.subjectIds.filter((value) => value !== id);
  else if (form.subjectIds.length < 200) form.subjectIds = [...form.subjectIds, id].sort((a, b) => a - b);
  else toast.show({ type: "warning", title: "Limite de seleção", message: "Selecione até 200 assuntos." });
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    Object.assign(form, await settingsApi.saveAnalytics({ ...form, subjectIds: [...form.subjectIds] }));
    saved.value = JSON.stringify(form);
    toast.success("Regra de ativações salva", "A configuração será usada na próxima consulta do Analytics.");
  } catch (e) {
    toast.error("Não foi possível salvar", e instanceof Error ? e.message : "Tente novamente.");
  } finally {
    saving.value = false;
  }
}
onMounted(load);
</script>
<template>
  <section class="panel activation-settings">
    <header class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="flex items-center gap-2 text-sm font-bold">
          <ChartNoAxesCombined class="h-4 w-4" aria-hidden="true" />Ativações no Analytics
        </h2>
        <p class="mt-1 text-xs text-slate-500">
          Defina a origem das ativações para os indicadores e a evolução mensal da carteira. Somente administradores podem editar.
        </p>
      </div>
      <button
        type="button"
        class="button-primary"
        :disabled="loading || !!error || saving || !dirty || missing || (form.source === 'serviceOrders' && !form.subjectIds.length)"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" aria-hidden="true" />{{ saving ? "Salvando…" : "Salvar regra" }}
      </button>
    </header>
    <LiveQueryState :loading="loading" :error="error" @retry="load" />
    <div v-if="!loading && !error">
      <fieldset class="mb-4 grid gap-3 sm:grid-cols-2" :disabled="saving">
        <legend class="mb-2 text-xs font-semibold">Como contabilizar as ativações</legend>
        <label class="activation-choice"
          ><input v-model="form.source" type="radio" value="contracts" name="activation-source" /><span
            ><strong>Data de ativação do contrato</strong><small>Usa o cadastro do contrato no IXC. Regra padrão do sistema.</small></span
          ></label
        >
        <label class="activation-choice"
          ><input v-model="form.source" type="radio" value="serviceOrders" name="activation-source" /><span
            ><strong>OS finalizadas por assunto</strong
            ><small>Considera os assuntos selecionados abaixo e a data de fechamento da ordem.</small></span
          ></label
        >
      </fieldset>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <Wrench class="h-4 w-4" aria-hidden="true" />
        <h3 class="text-xs font-bold">Assuntos de ordens de serviço</h3>
        <span class="text-xs text-slate-500">{{ form.subjectIds.length }} selecionados</span>
      </div>
      <div v-if="selected.length" class="mb-3 flex flex-wrap gap-2">
        <span v-for="subject in selected" :key="subject.id" class="activation-subject-tag"
          >#{{ subject.id }} · {{ subject.name
          }}<button
            type="button"
            :disabled="saving"
            :aria-label="`Remover assunto #${subject.id} ${subject.name}`"
            @click="toggle(subject.id)"
          >
            <X class="h-3 w-3" aria-hidden="true" /></button
        ></span>
      </div>
      <p v-if="missing" role="alert" class="mb-3 text-xs text-amber-600">
        Um assunto salvo não foi encontrado no IXC. Remova-o antes de salvar uma nova regra.
      </p>
      <label class="relative mb-3 block max-w-xl"
        ><span class="sr-only">Buscar assunto por nome ou ID</span
        ><Search class="absolute left-3 top-2 h-4 w-4 text-slate-500" aria-hidden="true" /><input
          v-model="search"
          class="input w-full pl-9"
          placeholder="Buscar assunto por nome ou ID"
          type="search"
      /></label>
      <fieldset class="activation-subject-list" :disabled="saving || form.source !== 'serviceOrders'">
        <legend class="sr-only">Assuntos considerados nas ativações</legend>
        <label v-for="subject in filtered" :key="subject.id" class="activation-subject-option"
          ><input type="checkbox" :checked="form.subjectIds.includes(subject.id)" @change="toggle(subject.id)" /><span
            class="activation-subject-id"
            >#{{ subject.id }}</span
          ><span>{{ subject.name }}</span></label
        >
        <p v-if="!filtered.length" class="p-4 text-xs text-slate-500">Nenhum assunto encontrado para essa busca.</p>
      </fieldset>
      <p v-if="form.source === 'serviceOrders' && !form.subjectIds.length" class="mt-3 text-xs text-amber-600">
        Selecione pelo menos um assunto para salvar esta regra.
      </p>
      <p class="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span
          >Na regra por OS, cada ordem finalizada dos assuntos escolhidos conta como um evento de ativação. Ordens abertas e canceladas
          ficam fora. Múltiplas OS do mesmo contrato podem gerar múltiplos eventos. A seleção também será aplicada aos anos anteriores.
          Cancelamentos continuam seguindo a data de cancelamento do contrato. Salvar altera apenas a configuração deste sistema.</span
        >
      </p>
    </div>
  </section>
</template>
<style scoped>
.activation-settings {
  padding: 1rem;
}
.activation-settings .input {
  height: 32px;
  min-height: 32px;
  font-size: 0.75rem;
}
.activation-settings .button-primary {
  min-height: 32px;
  padding: 0.35rem 0.7rem;
  font-size: 0.7rem;
}
.activation-choice {
  display: flex;
  gap: 0.65rem;
  padding: 0.8rem;
  border: 1px solid var(--appearance-border);
  border-radius: 0.65rem;
  cursor: pointer;
}
.activation-choice:has(input:checked) {
  border-color: var(--appearance-primary);
  background: var(--appearance-primary-tint);
}
.activation-choice input {
  margin-top: 0.15rem;
  accent-color: var(--appearance-primary);
}
.activation-choice strong {
  display: block;
  font-size: 0.75rem;
}
.activation-choice small {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.65rem;
  color: var(--appearance-secondary);
}
.activation-subject-list {
  max-height: 330px;
  overflow: auto;
  border: 1px solid var(--appearance-border);
  border-radius: 0.65rem;
}
.activation-subject-option {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--appearance-border);
  font-size: 0.75rem;
  cursor: pointer;
}
.activation-subject-option:hover {
  background: var(--appearance-muted);
}
.activation-subject-option input {
  accent-color: var(--appearance-primary);
}
.activation-subject-id {
  color: var(--appearance-secondary);
  font-size: 0.65rem;
  min-width: 2.5rem;
}
.activation-subject-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.45rem;
  background: var(--appearance-primary-tint);
  color: var(--appearance-primary-text);
  font-size: 0.65rem;
}
.activation-subject-tag button {
  padding: 0.2rem;
  border-radius: 0.25rem;
}
.activation-subject-list:disabled {
  opacity: 0.6;
}
</style>
