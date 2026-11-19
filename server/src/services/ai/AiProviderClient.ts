import axios from "axios";
import { z } from "zod";

export const aiProvider = z.enum(["openai", "gemini"]);
export type AiProvider = z.infer<typeof aiProvider>;
export const aiModel = z
  .string()
  .trim()
  .transform((s) => s.replace(/^models\//, ""))
  .pipe(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/, "Informe um identificador de modelo válido."));
export interface AiModelOption {
  id: string;
  name: string;
}
export interface AiConfiguration {
  provider: AiProvider;
  model: string;
  key: string | null;
}
export interface AiGeneration {
  instructions: string;
  input: unknown;
  schema: Record<string, unknown>;
  name: string;
  maxTokens: number;
}
function geminiLegacySchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ["type", "description", "enum", "required", "nullable", "format"])
    if (schema[key] !== undefined)
      result[key] = key === "type" && typeof schema[key] === "string" ? schema[key].toUpperCase() : schema[key];
  if (schema.properties && typeof schema.properties === "object")
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, geminiLegacySchema(value as Record<string, unknown>)])
    );
  if (schema.items && typeof schema.items === "object") result.items = geminiLegacySchema(schema.items as Record<string, unknown>);
  return result;
}
function formatRejected(error: unknown) {
  if (!axios.isAxiosError(error) || error.response?.status !== 400) return false;
  const text = String(error.response.data?.error?.message ?? "");
  return (
    /response[_ ]?format|response[_ ]?json[_ ]?schema|response[_ ]?schema|response[_ ]?mime[_ ]?type/i.test(text) &&
    /unknown|unrecognized|unsupported|not supported|invalid|cannot|not allowed/i.test(text)
  );
}
function providerReason(error: unknown) {
  if (!axios.isAxiosError(error)) return "";
  const remote = error.response?.data?.error;
  return `${String(remote?.message ?? "")} ${Array.isArray(remote?.details) ? remote.details.map((d: any) => (typeof d?.reason === "string" ? d.reason : "")).join(" ") : ""}`;
}
export class AiProviderClient {
  constructor(
    private readonly post = axios.post,
    private readonly get = axios.get
  ) {}
  async models(configuration: Pick<AiConfiguration, "provider" | "key">, signal?: AbortSignal): Promise<AiModelOption[]> {
    signal?.throwIfAborted();
    if (!configuration.key) throw new Error("Chave de IA não cadastrada.");
    const common = { signal, timeout: 15000, maxContentLength: 2_000_000, maxRedirects: 0 };
    const models = new Map<string, AiModelOption>();
    const add = (id: string, name?: string) => {
      const normalized = aiModel.parse(id);
      models.set(normalized, { id: normalized, name: name?.trim() || normalized });
    };
    if (configuration.provider === "openai") {
      const response = await this.get("https://api.openai.com/v1/models", {
        ...common,
        headers: { Authorization: `Bearer ${configuration.key}` },
      });
      const data = z.object({ data: z.array(z.object({ id: z.string() })).max(10000) }).parse(response.data);
      for (const model of data.data) add(model.id);
    } else {
      const seen = new Set<string>();
      let pageToken: string | undefined,
        total = 0;
      for (let page = 0; ; page++) {
        signal?.throwIfAborted();
        if (page >= 20) throw new Error("Limite de páginas de modelos excedido.");
        const response = await this.get("https://generativelanguage.googleapis.com/v1beta/models", {
          ...common,
          headers: { "x-goog-api-key": configuration.key },
          params: { pageSize: 1000, ...(pageToken ? { pageToken } : {}) },
        });
        const data = z
          .object({
            models: z
              .array(
                z.object({
                  name: z.string(),
                  displayName: z.string().max(256).optional(),
                  supportedGenerationMethods: z.array(z.string()).default([]),
                })
              )
              .max(1000)
              .default([]),
            nextPageToken: z.string().max(4096).optional(),
          })
          .parse(response.data);
        total += data.models.length;
        if (total > 10000) throw new Error("Limite de modelos excedido.");
        for (const model of data.models)
          if (model.supportedGenerationMethods.includes("generateContent")) add(model.name, model.displayName);
        if (!data.nextPageToken) break;
        if (seen.has(data.nextPageToken)) throw new Error("Paginação de modelos inválida.");
        seen.add(data.nextPageToken);
        pageToken = data.nextPageToken;
      }
    }
    signal?.throwIfAborted();
    return [...models.values()].sort((a, b) => a.id.localeCompare(b.id, "en"));
  }
  async generate(configuration: AiConfiguration, generation: AiGeneration, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const model = aiModel.parse(configuration.model);
    if (!configuration.key) throw new Error("Chave de IA não cadastrada.");
    const common = { signal, timeout: 90000, maxContentLength: 1_000_000, maxRedirects: 0 };
    let raw: string;
    if (configuration.provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const payload = {
        systemInstruction: { parts: [{ text: generation.instructions }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(generation.input) }] }],
        generationConfig: {
          responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: generation.schema } },
          maxOutputTokens: generation.maxTokens,
        },
      };
      const options = { ...common, headers: { "x-goog-api-key": configuration.key } };
      let response;
      try {
        response = await this.post(url, payload, options);
      } catch (error) {
        if (!formatRejected(error)) throw error;
        signal?.throwIfAborted();
        // Older generateContent deployments accept the native Schema representation.
        response = await this.post(
          url,
          {
            ...payload,
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: geminiLegacySchema(generation.schema),
              maxOutputTokens: generation.maxTokens,
            },
          },
          options
        );
      }
      const data = response.data as {
        promptFeedback?: { blockReason?: string };
        candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      };
      const candidate = data.candidates?.[0];
      if (data.promptFeedback?.blockReason || !candidate || candidate.finishReason !== "STOP")
        throw new Error("Resposta de IA incompleta ou bloqueada.");
      raw =
        candidate.content?.parts
          ?.filter((p) => !p.thought)
          .map((p) => p.text ?? "")
          .join("") ?? "";
    } else {
      const response = await this.post(
        "https://api.openai.com/v1/responses",
        {
          model,
          store: false,
          instructions: generation.instructions,
          input: JSON.stringify(generation.input),
          max_output_tokens: generation.maxTokens,
          text: { format: { type: "json_schema", name: generation.name, strict: true, schema: generation.schema } },
        },
        { ...common, headers: { Authorization: `Bearer ${configuration.key}` } }
      );
      const data = response.data as { status?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
      if (data.status !== "completed") throw new Error("Resposta de IA incompleta.");
      const content = data.output?.filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
      if (content?.some((c) => c.type === "refusal")) throw new Error("Análise não disponibilizada.");
      raw =
        content
          ?.filter((c) => c.type === "output_text")
          .map((c) => c.text ?? "")
          .join("") ?? "";
    }
    return JSON.parse(raw);
  }
}

