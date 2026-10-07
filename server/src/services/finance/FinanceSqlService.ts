import { performance } from "node:perf_hooks";
import { IxcReadDatabase, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import {
  dashboardMovements,
  dashboardTitles,
  dashboardAging,
  dashboardConcilation,
  bankAccountsQuery,
  bankLedgerQuery,
} from "../../integrations/ixc/database/dashboardQueries.js";
import { decimalToUnits, mapDate, mapAccountingRegime } from "../../integrations/ixc/database/maps/valueMappers.js";
import { financeQuery, comparisonPeriod, type FinanceQuery } from "./FinanceService.js";
import { addDays, referenceDate } from "../upgrades/UpgradeService.js";

export interface SqlMovement {
  day: string;
  accountId: number;
  accountName: string | null;
  classification: string | null;
  analyticType: string | null;
  syntheticType: string | null;
  regimeCode: string | null;
  cancellationCode: string;
  isTransfer: number;
  validTransfer: number;
  credit: string;
  debit: string;
  records: string;
}
export interface SqlTitle {
  statusCode: string;
  reversedCode: string;
  renegotiatedCode: string;
  records: string;
  nullBalances: string;
  negativeBalances: string;
  openCount: string;
  openBalance: string;
  overdueBalance: string;
}
export interface SqlAging {
  bucket: string;
  renegotiatedCode: string;
  records: string;
  nullBalances: string;
  negativeBalances: string;
  openCount: string;
  openBalance: string;
}
interface SqlReconciliation {
  code: string;
  cancellationCode: string;
  records: string;
  credit: string;
  debit: string;
}
interface SqlBank {
  id: number;
  name: string;
  accountId: number;
  type: string;
  active: string;
  openingDate: string;
  openingBalance: string;
  linkedAccounts: string;
}
interface SqlBankLedger {
  bankId: number;
  cancellationCode: string;
  priorVariation: string;
  inflow: string;
  outflow: string;
  possibleOpeningDuplicate: string;
  records: string;
}
interface SnapshotReader {
  withSnapshot<T>(read: (session: IxcReadSession) => Promise<T>, signal?: AbortSignal): Promise<T>;
  close?(): Promise<void>;
}
const fail = (message: string, statusCode = 502) => Object.assign(new Error(message), { statusCode });
const units = (value: string) => decimalToUnits(value);
function money(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
    throw fail("O total excede a precisão disponível. Reduza o período.", 422);
  return Number(value) / 100;
}
function count(value: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw fail("Contagem financeira inválida.");
  return Number(value);
}
const active = (code: string) => ["", "N"].includes(code.trim());
function check(signal?: AbortSignal) {
  if (signal?.aborted) throw fail("Consulta interrompida.", 499);
}
interface AccountUnits {
  id: number;
  name: string;
  classification: string;
  type: string;
  credit: bigint;
  debit: bigint;
  records: number;
}

/** Production financial reads: SQL only, no API fallback, no data/cache writes. */
export class FinanceSqlService {
  constructor(
    private readonly database: SnapshotReader = new IxcReadDatabase(),
    private readonly now: () => Date = () => new Date()
  ) {}
  async close() {
    await this.database.close?.();
  }
  private async optional<T>(read: () => Promise<T>, label: string, warnings: string[], signal?: AbortSignal): Promise<T | null> {
    check(signal);
    try {
      const result = await read();
      check(signal);
      return result;
    } catch {
      check(signal);
      warnings.push(`${label} indisponível nesta consulta. Atualize para tentar novamente.`);
      return null;
    }
  }
  async dashboard(input: FinanceQuery, signal?: AbortSignal) {
    const query = financeQuery.parse(input),
      previous = comparisonPeriod(query),
      now = this.now(),
      today = referenceDate(now);
    const started = performance.now(),
      warnings: string[] = [];
    check(signal);
    const data = await this.database.withSnapshot(async (session) => {
      const movements = await session.select<SqlMovement>(dashboardMovements(query));
      const receivables = await this.optional(
        () => session.select<SqlTitle>(dashboardTitles("receivable", query, today)),
        "Contas a receber",
        warnings,
        signal
      );
      const payables = await this.optional(
        () => session.select<SqlTitle>(dashboardTitles("payable", query, today)),
        "Contas a pagar",
        warnings,
        signal
      );
      const aging = await this.optional(
        () => session.select<SqlAging>(dashboardAging(query, today)),
        "Inadimplência atual",
        warnings,
        signal
      );
      const reconciliation = await this.optional(
        () => session.select<SqlReconciliation>(dashboardConcilation(query)),
        "Conciliação dos lançamentos",
        warnings,
        signal
      );
      return { movements, receivables, payables, aging, reconciliation };
    }, signal);
    check(signal);
    const accounts = new Map<number, AccountUnits>(),
      ledger = new Map<number, AccountUnits>();
    const buckets = new Map<string, { date: string; revenue: bigint; expense: bigint }>();
    for (let day = query.from; day <= query.to; day = addDays(day, 1)) {
      const key = previous.days <= 62 ? day : day.slice(0, 7);
      if (!buckets.has(key)) buckets.set(key, { date: key, revenue: 0n, expense: 0n });
    }
    let revenue = 0n,
      expense = 0n,
      priorRevenue = 0n,
      priorExpense = 0n;
    let flaggedMovements = 0,
      unclassified = 0,
      transferRecords = 0,
      invalidTransfers = 0;
    const regimes = new Set<string>();
    for (const row of data.movements) {
      const day = mapDate(row.day);
      if (!day || day < previous.from || day > query.to) throw fail("Data de lançamento fora do período consultado.");
      const records = count(row.records),
        isCurrent = day >= query.from;
      if (!active(row.cancellationCode)) {
        if (isCurrent) flaggedMovements += records;
        continue;
      }
      if (!row.analyticType || row.analyticType !== row.syntheticType || !["R", "D", "A", "P", "C", "PT"].includes(row.analyticType)) {
        unclassified += records;
        continue;
      }
      const debit = units(row.debit),
        credit = units(row.credit),
        type = row.analyticType;
      if (isCurrent) {
        const item = ledger.get(row.accountId) ?? {
          id: row.accountId,
          name: row.accountName ?? `Conta #${row.accountId}`,
          classification: row.classification ?? "",
          type,
          credit: 0n,
          debit: 0n,
          records: 0,
        };
        item.credit += credit;
        item.debit += debit;
        item.records += records;
        ledger.set(item.id, item);
      }
      if (String(row.isTransfer) === "1") {
        if (isCurrent) {
          transferRecords += records;
          if (String(row.validTransfer) !== "1") invalidTransfers += records;
        }
        continue;
      }
      if (!["R", "D"].includes(type)) continue;
      if (isCurrent) regimes.add(mapAccountingRegime(row.regimeCode));
      const value = type === "R" ? credit - debit : debit - credit;
      if (isCurrent) {
        if (type === "R") revenue += value;
        else expense += value;
        const bucket = buckets.get(previous.days <= 62 ? day : day.slice(0, 7))!;
        if (type === "R") bucket.revenue += value;
        else bucket.expense += value;
        const item = accounts.get(row.accountId) ?? {
          id: row.accountId,
          name: row.accountName ?? `Conta #${row.accountId}`,
          classification: row.classification ?? "",
          type,
          credit: 0n,
          debit: 0n,
          records: 0,
        };
        item.credit += credit;
        item.debit += debit;
        item.records += records;
        accounts.set(item.id, item);
      } else if (type === "R") priorRevenue += value;
      else priorExpense += value;
    }
    if (flaggedMovements)
      warnings.push(`${flaggedMovements} lançamentos com indicação de cancelamento foram separados do resultado e da movimentação.`);
    if (unclassified) warnings.push(`${unclassified} lançamentos sem classificação consistente foram excluídos, inclusive da comparação.`);
    if (invalidTransfers)
      warnings.push(`${invalidTransfers} movimentos de transferência sem origem/destino validáveis foram excluídos do resultado.`);
    if (regimes.size > 1 && (!query.regime || query.regime === "all"))
      warnings.push("O resultado reúne contas com regimes diferentes. Selecione caixa ou competência para comparar a mesma base.");
    const open = (rows: SqlTitle[] | null, label: string) => {
      if (rows === null) return null;
      let total = 0n,
        overdue = 0n,
        records = 0;
      for (const row of rows) {
        if (!["A", "P"].includes(row.statusCode) || !active(row.reversedCode) || !active(row.renegotiatedCode)) continue;
        if (count(row.nullBalances) || count(row.negativeBalances)) {
          warnings.push(`${label}: existem saldos ausentes ou negativos. O indicador não foi calculado.`);
          return null;
        }
        total += units(row.openBalance);
        overdue += units(row.overdueBalance);
        records += count(row.openCount);
      }
      return { total: money(total), overdue: money(overdue), count: records };
    };
    const receivable = open(data.receivables, "Contas a receber"),
      payable = open(data.payables, "Contas a pagar");
    const mapAccount = (item: AccountUnits) => ({
      ...item,
      credit: money(item.credit),
      debit: money(item.debit),
      value: money(item.type === "R" ? item.credit - item.debit : item.debit - item.credit),
    });
    const change = (current: bigint, prior: bigint) =>
      prior > 0n ? Math.round((Number(current - prior) / Number(prior)) * 10000) / 100 : null;
    const result = {
      source: "ixc-database" as const,
      regime: query.regime ?? "all",
      receivableScope: query.receivableScope ?? "active",
      durationMs: Math.round(performance.now() - started),
      period: { from: query.from, to: query.to },
      previous: {
        from: previous.from,
        to: previous.to,
        revenue: money(priorRevenue),
        expense: money(priorExpense),
        result: money(priorRevenue - priorExpense),
      },
      totals: {
        revenue: money(revenue),
        expense: money(expense),
        result: money(revenue - expense),
        margin: revenue > 0n ? Math.round((Number(revenue - expense) / Number(revenue)) * 10000) / 100 : null,
      },
      growth: {
        revenue: change(revenue, priorRevenue),
        expense: change(expense, priorExpense),
        resultDifference: money(revenue - expense - priorRevenue + priorExpense),
      },
      receivable,
      payable,
      accounts: [...accounts.values()].map(mapAccount).sort((a, b) => b.value - a.value || a.id - b.id),
      ledger: [...ledger.values()]
        .map((item) => ({ ...mapAccount(item), value: money(item.credit - item.debit) }))
        .sort((a, b) => a.classification.localeCompare(b.classification) || a.id - b.id),
      series: [...buckets.values()].map((item) => ({
        date: item.date,
        revenue: money(item.revenue),
        expense: money(item.expense),
        result: money(item.revenue - item.expense),
      })),
      aging: this.mapAging(data.aging, today, warnings),
      reconciliation: this.mapReconciliation(data.reconciliation),
      quality: { flaggedMovements, unclassified, transferRecords, invalidTransfers },
      warnings,
      queriedAt: now.toISOString(),
    };
    check(signal);
    return result;
  }
  private mapAging(rows: SqlAging[] | null, today: string, warnings: string[]) {
    if (rows === null) return null;
    const buckets = new Map(["1-30", "31-60", "61-90", "91+"].map((key) => [key, { key, total: 0n, count: 0 }]));
    let excludedRenegotiated = 0,
      undatedTotal = 0n,
      undatedCount = 0;
    for (const row of rows) {
      if (!active(row.renegotiatedCode)) {
        excludedRenegotiated += count(row.openCount);
        continue;
      }
      if (count(row.nullBalances) || count(row.negativeBalances)) {
        warnings.push("Inadimplência atual: há saldos ausentes ou negativos. O total não foi calculado.");
        return null;
      }
      if (row.bucket === "unknown") {
        undatedTotal += units(row.openBalance);
        undatedCount += count(row.openCount);
        continue;
      }
      const bucket = buckets.get(row.bucket);
      if (!bucket) throw fail("Faixa de atraso desconhecida.");
      bucket.total += units(row.openBalance);
      bucket.count += count(row.openCount);
    }
    if (undatedCount) warnings.push(`${undatedCount} títulos em aberto sem vencimento válido não entraram nas faixas de atraso.`);
    return {
      asOf: today,
      total: money([...buckets.values()].reduce((sum, row) => sum + row.total, 0n)),
      count: [...buckets.values()].reduce((sum, row) => sum + row.count, 0),
      buckets: [...buckets.values()].map((row) => ({ ...row, total: money(row.total) })),
      excludedRenegotiated,
      undated: { total: money(undatedTotal), count: undatedCount },
    };
  }
  private mapReconciliation(rows: SqlReconciliation[] | null) {
    if (rows === null) return null;
    let reconciled = 0,
      pending = 0,
      unknown = 0;
    for (const row of rows)
      if (active(row.cancellationCode)) {
        if (row.code === "S") reconciled += count(row.records);
        else if (row.code === "N") pending += count(row.records);
        else unknown += count(row.records);
      }
    const total = reconciled + pending + unknown;
    return {
      reconciled,
      pending,
      unknown,
      total,
      percentage: total ? Math.round((reconciled / total) * 10000) / 100 : null,
      statementVerified: false,
    };
  }
  async banks(input: FinanceQuery, signal?: AbortSignal) {
    const query = financeQuery.parse(input),
      warnings: string[] = [];
    check(signal);
    if (query.branchId)
      return {
        accounts: [],
        warnings: ["O saldo cadastrado de caixa/banco é compartilhado. Remova o filtro de filial para consultar os saldos completos."],
        queriedAt: this.now().toISOString(),
      };
    const result = await this.database.withSnapshot(async (session) => {
      const banks = await session.select<SqlBank>(bankAccountsQuery(query));
      const ledger = banks.length
        ? await this.optional(
            () => session.select<SqlBankLedger>(bankLedgerQuery(query)),
            "Saldos calculados de caixa/banco",
            warnings,
            signal
          )
        : [];
      return banks.map((bank) => {
        const groups = ledger?.filter((row) => row.bankId === bank.id) ?? [];
        const openingDate = mapDate(bank.openingDate);
        const reason =
          ledger === null
            ? "Consulta histórica excedeu o limite ou está indisponível."
            : !openingDate
              ? "Data de abertura inválida."
              : count(bank.linkedAccounts) !== 1
                ? "Conta contábil compartilhada por mais de um caixa/banco."
                : groups.some((row) => !active(row.cancellationCode))
                  ? "Existem lançamentos com indicação de cancelamento; conferir no IXC."
                  : groups.some((row) => count(row.possibleOpeningDuplicate) > 0)
                    ? "Há lançamento na abertura com o mesmo valor do saldo cadastrado; conferir possível duplicidade."
                    : null;
        let prior = 0n,
          inflow = 0n,
          outflow = 0n;
        for (const row of groups) {
          prior += units(row.priorVariation);
          inflow += units(row.inflow);
          outflow += units(row.outflow);
        }
        const creationBalance = openingDate && openingDate >= query.from ? units(bank.openingBalance) : 0n;
        const opening = openingDate && openingDate >= query.from ? 0n : units(bank.openingBalance) + prior;
        return {
          id: bank.id,
          name: bank.name,
          accountId: bank.accountId,
          type: bank.type,
          active: bank.active === "S",
          openingDate,
          reason,
          openingAdjustment: reason ? null : money(creationBalance),
          opening: reason ? null : money(opening),
          inflow: reason ? null : money(inflow),
          outflow: reason ? null : money(outflow),
          closing: reason ? null : money(opening + creationBalance + inflow - outflow),
        };
      });
    }, signal);
    check(signal);
    return { accounts: result, warnings, queriedAt: this.now().toISOString() };
  }
}
