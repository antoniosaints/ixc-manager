import { z } from "zod";
import { db } from "../../repositories/database.js";
import { IxcReadDatabase } from "../../integrations/ixc/database/IxcReadDatabase.js";
export const activationSettingsSchema = z
  .object({
    source: z.enum(["contracts", "serviceOrders"]),
    subjectIds: z
      .array(z.number().int().positive().safe())
      .max(200)
      .transform((ids) => [...new Set(ids)].sort((a, b) => a - b)),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.source === "serviceOrders" && !value.subjectIds.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subjectIds"],
        message: "Selecione pelo menos um assunto para contabilizar as ativações por OS.",
      });
  });
export type ActivationSettings = z.infer<typeof activationSettingsSchema>;
export const defaultActivationSettings: ActivationSettings = { source: "contracts", subjectIds: [] };
export class AnalyticsSettingsService {
  constructor(private readonly ixc = new IxcReadDatabase()) {}
  async close() {
    await this.ixc.close();
  }
  async read(): Promise<ActivationSettings> {
    const [rows] = await db.query<any[]>("SELECT configuration FROM retention_analytics_settings WHERE id=1");
    if (!rows[0]) return structuredClone(defaultActivationSettings);
    return activationSettingsSchema.parse(
      typeof rows[0].configuration === "string" ? JSON.parse(rows[0].configuration) : rows[0].configuration
    );
  }
  async subjects() {
    const rows = await this.ixc.select<{ id: number | string; assunto: string | null }>({
      name: "analytics-activation-subjects",
      sql: "SELECT id,assunto FROM su_oss_assunto ORDER BY assunto,id LIMIT 5001",
      params: [],
      timeoutSeconds: 5,
    });
    if (rows.length > 5000)
      throw Object.assign(new Error("Há mais assuntos que o limite de consulta. Contate a administração."), { statusCode: 422 });
    return rows.map((r) => ({ id: z.number().int().positive().safe().parse(Number(r.id)), name: r.assunto?.trim() || `Assunto #${r.id}` }));
  }
  async get() {
    const [configuration, subjects] = await Promise.all([this.read(), this.subjects()]);
    return { configuration, subjects };
  }
  async save(value: unknown, userId: number) {
    const configuration = activationSettingsSchema.parse(value);
    if (configuration.subjectIds.length) {
      const subjects = new Set((await this.subjects()).map((row) => row.id));
      if (configuration.subjectIds.some((id) => !subjects.has(id)))
        throw Object.assign(new Error("Um dos assuntos não existe mais no IXC. Atualize a lista e revise a seleção."), { statusCode: 400 });
    }
    await db.execute(
      "INSERT INTO retention_analytics_settings (id,configuration,updated_by_user_id) VALUES (1,?,?) ON DUPLICATE KEY UPDATE configuration=VALUES(configuration),updated_by_user_id=VALUES(updated_by_user_id)",
      [JSON.stringify(configuration), userId]
    );
    return configuration;
  }
}
