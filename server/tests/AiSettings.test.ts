import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiSecretVault } from "../src/services/ai/AiSecretVault.js";
import { AiProviderClient, aiConnectionFailure } from "../src/services/ai/AiProviderClient.js";
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
    vault = new AiSecretVault(directory);
  const service = new AiSettingsService(store, vault, new AiProviderClient(post));
  return { service, store, post, vault, directory, stored: () => structuredClone(stored) };
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
    expect(body).toMatchObject({ generationConfig: { responseMimeType: "application/json", responseJsonSchema: { required: ["ok"] } } });
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
    await expect(ai.analyze([order], {})).rejects.toThrow("Evidência");
    for (const data of [
      { data: { promptFeedback: { blockReason: "SAFETY" }, candidates: [] } },
      { data: { candidates: [{ finishReason: "MAX_TOKENS" }] } },
    ]) {
      post.mockResolvedValueOnce(data);
      await expect(ai.analyze([order], {})).rejects.toThrow();
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
