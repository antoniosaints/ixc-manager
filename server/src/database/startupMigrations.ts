import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { db } from "../repositories/database.js";

// Only these additive migrations are safe to install automatically on existing deployments.
export const startupMigrationFiles = ["020_ai_settings.sql", "021_order_analysis_history.sql", "022_ai_keyring.sql"] as const;

async function readMigration(file: string) {
  try {
    return await readFile(new URL(`../migration-sql/${file}`, import.meta.url), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // tsx development uses the original SQL; production also ships copies inside dist.
    return readFile(new URL(`../../migrations/${file}`, import.meta.url), "utf8");
  }
}

/** Runs before listen, on the application pool only. DDL is idempotent because MySQL auto-commits it. */
export async function runStartupMigrations(pool: Pick<Pool, "getConnection"> = db) {
  let connection: PoolConnection | undefined;
  let reusable = false;
  let step = "leitura dos arquivos de migração";
  try {
    const migrations = await Promise.all(startupMigrationFiles.map(async (file) => ({ file, sql: await readMigration(file) })));
    step = "conexão com a base da aplicação";
    connection = await pool.getConnection();
    const query = (sql: string, values: unknown[] = []) => connection!.query<RowDataPacket[]>({ sql, timeout: 65000 }, values);
    const [database] = await query("SELECT DATABASE() AS name");
    const name = database[0]?.name;
    if (typeof name !== "string" || !name) throw new Error("Base não selecionada");
    const lock = `retencao-cas:migrations:${createHash("sha256").update(name).digest("hex").slice(0, 40)}`;
    step = "bloqueio das migrações";
    const [locks] = await query("SELECT GET_LOCK(?, 60) AS acquired", [lock]);
    if (Number(locks[0]?.acquired) !== 1) throw new Error("Migração em andamento");
    step = "criação do controle de migrações";
    await query(`CREATE TABLE IF NOT EXISTS retention_schema_migrations (
      version VARCHAR(191) PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const [rows] = await query("SELECT version FROM retention_schema_migrations");
    const applied = new Set(rows.map((row) => String(row.version)));
    const installed: string[] = [];
    for (const migration of migrations) {
      if (applied.has(migration.file)) continue;
      step = migration.file;
      await query(migration.sql);
      // A failed checkpoint is retried safely on the next startup, without changing existing rows.
      await query("INSERT INTO retention_schema_migrations (version) VALUES (?)", [migration.file]);
      installed.push(migration.file);
    }
    step = "liberação do bloqueio das migrações";
    const [released] = await query("SELECT RELEASE_LOCK(?) AS released", [lock]);
    if (Number(released[0]?.released) !== 1) throw new Error("Bloqueio não liberado");
    reusable = true;
    return installed;
  } catch {
    // Never log SQL errors: connection options and provider credentials must remain private.
    throw new Error(
      `Não foi possível preparar o banco automaticamente (${step}). Verifique os arquivos do deploy, a conexão e as permissões CREATE, SELECT e INSERT na base da aplicação. O backend não foi iniciado; após corrigir, reinicie o serviço para tentar novamente.`
    );
  } finally {
    // A failed connection must not return to the pool holding a MySQL named lock.
    if (reusable) connection?.release();
    else connection?.destroy();
  }
}
