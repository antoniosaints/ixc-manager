import { performance } from "node:perf_hooks";
import { financeQuery, comparisonPeriod, type FinanceQuery } from "../../../services/finance/FinanceService.js";
import { referenceDate } from "../../../services/upgrades/UpgradeService.js";
import { IxcReadDatabase, type IxcReadSession } from "./IxcReadDatabase.js";
import { movementQuery, titleQuery, ledgerBalanceQuery } from "./financeQueries.js";
import { mapAccountingRegime, mapMoney, mapDate } from "./maps/valueMappers.js";

interface MovementAggregate {
  day: string;
  branchId: number;
  accountId: number;
  accountName: string | null;
  analyticType: string | null;
  syntheticType: string | null;
  regimeCode: string | null;
  cancellationCode: string;
  credit: string;
  debit: string;
  movementCount: string;
  transferLinkedCount: string;
}
interface TitleAggregate {
  statusCode: string;
  regimeCode: string;
  reversedCode: string;
  renegotiatedCode: string;
  titleCount: string;
  nullBalanceCount: string;
  negativeBalanceCount: string;
  openTitleCount: string;
  openBalance: string | null;
  overdueBalance: string | null;
}
interface LedgerAggregate {
  movementCount: string;
  credit: string | null;
  debit: string | null;
}
interface SnapshotReader {
  withSnapshot<T>(read: (session: IxcReadSession) => Promise<T>): Promise<T>;
}

/** Live-only repository: returns grouped results; it never stores customer records or financial values. */
export class IxcFinanceReadRepository {
  constructor(
    private readonly database: SnapshotReader = new IxcReadDatabase(),
    private readonly now: () => Date = () => new Date()
  ) {}
  async analyze(input: FinanceQuery) {
    const query = financeQuery.parse(input);
    const started = performance.now();
    const data = await this.database.withSnapshot(async (session) => {
      // Sequential queries share a single consistent connection/view.
      const movements = await session.select<MovementAggregate>(movementQuery(query));
      const today = referenceDate(this.now());
      const receivables = await session.select<TitleAggregate>(titleQuery("receivable", query, today));
      const payables = await session.select<TitleAggregate>(titleQuery("payable", query, today));
      const ledger = await session.select<LedgerAggregate>(ledgerBalanceQuery(query));
      return { movements, receivables, payables, ledger };
    });
    const mapTitles = (rows: TitleAggregate[]) =>
      rows.map((row) => ({
        ...row,
        regime: mapAccountingRegime(row.regimeCode),
        excludedByExistingRule: row.statusCode === "C" || row.reversedCode === "S",
        requiresRenegotiationReview: row.renegotiatedCode === "S",
        openBalance: mapMoney(row.openBalance),
        overdueBalance: mapMoney(row.overdueBalance),
      }));
    return {
      source: "ixc-database" as const,
      queriedAt: this.now().toISOString(),
      period: { from: query.from, to: query.to },
      previous: comparisonPeriod(query),
      durationMs: Math.round(performance.now() - started),
      movements: data.movements.map((row) => ({
        ...row,
        day: mapDate(row.day),
        regime: mapAccountingRegime(row.regimeCode),
        classificationConsistent: row.analyticType !== null && row.analyticType === row.syntheticType,
        requiresCancellationReview: row.cancellationCode !== "",
        credit: mapMoney(row.credit),
        debit: mapMoney(row.debit),
      })),
      receivables: mapTitles(data.receivables),
      payables: mapTitles(data.payables),
      ledger: data.ledger.map((row) => ({ ...row, credit: mapMoney(row.credit), debit: mapMoney(row.debit) })),
    };
  }
}
