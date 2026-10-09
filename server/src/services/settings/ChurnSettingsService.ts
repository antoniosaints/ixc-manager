import { z } from "zod";
import { db } from "../../repositories/database.js";
import { riskThresholds, type RiskThresholds } from "../../config/risk.js";

const threshold = z
  .number()
  .int("Use pontos inteiros.")
  .min(1, "O limite deve ser de pelo menos 1 ponto.")
  .max(100, "O limite máximo é 100 pontos.");
export const churnSettingsSchema = z
  .object({
    low: z.literal(0),
    attention: threshold,
    medium: threshold,
    high: threshold,
    critical: threshold,
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [previous, next] of [
      ["low", "attention"],
      ["attention", "medium"],
      ["medium", "high"],
      ["high", "critical"],
    ] as const) {
      if (value[next] <= value[previous])
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [next],
          message: "Os limites devem aumentar nesta ordem: Baixo, Atenção, Médio, Alto e Crítico.",
        });
    }
  });
export const defaultChurnSettings: RiskThresholds = { low: 0, ...riskThresholds };
const missingTable = (error: unknown) => (error as { code?: string })?.code === "ER_NO_SUCH_TABLE";

export class ChurnSettingsService {
  async read(): Promise<RiskThresholds> {
    try {
      const [rows] = await db.query<any[]>("SELECT configuration FROM retention_churn_settings WHERE id=1");
      if (!rows[0]) return { ...defaultChurnSettings };
      return churnSettingsSchema.parse(
        typeof rows[0].configuration === "string" ? JSON.parse(rows[0].configuration) : rows[0].configuration
      );
    } catch (error) {
      // Deploying before the additive migration preserves the current classification.
      if (missingTable(error)) return { ...defaultChurnSettings };
      throw error;
    }
  }
  async get() {
    return { configuration: await this.read(), defaults: { ...defaultChurnSettings } };
  }
  async save(value: unknown, userId: number): Promise<RiskThresholds> {
    const configuration = churnSettingsSchema.parse(value);
    try {
      await db.execute(
        "INSERT INTO retention_churn_settings (id,configuration,updated_by_user_id) VALUES (1,?,?) ON DUPLICATE KEY UPDATE configuration=VALUES(configuration),updated_by_user_id=VALUES(updated_by_user_id)",
        [JSON.stringify(configuration), userId]
      );
    } catch (error) {
      if (missingTable(error))
        throw Object.assign(new Error("A configuração de Churn ainda não foi instalada. Execute a migração 018 no backend."), {
          statusCode: 503,
        });
      throw error;
    }
    return configuration;
  }
}
export const churnSettings = new ChurnSettingsService();
