import { format, resolveConfig } from "prettier";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IxcReadDatabase } from "../integrations/ixc/database/IxcReadDatabase.js";
import { IxcFinanceReadRepository } from "../integrations/ixc/database/IxcFinanceReadRepository.js";
import { movementQuery, titleQuery, ledgerBalanceQuery } from "../integrations/ixc/database/financeQueries.js";
import { decimalToUnits } from "../integrations/ixc/database/maps/valueMappers.js";
import { financeQuery } from "../services/finance/FinanceService.js";
import { addDays, referenceDate } from "../services/upgrades/UpgradeService.js";

const today = referenceDate(new Date());
const input = financeQuery.parse({ from: process.argv[2] ?? `${today.slice(0, 7)}-01`, to: process.argv[3] ?? today });
const database = new IxcReadDatabase();
try {
  const result = await new IxcFinanceReadRepository(database).analyze(input);
  const ledger = result.ledger[0];
  const completeLedgerScope = !input.accountId;
  const plans = [];
  const queries = [
    movementQuery(input),
    titleQuery("receivable", input, today),
    titleQuery("payable", input, today),
    ledgerBalanceQuery(input),
  ];
  // EXPLAIN plans carry index/row estimates only, never financial amounts.
  for (const query of queries) {
    const rows = await database.explain(query);
    plans.push({ name: query.name, rows });
  }
  const groupedMovementCount = result.movements.reduce((sum, row) => sum + BigInt(row.movementCount), 0n).toString();
  const aggregate = (rows: typeof result.receivables, field: "titleCount" | "nullBalanceCount" | "negativeBalanceCount") =>
    rows.reduce((sum, row) => sum + BigInt(row[field]), 0n).toString();
  const report = {
    generatedAt: result.queriedAt,
    period: result.period,
    previous: result.previous,
    benchmark: {
      durationMs: result.durationMs,
      groupedMovementCount,
      returnedMovementGroups: result.movements.length,
      sequentialQueries: 4,
    },
    quality: {
      typeMismatchGroups: result.movements.filter((row) => !row.classificationConsistent).length,
      cancellationGroups: result.movements.filter((row) => row.requiresCancellationReview).length,
      transferLinkedCount: result.movements.reduce((sum, row) => sum + BigInt(row.transferLinkedCount), 0n).toString(),
      accountingRegimes: [...new Set(result.movements.map((row) => row.regime))],
      ledgerBalanced:
        completeLedgerScope && ledger?.credit && ledger.debit
          ? decimalToUnits(ledger.credit.decimal) === decimalToUnits(ledger.debit.decimal)
          : null,
      receivable: {
        count: aggregate(result.receivables, "titleCount"),
        nullBalances: aggregate(result.receivables, "nullBalanceCount"),
        negativeBalances: aggregate(result.receivables, "negativeBalanceCount"),
      },
      payable: {
        count: aggregate(result.payables, "titleCount"),
        nullBalances: aggregate(result.payables, "nullBalanceCount"),
        negativeBalances: aggregate(result.payables, "negativeBalanceCount"),
      },
    },
    queries: plans,
    note: "Only quality counts and timing saved; customer records and financial amounts remain ephemeral.",
  };
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const target = resolve(root, "docs/ixc-database/benchmark.json");
  await writeFile(target, await format(JSON.stringify(report), { ...(await resolveConfig(target)), parser: "json" }));
  console.info(JSON.stringify(report));
  // Validate half-open date boundaries without reading extra data.
  if (queries[0]!.params[1] !== addDays(input.to, 1)) throw new Error("Limite de período inválido");
} finally {
  await database.close();
}
