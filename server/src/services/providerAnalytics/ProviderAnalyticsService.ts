import { z } from "zod";
import { IxcReadDatabase, type IxcReadQuery } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { FinanceSqlService } from "../finance/FinanceSqlService.js";
import { financeQuery } from "../finance/FinanceService.js";
import { directRetention, type DirectRetentionService } from "../retention/DirectRetentionService.js";
import { addDays, referenceDate } from "../upgrades/UpgradeService.js";
import { connectedLoginSql } from "../network/LoginConnection.js";
import {
  AnalyticsSettingsService,
  defaultActivationSettings,
  activationSettingsSchema,
  type ActivationSettings,
} from "../settings/AnalyticsSettingsService.js";
import type { Permission } from "../../config/permissions.js";

export const providerAnalyticsQuery = financeQuery.transform(({ from, to }) => ({ from, to }));
type Period = z.infer<typeof providerAnalyticsQuery>;
export const portfolioEvolutionQuery = z
  .object({
    year: z.union([z.literal("all"), z.coerce.number().int().min(1900).max(9998)]),
    mode: z.enum(["general", "activation"]).default("activation"),
  })
  .strict()
  .refine(({ year, mode }) => year !== "all" || mode === "general", { message: "Todos os anos está disponível no modo Geral." });
export type PortfolioMode = z.infer<typeof portfolioEvolutionQuery>["mode"];
export type PortfolioYear = z.infer<typeof portfolioEvolutionQuery>["year"];
type Row = Record<string, unknown>;
export type AnalyticsSection<T> = { status: "ready"; data: T } | { status: "unavailable"; message: string } | { status: "restricted" };
const count = (value: unknown) => {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isSafeInteger(n) || n < 0) throw new Error("Indicador inválido");
  return n;
};
const counts = <K extends string>(row: Row | undefined, keys: readonly K[]): Record<K, number> =>
  Object.fromEntries(keys.map((key) => [key, count(row?.[key])])) as Record<K, number>;
const query = (name: string, sql: string, params: IxcReadQuery["params"] = []): IxcReadQuery => ({ name, sql, params, timeoutSeconds: 5 });
const openOrders = "t.status IN ('A','AN','EN','AS','AG','EX','RAG','DS')";
const openTickets = "t.su_status IN ('N','P','EP')";

const activationSource = (input: ActivationSettings) => {
  const definition = activationSettingsSchema.parse(input);
  return definition.source === "serviceOrders"
    ? {
        table: "su_oss_chamado",
        date: "data_fechamento",
        condition: `status='F' AND id_assunto IN (${definition.subjectIds.map(() => "?").join(",")}) AND `,
        params: definition.subjectIds,
      }
    : { table: "cliente_contrato", date: "data_ativacao", condition: "", params: [] };
};

