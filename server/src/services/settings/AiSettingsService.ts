import { z } from "zod";
import { db } from "../../repositories/database.js";
import { env } from "../../config/env.js";
import {
  AiProviderClient,
  aiConnectionFailure,
  AiModelsError,
  aiModel,
  aiProvider,
  type AiConfiguration,
  type AiProvider,
} from "../ai/AiProviderClient.js";
import { AiSecretVault, AiSecretUnavailableError } from "../ai/AiSecretVault.js";
import { PersistentAiSecretVault } from "../ai/PersistentAiSecretVault.js";

const entry = z
  .object({ model: aiModel, keySource: z.enum(["saved", "environment", "none"]), encryptedKey: z.string().nullable() })
  .strict();
const storedSchema = z.object({ provider: aiProvider, providers: z.object({ openai: entry, gemini: entry }).strict() }).strict();
type Stored = z.infer<typeof storedSchema>;
export const aiSettingsDraft = z
  .object({
    provider: aiProvider,
    model: aiModel,
    keyAction: z.enum(["keep", "replace", "remove"]).default("keep"),
    apiKey: z.string().trim().max(4096).default(""),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.keyAction === "replace" && (!v.apiKey || /\s/.test(v.apiKey)))
      ctx.addIssue({ code: "custom", path: ["apiKey"], message: "Informe uma chave válida, sem espaços." });
    if (v.keyAction !== "replace" && v.apiKey)
      ctx.addIssue({ code: "custom", path: ["apiKey"], message: "Selecione a substituição para cadastrar uma nova chave." });
  });
