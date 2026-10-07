import { afterEach, describe, expect, it, vi } from "vitest";
import { appearanceSchema, defaultAppearance, SettingsService } from "../src/services/settings/SettingsService.js";
import { db } from "../src/repositories/database.js";
import { defaultAppearance as clientDefaults } from "../../client/src/settingsApi.js";
import { normalizeTypography, defaultTypography, fontOptions } from "../../client/src/typography.js";
import { applyThemePreset, themePresets } from "../../client/src/appearancePresets.js";
afterEach(() => vi.restoreAllMocks());
describe("Tipografia configurável", () => {
  it("mantém as configurações antigas legíveis sem regravar o banco", async () => {
    const legacy = structuredClone(defaultAppearance);
    Reflect.deleteProperty(legacy, "typography");
    const original = JSON.stringify(legacy);
    vi.spyOn(db, "query").mockResolvedValue([[{ appearance: original }], []] as never);
    const execute = vi.spyOn(db, "execute");
    expect((await new SettingsService().appearance()).typography).toEqual(defaultTypography);
    expect(JSON.stringify(legacy)).toBe(original);
    expect(execute).not.toHaveBeenCalled();
    expect(clientDefaults.typography).toEqual(defaultAppearance.typography);
    expect(normalizeTypography()).toEqual(defaultTypography);
  });
  it("salva cada família com tamanho e piso de espessura e mantém a seleção ao aplicar presets", async () => {
    const execute = vi.spyOn(db, "execute").mockResolvedValue([{ affectedRows: 1 }, []] as never);
    for (const { value: font } of fontOptions) {
      const value = { ...structuredClone(clientDefaults), typography: { font, size: 18, minWeight: 600 } };
      expect((await new SettingsService().saveAppearance(value, 1)).typography).toEqual(value.typography);
      expect(JSON.parse(String(execute.mock.calls.at(-1)?.[1]?.[0])).typography).toEqual(value.typography);
      for (const preset of themePresets) expect(applyThemePreset(value, preset).typography).toEqual(value.typography);
    }
  });
  it("recusa fontes e valores inválidos antes de escrever", async () => {
    const execute = vi.spyOn(db, "execute");
    for (const typography of [
      { font: "Comic Sans" },
      { font: "url(https://example.test)" },
      { size: 13 },
      { size: 21 },
      { size: 16.5 },
      { size: "18" },
      { minWeight: 300 },
      { minWeight: 450 },
      { minWeight: 900 },
      { minWeight: "600" },
      null,
    ]) {
      await expect(new SettingsService().saveAppearance({ ...defaultAppearance, typography }, 1)).rejects.toThrow();
    }
    expect(execute).not.toHaveBeenCalled();
    expect(appearanceSchema.parse({ ...defaultAppearance, typography: {} }).typography).toEqual(defaultTypography);
    expect(normalizeTypography({ font: "bad" as never, size: 100, minWeight: 0 })).toEqual(defaultTypography);
  });
});