/** Small aggregates over the existing IXC maps. All statements are read-only. */
export function providerAnalyticsSql(
  period: Period,
  today: string,
  now: string,
  definition: ActivationSettings = defaultActivationSettings
) {
  const end = addDays(period.to, 1),
    activation = activationSource(definition);
  const older48h = new Date(Date.parse(`${now.replace(" ", "T")}Z`) - 48 * 3600000).toISOString().slice(0, 19).replace("T", " ");
  return {
    portfolio: query(
      "provider-portfolio",
      `SELECT
      (SELECT COUNT(*) FROM cliente WHERE ativo='S') activeCustomers,
      (SELECT COUNT(*) FROM cliente_contrato ct JOIN cliente c ON c.id=ct.id_cliente WHERE ct.status='A' AND c.ativo='S') activeContracts,
      (SELECT COUNT(DISTINCT ct.id_cliente) FROM cliente_contrato ct JOIN cliente c ON c.id=ct.id_cliente
        WHERE ct.status='A' AND c.ativo='S' AND ct.status_internet IN ('CA','CM')) blockedCustomers,
      (SELECT COUNT(*) FROM ${activation.table} WHERE ${activation.condition}${activation.date}>=? AND ${activation.date}<?) activations,
      (SELECT COUNT(*) FROM cliente_contrato WHERE status='I' AND data_cancelamento>=? AND data_cancelamento<?) cancellations,
      (SELECT COUNT(*) FROM cliente c WHERE c.ativo='S' AND NOT EXISTS
        (SELECT 1 FROM cliente_contrato ct WHERE ct.id_cliente=c.id AND ct.status='A')) customersWithoutActiveContract`,
      [...activation.params, period.from, end, period.from, end]
    ),
    evolution: query(
      "provider-contract-evolution",
      `SELECT day,SUM(activations) activations,SUM(cancellations) cancellations FROM (
      SELECT DATE(${activation.date}) day,COUNT(*) activations,0 cancellations FROM ${activation.table}
        WHERE ${activation.condition}${activation.date}>=? AND ${activation.date}<? GROUP BY DATE(${activation.date})
      UNION ALL SELECT DATE(data_cancelamento) day,0 activations,COUNT(*) cancellations FROM cliente_contrato
        WHERE status='I' AND data_cancelamento>=? AND data_cancelamento<? GROUP BY DATE(data_cancelamento)
      ) events GROUP BY day ORDER BY day`,
      [...activation.params, period.from, end, period.from, end]
    ),
    network: query(
      "provider-network",
      `SELECT COUNT(*) activeLogins,
      COALESCE(SUM(${connectedLoginSql}),0) online,
      COALESCE(SUM(NOT (${connectedLoginSql})),0) offline,
      COALESCE(SUM(NOT (${connectedLoginSql}) AND c.ativo='S' AND ct.status='A' AND ct.status_internet='A'),0) releasedOffline
      FROM radusuarios r LEFT JOIN cliente c ON c.id=r.id_cliente
      LEFT JOIN cliente_contrato ct ON ct.id=r.id_contrato AND ct.id_cliente=r.id_cliente WHERE r.ativo='S'`
    ),
    cities: query(
      "provider-offline-cities",
      `SELECT city.id cityId,COALESCE(city.nome,'Cidade não informada') name,
      COUNT(*) total,COALESCE(SUM(NOT (${connectedLoginSql})),0) offline
      FROM radusuarios r LEFT JOIN cliente c ON c.id=r.id_cliente
      LEFT JOIN cliente_contrato ct ON ct.id=r.id_contrato AND ct.id_cliente=r.id_cliente
      LEFT JOIN cidade city ON city.id=CASE WHEN r.endereco_padrao_cliente IN ('S','C') THEN NULLIF(c.cidade,0)
        ELSE COALESCE(NULLIF(r.cidade,0),NULLIF(ct.cidade,0),NULLIF(c.cidade,0)) END
      WHERE r.ativo='S' GROUP BY city.id,city.nome HAVING offline>0 ORDER BY offline DESC,total DESC,city.id LIMIT 5`
    ),
    orders: query(
      "provider-service-orders",
      `SELECT
      COALESCE(SUM(${openOrders}),0) open,
      COALESCE(SUM(${openOrders} AND t.data_abertura>='1000-01-01' AND t.data_abertura<?),0) older48h,
      COALESCE(SUM(${openOrders} AND t.data_agenda>='1000-01-01' AND t.data_agenda<?),0) overdueAppointments,
      COALESCE(SUM(${openOrders} AND t.prioridade IN ('A','C')),0) urgent,
      COALESCE(SUM(t.status='F' AND t.data_fechamento>=? AND t.data_fechamento<?),0) completed,
      COALESCE(SUM(t.data_abertura>=? AND t.data_abertura<?),0) created
      FROM su_oss_chamado t`,
      [older48h, now, period.from, end, period.from, end]
    ),
    subjects: query(
      "provider-open-order-subjects",
      `SELECT COALESCE(a.assunto,'Assunto não informado') name,COUNT(*) total
      FROM su_oss_chamado t LEFT JOIN su_oss_assunto a ON a.id=t.id_assunto WHERE ${openOrders}
      GROUP BY a.id,a.assunto ORDER BY total DESC,a.id LIMIT 5`
    ),
    oldestOrders: query(
      "provider-oldest-service-orders",
      `SELECT t.id,t.id_cliente customerId,c.razao customerName,
      COALESCE(a.assunto,'Assunto não informado') subject,t.data_abertura openedAt
      FROM su_oss_chamado t JOIN cliente c ON c.id=t.id_cliente LEFT JOIN su_oss_assunto a ON a.id=t.id_assunto
      WHERE ${openOrders} AND t.data_abertura>='1000-01-01' AND t.data_abertura<=?
      ORDER BY t.data_abertura,t.id LIMIT 5`,
      [now]
    ),
    tickets: query(
      "provider-tickets",
      `SELECT COALESCE(SUM(${openTickets}),0) open,
      COALESCE(SUM(${openTickets} AND t.mensagens_nao_lida_sup>0),0) unread,
      COALESCE(SUM(${openTickets} AND t.data_criacao>='1000-01-01' AND t.data_criacao<?),0) older48h,
      COALESCE(SUM(t.data_criacao>=? AND t.data_criacao<?),0) created FROM su_ticket t`,
      [older48h, period.from, end]
    ),
    upgrades: query(
      "provider-renewals",
      `SELECT COUNT(*) eligibleContracts,
      COALESCE(SUM(ct.data_expiracao>='1000-01-01' AND ct.data_expiracao<?),0) expired,
      COALESCE(SUM(ct.data_expiracao>=? AND ct.data_expiracao<?),0) next30,
      COALESCE(SUM(ct.data_expiracao IS NULL OR ct.data_expiracao<'1000-01-01'),0) missingExpiration
      FROM cliente_contrato ct JOIN cliente c ON c.id=ct.id_cliente
      WHERE ct.status='A' AND c.ativo='S' AND ct.status_internet='A'`,
      [today, today, addDays(today, 31)]
    ),
  };
}