export const aiSettingsSave = z.object({ revision: z.number().int().nonnegative().safe(), configuration: aiSettingsDraft }).strict();
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export const aiModelsQuery = z.object({ provider: aiProvider }).strict();
export interface AiSettingsStore {
  read(): Promise<{ configuration: Stored; revision: number } | null>;
  write(configuration: Stored, revision: number, userId: number): Promise<void>;
}
export class AiSettingsRepository implements AiSettingsStore {
  async read() {
    try {
      const [rows] = await db.query<any[]>("SELECT configuration,revision FROM retention_ai_settings WHERE id=1");
      const row = rows[0];
      return row
        ? {
            configuration: storedSchema.parse(typeof row.configuration === "string" ? JSON.parse(row.configuration) : row.configuration),
            revision: z.number().int().positive().safe().parse(Number(row.revision)),
          }
        : null;
    } catch (error) {
      if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return null;
      throw error;
    }
  }
  async write(configuration: Stored, revision: number, userId: number) {
    const write = async () => {
      if (!revision)
        await db.execute("INSERT INTO retention_ai_settings (id,configuration,revision,updated_by_user_id) VALUES (1,?,1,?)", [
          JSON.stringify(configuration),
          userId,
        ]);
      else {
        const [result] = await db.execute<any>(
          "UPDATE retention_ai_settings SET configuration=?,revision=revision+1,updated_by_user_id=? WHERE id=1 AND revision=?",
          [JSON.stringify(configuration), userId, revision]
        );
        if (!result.affectedRows) throw fail("As configurações foram alteradas por outro administrador. Recarregue a tela.", 409);
      }
    };
    try {
      try {
        await write();
      } catch (error) {
        if ((error as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw error;
        // Additive setup only on the first explicit save in the application database.
        await db.query(`CREATE TABLE IF NOT EXISTS retention_ai_settings (
          id TINYINT PRIMARY KEY,configuration JSON NOT NULL,revision BIGINT NOT NULL DEFAULT 1,
          updated_by_user_id BIGINT NULL,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
        await write();
      }
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY")
        throw fail("As configurações foram alteradas por outro administrador. Recarregue a tela.", 409);
      throw error;
    }
  }
}
export class AiSettingsService {
  constructor(
    private readonly store: AiSettingsStore = new AiSettingsRepository(),
    private readonly vault: AiSecretVault = new PersistentAiSecretVault(),
    private readonly client = new AiProviderClient()
  ) {}
  private defaults(): Stored {
    return {
      provider: "openai",
      providers: {
        openai: { model: env.OPENAI_MODEL, keySource: env.OPENAI_API_KEY ? "environment" : "none", encryptedKey: null },
        gemini: { model: "gemini-3.5-flash-lite", keySource: "none", encryptedKey: null },
      },
    };
  }
  private async read() {
    return (await this.store.read()) ?? { configuration: this.defaults(), revision: 0 };
  }
  private async public(configuration: Stored, revision: number) {
    const state = async (provider: AiProvider) => {
      const v = configuration.providers[provider];
      const configured =
        v.keySource === "saved" ? !!v.encryptedKey : v.keySource === "environment" && provider === "openai" && !!env.OPENAI_API_KEY;
      let protectionError: string | null = null;
      if (configured && v.keySource === "saved") {
        try {
          await this.key(configuration, provider);
        } catch (error) {
          protectionError =
            (error as { statusCode?: number }).statusCode === 409
              ? (error as Error).message
              : "Não foi possível verificar a proteção desta credencial. Tente recarregar as configurações.";
        }
      }
      return { model: v.model, keySource: v.keySource, configured, protectionError };
    };
    const [openai, gemini] = await Promise.all([state("openai"), state("gemini")]);
    return {
      provider: configuration.provider,
      revision,
      providers: { openai, gemini },
    };
  }
  async get() {
    const row = await this.read();
    return this.public(row.configuration, row.revision);
  }
  async status() {
    const value = await this.get();
    return {
      provider: value.provider,
      model: value.providers[value.provider].model,
      configured: value.providers[value.provider].configured && !value.providers[value.provider].protectionError,
    };
  }
  private async key(configuration: Stored, provider: AiProvider) {
    const value = configuration.providers[provider];
    if (value.keySource === "saved" && value.encryptedKey) {
      try {
        return await this.vault.decrypt(value.encryptedKey, provider);
      } catch (error) {
        if (error instanceof AiSecretUnavailableError)
          throw fail(
            error.recovery === "backend"
              ? "A proteção persistente não pôde ser aberta. Restaure o segredo do backend usado ao cadastrar as chaves antes de continuar."
              : "A proteção anterior não pôde ser aberta. Restaure o arquivo original ou cadastre novamente a chave da API. Novos cadastros usam proteção persistente no banco.",
            409
          );
        throw error;
      }
    }
    return value.keySource === "environment" && provider === "openai" ? (env.OPENAI_API_KEY ?? null) : null;
  }
  async runtime(): Promise<AiConfiguration> {
    const { configuration } = await this.read();
    let key: string | null;
    try {
      key = await this.key(configuration, configuration.provider);
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 409) throw error;
      key = null;
    }
    return {
      provider: configuration.provider,
      model: configuration.providers[configuration.provider].model,
      key,
    };
  }
  async models(input: unknown, signal?: AbortSignal) {
    const { provider } = aiModelsQuery.parse(input);
    const { configuration } = await this.read();
    const key = await this.key(configuration, provider);
    if (!key) throw fail("Cadastre e salve uma chave para este provedor para carregar os modelos.");
    try {
      const deadline = AbortSignal.timeout(45000);
      const models = await this.client.models({ provider, key }, signal ? AbortSignal.any([signal, deadline]) : deadline);
      return { provider, models };
    } catch (error) {
      signal?.throwIfAborted();
      throw new AiModelsError(provider, error);
    }
  }
  async save(input: unknown, userId: number) {
    const { revision, configuration: draft } = aiSettingsSave.parse(input);
    const current = await this.read();
    if (current.revision !== revision) throw fail("As configurações foram alteradas por outro administrador. Recarregue a tela.", 409);
    const configuration = structuredClone(current.configuration),
      target = configuration.providers[draft.provider];
    target.model = draft.model;
    configuration.provider = draft.provider;
    if (draft.keyAction === "replace") {
      target.encryptedKey = await this.vault.encrypt(draft.apiKey, draft.provider);
      target.keySource = "saved";
    } else if (draft.keyAction === "remove") {
      target.encryptedKey = null;
      target.keySource = "none";
    }
    await this.store.write(configuration, revision, userId);
    return this.public(configuration, revision + 1);
  }
  async test(input: unknown, signal?: AbortSignal) {
    const draft = aiSettingsDraft.parse(input),
      started = Date.now();
    const { configuration } = await this.read();
    const key =
      draft.keyAction === "replace" ? draft.apiKey : draft.keyAction === "remove" ? null : await this.key(configuration, draft.provider);
    if (!key) throw fail("Cadastre uma chave para o provedor selecionado antes de testar.");
    const selected = { provider: draft.provider, model: draft.model };
    try {
      const deadline = AbortSignal.timeout(50000);
      const result = await this.client.generate(
        { ...selected, key },
        {
          instructions: "Teste de conexão. Responda somente com JSON válido seguindo o schema, com ok igual a true.",
          input: "Confirme o funcionamento da geração estruturada.",
          schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
          name: "connection_test",
          maxTokens: 2048,
        },
        signal ? AbortSignal.any([signal, deadline]) : deadline
      );
      z.object({ ok: z.literal(true) })
        .strict()
        .parse(result);
      return { ...selected, ok: true, durationMs: Date.now() - started, message: "Conexão e geração de JSON validadas com sucesso." };
    } catch (error) {
      signal?.throwIfAborted();
      return { ...selected, ok: false, durationMs: Date.now() - started, message: aiConnectionFailure(error) };
    }
  }
}
