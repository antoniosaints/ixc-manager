import { describe, expect, it, vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { runStartupMigrations, startupMigrationFiles } from "../src/database/startupMigrations.js";

function fixture() {
  const versions = new Set<string>();
  const tables = new Map<string, unknown[]>();
  const calls: { connection: number; sql: string; values: unknown[] }[] = [];
  let held = false;
  const waiters: (() => void)[] = [];
  let nextConnection = 0;
  const state = { failOnce: "", lockUnavailable: false };
  const connections: { release: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] = [];
  const pool = {
    getConnection: vi.fn(async () => {
      const id = nextConnection++;
      let ownsLock = false;
      const unlock = () => {
        if (!ownsLock) return;
        ownsLock = false;
        const next = waiters.shift();
        if (next) next();
        else held = false;
      };
      const connection = {
        release: vi.fn(unlock),
        destroy: vi.fn(unlock),
        query: vi.fn(async (options: { sql: string; timeout: number }, values: unknown[] = []) => {
          const sql = options.sql.trim();
          calls.push({ connection: id, sql, values });
          expect(options.timeout).toBeGreaterThan(60000);
          if (state.failOnce && sql.includes(state.failOnce)) {
            state.failOnce = "";
            throw new Error("FAKE_PRIVATE_DATABASE_PASSWORD and raw SQL must not be logged");
          }
          if (sql === "SELECT DATABASE() AS name") return [[{ name: "app_fixture" }], []];
          if (sql.startsWith("SELECT GET_LOCK")) {
            if (state.lockUnavailable) return [[{ acquired: 0 }], []];
            if (held) await new Promise<void>((resolve) => waiters.push(resolve));
            held = true;
            ownsLock = true;
            return [[{ acquired: 1 }], []];
          }
          if (sql.startsWith("SELECT RELEASE_LOCK")) {
            unlock();
            return [[{ released: 1 }], []];
          }
          expect(ownsLock).toBe(true);
          const table = /^CREATE TABLE IF NOT EXISTS (\w+)/.exec(sql)?.[1];
          if (table) {
            if (!tables.has(table)) tables.set(table, []);
            return [{}, []];
          }
          if (sql === "SELECT version FROM retention_schema_migrations") return [[...versions].map((version) => ({ version })), []];
          if (sql.startsWith("INSERT INTO retention_schema_migrations")) {
            const version = String(values[0]);
            if (versions.has(version)) throw new Error("Duplicate checkpoint");
            versions.add(version);
            return [{}, []];
          }
          throw new Error("Unexpected query in migration");
        }),
      };
      connections.push(connection);
      return connection;
    }),
  };
  return { pool: pool as unknown as Pick<Pool, "getConnection">, versions, tables, calls, state, connections };
}

describe("Migração automática de IA na inicialização", () => {
  it("instala configurações, histórico e proteção em ordem na base da aplicação", async () => {
    const f = fixture();
    expect(await runStartupMigrations(f.pool)).toEqual(startupMigrationFiles);
    expect([...f.versions]).toEqual(startupMigrationFiles);
    expect([...f.tables.keys()]).toEqual([
      "retention_schema_migrations",
      "retention_ai_settings",
      "retention_order_analysis_history",
      "retention_ai_keyring",
    ]);
    const checkpoints = f.calls.filter((call) => call.sql.startsWith("INSERT"));
    expect(checkpoints.map((call) => call.values)).toEqual(startupMigrationFiles.map((file) => [file]));
    expect(f.calls.every((call) => call.connection === 0)).toBe(true);
    const lock = f.calls.find((call) => call.sql.startsWith("SELECT GET_LOCK"))!.values[0] as string;
    expect(lock.length).toBeLessThanOrEqual(64);
    expect(f.connections[0]!.release).toHaveBeenCalledOnce();
    expect(f.connections[0]!.destroy).not.toHaveBeenCalled();
  });

  it("registra tabelas já existentes sem modificar chaves, configurações ou análises", async () => {
    const f = fixture();
    const existing = ["retention_ai_settings", "retention_order_analysis_history", "retention_ai_keyring"];
    existing.forEach((table) => f.tables.set(table, [{ preserved: table }]));
    await runStartupMigrations(f.pool);
    existing.forEach((table) => expect(f.tables.get(table)).toEqual([{ preserved: table }]));
    expect(f.calls.some((call) => /^(ALTER|DROP|DELETE|TRUNCATE|UPDATE)\b/.test(call.sql))).toBe(false);
  });

  it("pula migrações aplicadas após um novo deploy ou reinício", async () => {
    const f = fixture();
    await runStartupMigrations(f.pool);
    const before = f.calls.length;
    expect(await runStartupMigrations(f.pool)).toEqual([]);
    const second = f.calls.slice(before);
    expect(second.filter((call) => call.sql.startsWith("CREATE TABLE"))).toHaveLength(1); // tracking table only
    expect(second.some((call) => call.sql.startsWith("INSERT"))).toBe(false);
  });

  it("serializa dois contêineres iniciando juntos e aplica cada migração uma única vez", async () => {
    const f = fixture();
    const results = await Promise.all([runStartupMigrations(f.pool), runStartupMigrations(f.pool)]);
    expect(results.flat()).toEqual(startupMigrationFiles);
    expect(f.calls.filter((call) => call.sql.startsWith("INSERT"))).toHaveLength(3);
    expect(f.connections.every((connection) => connection.release.mock.calls.length === 1)).toBe(true);
  });

  it("retoma após uma falha entre o DDL e o registro de versão", async () => {
    const f = fixture();
    f.state.failOnce = "INSERT INTO retention_schema_migrations";
    await expect(runStartupMigrations(f.pool)).rejects.toThrow("020_ai_settings.sql");
    expect(f.tables.has("retention_ai_settings")).toBe(true);
    expect(f.versions.size).toBe(0);
    expect(f.connections[0]!.destroy).toHaveBeenCalledOnce();
    expect(await runStartupMigrations(f.pool)).toEqual(startupMigrationFiles);
  });

  it("interrompe o início em caso de erro sem vazar credenciais e retoma só as pendências", async () => {
    const f = fixture();
    f.state.failOnce = "CREATE TABLE IF NOT EXISTS retention_order_analysis_history";
    const failure = await runStartupMigrations(f.pool).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("021_order_analysis_history.sql");
    expect(String(failure)).not.toMatch(/FAKE_PRIVATE_DATABASE_PASSWORD|raw SQL/);
    expect([...f.versions]).toEqual(["020_ai_settings.sql"]);
    expect(f.tables.has("retention_ai_keyring")).toBe(false);
    expect(await runStartupMigrations(f.pool)).toEqual(["021_order_analysis_history.sql", "022_ai_keyring.sql"]);
  });

  it("não instala nada se não conseguir obter o bloqueio e fecha a conexão", async () => {
    const f = fixture();
    f.state.lockUnavailable = true;
    await expect(runStartupMigrations(f.pool)).rejects.toThrow("bloqueio das migrações");
    expect(f.tables.size).toBe(0);
    expect(f.connections[0]!.destroy).toHaveBeenCalledOnce();
    expect(f.connections[0]!.release).not.toHaveBeenCalled();
  });

  it("trata falha de conexão sem exigir executar SQL manualmente ou expor o erro original", async () => {
    const pool = { getConnection: vi.fn().mockRejectedValue(new Error("FAKE_DATABASE_URL")) };
    await expect(runStartupMigrations(pool)).rejects.toThrow("conexão com a base da aplicação");
    await expect(runStartupMigrations(pool)).rejects.not.toThrow("FAKE_DATABASE_URL");
  });
});
