import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiSecretVault, AiSecretUnavailableError } from "../src/services/ai/AiSecretVault.js";
import { PersistentAiSecretVault, AiKeyringRepository, type AiKeyringStore } from "../src/services/ai/PersistentAiSecretVault.js";
import { AiSettingsService, type AiSettingsStore } from "../src/services/settings/AiSettingsService.js";
import { AiProviderClient } from "../src/services/ai/AiProviderClient.js";
import { env } from "../src/config/env.js";
import { db } from "../src/repositories/database.js";

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "cas-keyring-test-"));
  directories.push(directory);
  let row: Awaited<ReturnType<AiKeyringStore["read"]>> = null;
  const store: AiKeyringStore = {
    read: vi.fn(async () => structuredClone(row)),
    insertIfMissing: vi.fn(async (value) => {
      if (!row) row = structuredClone(value);
    }),
  };
  const vault = (secret = "FAKE_DATABASE_PASSWORD") =>
    new PersistentAiSecretVault(store, directory, () => ({ mode: "database-password", value: secret }));
  return { store, directory, vault, row: () => structuredClone(row) };
}
describe("Proteção de IA persistente", () => {
  it("funciona após recriar a instância sem arquivo local e não guarda a chave mestra em texto aberto", async () => {
    const f = await fixture();
    const encrypted = await f.vault().encrypt("FAKE_GEMINI_KEY", "gemini");
    expect(await f.vault().decrypt(encrypted, "gemini")).toBe("FAKE_GEMINI_KEY");
    await expect(stat(join(f.directory, "master.key"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(f.row()?.mode).toBe("database-password");
    expect(JSON.stringify(f.row())).not.toMatch(/FAKE_DATABASE_PASSWORD|FAKE_GEMINI_KEY/);
  });
  it("migra automaticamente um master.key antigo válido e continua funcionando após perder o arquivo", async () => {
    const f = await fixture(),
      legacy = new AiSecretVault(f.directory);
    const gemini = await legacy.encrypt("FAKE_GEMINI", "gemini"),
      openai = await legacy.encrypt("FAKE_OPENAI", "openai");
    const migrated = f.vault();
    expect(await migrated.decrypt(gemini, "gemini")).toBe("FAKE_GEMINI");
    expect(f.store.insertIfMissing).toHaveBeenCalledOnce();
    await rm(join(f.directory, "master.key"));
    const restarted = f.vault();
    expect(await restarted.decrypt(gemini, "gemini")).toBe("FAKE_GEMINI");
    expect(await restarted.decrypt(openai, "openai")).toBe("FAKE_OPENAI");
  });
  it("não inventa proteção para uma credencial antiga cujo arquivo foi perdido", async () => {
    const f = await fixture(),
      encrypted = await new AiSecretVault(f.directory).encrypt("FAKE_OLD_KEY", "gemini");
    await rm(join(f.directory, "master.key"));
    await expect(f.vault().decrypt(encrypted, "gemini")).rejects.toBeInstanceOf(AiSecretUnavailableError);
    expect(f.store.insertIfMissing).not.toHaveBeenCalled();
    expect(f.row()).toBeNull();
  });
  it("rejeita provedor incorreto e alteração do segredo de proteção sem sobrescrever o registro", async () => {
    const f = await fixture(),
      encrypted = await f.vault().encrypt("FAKE_KEY", "gemini");
    const original = f.row();
    await expect(f.vault().decrypt(encrypted, "openai")).rejects.toBeInstanceOf(AiSecretUnavailableError);
    await expect(f.vault("DIFFERENT_SECRET").decrypt(encrypted, "gemini")).rejects.toBeInstanceOf(AiSecretUnavailableError);
    expect(f.row()).toEqual(original);
    expect(await f.vault().decrypt(encrypted, "gemini")).toBe("FAKE_KEY");
  });
  it("mantém a mesma proteção entre duas instâncias que cadastram provedores simultaneamente", async () => {
    const f = await fixture();
    const [gemini, openai] = await Promise.all([f.vault().encrypt("FAKE_GEMINI", "gemini"), f.vault().encrypt("FAKE_OPENAI", "openai")]);
    const restarted = f.vault();
    expect(await restarted.decrypt(gemini, "gemini")).toBe("FAKE_GEMINI");
    expect(await restarted.decrypt(openai, "openai")).toBe("FAKE_OPENAI");
  });
  it("não migra um arquivo errado quando a autenticação da credencial falha", async () => {
    const f = await fixture(),
      otherDirectory = await mkdtemp(join(tmpdir(), "cas-other-key-"));
    directories.push(otherDirectory);
    const encrypted = await new AiSecretVault(otherDirectory).encrypt("FAKE_KEY", "gemini");
    await new AiSecretVault(f.directory).encrypt("UNRELATED_KEY", "gemini");
    await expect(f.vault().decrypt(encrypted, "gemini")).rejects.toBeInstanceOf(AiSecretUnavailableError);
    expect(f.store.insertIfMissing).not.toHaveBeenCalled();
  });
  it("usa a senha decodificada da conexão sem depender do host e permite segredo dedicado", async () => {
    const f = await fixture(),
      previousUrl = env.DATABASE_URL,
      previousSecret = env.AI_ENCRYPTION_SECRET;
    try {
      env.AI_ENCRYPTION_SECRET = undefined;
      env.DATABASE_URL = "mysql://app:FAKE%40PASS%3A123@old-host/app";
      const encrypted = await new PersistentAiSecretVault(f.store, f.directory).encrypt("FAKE_KEY", "gemini");
      env.DATABASE_URL = "mysql://app:FAKE%40PASS%3A123@new-host/app";
      expect(await new PersistentAiSecretVault(f.store, f.directory).decrypt(encrypted, "gemini")).toBe("FAKE_KEY");
      const dedicated = await fixture();
      env.AI_ENCRYPTION_SECRET = "FAKE_DEDICATED_SECRET_32_CHARACTERS_LONG";
      const protectedKey = await new PersistentAiSecretVault(dedicated.store, dedicated.directory).encrypt("FAKE_OPENAI", "openai");
      env.DATABASE_URL = "mysql://app:DIFFERENT_DB_PASSWORD@new-host/app";
      expect(await new PersistentAiSecretVault(dedicated.store, dedicated.directory).decrypt(protectedKey, "openai")).toBe("FAKE_OPENAI");
      expect(dedicated.row()?.mode).toBe("server-secret");
    } finally {
      env.DATABASE_URL = previousUrl;
      env.AI_ENCRYPTION_SECRET = previousSecret;
    }
  });
  it("não cria uma proteção baseada em segredo vazio", async () => {
    const f = await fixture(),
      previousUrl = env.DATABASE_URL,
      previousSecret = env.AI_ENCRYPTION_SECRET;
    try {
      env.DATABASE_URL = "mysql://app@database/app";
      env.AI_ENCRYPTION_SECRET = undefined;
      await expect(new PersistentAiSecretVault(f.store, f.directory).encrypt("FAKE_KEY", "gemini")).rejects.toBeInstanceOf(
        AiSecretUnavailableError
      );
      expect(f.row()).toBeNull();
    } finally {
      env.DATABASE_URL = previousUrl;
      env.AI_ENCRYPTION_SECRET = previousSecret;
    }
  });
});
describe("OpenAI e Gemini com a nova proteção", () => {
  it("cadastra, recria o backend e testa as duas integrações com transportes simulados", async () => {
    const f = await fixture();
    let settings: Awaited<ReturnType<AiSettingsStore["read"]>> = null;
    const store: AiSettingsStore = {
      read: async () => structuredClone(settings),
      write: async (configuration, revision) => {
        settings = { configuration: structuredClone(configuration), revision: revision + 1 };
      },
    };
    const post = vi.fn(async (url: string) =>
      url.includes("googleapis")
        ? { data: { candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"ok":true}' }] } }] } }
        : { data: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"ok":true}' }] }] } }
    );
    const client = new AiProviderClient(post as never);
    const first = new AiSettingsService(store, f.vault(), client);
    await first.save(
      { revision: 0, configuration: { provider: "gemini", model: "gemini-test", keyAction: "replace", apiKey: "FAKE_GEMINI_KEY" } },
      1
    );
    await first.save(
      { revision: 1, configuration: { provider: "openai", model: "gpt-test", keyAction: "replace", apiKey: "FAKE_OPENAI_KEY" } },
      1
    );
    const restarted = new AiSettingsService(store, f.vault(), client);
    for (const [provider, model] of [
      ["gemini", "gemini-test"],
      ["openai", "gpt-test"],
    ]) {
      expect(await restarted.test({ provider, model, keyAction: "keep", apiKey: "" })).toMatchObject({ ok: true, provider, model });
      expect((await restarted.get()).providers[provider as "gemini" | "openai"].protectionError).toBeNull();
    }
    expect(post.mock.calls[0]?.[0]).toContain("generativelanguage.googleapis.com");
    expect(post.mock.calls[1]?.[0]).toBe("https://api.openai.com/v1/responses");
    expect(JSON.stringify(settings)).not.toMatch(/FAKE_GEMINI_KEY|FAKE_OPENAI_KEY/);
    await expect(stat(join(f.directory, "master.key"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("sinaliza credencial legada irrecuperável e permite recadastro pela interface", async () => {
    const f = await fixture();
    const encrypted = await new AiSecretVault(f.directory).encrypt("FAKE_OLD", "gemini");
    await rm(join(f.directory, "master.key"));
    let settings = {
      revision: 1,
      configuration: {
        provider: "gemini" as const,
        providers: {
          gemini: { model: "gemini-test", keySource: "saved" as const, encryptedKey: encrypted },
          openai: { model: "gpt-test", keySource: "none" as const, encryptedKey: null },
        },
      },
    };
    const store: AiSettingsStore = {
      read: async () => structuredClone(settings),
      write: async (configuration, revision) => {
        settings = { configuration, revision: revision + 1 } as typeof settings;
      },
    };
    const service = new AiSettingsService(store, f.vault());
    expect((await service.get()).providers.gemini.protectionError).toContain("proteção");
    expect((await service.status()).configured).toBe(false);
    expect((await service.runtime()).key).toBeNull();
    await expect(service.test({ provider: "gemini", model: "gemini-test", keyAction: "keep", apiKey: "" })).rejects.toMatchObject({
      statusCode: 409,
    });
    const saved = await service.save(
      { revision: 1, configuration: { provider: "gemini", model: "gemini-test", keyAction: "replace", apiKey: "FAKE_REPLACEMENT" } },
      1
    );
    expect(saved.providers.gemini.protectionError).toBeNull();
    expect((await service.runtime()).key).toBe("FAKE_REPLACEMENT");
  });
});
describe("Tabela da proteção persistente", () => {
  it("lê instalação antiga sem criar tabela e instala apenas durante a persistência", async () => {
    const missing = Object.assign(new Error("missing"), { code: "ER_NO_SUCH_TABLE" });
    const query = vi
      .spyOn(db, "query")
      .mockRejectedValueOnce(missing)
      .mockResolvedValue([[], []] as never);
    const execute = vi
      .spyOn(db, "execute")
      .mockRejectedValueOnce(missing)
      .mockResolvedValue([{}, []] as never);
    const repository = new AiKeyringRepository();
    expect(await repository.read()).toBeNull();
    expect(execute).not.toHaveBeenCalled();
    await repository.insertIfMissing({ mode: "database-password", salt: "salt", iv: "iv", tag: "tag", body: "wrapped" });
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS retention_ai_keyring"));
    expect(String(execute.mock.calls[1]?.[0])).toContain("ON DUPLICATE KEY UPDATE id=id");
  });
});