/** Bound dates retain index filtering; aggregate before filling monthly or yearly periods. */
export function portfolioEvolutionSql(
  year: PortfolioYear,
  today: string,
  definition: ActivationSettings = defaultActivationSettings,
  mode: PortfolioMode = "activation"
) {
  const activation =
      mode === "general" || definition.source === "contracts"
        ? { table: "cliente_contrato", date: "data_ativacao", condition: "status IN ('A','I') AND ", params: [] }
        : activationSource(definition),
    churnCondition = `status='I' AND EXISTS (SELECT 1 FROM fn_areceber_mot_cancelamento m
      WHERE m.id=cliente_contrato.motivo_cancelamento AND m.considerar_churn='S')`,
    from = year === "all" ? "1900-01-01" : `${year}-01-01`,
    end = year === "all" || year === Number(today.slice(0, 4)) ? addDays(today, 1) : `${year + 1}-01-01`,
    periodLength = year === "all" ? 4 : 7;
  return {
    openingBalance:
      mode === "general" && year !== "all"
        ? query(
            "provider-contract-evolution-opening-balance",
            `SELECT
              (SELECT COUNT(*) FROM cliente_contrato WHERE status IN ('A','I') AND data_ativacao>=? AND data_ativacao<?) activations,
              (SELECT COUNT(*) FROM cliente_contrato WHERE ${churnCondition} AND data_acesso_desativado>=? AND data_acesso_desativado<?) cancellations`,
            ["1900-01-01", from, "1900-01-01", from]
          )
        : undefined,
    months: query(
      year === "all" ? "provider-contract-evolution-yearly" : "provider-contract-evolution-monthly",
      `SELECT month,SUM(activations) activations,SUM(cancellations) cancellations FROM (
      SELECT SUBSTR(${activation.date},1,${periodLength}) month,COUNT(*) activations,0 cancellations FROM ${activation.table}
        WHERE ${activation.condition}${activation.date}>=? AND ${activation.date}<? GROUP BY SUBSTR(${activation.date},1,${periodLength})
      UNION ALL SELECT SUBSTR(data_acesso_desativado,1,${periodLength}) month,0 activations,COUNT(*) cancellations FROM cliente_contrato
        WHERE ${churnCondition} AND data_acesso_desativado>=? AND data_acesso_desativado<? GROUP BY SUBSTR(data_acesso_desativado,1,${periodLength})
      ) events GROUP BY month ORDER BY month`,
      [...activation.params, from, end, from, end]
    ),
    firstYear: query(
      "provider-contract-evolution-first-year",
      `SELECT MIN(SUBSTR(firstDate,1,4)) firstYear FROM (
      SELECT MIN(${activation.date}) firstDate FROM ${activation.table} WHERE ${activation.condition}${activation.date}>=? AND ${activation.date}<?
      UNION ALL SELECT MIN(data_acesso_desativado) firstDate FROM cliente_contrato WHERE ${churnCondition} AND data_acesso_desativado>=? AND data_acesso_desativado<?
    ) dates`,
      [...activation.params, "1900-01-01", addDays(today, 1), "1900-01-01", addDays(today, 1)]
    ),
  };
}

