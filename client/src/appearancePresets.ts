import { defaultAppearance, type Appearance, type Palette } from "./settingsApi";
export interface ThemePreset {
  id: string;
  name: string;
  light: Palette;
  dark: Palette;
}
export const themePresets: ThemePreset[] = [
  {
    id: "blue",
    name: "Azul original",
    light: { ...defaultAppearance.light, primary: "#2563eb" },
    dark: { ...defaultAppearance.dark, primary: "#60a5fa" },
  },
  {
    id: "emerald",
    name: "Esmeralda",
    light: {
      ...defaultAppearance.light,
      background: "#f5faf8",
      muted: "#edf5f0",
      text: "#15332a",
      secondary: "#526c61",
      border: "#d7e7df",
      primary: "#059669",
    },
    dark: {
      ...defaultAppearance.dark,
      background: "#0b1915",
      surface: "#132a22",
      muted: "#1c372d",
      text: "#e7f5ed",
      secondary: "#a4c0b3",
      border: "#355247",
      primary: "#34d399",
    },
  },
  {
    id: "violet",
    name: "Violeta",
    light: {
      ...defaultAppearance.light,
      background: "#faf8ff",
      muted: "#f2eef9",
      text: "#28203d",
      secondary: "#706581",
      border: "#e4dcef",
      primary: "#7c3aed",
    },
    dark: {
      ...defaultAppearance.dark,
      background: "#151020",
      surface: "#211a32",
      muted: "#2e2443",
      text: "#f0eafa",
      secondary: "#b8aacd",
      border: "#493a62",
      primary: "#a78bfa",
    },
  },
  {
    id: "amber",
    name: "Âmbar",
    light: {
      ...defaultAppearance.light,
      background: "#fffdf6",
      muted: "#f7f1e4",
      text: "#342918",
      secondary: "#796b52",
      border: "#e9dfcb",
      primary: "#d97706",
    },
    dark: {
      ...defaultAppearance.dark,
      background: "#1b160e",
      surface: "#2b2317",
      muted: "#393020",
      text: "#f6efdf",
      secondary: "#c5b798",
      border: "#564831",
      primary: "#fbbf24",
    },
  },
];
const sharedKeys = ["background", "surface", "muted", "text", "secondary", "border", "primary"] as const;
/** Presets style both modes while preserving branding, mode and each module's accent. */
export function applyThemePreset(appearance: Appearance, preset: ThemePreset): Appearance {
  return {
    ...appearance,
    light: { ...preset.light, churn: appearance.light.churn, upgrades: appearance.light.upgrades },
    dark: { ...preset.dark, churn: appearance.dark.churn, upgrades: appearance.dark.upgrades },
  };
}
export function matchingThemePreset(appearance: Appearance): string | null {
  return (
    themePresets.find((preset) =>
      (["light", "dark"] as const).every((mode) =>
        sharedKeys.every((key) => appearance[mode][key].toLowerCase() === preset[mode][key].toLowerCase())
      )
    )?.id ?? null
  );
}
