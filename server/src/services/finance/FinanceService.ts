import { IxcApiService, type IxcListRequest } from "../../integrations/ixc/IxcApiService.js";
import { addDays, dateOnly, referenceDate } from "../upgrades/UpgradeService.js";
import { z } from "zod";

type Row = Record<string, unknown>;
const validDate = z.string().refine((value) => dateOnly(value) === value, "Data inválida");
export const financeQuery = z
  .object({
    from: validDate,
    to: validDate,
    branchId: z.coerce.number().int().positive().optional(),
    accountId: z.coerce.number().int().positive().optional(),
    regime: z.enum(["all", "cash", "competence", "manual"]).optional(),
    receivableScope: z.enum(["active", "all"]).optional(),
  })
  .refine(
    (query) => query.from <= query.to && Date.parse(query.to) - Date.parse(query.from) < 366 * 86400000,
    "Use um período de até 366 dias"
  );
export type FinanceQuery = z.infer<typeof financeQuery>;
const fail = (message: string, statusCode = 502) => Object.assign(new Error(message), { statusCode });
const text = (value: unknown) => String(value ?? "").trim();
const id = (value: unknown) => (/^[1-9]\d*$/.test(text(value)) ? text(value) : null);
/** IXC decimal amounts are converted to cents before any aggregation. */
export function cents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = text(value);
  if (!raw) return 0;
  if (raw.includes(",") && !/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(raw)) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(amount) ? amount : null;
}
const amount = (value: number) => {
  if (!Number.isSafeInteger(value)) throw fail("O total excede a precisão disponível. Reduza o período.", 422);
  return value / 100;
};
export function comparisonPeriod(query: FinanceQuery) {
  const days = Math.round((Date.parse(query.to) - Date.parse(query.from)) / 86400000) + 1;
  return { from: addDays(query.from, -days), to: addDays(query.from, -1), days };
}
export class FinanceService {
  constructor(
    private readonly ixc: Pick<IxcApiService, "listPage"> = new IxcApiService({ timeout: 12000, attempts: 1 }),
    private readonly now: () => Date = () => new Date(),
    private readonly maxRows = 40000
  ) {}
  private check(deadline: number, signal?: AbortSignal) {
    if (signal?.aborted) throw fail("Consulta interrompida.", 499);
    if (Date.now() > deadline) throw fail("A consulta excedeu o tempo disponível. Reduza o período ou filtre uma filial.", 422);
  }
  private async read(endpoint: string, request: IxcListRequest, deadline: number, signal?: AbortSignal) {
    const rows: Row[] = [];
    const seen = new Set<string>();
    let processed = 0;
    let expectedTotal: number | undefined;
    for (let page = 1; ; page++) {
      this.check(deadline, signal);
      let result;
      try {
        result = await this.ixc.listPage<Row>(endpoint, { ...request, rp: 500 }, page, signal);
      } catch {
        if (signal?.aborted) throw fail("Consulta interrompida.", 499);
        throw fail("Não foi possível consultar uma das fontes financeiras no IXC.");
      }
      this.check(deadline, signal);
      if (!Number.isSafeInteger(result.total) || result.total < 0 || result.total > this.maxRows)
        throw fail("Há muitos registros para esta consulta. Reduza o período ou filtre uma filial/conta.", 422);
      if (expectedTotal !== undefined && expectedTotal !== result.total)
        throw fail("Os registros mudaram durante a consulta. Atualize para obter os totais completos.");
      expectedTotal = result.total;
      if (result.rows.length > 500 || processed + result.rows.length > result.total)
        throw fail("O IXC retornou uma listagem financeira inconsistente.");
      if (!result.rows.length && processed < result.total) throw fail("A listagem financeira ficou incompleta. Atualize a consulta.");
      for (const row of result.rows) {
        const key = id(row.id);
        if (!key) throw fail("O IXC retornou um registro financeiro sem identificador válido.");
        if (seen.has(key)) throw fail("Os registros mudaram durante a consulta. Atualize para obter os totais completos.");
        seen.add(key);
        rows.push(row);
      }
      processed += result.rows.length;
      if (processed > this.maxRows) throw fail("Reduza o período da consulta.", 422);
      if (processed >= result.total) return rows;
    }
  }
  private request(endpoint: string, field: string, from: string, to: string, query: FinanceQuery): IxcListRequest {
    return {
      qtype: `${endpoint}.${field}`,
      query: from,
      oper: ">=",
      sortname: `${endpoint}.id`,
      gridParam: [
        { TB: `${endpoint}.${field}`, OP: "<=", P: `${to} 23:59:59` },
        ...(query.branchId ? [{ TB: `${endpoint}.filial_id`, OP: "=", P: String(query.branchId) }] : []),
        ...(query.accountId ? [{ TB: `${endpoint}.id_conta`, OP: "=", P: String(query.accountId) }] : []),
      ],
    };
  }
  private validateScope(row: Row, query: FinanceQuery) {
    if (
      (query.branchId && text(row.filial_id) !== String(query.branchId)) ||
      (query.accountId && text(row.id_conta) !== String(query.accountId))
    )
      throw fail("O IXC retornou dados fora dos filtros solicitados.");
  }
  async dashboard(input: FinanceQuery, signal?: AbortSignal) {
    const query = financeQuery.parse(input);
    const previous = comparisonPeriod(query);
    const deadline = Date.now() + 60000;
    const rows = await this.read(
      "fn_movim_finan",
      this.request("fn_movim_finan", "data", previous.from, query.to, query),
      deadline,
      signal
    );
    const accountIds = [...new Set(rows.map((row) => id(row.id_conta)).filter((value): value is string => Boolean(value)))];
    const catalog = new Map<string, Row>();
    for (let start = 0; start < accountIds.length; start += 250) {
      const accounts = await this.read(
        "planejamento_analitico",
        {
          qtype: "planejamento_analitico.id",
          query: accountIds.slice(start, start + 250).join(","),
          oper: "IN",
          sortname: "planejamento_analitico.id",
        },
        deadline,
        signal
      );
      for (const account of accounts) catalog.set(text(account.id), account);
    }
    const accounts = new Map<
      string,
      { id: number; name: string; classification: string; type: "R" | "D"; debit: number; credit: number; records: number }
    >();
    const ledger = new Map<
      string,
      { id: number; name: string; classification: string; type: string; debit: number; credit: number; records: number }
    >();
    const buckets = new Map<string, { date: string; revenue: number; expense: number }>();
    const monthly = previous.days > 62;
    for (let date = query.from; date <= query.to; date = addDays(date, 1)) {
      const key = monthly ? date.slice(0, 7) : date;
      if (!buckets.has(key)) buckets.set(key, { date: key, revenue: 0, expense: 0 });
    }
    let revenue = 0,
      expense = 0,
      priorRevenue = 0,
      priorExpense = 0,
      unclassified = 0;
    for (const row of rows) {
      this.validateScope(row, query);
      const date = dateOnly(row.data),
        debit = cents(row.debito),
        credit = cents(row.credito);
      if (!date || debit === null || credit === null)
        throw fail("Há lançamentos com data ou valor inválido. Revise o cadastro no IXC.", 422);
      if (date < previous.from || date > query.to) throw fail("O IXC retornou registros fora do período solicitado.");
      const accountId = id(row.id_conta),
        account = accountId ? catalog.get(accountId) : undefined;
      if (!account || !["A", "P", "R", "D"].includes(text(account.tipo))) {
        unclassified++;
        continue;
      }
      if (date >= query.from) {
        const key = accountId!;
        if (!ledger.has(key))
          ledger.set(key, {
            id: Number(key),
            name: text(account.planejamento_analitico) || `Conta #${key}`,
            classification: text(account.classificacao),
            type: text(account.tipo),
            debit: 0,
            credit: 0,
            records: 0,
          });
        const item = ledger.get(key)!;
        item.debit += debit;
        item.credit += credit;
        item.records++;
      }
      // Only income/expense accounts enter the result: exclude balance sheet counterparts and transfers.
      const type = text(account.tipo);
      if (type !== "R" && type !== "D") continue;
      const value = type === "R" ? credit - debit : debit - credit;
      if (date < query.from) {
        if (type === "R") priorRevenue += value;
        else priorExpense += value;
        continue;
      }
      if (type === "R") revenue += value;
      else expense += value;
      const bucket = buckets.get(monthly ? date.slice(0, 7) : date)!;
      if (type === "R") bucket.revenue += value;
      else bucket.expense += value;
      const key = accountId!;
      if (!accounts.has(key))
        accounts.set(key, {
          id: Number(key),
          name: text(account.planejamento_analitico) || `Conta #${key}`,
          classification: text(account.classificacao),
          type,
          debit: 0,
          credit: 0,
          records: 0,
        });
      const item = accounts.get(key)!;
      item.debit += debit;
      item.credit += credit;
      item.records++;
    }
    const warnings: string[] = [];
    if (unclassified)
      warnings.push(
        `${unclassified} lançamentos não têm classificação reconhecida e foram excluídos do resultado, inclusive da comparação.`
      );
    const today = referenceDate(this.now());
    const open = async (endpoint: "fn_areceber" | "fn_apagar") => {
      try {
        const titles = await this.read(endpoint, this.request(endpoint, "data_vencimento", query.from, query.to, query), deadline, signal);
        let total = 0,
          overdue = 0,
          count = 0;
        for (const row of titles) {
          this.validateScope(row, query);
          if (text(row.status) === "C" || text(row.estornado) === "S") continue;
          const value = cents(row.valor_aberto),
            date = dateOnly(row.data_vencimento);
          if (value === null || !date || date < query.from || date > query.to) throw fail("Valores ou datas inválidos");
          if (value > 0) {
            total += value;
            count++;
            if (date < today) overdue += value;
          }
        }
        return { total: amount(total), overdue: amount(overdue), count };
      } catch {
        if (signal?.aborted) throw fail("Consulta interrompida.", 499);
        warnings.push(
          `${endpoint === "fn_areceber" ? "Contas a receber" : "Contas a pagar"} indisponíveis. Os valores em aberto não foram calculados.`
        );
        return null;
      }
    };
    const [receivable, payable] = await Promise.all([open("fn_areceber"), open("fn_apagar")]);
    const list = [...accounts.values()]
      .map((item) => ({
        ...item,
        debit: amount(item.debit),
        credit: amount(item.credit),
        value: amount(item.type === "R" ? item.credit - item.debit : item.debit - item.credit),
      }))
      .sort((a, b) => b.value - a.value || a.id - b.id);
    const change = (current: number, prior: number) => (prior > 0 ? Math.round(((current - prior) / prior) * 10000) / 100 : null);
    return {
      period: { from: query.from, to: query.to },
      previous: {
        from: previous.from,
        to: previous.to,
        revenue: amount(priorRevenue),
        expense: amount(priorExpense),
        result: amount(priorRevenue - priorExpense),
      },
      totals: {
        revenue: amount(revenue),
        expense: amount(expense),
        result: amount(revenue - expense),
        margin: revenue > 0 ? Math.round(((revenue - expense) / revenue) * 10000) / 100 : null,
      },
      growth: {
        revenue: change(revenue, priorRevenue),
        expense: change(expense, priorExpense),
        resultDifference: amount(revenue - expense - priorRevenue + priorExpense),
      },
      receivable,
      payable,
      accounts: list,
      ledger: [...ledger.values()]
        .map((item) => ({ ...item, debit: amount(item.debit), credit: amount(item.credit), value: amount(item.credit - item.debit) }))
        .sort((a, b) => a.classification.localeCompare(b.classification) || a.id - b.id),
      series: [...buckets.values()].map((item) => ({
        ...item,
        revenue: amount(item.revenue),
        expense: amount(item.expense),
        result: amount(item.revenue - item.expense),
      })),
      warnings,
      queriedAt: this.now().toISOString(),
    };
  }
}
