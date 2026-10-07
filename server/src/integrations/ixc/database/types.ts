/** Driver settings preserve DECIMAL and BIGINT without rounding and dates without UTC conversion. */
export type IxcDecimal = string;
export type IxcBigInt = string;
export type IxcDate = string;
export type IxcDateTime = string;
export type IxcBinary = Buffer;
export interface SchemaSnapshot {
  generatedAt: string;
  server: { version: string; timeZone: string; systemTimeZone: string; serverReadOnly: number };
  grantsStrictlyReadOnly: boolean;
  tables: { tableName: string; tableType: string; engine: string | null; estimatedRows: string | null }[];
  columns: {
    tableName: string;
    name: string;
    position: number;
    type: string;
    nullable: string;
    columnKey: string;
    extra: string;
    comment: string;
  }[];
  indexes: { tableName: string; name: string; nonUnique: number; position: number; columnName: string; type: string }[];
  foreignKeys: { tableName: string; columnName: string; name: string; referencedTable: string; referencedColumn: string }[];
}
