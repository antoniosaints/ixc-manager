<script setup lang="ts">
import ToastPreferences from "../components/ToastPreferences.vue";
import { toast } from "../notifications/toast";
import { Image as ImageIcon, Palette as PaletteIcon, SwatchBook, Check, RotateCcw, Save, Sun, Moon } from "lucide-vue-next";

import { computed, onMounted, reactive, ref } from "vue";

import { defaultAppearance, settingsApi, type Appearance, type Palette } from "../settingsApi";
import { contrast, useAppearanceStore } from "../stores/appearance";
import { themePresets, applyThemePreset, matchingThemePreset, type ThemePreset } from "../appearancePresets";
const appearance = useAppearanceStore();
const form = reactive<Appearance>(structuredClone(defaultAppearance));
const accentContrast = (color: string) => (contrast(color, "#ffffff") >= contrast(color, "#0f172a") ? "#ffffff" : "#0f172a");
const paletteMode = ref<"light" | "dark">("light");
const palette = computed(() => form[paletteMode.value]);
const activePreset = computed(() => matchingThemePreset(form));
const loading = ref(true),
  saving = ref(false),
  error = ref("");
const labels: Record<keyof Palette, string> = {
  background: "Fundo da página",
  surface: "Cards e header",
  muted: "Fundos secundários",
  text: "Texto principal",
  secondary: "Texto secundário",
  border: "Bordas",
  primary: "Cor primária geral",
  churn: "Cor do Churn",
  upgrades: "Cor do Upgrades",
};
function applyPreset(preset: ThemePreset) {
  Object.assign(form, applyThemePreset(form, preset));
  error.value = "";
  toast.info(`Paleta ${preset.name} aplicada ao formulário`, "Salve a aparência para atualizar o sistema.");
}
onMounted(async () => {
  try {
    Object.assign(form, await settingsApi.appearance());
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Não foi possível carregar.";
  } finally {
    loading.value = false;
  }
});
async function upload(event: Event, target: "logo" | "favicon") {
  error.value = "";
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  try {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 256 * 1024)
      throw new Error("Use PNG, JPEG ou WebP de até 256 KB.");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("A imagem não pôde ser lida."));
      image.src = data;
    });
    form[target] = data;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Não foi possível carregar a imagem.";
    toast.error("Imagem inválida", error.value);
  }
  input.value = "";
}
async function save() {
  saving.value = true;
  error.value = "";
  try {
    appearance.set(await settingsApi.saveAppearance(JSON.parse(JSON.stringify(form))));
    appearance.followDefault();
    toast.success("Aparência salva", "As cores foram aplicadas ao sistema.");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Não foi possível salvar.";
    toast.error("Não foi possível salvar a aparência", error.value);
  } finally {
    saving.value = false;
  }
}
const reset = async () => {
  if (
    !(await toast.confirm({
      title: "Restaurar aparência padrão?",
      message: "Os ajustes não salvos deste formulário serão substituídos. Salve depois para aplicar ao sistema.",
      confirmLabel: "Restaurar padrão",
      key: "restore-appearance",
    }))
  )
    return;
  Object.assign(form, structuredClone(defaultAppearance));
  error.value = "";
};
</script>
<template>
  <p v-if="loading" class="panel p-5 text-sm text-slate-500">Carregando aparência…</p>
  <form v-else @submit.prevent="save" class="space-y-4">
    <section class="panel p-4">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-bold">
            <ImageIcon class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Identidade do sistema
          </h2>
          <p class="mt-1 text-xs text-slate-500">Logo do header e ícone da aba do navegador.</p>
        </div>
        <label class="text-xs text-slate-500"
          >Modo padrão<select v-model="form.mode" class="input mt-1">
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
            <option value="system">Seguir o dispositivo</option>
          </select></label
        >
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div
          v-for="target in ['logo', 'favicon'] as const"
          :key="target"
          class="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3"
        >
          <img
            :src="form[target]"
            :alt="target === 'logo' ? 'Prévia do logo' : 'Prévia do favicon'"
            class="h-12 w-12 rounded-lg object-contain"
          />
          <div class="min-w-0 flex-1">
            <label class="block text-xs font-semibold"
              >{{ target === "logo" ? "Logo do header" : "Favicon"
              }}<input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                class="mt-2 block w-full text-xs"
                @change="upload($event, target)" /></label
            ><button type="button" class="mt-2 text-[11px] text-slate-500 underline" @click="form[target] = '/cas-logo.png'">
              Usar imagem padrão
            </button>
          </div>
        </div>
      </div>
      <p class="mt-2 text-[10px] text-slate-500">PNG, JPEG ou WebP · até 256 KB por imagem. Prefira ícones quadrados para o favicon.</p>
    </section>
    <section class="panel p-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-sm font-bold">
            <SwatchBook class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Paletas rápidas
          </h2>
          <p class="mt-1 text-xs text-slate-500">Escolha um preset para os dois modos e ajuste as cores se desejar.</p>
        </div>
        <span v-if="activePreset === null" class="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500">Paleta personalizada</span>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          v-for="preset in themePresets"
          :key="preset.id"
          type="button"
          :aria-pressed="activePreset === preset.id"
          :aria-label="`Aplicar paleta ${preset.name}`"
          class="flex items-center gap-3 rounded-xl border p-3 text-left transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2"
          :style="{
            borderColor: activePreset === preset.id ? 'var(--appearance-primary)' : 'var(--appearance-border)',
            background: activePreset === preset.id ? 'var(--appearance-primary-tint)' : 'var(--appearance-background)',
          }"
          @click="applyPreset(preset)"
        >
          <span class="flex shrink-0 -space-x-2" aria-hidden="true"
            ><span
              v-for="color in [preset.light.primary, preset.dark.primary, preset.light.background]"
              :key="color"
              class="h-7 w-7 rounded-full border-2 border-white"
              :style="{ background: color }"
          /></span>
          <span class="min-w-0 flex-1"
            ><strong class="block text-xs">{{ preset.name }}</strong
            ><span class="mt-1 block text-[11px] text-slate-500">{{
              activePreset === preset.id ? "Selecionada" : "Aplicar paleta"
            }}</span></span
          ><Check v-if="activePreset === preset.id" class="h-4 w-4 shrink-0" aria-hidden="true" focusable="false" />
        </button>
      </div>
      <p class="mt-3 text-[11px] text-slate-500">Os presets preservam as cores de Churn e Upgrades, o logo, o favicon e o modo padrão.</p>
    </section>
    <section class="panel p-4">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-bold">
            <PaletteIcon class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Paletas de aparência
          </h2>
          <p class="mt-1 text-xs text-slate-500">
            A cor primária geral atende Configurações e ações gerais. Cada módulo usa sua própria cor.
          </p>
        </div>
        <div class="flex rounded-lg bg-slate-100 p-1">
          <button
            v-for="mode in ['light', 'dark'] as const"
            :key="mode"
            type="button"
            class="rounded-md px-3 py-1.5 text-xs font-semibold"
            :class="paletteMode === mode ? 'bg-white shadow-sm' : ''"
            :aria-pressed="paletteMode === mode"
            @click="paletteMode = mode"
          >
            <component
              :is="mode === 'light' ? Sun : Moon"
              class="mr-1 inline h-3.5 w-3.5 align-middle"
              aria-hidden="true"
              focusable="false"
            />
            {{ mode === "light" ? "Claro" : "Escuro" }}
          </button>
        </div>
      </div>
      <div class="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div class="grid gap-3 sm:grid-cols-2">
          <label v-for="(label, key) in labels" :key="key" class="text-xs font-medium text-slate-500"
            >{{ label }}
            <div class="mt-1 flex gap-2">
              <input
                v-model="palette[key]"
                type="color"
                class="h-8 w-10 shrink-0 cursor-pointer rounded border border-slate-200"
                :aria-label="`${label}: seletor de cor`"
              /><input
                v-model="palette[key]"
                class="input font-mono"
                pattern="#[0-9a-fA-F]{6}"
                maxlength="7"
                :aria-label="`${label}: código hexadecimal`"
                required
              /></div
          ></label>
        </div>
        <div class="rounded-xl border p-4" :style="{ background: palette.background, color: palette.text, borderColor: palette.border }">
          <p class="mb-3 text-xs font-bold">Prévia · {{ paletteMode === "light" ? "modo claro" : "modo escuro" }}</p>
          <div class="rounded-lg border p-3" :style="{ background: palette.surface, borderColor: palette.border }">
            <div class="flex items-center gap-2">
              <img :src="form.logo" alt="" class="h-8 w-8 object-contain" /><strong class="text-sm">CAS</strong>
            </div>
            <p class="mt-3 text-xs" :style="{ color: palette.secondary }">Clientes e oportunidades</p>
            <div class="mt-3 rounded p-2 text-xs" :style="{ background: palette.muted }">Exemplo de informação</div>
            <div class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="accent in [
                  { key: 'primary', label: 'Geral' },
                  { key: 'churn', label: 'Churn' },
                  { key: 'upgrades', label: 'Upgrades' },
                ] as const"
                :key="accent.key"
                class="rounded px-2.5 py-1.5 text-[11px] font-semibold"
                :style="{ background: palette[accent.key], color: accentContrast(palette[accent.key]) }"
                >{{ accent.label }}</span
              >
            </div>
          </div>
          <p class="mt-3 text-[10px]" :style="{ color: palette.secondary }">Textos e fundos devem manter contraste legível.</p>
        </div>
      </div>
    </section>
    <ToastPreferences />
    <p v-if="error" role="alert" class="text-sm text-red-600">{{ error }}</p>

    <footer class="flex flex-wrap justify-end gap-2">
      <button type="button" class="button-secondary" :disabled="saving" @click="reset">
        <RotateCcw class="h-4 w-4" aria-hidden="true" focusable="false" />Restaurar padrões no formulário</button
      ><button class="button-primary" :disabled="saving">
        <Save class="h-4 w-4" aria-hidden="true" focusable="false" />{{ saving ? "Salvando…" : "Salvar aparência" }}
      </button>
    </footer>
  </form>
</template>