export function aiModelsFailure(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 401 || status === 403)
    return "O provedor recusou a chave cadastrada ou a permissão de listar modelos. Confira a chave e as permissões do projeto.";
  if (status === 429) return "O provedor limitou a consulta de modelos. Aguarde e tente atualizar a lista.";
  return "Não foi possível carregar os modelos do provedor. Confira a chave cadastrada, sua conexão e tente atualizar a lista.";
}

/** Only fixed messages are surfaced, never Axios errors containing headers or prompts. */
export function aiConnectionFailure(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const reason = providerReason(error);
  if (/API_KEY_INVALID|API key not valid|invalid api key|API_KEY_EXPIRED/i.test(reason))
    return "A chave da API foi recusada ou expirou. Cadastre uma chave válida para este provedor.";
  if (/billing|free tier|paid tier|FAILED_PRECONDITION/i.test(reason))
    return "O provedor exige revisar o faturamento ou a elegibilidade do projeto para usar este modelo.";
  if (status === 401 || status === 403) return "O provedor recusou a chave ou o acesso. Confira a chave e as permissões do projeto.";
  if (status === 404) return "Modelo não encontrado ou indisponível para esta chave. Escolha outro modelo.";
  if (status === 429) return "O provedor informou limite de uso ou cota insuficiente. Confira a cota e tente novamente.";
  if (status === 400)
    return formatRejected(error)
      ? "A API recusou o formato de JSON estruturado mesmo após a tentativa de compatibilidade. Escolha outro modelo e teste novamente."
      : "O provedor recusou a requisição do teste. Confira a chave e o acesso ao modelo selecionado.";
  return "Não foi possível validar a geração de JSON com este modelo. Confira o modelo, a conexão e a disponibilidade do provedor.";
}
