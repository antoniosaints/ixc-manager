import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiSecretVault } from "../src/services/ai/AiSecretVault.js";
import { AiProviderClient, AiModelsError, aiConnectionFailure } from "../src/services/ai/AiProviderClient.js";
import {
  AiSettingsService,
  AiSettingsRepository,
  aiSettingsDraft,
  type AiSettingsStore,
} from "../src/services/settings/AiSettingsService.js";
import { settingsRoutes } from "../src/controllers/settingsController.js";
import { AuthService } from "../src/services/AuthService.js";
import { db } from "../src/repositories/database.js";
import { env } from "../src/config/env.js";
import { OrderAiService, type OrderAiInput } from "../src/services/ai/OrderAiService.js";

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
const draft = (provider: "openai" | "gemini" = "gemini", apiKey = "key-gemini-private") => ({
  provider,
  model: provider === "gemini" ? "gemini-test" : "gpt-test",
  keyAction: "replace" as const,
  apiKey,
});
const gemini = (result: unknown = { ok: true }) => ({
  data: { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(result) }] } }] },
});
const openai = (result: unknown = { ok: true }) => ({
  data: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }] },
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "cas-ai-test-"));
  directories.push(directory);
  let stored: Awaited<ReturnType<AiSettingsStore["read"]>> = null;
  const store: AiSettingsStore = {
    read: vi.fn(async () => structuredClone(stored)),
    write: vi.fn(async (configuration, revision) => {
      if (revision !== (stored?.revision ?? 0)) throw Object.assign(new Error("Conflito"), { statusCode: 409 });
      stored = { configuration: structuredClone(configuration), revision: revision + 1 };
    }),
  };
  const post = vi.fn().mockResolvedValue(gemini()),
    get = vi.fn(),
    vault = new AiSecretVault(directory);
  const service = new AiSettingsService(store, vault, new AiProviderClient(post, get));
  return { service, store, post, get, vault, directory, stored: () => structuredClone(stored) };
}
describe("Chaves de IA protegidas", () => {
  it("criptografa com nonce único, persiste entre instâncias e vincula o segredo ao provedor", async () => {
    const { vault, directory } = await fixture();
    const first = await vault.encrypt("PRIVATE_API_KEY", "gemini"),
      second = await vault.encrypt("PRIVATE_API_KEY", "gemini");
    expect(first).not.toBe(second);
    expect(first).not.toContain("PRIVATE_API_KEY");
    expect(await new AiSecretVault(directory).decrypt(first, "gemini")).toBe("PRIVATE_API_KEY");
    await expect(vault.decrypt(first, "openai")).rejects.toThrow();
    expect((await stat(join(directory, "master.key"))).mode & 0o777).toBe(0o600);
    expect((await readFile(join(directory, "master.key"))).length).toBe(32);
  });
  it("cria uma única chave mestra em gravações concorrentes e não recria chave ausente ao ler", async () => {
    const { directory } = await fixture();
    const first = new AiSecretVault(directory),
      second = new AiSecretVault(directory);
    const [a, b] = await Promise.all([first.encrypt("KEY_A", "openai"), second.encrypt("KEY_B", "gemini")]);
    expect(await first.decrypt(a, "openai")).toBe("KEY_A");
    expect(await second.decrypt(b, "gemini")).toBe("KEY_B");
    await rm(join(directory, "master.key"));
    await expect(first.decrypt(a, "openai")).rejects.toThrow("Chave de proteção indisponível");
    await expect(stat(join(directory, "master.key"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
describe("Cadastro de IA pela aplicação", () => {
  it("mantém chaves separadas, preserva segredo ao editar modelo e aplica a troca sem reiniciar", async () => {
    const f = await fixture();
    const first = await f.service.save({ revision: 0, configuration: draft() }, 1);
    expect(first.provider).toBe("gemini");
    expect(first.providers.gemini).toMatchObject({ configured: true, keySource: "saved" });
    expect(JSON.stringify(first)).not.toMatch(/key-gemini-private|encryptedKey/);
    expect(JSON.stringify(f.stored())).not.toContain("key-gemini-private");
    const cipher = f.stored()!.configuration.providers.gemini.encryptedKey;
    await f.service.save({ revision: 1, configuration: { ...draft(), model: "models/gemini-new", keyAction: "keep", apiKey: "" } }, 1);
    expect(f.stored()!.configuration.providers.gemini.encryptedKey).toBe(cipher);
    expect(await f.service.runtime()).toEqual({ provider: "gemini", model: "gemini-new", key: "key-gemini-private" });
    await f.service.save({ revision: 2, configuration: draft("openai", "key-openai-private") }, 1);
    expect(await f.service.runtime()).toMatchObject({ provider: "openai", key: "key-openai-private" });
    const changed = await f.service.save({ revision: 3, configuration: { ...draft(), keyAction: "keep", apiKey: "" } }, 1);
    expect(changed.providers.openai.configured).toBe(true);
    expect(await f.service.runtime()).toMatchObject({ provider: "gemini", key: "key-gemini-private" });
    const removed = await f.service.save({ revision: 4, configuration: { ...draft(), keyAction: "remove", apiKey: "" } }, 1);
    expect(removed.providers.gemini.configured).toBe(false);
    expect(removed.providers.openai.configured).toBe(true);
    expect((await f.service.runtime()).key).toBeNull();
    expect(f.post).not.toHaveBeenCalled();
  });
  it("permite migrar a chave antiga e removê-la sem reativar o fallback do ambiente", async () => {
    const previous = env.OPENAI_API_KEY;
    env.OPENAI_API_KEY = "OLD_ENV_KEY";
    try {
      const f = await fixture();
      expect((await f.service.get()).providers.openai).toMatchObject({ configured: true, keySource: "environment" });
      await f.service.save({ revision: 0, configuration: { ...draft("openai"), keyAction: "remove", apiKey: "" } }, 1);
      expect((await f.service.runtime()).key).toBeNull();
      await f.service.save({ revision: 1, configuration: draft("openai", "NEW_SAVED_KEY") }, 1);
      expect((await f.service.runtime()).key).toBe("NEW_SAVED_KEY");
    } finally {
      env.OPENAI_API_KEY = previous;
    }
  });
  it("testa chave nova sem salvar e usa somente a chave do provedor selecionado", async () => {
    const f = await fixture();
    expect((await f.service.test(draft())).ok).toBe(true);
    expect(f.store.write).not.toHaveBeenCalled();
    expect(f.stored()).toBeNull();
    const [url, body, options] = f.post.mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
    expect(url).not.toContain("key-gemini-private");
    expect(body).toMatchObject({
      generationConfig: { responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: { required: ["ok"] } } } },
    });
    expect(options.headers).toEqual({ "x-goog-api-key": "key-gemini-private" });
    expect(JSON.stringify(body)).not.toContain("key-gemini-private");
    await f.service.save({ revision: 0, configuration: draft("openai", "ONLY_OPENAI_KEY") }, 1);
    await expect(f.service.test({ ...draft(), keyAction: "keep", apiKey: "" })).rejects.toMatchObject({ statusCode: 400 });
    f.post.mockResolvedValueOnce(openai());
    expect((await f.service.test({ ...draft("openai"), keyAction: "keep", apiKey: "" })).ok).toBe(true);
    expect(f.post.mock.calls.at(-1)![2].headers.Authorization).toBe("Bearer ONLY_OPENAI_KEY");
  });
  it("recusa configuração inválida e edições antigas antes de escrever ou chamar o provedor", async () => {
    const f = await fixture();
    for (const input of [
      { ...draft(), provider: "other" },
      { ...draft(), model: "../../other?key=test" },
      { ...draft(), apiKey: "key\nsecret" },
      { ...draft(), keyAction: "keep" },
      { ...draft(), baseUrl: "https://other.test" },
    ]) {
      expect(aiSettingsDraft.safeParse(input).success).toBe(false);
      await expect(f.service.test(input)).rejects.toThrow();
    }
    expect(f.post).not.toHaveBeenCalled();
    await f.service.save({ revision: 0, configuration: draft() }, 1);
    await expect(f.service.save({ revision: 0, configuration: draft("openai") }, 1)).rejects.toMatchObject({ statusCode: 409 });
    expect(f.store.write).toHaveBeenCalledOnce();
  });
  it("não valida conexão com JSON inválido e não devolve erros privados do transporte", async () => {
    const f = await fixture();
    f.post.mockResolvedValueOnce(gemini({ ok: false }));
    expect((await f.service.test(draft())).ok).toBe(false);
    f.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 429, data: "PRIVATE_RESPONSE" },
      config: { headers: { "x-goog-api-key": "PRIVATE_KEY" } },
    });
    const result = await f.service.test(draft());
    expect(result).toMatchObject({ ok: false, provider: "gemini", model: "gemini-test" });
    expect(result.message).toContain("cota");
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    for (const status of [400, 401, 403, 404, 429, 500])
      expect(aiConnectionFailure({ isAxiosError: true, response: { status }, message: "PRIVATE" })).not.toContain("PRIVATE");
  });
});
describe("Modelos retornados pelos provedores", () => {
  it("carrega o catálogo Gemini pelo endpoint administrativo usando a chave salva", async () => {
    const f = await fixture();
    await f.service.save({ revision: 0, configuration: draft() }, 1);
    const models = f.service.models.bind(f.service);
    vi.spyOn(AiSettingsService.prototype, "models").mockImplementation(models);
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ id: 1, role: "ADMIN" } as never);
    f.get.mockResolvedValueOnce({
      data: { models: [{ name: "models/gemini-live", displayName: "Gemini Live", supportedGenerationMethods: ["generateContent"] }] },
    });
    const app = Fastify();
    await app.register(settingsRoutes, { prefix: "/api/settings" });
    try {
      const response = await app.inject({ url: "/api/settings/ai/models?provider=gemini" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ provider: "gemini", models: [{ id: "gemini-live", name: "Gemini Live" }] });
      expect(f.get.mock.calls[0]?.[1]).toMatchObject({ headers: { "x-goog-api-key": "key-gemini-private" }, params: { pageSize: 1000 } });
      expect(response.body).not.toContain("key-gemini-private");
      expect(f.post).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("identifica a recusa HTTP 400 do Gemini sem esconder a causa nem expor a chave", async () => {
    const f = await fixture();
    await f.service.save({ revision: 0, configuration: draft() }, 1);
    const models = f.service.models.bind(f.service);
    vi.spyOn(AiSettingsService.prototype, "models").mockImplementation(models);
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ id: 1, role: "ADMIN" } as never);
    f.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: { message: "API key not valid PRIVATE_REMOTE_BODY", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] },
        },
      },
      config: { headers: { "x-goog-api-key": "key-gemini-private" } },
    });
    const app = Fastify();
    await app.register(settingsRoutes, { prefix: "/api/settings" });
    try {
      const response = await app.inject({ url: "/api/settings/ai/models?provider=gemini" });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ provider: "gemini", code: "API_KEY_INVALID", providerStatus: 400, retryable: false });
      expect(response.json().message).toContain("Cadastre uma chave válida");
      expect(response.body).not.toMatch(/PRIVATE_REMOTE_BODY|key-gemini-private|x-goog-api-key/);
      expect(f.get).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });
  it.each([
    [400, "API_KEY_EXPIRED", "API_KEY_INVALID"],
    [403, "Your API key was reported as leaked", "API_KEY_BLOCKED"],
    [403, "API_KEY_HTTP_REFERRER_BLOCKED", "API_KEY_RESTRICTED"],
    [403, "API_KEY_IP_ADDRESS_BLOCKED", "API_KEY_RESTRICTED"],
    [403, "API_KEY_SERVICE_BLOCKED", "API_KEY_RESTRICTED"],
    [400, "Unrestricted API keys are not supported", "API_KEY_RESTRICTED"],
    [403, "SERVICE_DISABLED", "SERVICE_DISABLED"],
    [400, "User location is not supported for the API use", "REGION_UNSUPPORTED"],
    [400, "FAILED_PRECONDITION billing", "BILLING_REQUIRED"],
    [403, "Permission denied", "ACCESS_DENIED"],
    [400, "Invalid argument", "INVALID_REQUEST"],
    [429, "Quota exhausted", "RATE_LIMITED"],
    [503, "Unavailable", "PROVIDER_UNAVAILABLE"],
  ])("distingue o erro do provedor %s/%s como %s", (status, reason, code) => {
    const error = new AiModelsError("gemini", {
      isAxiosError: true,
      response: { status, data: { error: { message: "PRIVATE_BODY", details: [{ reason }] } } },
      config: { headers: { "x-goog-api-key": "PRIVATE_KEY" } },
    });
    expect(error.diagnostic).toMatchObject({ provider: "gemini", code, providerStatus: status });
    expect(JSON.stringify(error.diagnostic)).not.toContain("PRIVATE");
    expect(error.diagnostic).not.toHaveProperty("headers");
    expect(error.diagnostic).not.toHaveProperty("config");
  });
  it.each([
    ["ENOTFOUND", "DNS_ERROR"],
    ["ERR_CANCELED", "CONNECTION_TIMEOUT"],
    ["ECONNABORTED", "CONNECTION_TIMEOUT"],
    ["CERT_HAS_EXPIRED", "TLS_ERROR"],
    ["ENETUNREACH", "NETWORK_ERROR"],
  ])("identifica falhas de rede %s sem confundi-las com uma chave inválida", (code, expected) => {
    expect(new AiModelsError("gemini", { isAxiosError: true, code }).diagnostic).toMatchObject({
      provider: "gemini",
      code: expected,
      providerStatus: null,
    });
  });
  it("recupera uma falha transitória do catálogo sem gerar conteúdo nem trocar credenciais", async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 503 } })
      .mockResolvedValueOnce({
        data: { models: [{ name: "models/gemini-live", supportedGenerationMethods: ["generateContent"] }] },
      });
    const post = vi.fn();
    expect(await new AiProviderClient(post, get).models({ provider: "gemini", key: "PRIVATE_KEY" })).toEqual([
      { id: "gemini-live", name: "gemini-live" },
    ]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[0]).toEqual(get.mock.calls[1]);
    expect(post).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 429])("não repete listagem recusada por credenciais, projeto ou cota (HTTP %s)", async (status) => {
    const error = { isAxiosError: true, response: { status } };
    const get = vi.fn().mockRejectedValue(error);
    await expect(new AiProviderClient(vi.fn(), get).models({ provider: "gemini", key: "KEY" })).rejects.toBe(error);
    expect(get).toHaveBeenCalledOnce();
  });
  it("interrompe a espera de repetição quando a consulta é cancelada", async () => {
    const controller = new AbortController();
    const get = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw { isAxiosError: true, code: "ECONNRESET" };
    });
    await expect(new AiProviderClient(vi.fn(), get).models({ provider: "gemini", key: "KEY" }, controller.signal)).rejects.toThrow();
    expect(get).toHaveBeenCalledOnce();
  });
  it("carrega OpenAI com autenticação no header, remove duplicados e retorna somente identificação", async () => {
    const get = vi.fn().mockResolvedValue({
      data: { data: [{ id: "gpt-z", owned_by: "PRIVATE" }, { id: "ft:gpt-test:org::123" }, { id: "gpt-a" }, { id: "gpt-a" }] },
    });
    const client = new AiProviderClient(vi.fn(), get);
    expect(await client.models({ provider: "openai", key: "PRIVATE_KEY" })).toEqual([
      { id: "ft:gpt-test:org::123", name: "ft:gpt-test:org::123" },
      { id: "gpt-a", name: "gpt-a" },
      { id: "gpt-z", name: "gpt-z" },
    ]);
    expect(get).toHaveBeenCalledOnce();
    expect(get.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/models");
    expect(get.mock.calls[0]?.[1]).toMatchObject({ headers: { Authorization: "Bearer PRIVATE_KEY" }, maxRedirects: 0 });
  });
  it("percorre todas as páginas do Gemini e seleciona modelos com generateContent", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          models: [
            { name: "models/gemini-z", displayName: "Gemini Z", supportedGenerationMethods: ["generateContent"] },
            { name: "models/embedding", supportedGenerationMethods: ["embedContent"] },
          ],
          nextPageToken: "next+/=",
        },
      })
      .mockResolvedValueOnce({
        data: {
          models: [
            { name: "models/gemini-a", displayName: "Gemini A", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-z", displayName: "Gemini Z", supportedGenerationMethods: ["generateContent"] },
          ],
        },
      });
    expect(await new AiProviderClient(vi.fn(), get).models({ provider: "gemini", key: "GEMINI_PRIVATE" })).toEqual([
      { id: "gemini-a", name: "Gemini A" },
      { id: "gemini-z", name: "Gemini Z" },
    ]);
    expect(get).toHaveBeenCalledTimes(2);
    for (const [url, options] of get.mock.calls) {
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models");
      expect(url).not.toContain("GEMINI_PRIVATE");
      expect(options.headers).toEqual({ "x-goog-api-key": "GEMINI_PRIVATE" });
    }
    expect(get.mock.calls[1]?.[1].params).toEqual({ pageSize: 1000, pageToken: "next+/=" });
  });
  it("não devolve listas parciais quando há erro ou ciclo na paginação", async () => {
    const get = vi.fn().mockResolvedValue({
      data: { models: [{ name: "models/gemini-x", supportedGenerationMethods: ["generateContent"] }], nextPageToken: "same" },
    });
    await expect(new AiProviderClient(vi.fn(), get).models({ provider: "gemini", key: "KEY" })).rejects.toThrow("Paginação");
    expect(get).toHaveBeenCalledTimes(2);
    const broken = vi
      .fn()
      .mockResolvedValueOnce({ data: { models: [], nextPageToken: "next" } })
      .mockRejectedValueOnce(new Error("PRIVATE"));
    await expect(new AiProviderClient(vi.fn(), broken).models({ provider: "gemini", key: "KEY" })).rejects.toThrow();
    const malformed = vi.fn().mockResolvedValue({ data: { data: [{ id: "../invalid" }] } });
    await expect(new AiProviderClient(vi.fn(), malformed).models({ provider: "openai", key: "KEY" })).rejects.toThrow();
  });
  it("trata lista vazia e interrompe paginação ao cancelar", async () => {
    const empty = vi.fn().mockResolvedValue({ data: { data: [] } });
    expect(await new AiProviderClient(vi.fn(), empty).models({ provider: "openai", key: "KEY" })).toEqual([]);
    const controller = new AbortController();
    const get = vi.fn().mockImplementation(async () => {
      controller.abort();
      return { data: { models: [], nextPageToken: "next" } };
    });
    await expect(new AiProviderClient(vi.fn(), get).models({ provider: "gemini", key: "KEY" }, controller.signal)).rejects.toThrow();
    expect(get).toHaveBeenCalledOnce();
  });
  it("usa a chave salva do provedor selecionado mesmo quando outro está ativo, sem gerar texto ou salvar", async () => {
    const f = await fixture();
    await expect(f.service.models({ provider: "gemini" })).rejects.toMatchObject({ statusCode: 400 });
    expect(f.get).not.toHaveBeenCalled();
    await f.service.save({ revision: 0, configuration: draft("openai", "OPENAI_SAVED") }, 1);
    await expect(f.service.models({ provider: "gemini" })).rejects.toMatchObject({ statusCode: 400 });
    await f.service.save({ revision: 1, configuration: draft("gemini", "GEMINI_SAVED") }, 1);
    f.get.mockResolvedValueOnce({ data: { data: [{ id: "gpt-live" }] } });
    const result = await f.service.models({ provider: "openai" });
    expect(result).toEqual({ provider: "openai", models: [{ id: "gpt-live", name: "gpt-live" }] });
    expect(f.get.mock.calls[0]?.[1].headers).toEqual({ Authorization: "Bearer OPENAI_SAVED" });
    expect(f.stored()?.configuration.provider).toBe("gemini");
    expect(f.store.write).toHaveBeenCalledTimes(2);
    expect(f.post).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("OPENAI_SAVED");
  });
  it("sanitiza falha de listagem e rejeita chave ou provedor enviados na consulta", async () => {
    const f = await fixture();
    await f.service.save({ revision: 0, configuration: draft() }, 1);
    f.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 403, data: "PRIVATE_BODY" },
      config: { headers: { "x-goog-api-key": "PRIVATE_KEY" } },
    });
    try {
      await f.service.models({ provider: "gemini" });
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 422 });
      expect((error as Error).message).toContain("permissão");
      expect((error as Error).message).not.toContain("PRIVATE");
    }
    for (const input of [{ provider: "other" }, { provider: "gemini", apiKey: "UNSAVED_KEY" }])
      await expect(f.service.models(input)).rejects.toThrow();
    expect(f.get).toHaveBeenCalledOnce();
  });
  it("protege o GET administrativo e não vaza chaves na resposta ou nas falhas", async () => {
    const auth = vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue(null);
    const models = vi
      .spyOn(AiSettingsService.prototype, "models")
      .mockResolvedValue({ provider: "gemini", models: [{ id: "gemini-live", name: "Gemini Live" }] });
    const app = Fastify();
    await app.register(settingsRoutes, { prefix: "/api/settings" });
    const url = "/api/settings/ai/models?provider=gemini";
    try {
      expect((await app.inject({ url })).statusCode).toBe(401);
      auth.mockResolvedValue({ id: 1, role: "OPERATOR", permissions: ["support.orders.analyze"] } as never);
      expect((await app.inject({ url })).statusCode).toBe(403);
      expect(models).not.toHaveBeenCalled();
      auth.mockResolvedValue({ id: 1, role: "ADMIN" } as never);
      for (const query of ["provider=other", "provider=gemini&apiKey=PRIVATE"])
        expect((await app.inject({ url: `/api/settings/ai/models?${query}` })).statusCode).toBe(400);
      expect(models).not.toHaveBeenCalled();
      const response = await app.inject({ url });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toEqual({ provider: "gemini", models: [{ id: "gemini-live", name: "Gemini Live" }] });
      expect(models).toHaveBeenCalledWith({ provider: "gemini" }, expect.any(AbortSignal));
      models.mockRejectedValueOnce(new Error("PRIVATE_KEY"));
      expect((await app.inject({ url })).body).not.toContain("PRIVATE_KEY");
    } finally {
      await app.close();
    }
  });
});

