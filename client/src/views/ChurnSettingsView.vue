<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ShieldAlert, Save, RotateCcw, Info } from "lucide-vue-next";
import { settingsApi, type ChurnSettings } from "../settingsApi";
import { toast } from "../notifications/toast";
import LiveQueryState from "../components/LiveQueryState.vue";

const form = reactive<ChurnSettings>({ low: 0, attention: 30, medium: 50, high: 60, critical: 85 });
const defaults = ref<ChurnSettings>({ ...form });
const loading = ref(true),
  saving = ref(false),
  error = ref(""),
  saved = ref("");
const levels = [
  { key: "low", label: "Baixo", color: "#059669" },
  { key: "attention", label: "Atenção", color: "#ca8a04" },
  { key: "medium", label: "Médio", color: "#ea580c" },
  { key: "high", label: "Alto", color: "#e11d48" },
  { key: "critical", label: "Crítico", color: "#9333ea" },
] as const;
const validation = computed(() => {
  if (levels.some(({ key }) => !Number.isInteger(form[key]) || form[key] < 0 || form[key] > 100)) return "Use pontos inteiros de 0 a 100.";
  if (levels.some(({ key }, i) => i > 0 && form[key] <= form[levels[i - 1]!.key]))
    return "Cada faixa deve começar acima da anterior: Baixo, Atenção, Médio, Alto e Crítico.";
  return "";
});
const dirty = computed(() => JSON.stringify(form) !== saved.value);
const ranges = computed(() =>
  levels.map((level, i) => ({ ...level, start: form[level.key], end: i === levels.length - 1 ? 100 : form[levels[i + 1]!.key] - 1 }))
);
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const response = await settingsApi.churn();
    Object.assign(form, response.configuration);
    defaults.value = response.defaults;
    saved.value = JSON.stringify(form);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Não foi possível carregar as faixas de risco.";
  } finally {
    loading.value = false;
  }
}
async function save() {
  if (saving.value || validation.value || !dirty.value) return;
  saving.value = true;
  try {
    Object.assign(form, await settingsApi.saveChurn({ ...form }));
    saved.value = JSON.stringify(form);
    toast.success("Faixas de Churn salvas", "Os limites serão usados nas próximas consultas de Churn, Suporte e Analytics.");
  } catch (e) {
    toast.error("Não foi possível salvar", e instanceof Error ? e.message : "Tente novamente.");
  } finally {
    saving.value = false;
  }
}
onMounted(load);
</script>
<template>
  <section class="panel churn-settings">
    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="flex items-center gap-2 text-sm font-bold">
          <ShieldAlert class="h-4 w-4" aria-hidden="true" />Classificação de risco do Churn
        </h2>
        <p class="mt-1 text-xs text-slate-500">Defina a pontuação mínima de cada faixa. Configuração válida para todos os usuários.</p>
      </div>
      <button type="button" class="button-primary" :disabled="loading || !!error || saving || !!validation || !dirty" @click="save">
        <Save class="h-3.5 w-3.5" aria-hidden="true" />{{ saving ? "Salvando…" : "Salvar faixas" }}
      </button>
    </header>
    <LiveQueryState :loading="loading" :error="error" @retry="load" />
    <div v-if="!loading && !error">
      <fieldset class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" :disabled="saving">
        <legend class="sr-only">Pontuação mínima por faixa de risco</legend>
        <label v-for="level in levels" :key="level.key" class="churn-threshold">
          <span class="mb-3 flex items-center gap-2 text-xs font-bold"
            ><span class="churn-dot" :style="{ background: level.color }"></span>{{ level.label }}</span
          >
          <span class="mb-1 block text-[11px] text-slate-500">A partir de</span>
          <span class="flex items-center gap-2">
            <input
              :id="`churn-${level.key}`"
              v-model.number="form[level.key]"
              class="input w-24"
              type="number"
              min="0"
              max="100"
              step="1"
              :readonly="level.key === 'low'"
              :aria-label="`${level.label}: pontuação mínima`"
              :aria-describedby="level.key === 'low' ? 'churn-low-help' : 'churn-range-help'"
            />
            <span class="text-xs text-slate-500">pontos</span>
          </span>
          <span v-if="level.key === 'low'" id="churn-low-help" class="mt-2 block text-[11px] text-slate-500">Sempre começa em zero.</span>
        </label>
      </fieldset>
      <p id="churn-range-help" class="mt-3 text-xs text-slate-500">
        Cada faixa termina um ponto antes da seguinte. Crítico vai até 100 pontos.
      </p>
      <p v-if="validation" role="alert" class="mt-3 text-xs text-red-600">{{ validation }}</p>
      <div v-else class="mt-5 rounded-xl border p-4">
        <h3 class="mb-3 text-xs font-bold">Prévia das faixas</h3>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div v-for="range in ranges" :key="range.key" class="churn-range" :style="{ borderLeftColor: range.color }">
            <span class="block text-xs font-semibold">{{ range.label }}</span>
            <span class="mt-1 block text-sm font-bold"
              >{{ range.start === range.end ? range.start : `${range.start}–${range.end}` }}
              <small class="text-[11px] font-normal text-slate-500">pontos</small></span
            >
          </div>
        </div>
      </div>
      <footer class="mt-5 flex flex-wrap items-start justify-between gap-4">
        <p class="flex max-w-3xl items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Info class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span
            >Os limites alteram a classificação nos filtros, indicadores, detalhes e PDFs. A pontuação e seus fatores permanecem os mesmos.
            O score de 0 a 100 é um indicador de risco, não uma probabilidade de cancelamento. Marcações críticas manuais são
            preservadas.</span
          >
        </p>
        <button type="button" class="button-secondary" :disabled="saving" @click="Object.assign(form, defaults)">
          <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />Usar padrão
        </button>
      </footer>
      <p v-if="dirty" class="mt-3 text-xs text-slate-500">Alterações ainda não salvas. Clique em “Salvar faixas” para aplicar.</p>
    </div>
  </section>
</template>
<style scoped>
.churn-settings {
  padding: 1rem;
}
.churn-settings .input {
  height: 32px;
  min-height: 32px;
  font-size: 0.75rem;
}
.churn-settings .button-primary,
.churn-settings .button-secondary {
  min-height: 32px;
  padding: 0.35rem 0.7rem;
  font-size: 0.7rem;
}
.churn-threshold {
  padding: 1rem;
  border: 1px solid var(--appearance-border);
  border-radius: 0.75rem;
}
.churn-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
}
.churn-range {
  border-left: 3px solid;
  padding-left: 0.75rem;
}
.churn-settings input[readonly] {
  background: var(--appearance-muted);
  color: var(--appearance-secondary);
}
</style>
