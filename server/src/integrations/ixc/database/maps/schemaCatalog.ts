import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SchemaSnapshot } from "../types.js";

export type IxcTableMap = SchemaSnapshot["tables"][number] & {
  columns: SchemaSnapshot["columns"];
  indexes: SchemaSnapshot["indexes"];
  foreignKeys: SchemaSnapshot["foreignKeys"];
};
let catalog: Promise<Map<string, IxcTableMap>> | undefined;
/** All 930 table maps come from a local metadata file. No SQL or API calls. */
export async function loadIxcTableMap(tableName: string): Promise<IxcTableMap> {
  if (!catalog) {
    const source = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../docs/ixc-database/schema.json");
    catalog = readFile(source, "utf8")
      .then((text) => {
        const snapshot: SchemaSnapshot = JSON.parse(text);
        const tables = new Map(
          snapshot.tables.map((table) => [
            table.tableName,
            {
              ...table,
              columns: [] as SchemaSnapshot["columns"],
              indexes: [] as SchemaSnapshot["indexes"],
              foreignKeys: [] as SchemaSnapshot["foreignKeys"],
            },
          ])
        );
        for (const column of snapshot.columns) tables.get(column.tableName)?.columns.push(column);
        for (const index of snapshot.indexes) tables.get(index.tableName)?.indexes.push(index);
        for (const key of snapshot.foreignKeys) tables.get(key.tableName)?.foreignKeys.push(key);
        return tables;
      })
      .catch((error: unknown) => {
        catalog = undefined;
        throw error;
      });
  }
  const table = (await catalog).get(tableName);
  if (!table) throw new Error("Tabela ausente do catálogo IXC local. Atualize o snapshot se a estrutura mudou.");
  // Callers cannot mutate the cached structural map used by subsequent analyses.
  return structuredClone(table);
}
