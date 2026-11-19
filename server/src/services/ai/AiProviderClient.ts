import axios from "axios";
import { z } from "zod";

export const aiProvider = z.enum(["openai", "gemini"]);
export type AiProvider = z.infer<typeof aiProvider>;
export const aiModel = z
  .string()
  .trim()
  .transform((s) => s.replace(/^models\//, ""))
  .pipe(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/, "Informe um identificador de modelo válido."));
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
export class AiProviderClient {
  constructor(private readonly post = axios.post) {}
  async generate(configuration: AiConfiguration, generation: AiGeneration, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    const model = aiModel.parse(configuration.model);
    if (!configuration.key) throw new Error("Chave de IA não cadastrada.");
    const common = { signal, timeout: 90000, maxContentLength: 1_000_000, maxRedirects: 0 };
    let raw: string;
    if (configuration.provider === "gemini") {
      const response = await this.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          systemInstruction: { parts: [{ text: generation.instructions }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(generation.input) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: generation.schema,
            maxOutputTokens: generation.maxTokens,
          },
        },
        { ...common, headers: { "x-goog-api-key": configuration.key } }
      );
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

/** Only fixed messages are surfaced, never Axios errors containing headers or prompts. */
export function aiConnectionFailure(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (status === 401 || status === 403) return "O provedor recusou a chave ou o acesso. Confira a chave e as permissões do projeto.";
  if (status === 404) return "Modelo não encontrado ou indisponível para esta chave. Escolha outro modelo.";
  if (status === 429) return "O provedor informou limite de uso ou cota insuficiente. Confira a cota e tente novamente.";
  if (status === 400) return "O provedor recusou o teste. Confira se o modelo suporta geração de JSON com schema.";
  return "Não foi possível validar a geração de JSON com este modelo. Confira o modelo, a conexão e a disponibilidade do provedor.";
}
