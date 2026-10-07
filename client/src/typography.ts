export const fontOptions = [
  { value: "inter", label: "Inter", family: '"Inter Variable", sans-serif' },
  { value: "sora", label: "Sora", family: '"Sora Variable", sans-serif' },
  { value: "roboto", label: "Roboto", family: '"Roboto Variable", sans-serif' },
  { value: "poppins", label: "Poppins", family: '"Poppins", sans-serif' },
] as const;
export type SystemFont = (typeof fontOptions)[number]["value"];
export interface Typography {
  font: SystemFont;
  size: number;
  minWeight: number;
}
export const defaultTypography: Typography = { font: "inter", size: 16, minWeight: 400 };
/** Keep old saved settings and older API responses readable. */
export function normalizeTypography(value?: Partial<Typography> | null): Typography {
  return {
    font: fontOptions.some((option) => option.value === value?.font) ? value!.font! : defaultTypography.font,
    size: Number.isInteger(value?.size) && value!.size! >= 14 && value!.size! <= 20 ? value!.size! : defaultTypography.size,
    minWeight: [400, 500, 600, 700].includes(value?.minWeight ?? 0) ? value!.minWeight! : defaultTypography.minWeight,
  };
}
export const fontFamily = (font: SystemFont) => fontOptions.find((option) => option.value === font)?.family ?? fontOptions[0].family;
