import { defineStore } from "pinia";
import { defaultAppearance, settingsApi, type Appearance } from "../settingsApi";
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a: string, b: string, weight: number) =>
  `#${rgb(a)
    .map((n, i) =>
      Math.round(n * (1 - weight) + rgb(b)[i]! * weight)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
export const contrast = (a: string, b: string) => {
  const lum = (hex: string) =>
    rgb(hex)
      .map((n) => n / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i]!, 0);
  return (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
};
export const readable = (accent: string, surface: string, foreground: string) => {
  let color = accent;
  for (let i = 0; i <= 10 && contrast(color, surface) < 4.5; i++) color = mix(accent, foreground, i / 10);
  return color;
};
export const useAppearanceStore = defineStore("appearance", {
  state: () => ({
    value: structuredClone(defaultAppearance),
    initialized: false,
    error: "",
    preference: localStorage.getItem("retencao-cas.theme") ?? "",
    systemDark: matchMedia("(prefers-color-scheme: dark)").matches,
  }),
  getters: {
    dark: (state) =>
      (state.preference || state.value.mode) === "dark" || ((state.preference || state.value.mode) === "system" && state.systemDark),
  },
  actions: {
    async initialize() {
      if (this.initialized) return;
      this.initialized = true;
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
        this.systemDark = event.matches;
        this.apply();
      });
      try {
        this.value = await settingsApi.appearance();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Aparência indisponível";
      }
      this.apply();
    },
    set(value: Appearance) {
      this.value = value;
      this.error = "";
      this.apply();
    },
    toggle() {
      this.preference = this.dark ? "light" : "dark";
      localStorage.setItem("retencao-cas.theme", this.preference);
      this.apply();
    },
    followDefault() {
      this.preference = "";
      localStorage.removeItem("retencao-cas.theme");
      this.apply();
    },
    apply() {
      const root = document.documentElement,
        palette = this.dark ? this.value.dark : this.value.light;
      root.dataset.theme = this.dark ? "dark" : "light";
      root.style.colorScheme = this.dark ? "dark" : "light";
      for (const [key, value] of Object.entries(palette)) root.style.setProperty(`--appearance-${key}`, value);
      for (const key of ["primary", "churn", "upgrades"] as const) {
        root.style.setProperty(
          `--appearance-${key}-contrast`,
          contrast(palette[key], "#ffffff") >= contrast(palette[key], "#0f172a") ? "#ffffff" : "#0f172a"
        );
        root.style.setProperty(`--appearance-${key}-text`, readable(palette[key], palette.surface, palette.text));
        root.style.setProperty(`--appearance-${key}-tint`, mix(palette.surface, palette[key], 0.12));
      }
      const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (favicon) {
        favicon.href = this.value.favicon;
        favicon.removeAttribute("type");
      }
    },
  },
});
