import axios from "axios";
import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";

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
export class AiGenerationError extends Error {
  constructor(readonly code: "OUTPUT_LIMIT" | "BLOCKED" | "INCOMPLETE" | "INVALID_JSON" | "INVALID_REPORT" | "INVALID_EVIDENCE") {
    super(code);
  }
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
function transientCatalogFailure(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  return (
    [408, 500, 502, 503, 504].includes(error.response?.status ?? 0) ||
    (!error.response && ["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EAI_AGAIN", "ERR_NETWORK"].includes(error.code ?? ""))
  );
}
export class AiProviderClient {
  constructor(
    private readonly post = axios.post,
    private readonly get = axios.get
  ) {}
  private async getCatalog(url: string, options: Parameters<typeof axios.get>[1]) {
    try {
      return await this.get(url, options);
    } catch (error) {
      // Only retry a read after a transient failure. Credentials, permissions and quota require action.
      if (!transientCatalogFailure(error)) throw error;
      await delay(500, undefined, { signal: options?.signal as AbortSignal | undefined });
      return this.get(url, options);
    }
  }
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
      const response = await this.getCatalog("https://api.openai.com/v1/models", {
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
        const response = await this.getCatalog("https://generativelanguage.googleapis.com/v1beta/models", {
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
      if (data.promptFeedback?.blockReason) throw new AiGenerationError("BLOCKED");
      if (candidate?.finishReason === "MAX_TOKENS") throw new AiGenerationError("OUTPUT_LIMIT");
      if (candidate?.finishReason && ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"].includes(candidate.finishReason))
        throw new AiGenerationError("BLOCKED");
      if (!candidate || candidate.finishReason !== "STOP") throw new AiGenerationError("INCOMPLETE");
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
      const data = response.data as {
        status?: string;
        incomplete_details?: { reason?: string };
        output?: { type: string; content?: { type: string; text?: string }[] }[];
      };
      if (data.incomplete_details?.reason === "max_output_tokens") throw new AiGenerationError("OUTPUT_LIMIT");
      if (data.status !== "completed") throw new AiGenerationError("INCOMPLETE");
      const content = data.output?.filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
      if (content?.some((c) => c.type === "refusal")) throw new AiGenerationError("BLOCKED");
      raw =
        content
          ?.filter((c) => c.type === "output_text")
          .map((c) => c.text ?? "")
          .join("") ?? "";
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new AiGenerationError("INVALID_JSON");
    }
  }
}

export function aiModelsFailure(error: unknown) {
  return modelsDiagnostic(error).message;
}

function modelsDiagnostic(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const reason = providerReason(error);
  const result = (code: string, message: string, retryable = false) => ({
    code,
    message,
    providerStatus: typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    retryable,
  });
  if (/API_KEY_INVALID|API_KEY_EXPIRED|API_KEY_NOT_FOUND|API key not valid|invalid api key|api key.*expired/i.test(reason))
    return result(
      "API_KEY_INVALID",
      "A chave da API foi recusada ou expirou. Cadastre uma chave válida do provedor e salve antes de atualizar os modelos."
    );
  if (/leaked|API_KEY_BLOCKED|API_KEY_COMPROMISED/i.test(reason))
    return result(
      "API_KEY_BLOCKED",
      "O provedor bloqueou esta chave. Gere uma nova chave no painel do provedor e cadastre-a nas configurações."
    );
  if (/API_KEY_(SERVICE|IP_ADDRESS|HTTP_REFERRER|ANDROID_APP|IOS_APP)_BLOCKED|unrestricted.*key|key.*unrestricted/i.test(reason))
    return result(
      "API_KEY_RESTRICTED",
      "As restrições da chave impedem o acesso pelo backend. No provedor, autorize a Gemini API e o servidor que executa o sistema."
    );
  if (/SERVICE_DISABLED|API_DISABLED|has not been used.*disabled|api.*not enabled/i.test(reason))
    return result(
      "SERVICE_DISABLED",
      "A Gemini API não está habilitada no projeto desta chave. Habilite a Generative Language API no projeto do Google e atualize os modelos."
    );
  if (/location.*not supported|country.*not supported|unsupported.*(location|country|region)/i.test(reason))
    return result(
      "REGION_UNSUPPORTED",
      "O Gemini não está disponível para a localização do servidor. Confira a região de hospedagem e a disponibilidade da API."
    );
  if (/billing|free tier|paid tier|FAILED_PRECONDITION/i.test(reason))
    return result(
      "BILLING_REQUIRED",
      "O provedor exige revisar o faturamento ou a elegibilidade do projeto desta chave antes de listar modelos."
    );
  if (status === 401 || status === 403)
    return result(
      "ACCESS_DENIED",
      "O provedor recusou a chave cadastrada ou a permissão de listar modelos. Confira a chave e as permissões do projeto."
    );
  if (status === 429)
    return result("RATE_LIMITED", "O provedor limitou a consulta de modelos. Confira a cota, aguarde e tente atualizar a lista.", true);
  if (status === 400)
    return result(
      "INVALID_REQUEST",
      "O provedor recusou a consulta de modelos (HTTP 400). Confira o tipo da chave, as restrições e a habilitação da API no projeto."
    );
  if (status === 404) return result("CATALOG_NOT_FOUND", "O catálogo de modelos não está disponível nesta API para a chave cadastrada.");
  if (status && status >= 500)
    return result("PROVIDER_UNAVAILABLE", "O provedor está temporariamente indisponível. Aguarde e atualize a lista de modelos.", true);
  const code = axios.isAxiosError(error) ? error.code : undefined;
  if (
    ["ERR_CANCELED", "ECONNABORTED", "ETIMEDOUT"].includes(code ?? "") ||
    (error instanceof Error && /AbortError|TimeoutError/.test(error.name))
  )
    return result(
      "CONNECTION_TIMEOUT",
      "A consulta de modelos excedeu o tempo limite. Confira a conexão de saída do backend com o provedor e tente novamente.",
      true
    );
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code ?? ""))
    return result(
      "DNS_ERROR",
      "O servidor não conseguiu resolver o endereço da API. Confira o DNS e a conexão de saída da hospedagem.",
      true
    );
  if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code ?? ""))
    return result(
      "TLS_ERROR",
      "O backend não conseguiu validar o certificado HTTPS do provedor. Confira os certificados e o proxy da hospedagem."
    );
  if (["ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "ERR_NETWORK"].includes(code ?? ""))
    return result(
      "NETWORK_ERROR",
      "O backend não conseguiu se conectar à API do provedor. Confira a rede, o firewall e o proxy da hospedagem.",
      true
    );
  if (error instanceof z.ZodError)
    return result(
      "INVALID_CATALOG",
      "O provedor retornou um catálogo de modelos em formato inesperado. Atualize a lista; se persistir, confira o proxy da hospedagem."
    );
  return result(
    "MODELS_UNAVAILABLE",
    "Não foi possível carregar os modelos do provedor. Confira a chave cadastrada, sua conexão e tente atualizar a lista.",
    true
  );
}

/** Only allowlisted diagnostic fields cross the HTTP boundary, never the original transport error. */
export class AiModelsError extends Error {
  readonly statusCode = 422;
  readonly diagnostic: ReturnType<typeof modelsDiagnostic> & { provider: AiProvider };
  constructor(provider: AiProvider, error: unknown) {
    const diagnostic = modelsDiagnostic(error);
    super(diagnostic.message);
    this.diagnostic = { ...diagnostic, provider };
  }
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

export function aiAnalysisFailure(error: unknown) {
  if (error instanceof AiGenerationError) {
    return {
      OUTPUT_LIMIT:
        "O provedor atingiu o limite de saída antes de concluir o resumo. Reduza o período ou escolha um modelo com maior capacidade de saída.",
      BLOCKED: "O provedor bloqueou a geração deste conteúdo. Revise os textos das OS ou teste outro modelo compatível.",
      INCOMPLETE: "O provedor devolveu uma resposta incompleta. Tente novamente ou reduza o período.",
      INVALID_JSON: "O modelo não devolveu JSON válido. Teste a conexão em Configurações e escolha um modelo compatível com a análise.",
      INVALID_REPORT: "O resumo devolvido não respeitou os campos ou limites exigidos. Reduza o período ou teste outro modelo.",
      INVALID_EVIDENCE:
        "O resumo citou OS que não pertencem às evidências fornecidas e foi rejeitado. Tente novamente ou escolha outro modelo.",
    }[error.code];
  }
  if (
    (error instanceof Error && /AbortError|TimeoutError/.test(error.name)) ||
    (axios.isAxiosError(error) && ["ERR_CANCELED", "ECONNABORTED", "ETIMEDOUT"].includes(error.code ?? ""))
  )
    return "O tempo limite da revisão por IA foi atingido. Reduza o período para processar menos lotes por análise.";
  if (axios.isAxiosError(error))
    return aiConnectionFailure(error)
      .replace("do teste", "da análise")
      .replace("validar a geração de JSON", "concluir a geração do resumo");
  return "Não foi possível concluir o resumo por IA. Tente novamente ou reduza o período. Confira o modelo e a disponibilidade do provedor.";
}
