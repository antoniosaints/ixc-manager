import { z } from "zod";
import type { TableSort } from "./tableSort.js";

export const columnSortFields = {
  sortColumn: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    .max(60)
    .optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
};
export type ColumnSortQuery = { sortColumn?: string; sortDirection?: "asc" | "desc" };

export function requestedSort(query: ColumnSortQuery, columns: Record<string, unknown>): TableSort | null {
  if (!query.sortColumn) return null;
  if (!Object.hasOwn(columns, query.sortColumn)) throw Object.assign(new Error("Coluna de ordenação inválida."), { statusCode: 400 });
  return { column: query.sortColumn, direction: query.sortDirection ?? "asc" };
}

export function columnOrder(query: ColumnSortQuery, columns: Record<string, string>, fallback: string, tieBreaker: string): string {
  const sort = requestedSort(query, columns);
  if (!sort) return fallback;
  const field = columns[sort.column]!;
  return `(${field} IS NULL) ASC,${field} ${sort.direction.toUpperCase()},${tieBreaker}`;
}

export function ixcColumnOrder(query: ColumnSortQuery, columns: Record<string, string>, fallback: string, direction: "asc" | "desc") {
  const sort = requestedSort(query, columns);
  return { sortname: sort ? columns[sort.column]! : fallback, sortorder: sort?.direction ?? direction };
}
