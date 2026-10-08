import { z } from "zod";
import { db } from "../../repositories/database.js";
import { permissionCatalog, permissionKeys, rolePermissions, accessPresets, type Permission } from "../../config/permissions.js";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const paletteSchema = z.object({
  background: color,
  surface: color,
  muted: color,
  text: color,
  secondary: color,
  border: color,
  primary: color,
  churn: color,
  upgrades: color,
  collections: color.default("#c2410c"),
  network: color.default("#0284c7"),
});
export const defaultAppearance = {
  typography: { font: "inter" as "inter" | "sora" | "roboto" | "poppins", size: 16, minWeight: 400 },
  mode: "light" as "light" | "dark" | "system",
  logo: "/cas-logo.png",
  favicon: "/cas-logo.png",
  light: {
    background: "#f8fafc",
    surface: "#ffffff",
    muted: "#f1f5f9",
    text: "#172033",
    secondary: "#64748b",
    border: "#e2e8f0",
    primary: "#2563eb",
    churn: "#0891b2",
    upgrades: "#7c3aed",
    collections: "#c2410c",
    network: "#0284c7",
  },
  dark: {
    background: "#0b1120",
    surface: "#151e30",
    muted: "#202c42",
    text: "#e8edf7",
    secondary: "#a2b0c7",
    border: "#34435b",
    primary: "#60a5fa",
    churn: "#22d3ee",
    upgrades: "#a78bfa",
    collections: "#fb923c",
    network: "#38bdf8",
  },
};
export function contrast(first: string, second: string) {
  const luminance = (hex: string) => {
    const components = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
    return components[0]! * 0.2126 + components[1]! * 0.7152 + components[2]! * 0.0722;
  };
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export function validImage(value: string) {
  if (value === "/cas-logo.png") return true;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2]!, "base64");
  if (!bytes.length || bytes.length > 256 * 1024) return false;
  return match[1] === "png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === "jpeg"
      ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
}
const image = z.string().max(350_000).refine(validImage, "Use uma imagem PNG, JPEG ou WebP de até 256 KB.");
export const typographySchema = z
  .object({
    font: z.enum(["inter", "sora", "roboto", "poppins"]).default("inter"),
    size: z.number().int().min(14).max(20).default(16),
    minWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).default(400),
  })
  .default({ font: "inter", size: 16, minWeight: 400 });
const appearanceObjectSchema = z
  .object({
    mode: z.enum(["light", "dark", "system"]),
    logo: image,
    favicon: image,
    typography: typographySchema,
    light: paletteSchema,
    dark: paletteSchema,
  })
  .superRefine((value, ctx) => {
    for (const mode of ["light", "dark"] as const) {
      const palette = value[mode];
      for (const surface of ["background", "surface", "muted"] as const) {
        if (contrast(palette.text, palette[surface]) < 4.5 || contrast(palette.secondary, palette[surface]) < 3)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `A paleta ${mode} precisa de mais contraste entre textos e fundos.`,
            path: [mode, surface],
          });
      }
    }
  });
/** Upgrade legacy palettes where primary was the Churn accent, without rewriting saved settings. */
export const appearanceSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const appearance = { ...(value as Record<string, unknown>) };
  for (const mode of ["light", "dark"] as const) {
    const palette = appearance[mode];
    if (palette && typeof palette === "object" && !Array.isArray(palette) && !("network" in palette))
      appearance[mode] = { ...palette, network: defaultAppearance[mode].network };
    if (palette && typeof palette === "object" && !Array.isArray(palette) && !("collections" in palette)) {
      appearance[mode] = { ...(appearance[mode] as object), collections: defaultAppearance[mode].collections };
    }
    if (palette && typeof palette === "object" && !Array.isArray(palette) && !("churn" in palette)) {
      const legacy = palette as Record<string, unknown>;
      appearance[mode] = { ...(appearance[mode] as object), churn: legacy.primary, primary: defaultAppearance[mode].primary };
    }
  }
  return appearance;
}, appearanceObjectSchema);
export const permissionSchema = z.enum(permissionKeys as [Permission, ...Permission[]]);
export const overridesSchema = z.record(permissionSchema, z.boolean());
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(255).default(""),
  permissions: z
    .array(permissionSchema)
    .max(permissionKeys.length)
    .transform((keys) => [...new Set(keys)]),
});
const parse = (value: unknown) => (typeof value === "string" ? JSON.parse(value) : value);

export class SettingsService {
  async appearance() {
    const [rows] = await db.query<any[]>("SELECT appearance FROM retention_system_settings WHERE id=1");
    return rows[0] ? appearanceSchema.parse(parse(rows[0].appearance)) : structuredClone(defaultAppearance);
  }
  async saveAppearance(value: unknown, userId: number) {
    const appearance = appearanceSchema.parse(value);
    await db.execute(
      "INSERT INTO retention_system_settings (id,appearance,updated_by_user_id) VALUES (1,?,?) ON DUPLICATE KEY UPDATE appearance=VALUES(appearance),updated_by_user_id=VALUES(updated_by_user_id)",
      [JSON.stringify(appearance), userId]
    );
    return appearance;
  }
  async access() {
    const [rows] = await db.query<any[]>(
      "SELECT p.*,COUNT(u.id) users_count FROM retention_permission_profiles p LEFT JOIN retention_users u ON u.profile_id=p.id GROUP BY p.id ORDER BY p.name"
    );
    return {
      catalog: permissionCatalog,
      defaults: rolePermissions,
      presets: accessPresets,
      profiles: rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        description: row.description,
        permissions: parse(row.permissions),
        usersCount: Number(row.users_count),
      })),
    };
  }
  async saveProfile(value: unknown, id?: number) {
    const profile = profileSchema.parse(value);
    try {
      if (id) {
        const [result] = await db.execute<any>("UPDATE retention_permission_profiles SET name=?,description=?,permissions=? WHERE id=?", [
          profile.name,
          profile.description,
          JSON.stringify(profile.permissions),
          id,
        ]);
        if (!result.affectedRows) throw Object.assign(new Error("Perfil não encontrado"), { statusCode: 404 });
        return { id };
      }
      const [result] = await db.execute<any>("INSERT INTO retention_permission_profiles (name,description,permissions) VALUES (?,?,?)", [
        profile.name,
        profile.description,
        JSON.stringify(profile.permissions),
      ]);
      return { id: Number(result.insertId) };
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY")
        throw Object.assign(new Error("Já existe um perfil com esse nome."), { statusCode: 409 });
      throw error;
    }
  }
}
