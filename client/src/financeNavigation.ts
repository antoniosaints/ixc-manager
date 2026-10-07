type Query = Record<string, string | null | (string | null)[] | undefined>;
export type FinanceTab = "accounts" | "series" | "ledger" | "banks" | "pending";
export interface FinanceFilters {
  from: string;
  to: string;
  branchId: string;
  accountId: string;
  regime: string;
  receivableScope: string;
}
export interface FinanceSelection {
  tab: FinanceTab;
  type: string;
  accountSearch: string;
  pending: { kind: string; scope: string; bucket: string; search: string; searchBy: string; sort: string };
}
const one = (query: Query, key: string) => (typeof query[key] === "string" ? query[key] : "") as string;
const choice = (value: string, allowed: string[], fallback: string) => (allowed.includes(value) ? value : fallback);
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function readFinanceNavigation(query: Query, defaults: FinanceFilters) {
  const from = one(query, "from"),
    to = one(query, "to");
  const validPeriod = validDate(from) && validDate(to) && from <= to && Date.parse(to) - Date.parse(from) < 366 * 86400000;
  const filters: FinanceFilters = {
    from: validPeriod ? from : defaults.from,
    to: validPeriod ? to : defaults.to,
    branchId: /^[1-9]\d*$/.test(one(query, "branchId")) ? one(query, "branchId") : "",
    accountId: /^[1-9]\d*$/.test(one(query, "accountId")) ? one(query, "accountId") : "",
    regime: choice(one(query, "regime"), ["all", "cash", "competence", "manual"], "all"),
    receivableScope: choice(one(query, "receivableScope"), ["active", "all"], "active"),
  };
  const kind = choice(one(query, "kind"), ["receivable", "payable"], "receivable");
  const scope = choice(one(query, "scope"), ["aging", "period", "overdue"], "aging");
  const selection: FinanceSelection = {
    tab: choice(one(query, "tab"), ["accounts", "series", "ledger", "banks", "pending"], "accounts") as FinanceTab,
    type: choice(one(query, "type"), ["all", "R", "D", "A", "P"], "all"),
    accountSearch: one(query, "accountSearch"),
    pending: {
      kind,
      scope,
      bucket: scope === "aging" ? choice(one(query, "bucket"), ["all", "1-30", "31-60", "61-90", "91+"], "all") : "all",
      search: one(query, "search"),
      searchBy: choice(
        one(query, "searchBy"),
        kind === "payable" ? ["name", "partyId", "titleId"] : ["name", "partyId", "contractId", "titleId"],
        "name"
      ),
      sort: choice(one(query, "sort"), ["oldest", "newest", "balance"], "oldest"),
    },
  };
  return { filters, selection };
}

export function financeNavigationQuery(filters: FinanceFilters, selection: FinanceSelection): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      ...filters,
      tab: selection.tab,
      type: selection.type,
      accountSearch: selection.accountSearch,
      ...selection.pending,
    }).filter(([, value]) => value !== "")
  );
}
