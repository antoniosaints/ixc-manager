import mysql, { type RowDataPacket } from "mysql2/promise";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import type { SchemaSnapshot } from "../integrations/ixc/database/types.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
if (!env.DATABASE_IXC_HOST || !env.DATABASE_IXC_USER || !env.DATABASE_IXC_PASSWORD || !env.DATABASE_IXC_NAME) {
  throw new Error("Preencha DATABASE_IXC_* antes de atualizar o mapa estrutural.");
}
const connection = await mysql.createConnection({
  host: env.DATABASE_IXC_HOST,
  port: env.DATABASE_IXC_PORT,
  user: env.DATABASE_IXC_USER,
  password: env.DATABASE_IXC_PASSWORD,
  database: env.DATABASE_IXC_NAME,
  connectTimeout: 10000,
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
});
async function read<T>(sql: string, params: string[] = []): Promise<T[]> {
  const [rows] = await connection.execute<RowDataPacket[]>(sql, params);
  return rows as T[];
}
try {
  const server = await read<SchemaSnapshot["server"]>(
    "SELECT VERSION() version, @@session.time_zone timeZone, @@system_time_zone systemTimeZone, @@global.read_only serverReadOnly"
  );
  const grants = await read<Record<string, string>>("SHOW GRANTS FOR CURRENT_USER()");
  const grantsStrictlyReadOnly =
    grants.length > 0 &&
    grants.every((row) =>
      Object.values(row).every((grant) => {
        const privileges = /^GRANT (.+?) ON /i
          .exec(grant)?.[1]
          ?.split(",")
          .map((value) => value.trim().toUpperCase());
        return privileges?.every((privilege) => ["USAGE", "SELECT", "SHOW VIEW"].includes(privilege));
      })
    );
  if (!grantsStrictlyReadOnly) throw new Error("O usuário IXC deve ter exclusivamente permissões de leitura.");
  const params = [env.DATABASE_IXC_NAME];
  const tables = await read<SchemaSnapshot["tables"][number]>(
    "SELECT TABLE_NAME tableName, TABLE_TYPE tableType, ENGINE engine, TABLE_ROWS estimatedRows FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME",
    params
  );
  const columns = await read<SchemaSnapshot["columns"][number]>(
    "SELECT TABLE_NAME tableName, COLUMN_NAME name, ORDINAL_POSITION position, COLUMN_TYPE type, IS_NULLABLE nullable, COLUMN_KEY columnKey, EXTRA extra, COLUMN_COMMENT comment FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,ORDINAL_POSITION",
    params
  );
  const indexes = await read<SchemaSnapshot["indexes"][number]>(
    "SELECT TABLE_NAME tableName, INDEX_NAME name, NON_UNIQUE nonUnique, SEQ_IN_INDEX position, COLUMN_NAME columnName, INDEX_TYPE type FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX",
    params
  );
  const foreignKeys = await read<SchemaSnapshot["foreignKeys"][number]>(
    "SELECT TABLE_NAME tableName, COLUMN_NAME columnName, CONSTRAINT_NAME name, REFERENCED_TABLE_NAME referencedTable, REFERENCED_COLUMN_NAME referencedColumn FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION",
    params
  );
  const snapshot: SchemaSnapshot = {
    generatedAt: new Date().toISOString(),
    server: server[0]!,
    grantsStrictlyReadOnly,
    tables,
    columns,
    indexes,
    foreignKeys,
  };
  await writeFile(resolve(root, "docs/ixc-database/schema.json"), JSON.stringify(snapshot, null, 2) + "\n");
  console.info(
    JSON.stringify({
      readOnly: grantsStrictlyReadOnly,
      tables: tables.length,
      columns: columns.length,
      indexColumns: indexes.length,
      foreignKeyColumns: foreignKeys.length,
    })
  );
} finally {
  await connection.end();
}
