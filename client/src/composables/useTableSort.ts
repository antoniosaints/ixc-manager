import { ref } from "vue";
import { sortTableRows, type TableSort, type SortValue } from "../utils/tableSort";

export function useTableSort(onChange?: () => void) {
  const tableSort = ref<TableSort | null>(null);
  function setTableSort(value: TableSort | null) {
    tableSort.value = value;
    onChange?.();
  }
  function sortParams(): Record<string, string> {
    return tableSort.value ? { sortColumn: tableSort.value.column, sortDirection: tableSort.value.direction } : {};
  }
  function sortedRows<T>(rows: readonly T[] | null | undefined, value: (row: T, column: string) => SortValue) {
    return sortTableRows(rows ?? [], tableSort.value, value);
  }
  return { tableSort, setTableSort, sortParams, sortedRows };
}