describe("Persistência de configuração de IA", () => {
  it("lê instalação antiga sem criar tabela e cria apenas na primeira gravação explícita", async () => {
    const f = await fixture();
    await f.service.save({ revision: 0, configuration: draft() }, 1);
    const value = f.stored()!.configuration;
    const missing = Object.assign(new Error("missing"), { code: "ER_NO_SUCH_TABLE" });
    const query = vi
      .spyOn(db, "query")
      .mockRejectedValueOnce(missing)
      .mockResolvedValue([[], []] as never);
    const execute = vi
      .spyOn(db, "execute")
      .mockRejectedValueOnce(missing)
      .mockResolvedValue([{ affectedRows: 1 }, []] as never);
    const repository = new AiSettingsRepository();
    expect(await repository.read()).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    await repository.write(value, 0, 8);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS retention_ai_settings"));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(execute.mock.calls)).not.toContain("key-gemini-private");
    query.mockClear();
    await repository.write(value, 1, 8);
    expect(query).not.toHaveBeenCalled();
    expect(execute.mock.calls.at(-1)![0]).toContain("WHERE id=1 AND revision=?");
    execute.mockResolvedValueOnce([{ affectedRows: 0 }, []] as never);
    await expect(repository.write(value, 1, 8)).rejects.toMatchObject({ statusCode: 409 });
  });
});
describe("Gemini na análise de OS", () => {
  const order: OrderAiInput = {
    id: 7,
    customer: "C1",
    city: null,
    networkBranch: null,
    openedAt: null,
    status: "A",
    message: "Sem conexão",
    response: null,
    messages: [],
  };
  const report = {
    summary: "Relato de perda de conexão.",
    findings: [{ title: "Relato", assessment: "Investigar.", severity: "low", orderIds: [7] }],
    actions: [],
    limitations: [],
  };
  it("reutiliza revisão em lotes e valida referências também nas respostas do Gemini", async () => {
    const post = vi.fn().mockResolvedValue(gemini(report));
    const ai = new OrderAiService("GEMINI_KEY", "gemini-test", post, "gemini");
    expect(await ai.analyze([order], {})).toMatchObject({ provider: "gemini", model: "gemini-test", report });
    post.mockResolvedValueOnce(gemini({ ...report, findings: [{ ...report.findings[0], orderIds: [999] }] }));
    await expect(ai.analyze([order], {})).rejects.toMatchObject({ code: "INVALID_EVIDENCE" });
    for (const data of [
      { data: { promptFeedback: { blockReason: "SAFETY" }, candidates: [] } },
      { data: { candidates: [{ finishReason: "MAX_TOKENS" }] } },
    ]) {
      post.mockResolvedValueOnce(data);
      await expect(ai.analyze([order], {})).rejects.toThrow();
    }
  });
  it("faz uma única adaptação de schema para versões antigas, mantendo a validação estruturada", async () => {
    const post = vi
      .fn()
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: { message: 'Invalid JSON payload. Unknown name "responseFormat" at generation_config.' } },
        },
      })
      .mockResolvedValueOnce(gemini({ ok: true }));
    const client = new AiProviderClient(post);
    const result = await client.generate(
      { provider: "gemini", model: "gemini-test", key: "PRIVATE_KEY" },
      {
        instructions: "Teste",
        input: "Confirme",
        schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean" } }, required: ["ok"] },
        name: "test",
        maxTokens: 100,
      }
    );
    expect(result).toEqual({ ok: true });
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1]?.[1].generationConfig).toEqual({
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties: { ok: { type: "BOOLEAN" } }, required: ["ok"] },
      maxOutputTokens: 100,
    });
    expect(post.mock.calls[1]?.[1].generationConfig).not.toHaveProperty("responseFormat");
  });
  it("não repete recusas de chave ou cota e informa chave inválida inclusive em HTTP 400", async () => {
    for (const status of [400, 401, 429]) {
      const error = {
        isAxiosError: true,
        response: { status, data: { error: { message: "API key not valid", details: [{ reason: "API_KEY_INVALID" }] } } },
      };
      const post = vi.fn().mockRejectedValue(error);
      await expect(
        new AiProviderClient(post).generate(
          { provider: "gemini", model: "gemini-test", key: "PRIVATE_KEY" },
          { instructions: "Teste", input: "OK", schema: {}, name: "test", maxTokens: 100 }
        )
      ).rejects.toBe(error);
      expect(post).toHaveBeenCalledOnce();
      expect(aiConnectionFailure(error)).toContain("chave");
      expect(aiConnectionFailure(error)).not.toContain("PRIVATE_KEY");
    }
  });
});
describe("Rotas administrativas de IA", () => {
  it("exige ADMIN em GET, PUT e teste antes de qualquer consulta; valida corpo e sanitiza falhas", async () => {
    const auth = vi
      .spyOn(AuthService.prototype, "authenticate")
      .mockResolvedValue({ id: 1, role: "OPERATOR", permissions: ["support.orders.analyze"] } as never);
    const get = vi.spyOn(AiSettingsService.prototype, "get").mockRejectedValue(new Error("PRIVATE_KEY"));
    const save = vi.spyOn(AiSettingsService.prototype, "save").mockRejectedValue(new Error("PRIVATE_KEY"));
    const test = vi
      .spyOn(AiSettingsService.prototype, "test")
      .mockResolvedValue({ ok: true, provider: "gemini", model: "gemini-test", durationMs: 10, message: "Conexão validada." });
    const app = Fastify();
    await app.register(settingsRoutes, { prefix: "/api/settings" });
    try {
      for (const [method, url, payload] of [
        ["GET", "/api/settings/ai", undefined],
        ["PUT", "/api/settings/ai", { revision: 0, configuration: draft() }],
        ["POST", "/api/settings/ai/test", draft()],
      ] as const) {
        expect((await app.inject({ method, url, payload })).statusCode).toBe(403);
      }
      expect(get).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      expect(test).not.toHaveBeenCalled();
      auth.mockResolvedValueOnce(null);
      expect((await app.inject({ url: "/api/settings/ai" })).statusCode).toBe(401);
      auth.mockResolvedValue({ id: 1, role: "ADMIN" } as never);
      const failed = await app.inject({ url: "/api/settings/ai" });
      expect(failed.statusCode).toBe(500);
      expect(failed.body).not.toContain("PRIVATE_KEY");
      expect(failed.headers["cache-control"]).toBe("no-store");
      expect((await app.inject({ method: "POST", url: "/api/settings/ai/test", payload: { ...draft(), apiKey: "" } })).statusCode).toBe(
        400
      );
      expect(test).not.toHaveBeenCalled();
      const result = await app.inject({ method: "POST", url: "/api/settings/ai/test", payload: draft() });
      expect(result.statusCode).toBe(200);
      expect(result.json().ok).toBe(true);
      expect(result.headers["cache-control"]).toBe("no-store");
      const saved = await app.inject({ method: "PUT", url: "/api/settings/ai", payload: { revision: 0, configuration: draft() } });
      expect(saved.statusCode).toBe(500);
      expect(saved.body).not.toContain("PRIVATE_KEY");
      expect(save).toHaveBeenCalledWith({ revision: 0, configuration: draft() }, 1);
    } finally {
      await app.close();
    }
  });
});
