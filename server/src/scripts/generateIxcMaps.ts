import { readFile, writeFile } from "node:fs/promises";
import { format, resolveConfig } from "prettier";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SchemaSnapshot } from "../integrations/ixc/database/types.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const snapshot: SchemaSnapshot = JSON.parse(await readFile(resolve(root, "docs/ixc-database/schema.json"), "utf8"));
const core = [
  "fn_movim_finan",
  "fn_areceber",
  "fn_apagar",
  "planejamento_analitico",
  "planejamento",
  "contas",
  "filial",
  "fn_extrato",
  "fn_transferencia_caixa",
  "centro_custo_rateio",
  "fornecedor",
  "cliente",
  "cliente_contrato",
  "cliente_contrato_historico",
  "vd_contratos",
  "radusuarios",
  "rad_caixa_ftth",
  "radpop_radio",
  "radpop_radio_cliente_fibra",
  "radpop_radio_cliente_fibra_perfil",
  "radpop_radio_porta",
  "radpop_olt_slot",
  "rad_hardware",
  "df_projeto",
  "radacct",
  "radusuarios_consumo_m",
  "su_ticket",
  "su_oss_chamado",
  "su_oss_assunto",
  "su_oss_chamado_mensagem",
  "su_oss_chamado_historico",
  "su_mensagens",
  "su_evento_status",
  "su_oss_evento",
  "su_ticket_setor",
  "su_diagnostico",
  "usuarios",
  "funcionarios",
  "contato",
  "movimento_comodatos",
  "movimento_produtos",
  "produtos",
  "cidade",
];
const coreTables = core.filter((name) => snapshot.tables.some((table) => table.tableName === name));
const tableType = (name: string) =>
  name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") + "Row";
function tsType(sql: string): string {
  if (sql.startsWith("enum(")) {
    // Legacy non-strict inserts in IXC also contain the empty enum value.
    const values = [...sql.matchAll(/'((?:[^']|'')*)'/g)].map((match) => JSON.stringify(match[1]!.replace(/''/g, "'")));
    return [...new Set([...values, '""'])].join(" | ");
  }
  if (/^(decimal|numeric)/.test(sql)) return "IxcDecimal";
  if (/^bigint/.test(sql)) return "IxcBigInt";
  if (/^(tinyint|smallint|mediumint|int|float|double|year)/.test(sql)) return "number";
  if (sql === "date") return "IxcDate";
  if (/^(datetime|timestamp)/.test(sql)) return "IxcDateTime";
  if (/^(blob|tinyblob|mediumblob|longblob|binary|varbinary|bit)/.test(sql)) return "IxcBinary";
  return "string";
}
const sections = coreTables.map((name) => {
  const columns = snapshot.columns.filter((column) => column.tableName === name);
  return `export interface ${tableType(name)} {\n${columns.map((column) => `  ${JSON.stringify(column.name)}: ${tsType(column.type)}${column.nullable === "YES" ? " | null" : ""};`).join("\n")}\n}`;
});
const maps = Object.fromEntries(
  coreTables.map((name) => [
    name,
    {
      primaryKey: snapshot.columns.filter((column) => column.tableName === name && column.columnKey === "PRI").map((column) => column.name),
      columns: Object.fromEntries(
        snapshot.columns
          .filter((column) => column.tableName === name)
          .map((column) => [column.name, { type: column.type, nullable: column.nullable === "YES" }])
      ),
      indexes: snapshot.indexes
        .filter((index) => index.tableName === name)
        .map((index) => ({
          name: index.name,
          nonUnique: index.nonUnique,
          position: index.position,
          columnName: index.columnName,
          type: index.type,
        })),
      foreignKeys: snapshot.foreignKeys
        .filter((key) => key.tableName === name)
        .map((key) => ({
          name: key.name,
          columnName: key.columnName,
          referencedTable: key.referencedTable,
          referencedColumn: key.referencedColumn,
        })),
    },
  ])
);
const source = `// Generated offline from docs/ixc-database/schema.json. Run npm run ixc:maps -w server.\n// These types describe storage, not DTOs: never expose entire rows or credentials.\nimport type { IxcDecimal, IxcBigInt, IxcDate, IxcDateTime, IxcBinary } from "../types.js";\n\n${sections.join("\n\n")}\n\nexport interface IxcTableRows {\n${coreTables.map((name) => `  ${JSON.stringify(name)}: ${tableType(name)};`).join("\n")}\n}\n\nexport const ixcTables = ${JSON.stringify(maps, null, 2)} as const;\n`;
const target = resolve(root, "server/src/integrations/ixc/database/maps/tables.generated.ts");
const prettierOptions = await resolveConfig(target);
await writeFile(target, await format(source, { ...prettierOptions, parser: "typescript" }));
const catalog = snapshot.tables.map((table) => ({
  ...table,
  columnCount: snapshot.columns.filter((column) => column.tableName === table.tableName).length,
  primaryKey: snapshot.columns
    .filter((column) => column.tableName === table.tableName && column.columnKey === "PRI")
    .map((column) => column.name),
  typedMap: coreTables.includes(table.tableName),
}));
await writeFile(
  resolve(root, "docs/ixc-database/catalog.json"),
  await format(JSON.stringify({ generatedAt: snapshot.generatedAt, tables: catalog }), { ...prettierOptions, parser: "json" })
);
console.info(
  JSON.stringify({ tables: catalog.length, typedTables: coreTables.length, source: "local schema snapshot; no database connection" })
);
