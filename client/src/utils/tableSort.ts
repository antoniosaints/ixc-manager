export type SortDirection = "asc" | "desc";
export interface TableSort {
  column: string;
  direction: SortDirection;
}
export type SortValue = string | number | bigint | boolean | Date | null | undefined;
const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export function compareSortValues(a: SortValue, b: SortValue, direction: SortDirection): number {
  const emptyA = a == null || a === "" || (typeof a === "number" && !Number.isFinite(a));
  const emptyB = b == null || b === "" || (typeof b === "number" && !Number.isFinite(b));
  // Missing values stay at the end in either direction.
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  let result: number;
  if (typeof a === "bigint" && typeof b === "bigint") result = a < b ? -1 : a > b ? 1 : 0;
  else if (typeof a === "number" && typeof b === "number") result = a - b;
  else if (typeof a === "boolean" && typeof b === "boolean") result = Number(a) - Number(b);
  else if (a instanceof Date && b instanceof Date) result = a.getTime() - b.getTime();
  else result = collator.compare(String(a), String(b));
  return direction === "asc" ? result : -result;
}

export function sortTableRows<T>(rows: readonly T[], sort: TableSort | null, value: (row: T, column: string) => SortValue): T[] {
  if (!sort) return [...rows];
  return [...rows].sort((a, b) => compareSortValues(value(a, sort.column), value(b, sort.column), sort.direction));
}