export class ProviderAnalyticsService {
  constructor(
    private readonly database = new IxcReadDatabase(),
    private readonly finance: Pick<FinanceSqlService, "dashboard"> = new FinanceSqlService(database),
    private readonly risk: Pick<DirectRetentionService, "getSummary"> = directRetention,
    private readonly clock: () => Date = () => new Date(),
    private readonly activationSettings: Pick<AnalyticsSettingsService, "read"> = new AnalyticsSettingsService()
  ) {}
  async close() {
    await this.database.close();
  }
  async portfolioEvolution(yearInput: PortfolioYear, signal?: AbortSignal, modeInput: PortfolioMode = "activation") {
    const { year, mode } = portfolioEvolutionQuery.parse({ year: yearInput, mode: modeInput }),
      now = this.clock(),
      today = referenceDate(now),
      currentYear = Number(today.slice(0, 4));
    if (year !== "all" && year > currentYear) throw Object.assign(new Error("Selecione um ano até o ano atual."), { statusCode: 400 });
    const activationDefinition = mode === "general" ? defaultActivationSettings : await this.activationSettings.read();
    const sql = portfolioEvolutionSql(year, today, activationDefinition, mode);
    return this.database.withSnapshot(async (session) => {
      const rows = await session.select<Row>(sql.months),
        [first] = await session.select<Row>(sql.firstYear),
        earliestYear = first?.firstYear == null ? currentYear : Math.min(currentYear, Math.max(1900, count(first.firstYear))),
        byMonth = new Map(rows.map((r) => [String(r.month), counts(r, ["activations", "cancellations"])]));
      const [openingBalance] = sql.openingBalance ? await session.select<Row>(sql.openingBalance) : [];
      const initial = sql.openingBalance ? counts(openingBalance, ["activations", "cancellations"]) : { activations: 0, cancellations: 0 };
      let accumulatedActivations = initial.activations,
        accumulatedCancellations = initial.cancellations;
      const series = Array.from({ length: year === "all" ? currentYear - earliestYear + 1 : 12 }, (_, i) => {
        const month = year === "all" ? String(earliestYear + i) : `${year}-${String(i + 1).padStart(2, "0")}`;
        if (month > today.slice(0, 7)) return { month, activations: null, cancellations: null, growth: null };
        const monthly = byMonth.get(month) ?? { activations: 0, cancellations: 0 };
        accumulatedActivations += monthly.activations;
        accumulatedCancellations += monthly.cancellations;
        const values = mode === "general" ? { activations: accumulatedActivations, cancellations: accumulatedCancellations } : monthly;
        const balance = values.activations - values.cancellations;
        return {
          month,
          growth: values.activations === 0 ? null : (balance / values.activations) * 100,
          ...values,
        };
      });
      const activations = mode === "general" ? accumulatedActivations : series.reduce((total, r) => total + (r.activations ?? 0), 0),
        cancellations = mode === "general" ? accumulatedCancellations : series.reduce((total, r) => total + (r.cancellations ?? 0), 0);
      return {
        year,
        granularity: year === "all" ? "year" : "month",
        mode,
        activationDefinition,
        earliestYear,
        currentYear,
        through: year === "all" || year === currentYear ? today : `${year}-12-31`,
        queriedAt: now.toISOString(),
        activations,
        cancellations,
        eventBalance: activations - cancellations,
        series,
      };
    }, signal);
  }
  async dashboard(input: Period, can: (permission: Permission) => boolean, signal?: AbortSignal) {
    const period = providerAnalyticsQuery.parse(input),
      now = this.clock(),
      today = referenceDate(now);
    if (period.to > today) throw Object.assign(new Error("O período não pode terminar no futuro."), { statusCode: 400 });
    const localNow = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(
      now
    );
    const sql = providerAnalyticsSql(period, today, localNow);
    const section = async <T>(allowed: boolean, read: () => Promise<T>): Promise<AnalyticsSection<T>> => {
      if (!allowed) return { status: "restricted" };
      try {
        return { status: "ready", data: await read() };
      } catch {
        if (signal?.aborted) throw Object.assign(new Error("Consulta interrompida."), { statusCode: 499 });
        return { status: "unavailable", message: "Fonte indisponível nesta consulta. Atualize para tentar novamente." };
      }
    };
    const [portfolio, network, orders, tickets, finance, retention, upgrades] = await Promise.all([
      section(can("churn.dashboard") || can("support.customers.view"), async () => {
        const activationDefinition = await this.activationSettings.read(),
          sql = providerAnalyticsSql(period, today, localNow, activationDefinition);
        return this.database.withSnapshot(async (s) => {
          const [row] = await s.select<Row>(sql.portfolio),
            events = await s.select<Row>(sql.evolution);
          const totals = counts(row, [
            "activeCustomers",
            "activeContracts",
            "blockedCustomers",
            "activations",
            "cancellations",
            "customersWithoutActiveContract",
          ]);
          const byDay = new Map(events.map((r) => [String(r.day), counts(r, ["activations", "cancellations"])]));
          const series = [];
          for (let day = period.from; day <= period.to; day = addDays(day, 1))
            series.push({ date: day, ...(byDay.get(day) ?? { activations: 0, cancellations: 0 }) });
          return { activationDefinition, ...totals, eventBalance: totals.activations - totals.cancellations, series };
        }, signal);
      }),
      section(can("network.logins.list"), () =>
        this.database.withSnapshot(async (s) => {
          const [row] = await s.select<Row>(sql.network),
            cities = await s.select<Row>(sql.cities);
          return {
            ...counts(row, ["activeLogins", "online", "offline", "releasedOffline"]),
            cities: cities.map((r) => ({
              cityId: r.cityId === null ? null : count(r.cityId),
              name: String(r.name),
              ...counts(r, ["total", "offline"]),
            })),
          };
        }, signal)
      ),
      section(can("support.customer.view") && can("support.orders.view"), () =>
        this.database.withSnapshot(async (s) => {
          const [row] = await s.select<Row>(sql.orders),
            subjects = await s.select<Row>(sql.subjects),
            oldest = await s.select<Row>(sql.oldestOrders);
          return {
            ...counts(row, ["open", "older48h", "overdueAppointments", "urgent", "completed", "created"]),
            subjects: subjects.map((r) => ({ name: String(r.name), total: count(r.total) })),
            oldest: oldest.map((r) => ({
              id: count(r.id),
              customerId: count(r.customerId),
              customerName: String(r.customerName),
              subject: String(r.subject),
              openedAt: String(r.openedAt),
            })),
          };
        }, signal)
      ),
      section(can("support.customer.view") && can("support.tickets.view"), async () =>
        counts((await this.database.withSnapshot((s) => s.select<Row>(sql.tickets), signal))[0], ["open", "unread", "older48h", "created"])
      ),
      section(can("finance.dashboard.view"), async () => {
        const report = await this.finance.dashboard({ ...period, regime: "all", receivableScope: "active" }, signal);
        return {
          totals: report.totals,
          growth: report.growth,
          previous: report.previous,
          aging: report.aging,
          payable: report.payable,
          reconciliation: report.reconciliation,
          quality: report.quality,
          warnings: report.warnings,
          series: report.series,
        };
      }),
      section(can("churn.dashboard"), async () => {
        const r = await this.risk.getSummary(signal);
        return {
          ...counts(r, ["lowRisk", "attention", "medium", "highRisk", "critical"]),
          calculatedAt: r?.riskCalculatedAt ? new Date(r.riskCalculatedAt).toISOString() : null,
          satisfactionCoverage: r.satisfactionCoverage,
        };
      }),
      section(can("upgrades.opportunities.view"), async () =>
        counts((await this.database.withSnapshot((s) => s.select<Row>(sql.upgrades), signal))[0], [
          "eligibleContracts",
          "expired",
          "next30",
          "missingExpiration",
        ])
      ),
    ]);
    return { period, asOf: today, queriedAt: now.toISOString(), portfolio, network, orders, tickets, finance, retention, upgrades };
  }
}
