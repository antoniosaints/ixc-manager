import { afterEach, describe, expect, it, vi } from "vitest";
import { appearanceSchema, defaultAppearance, SettingsService } from "../src/services/settings/SettingsService.js";
import { defaultAppearance as clientDefaults } from "../../client/src/settingsApi";
import { applyThemePreset, matchingThemePreset, themePresets } from "../../client/src/appearancePresets";
import { db } from "../src/repositories/database.js";
afterEach(() => vi.restoreAllMocks());
describe("Presets e cores independentes", () => {
  it("valida contraste nos dois modos de todos os presets e mantém padrões iguais no cliente/servidor", () => {
    expect(clientDefaults).toEqual(defaultAppearance);
    expect(themePresets.map((preset) => preset.id)).toEqual(["blue", "emerald", "violet", "amber"]);
    for (const preset of themePresets) {
      const appearance = applyThemePreset(clientDefaults, preset);
      expect(appearanceSchema.safeParse(appearance).success, preset.name).toBe(true);
      expect(matchingThemePreset(appearance)).toBe(preset.id);
    }
  });
  it("aplica ambos os modos preservando as cores dos módulos e a identidade existente sem alterar o original", () => {
    const appearance = {
      ...structuredClone(clientDefaults),
      mode: "system" as const,
      logo: "/marca-teste.png",
      favicon: "/icone-teste.png",
    };
    appearance.light.churn = "#be123c";
    appearance.light.upgrades = "#0066ff";
    appearance.dark.churn = "#fb7185";
    appearance.dark.upgrades = "#60a5fa";
    const original = structuredClone(appearance);
    const preset = themePresets.find((preset) => preset.id === "emerald")!;
    const applied = applyThemePreset(appearance, preset);
    expect(appearance).toEqual(original);
    expect(applied).toMatchObject({
      mode: "system",
      logo: "/marca-teste.png",
      favicon: "/icone-teste.png",
      light: { churn: "#be123c", upgrades: "#0066ff", primary: "#059669" },
      dark: { churn: "#fb7185", upgrades: "#60a5fa", primary: "#34d399" },
    });
    applied.light.primary = "#000000";
    expect(preset.light.primary).toBe("#059669");
    expect(matchingThemePreset(applied)).toBeNull();
  });
  it("interpreta as paletas antigas preservando a antiga cor primary como Churn sem modificar o registro", async () => {
    const light = { ...clientDefaults.light };
    const dark = { ...clientDefaults.dark };
    Reflect.deleteProperty(light, "churn");
    Reflect.deleteProperty(dark, "churn");
    const legacy = { ...clientDefaults, light: { ...light, primary: "#be123c" }, dark: { ...dark, primary: "#fb7185" } };
    const original = JSON.stringify(legacy);
    const parsed = appearanceSchema.parse(legacy);
    expect(parsed.light).toMatchObject({
      churn: "#be123c",
      primary: clientDefaults.light.primary,
      upgrades: clientDefaults.light.upgrades,
    });
    expect(parsed.dark).toMatchObject({ churn: "#fb7185", primary: clientDefaults.dark.primary, upgrades: clientDefaults.dark.upgrades });
    expect(JSON.stringify(legacy)).toBe(original);
    vi.spyOn(db, "query").mockResolvedValue([[{ appearance: original }], []] as never);
    const execute = vi.spyOn(db, "execute");
    expect(await new SettingsService().appearance()).toEqual(parsed);
    expect(execute).not.toHaveBeenCalled();
  });
  it("salva três cores independentes e não aceita novas cores ausentes ou inválidas", async () => {
    const palette = {
      ...structuredClone(defaultAppearance),
      light: { ...defaultAppearance.light, primary: "#2563eb", churn: "#be123c", upgrades: "#0066ff" },
    };
    const execute = vi.spyOn(db, "execute").mockResolvedValue([{ affectedRows: 1 }, []] as never);
    expect(await new SettingsService().saveAppearance(palette, 1)).toEqual(palette);
    expect(JSON.parse(String(execute.mock.calls[0]?.[1]?.[0])).light).toMatchObject(palette.light);
    for (const value of [null, "", "red", "var(--color)", "#12345"])
      expect(appearanceSchema.safeParse({ ...palette, light: { ...palette.light, churn: value } }).success).toBe(false);
  });
});
