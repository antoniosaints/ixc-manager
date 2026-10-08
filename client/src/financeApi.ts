export interface FinanceAccount {
  id: number;
  name: string;
  classification: string;
  type: "R" | "D";
  debit: number;
  credit: number;
  value: number;
  records: number;
}
export interface FinanceDashboard {
  source: "ixc-database";
  regime: "all" | "cash" | "competence" | "manual";
  receivableScope: "active" | "all";
  durationMs: number;
  aging: {
    asOf: string;
    total: number;
    count: number;
    excludedRenegotiated: number;
    buckets: { key: string; total: number; count: number }[];
    undated: { total: number; count: number };
  } | null;
  reconciliation: {
    reconciled: number;
    pending: number;
    unknown: number;
    total: number;
    percentage: number | null;
    statementVerified: boolean;
  } | null;
  quality: { flaggedMovements: number; unclassified: number; transferRecords: number; invalidTransfers: number };
  period: { from: string; to: string };
  previous: { from: string; to: string; revenue: number; expense: number; result: number };
  totals: { revenue: number; expense: number; result: number; margin: number | null };
  growth: { revenue: number | null; expense: number | null; resultDifference: number };
  receivable: { total: number; overdue: number; count: number } | null;
  payable: { total: number; overdue: number; count: number } | null;
  accounts: FinanceAccount[];
  ledger: (Omit<FinanceAccount, "type"> & { type: string })[];
  series: { date: string; revenue: number; expense: number; result: number }[];
  warnings: string[];
  queriedAt: string;
}
export interface FinanceBanks {
  accounts: {
    id: number;
    name: string;
    accountId: number;
    type: string;
    active: boolean;
    openingDate: string | null;
    reason: string | null;
    openingAdjustment: number | null;
    opening: number | null;
    inflow: number | null;
    outflow: number | null;
    closing: number | null;
  }[];
  warnings: string[];
  queriedAt: string;
}
export function financeDashboard(params: URLSearchParams, signal?: AbortSignal): Promise<FinanceDashboard> {
  return readFinance("dashboard", params, signal);
}
export function financeBanks(params: URLSearchParams, signal?: AbortSignal): Promise<FinanceBanks> {
  return readFinance("banks", params, signal);
}
async function readFinance<T>(
  path: "dashboard" | "banks" | "pending" | "options" | "account-details",
  params: URLSearchParams,
  signal?: AbortSignal
): Promise<T> {
  const token = localStorage.getItem("retencao-cas.auth-token");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 80_000);
  try {
    const response = await fetch(`/api/finance/${path}?${params}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      if ([502, 503, 504].includes(response.status))
        throw new Error(body?.message ?? "A consulta financeira foi interrompida. Tente novamente ou reduza o período.");
      throw new Error(body?.message ?? "Não foi possível consultar o financeiro.");
    }
    return await response.json();
  } catch (error) {
    if (timedOut)
      throw new Error("A consulta financeira demorou mais que o esperado. Reduza o período ou filtre uma filial e tente novamente.");
    if (error instanceof TypeError) throw new Error("A conexão com o financeiro foi interrompida. Verifique o servidor e tente novamente.");
    if (error instanceof SyntaxError) throw new Error("O servidor não retornou uma resposta financeira válida. Tente novamente.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export interface FinancePending {
  items: {
    id: string;
    partyId: number | null;
    partyName: string | null;
    partyActive: string | null;
    contractId: number | null;
    contractName: string | null;
    contractStatus: string | null;
    accountId: number | null;
    accountName: string | null;
    branchId: number | null;
    document: string | null;
    dueDate: string | null;
    issuedDate: string | null;
    amount: number;
    paid: number | null;
    balance: number;
    daysLate: number;
    status: string;
  }[];
  total: number;
  balance: number;
  page: number;
  limit: number;
  kind: string;
  scope: string;
  bucket: string;
  receivableScope: "active" | "all";
  asOf: string;
  queriedAt: string;
}
export function financePending(params: URLSearchParams, signal?: AbortSignal): Promise<FinancePending> {
  return readFinance("pending", params, signal);
}

export interface FinanceAccountDetail {
  account: { id: number; name: string; type: string; classification: string };
  basis: "result" | "ledger";
  period: { from: string; to: string };
  page: number;
  limit: number;
  total: number;
  credit: number;
  debit: number;
  value: number;
  receivableTitles: number;
  payableTitles: number;
  unlinked: number;
  queriedAt: string;
  items: {
    id: string;
    day: string | null;
    document: string | null;
    history: string | null;
    branchId: number;
    credit: number;
    debit: number;
    value: number;
    titles: {
      kind: "receivable" | "payable";
      id: string;
      document: string | null;
      dueDate: string | null;
      amount: number | null;
      status: string | null;
      partyId: number | null;
      partyName: string | null;
      contractId: number | null;
    }[];
  }[];
}
export function financeAccountDetail(params: URLSearchParams, signal?: AbortSignal): Promise<FinanceAccountDetail> {
  return readFinance("account-details", params, signal);
}

export function financeOptions(signal?: AbortSignal): Promise<{
  branches: { id: number; name: string }[];
  accounts: { id: number; name: string; type: string; classification: string }[];
  truncated: boolean;
}> {
  return readFinance("options", new URLSearchParams(), signal);
}
