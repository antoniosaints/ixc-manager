import { IxcApiService, type IxcListRequest } from "../../integrations/ixc/IxcApiService.js";
import { RetentionRiskEngine } from "../retention/RetentionRiskEngine.js";
import { dateOnly, referenceDate } from "../upgrades/UpgradeService.js";
import type { RiskContext } from "../../types/retention.js";

type Row = Record<string, unknown>;
type Reader = Pick<IxcApiService, "listPage">;
const text = (value: unknown) => (value == null ? "" : String(value).trim());
const dayMs = 86_400_000;
const date = (value: unknown) => dateOnly(text(value).replace(/^(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1"));
const day = (value: unknown) => {
  const parsed = date(value);
  return parsed ? Date.parse(`${parsed}T00:00:00Z`) : NaN;
};
const timestamp = (value: unknown) => {
  const raw = text(value).replace(/^(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1");
  if (!date(raw)) return NaN;
  return Date.parse(`${raw.replace(" ", "T")}${raw.length === 10 ? "T00:00:00Z" : /Z$|[+-]\d\d:\d\d$/.test(raw) ? "" : "Z"}`);
};
const failure = (message = "Não foi possível consultar os dados da análise no IXC.", statusCode = 502) =>
  Object.assign(new Error(message), { statusCode });
export interface AnalysisSource {
  key: string;
  label: string;
  status: "ok" | "unavailable";
  count: number | null;
}

/** Live, request-scoped analysis. No repository, DB, Redis, jobs or saved scores. */
export class CustomerAnalysisService {
  constructor(
    private readonly ixc: Reader = new IxcApiService({ timeout: 8_000, attempts: 1 }),
    private readonly now = () => new Date(),
    private readonly engine = new RetentionRiskEngine()
  ) {}

  async analyze(customerId: number, signal?: AbortSignal) {
    const started = this.now();
    const deadline = Date.now() + 60_000;
    // IXC dates are civil times in Brasília, matching the daily cutoffs in Churn.
    const today = day(referenceDate(started));
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(started);
    const now = timestamp(`${referenceDate(started)} ${parts}`);
    const recentStart = now - 30 * dayMs;
    const weekStart = today - 7 * dayMs;
    const baselineStart = today - 35 * dayMs;
    const month = new Date(today);
    month.setUTCDate(1);
    const monthStart = month.getTime();
    month.setUTCMonth(month.getUTCMonth() - 3);
    const usageStart = month.getTime();
    const sources: AnalysisSource[] = [];
    const warnings: string[] = [];
    const check = () => {
      if (signal?.aborted) throw failure("Consulta interrompida.", 499);
      if (Date.now() > deadline) throw failure("A consulta excedeu o tempo disponível. Tente novamente.");
    };
    const read = async (
      endpoint: string,
      field: string,
      query: string,
      belongs: (row: Row) => boolean,
      gridParam: IxcListRequest["gridParam"] = [],
      key = "id",
      oper = "="
    ) => {
      const rows: Row[] = [],
        seen = new Set<string>();
      let expected: number | undefined;
      for (let page = 1; page <= 20; page++) {
        check();
        const result = await this.ixc.listPage<Row>(
          endpoint,
          {
            qtype: `${endpoint}.${field}`,
            query,
            oper,
            gridParam,
            sortname: `${endpoint}.${key}`,
            sortorder: "asc",
            rp: 500,
          },
          page
        );
        check();
        if (
          !Array.isArray(result.rows) ||
          !Number.isSafeInteger(result.total) ||
          result.total < result.rows.length ||
          result.total > 10_000 ||
          (expected !== undefined && expected !== result.total)
        )
          throw failure();
        expected = result.total;
        for (const row of result.rows) {
          if (
            !row ||
            typeof row !== "object" ||
            !/^\d+$/.test(text(row[key])) ||
            Number(row[key]) <= 0 ||
            seen.has(text(row[key])) ||
            !belongs(row)
          )
            throw failure();
          seen.add(text(row[key]));
          rows.push(row);
        }
        if (rows.length === expected) return rows;
        if (rows.length > expected || result.rows.length !== 500) throw failure();
      }
      throw failure();
    };
    const source = async (key: string, label: string, query: () => Promise<Row[]>, required = false): Promise<Row[] | null> => {
      try {
        const rows = await query();
        sources.push({ key, label, status: "ok", count: rows.length });
        return rows;
      } catch {
        if (required || signal?.aborted) throw failure(signal?.aborted ? "Consulta interrompida." : undefined, signal?.aborted ? 499 : 502);
        sources.push({ key, label, status: "unavailable", count: null });
        return null;
      }
    };
    const own = (row: Row) => text(row.id_cliente) === String(customerId);
    const customers = await source(
      "customer",
      "Cadastro e satisfação",
      () => read("cliente", "id", String(customerId), (r) => text(r.id) === String(customerId)),
      true
    );
    const customer = customers?.[0];
    if (!customer) throw failure("Cliente não encontrado no IXC.", 404);
    if (!["S", "N"].includes(text(customer.ativo))) throw failure();
    const allContracts = await source(
      "contracts",
      "Contratos e permanência",
      () => read("cliente_contrato", "id_cliente", String(customerId), (row) => own(row) && !!text(row.status)),
      true
    );
    const contracts = allContracts!.filter((row) => text(row.status) && text(row.status) !== "I");
    const eligible = text(customer.ativo) === "S" && contracts.length > 0;
    if (!eligible)
      return {
        customer: { id: customerId, name: text(customer.razao) },
        queriedAt: this.now().toISOString(),
        partial: false,
        sources,
        warnings,
        contracts: [],
        message:
          text(customer.ativo) !== "S"
            ? "O Churn analisa apenas clientes ativos. Este cadastro não está ativo no IXC."
            : "Nenhum contrato elegível para análise. Contratos inativos não entram no Churn.",
      };
    const [financial, tickets, orders, logins] = await Promise.all([
      source("financial", "Títulos a receber", () =>
        read(
          "fn_areceber",
          "id_cliente",
          String(customerId),
          (row) => own(row) && !!text(row.status) && Number.isFinite(day(row.data_vencimento))
        )
      ),
      source("tickets", "Atendimentos", () =>
        read("su_ticket", "id_cliente", String(customerId), (row) => own(row) && Number.isFinite(timestamp(row.data_criacao)))
      ),
      source("orders", "Ordens de serviço", () =>
        read("su_oss_chamado", "id_cliente", String(customerId), (row) => own(row) && Number.isFinite(timestamp(row.data_abertura)))
      ),
      source("logins", "Logins e estado da conexão", () =>
        read("radusuarios", "id_cliente", String(customerId), (row) => own(row) && ["S", "N"].includes(text(row.ativo)))
      ),
    ]);
    check();
    const activeLogins = logins?.filter((row) => text(row.ativo) === "S") ?? [];
    const usernames = [...new Set(activeLogins.map((row) => text(row.login)).filter(Boolean))];
    const loginIds = new Set(activeLogins.map((row) => text(row.id)));
    const networkQuery =
      (endpoint: string, field: string, names: string[], valid: (row: Row) => boolean, start: number, dateField: string, key = "id") =>
      async () => {
        if (
          logins === null ||
          names.length > 50 ||
          names.some((name) => name.includes(",")) ||
          activeLogins.some((row) => !text(row.login))
        )
          throw failure();
        if (!names.length) return [];
        const since = new Date(start).toISOString().slice(0, 19).replace("T", " ");
        return read(
          endpoint,
          field,
          names.join(","),
          (row) => valid(row) && timestamp(row[dateField]) >= start && timestamp(row[dateField]) <= now,
          [{ TB: `${endpoint}.${dateField}`, OP: ">=", P: since }],
          key,
          "IN"
        );
      };
    const [sessions, usage] = await Promise.all([
      source(
        "sessions",
        "Sessões Radius · últimos 35 dias",
        networkQuery(
          "radacct",
          "username",
          usernames,
          (r) => usernames.includes(text(r.username)),
          baselineStart,
          "acctstarttime",
          "radacctid"
        )
      ),
      source(
        "usage",
        "Consumo · mês atual e 3 anteriores",
        networkQuery("radusuarios_consumo_m", "id_login", [...loginIds], (r) => loginIds.has(text(r.id_login)), usageStart, "data")
      ),
    ]);
    check();
    const recent = (value: unknown) => timestamp(value) > recentStart && timestamp(value) <= now;
    const recentTickets = tickets?.filter((row) => timestamp(row.data_criacao) >= recentStart && timestamp(row.data_criacao) <= now) ?? [];
    const subjects = new Map<string, number>();
    for (const row of recentTickets) {
      const subject = text(row.id_assunto);
      subjects.set(subject, (subjects.get(subject) ?? 0) + 1);
    }
    const sessions7 = sessions?.filter((row) => day(row.acctstarttime) >= weekStart) ?? [];
    const baseline = sessions?.filter((row) => day(row.acctstarttime) < weekStart) ?? [];
    const online = activeLogins.some((row) => ["S", "SS"].includes(text(row.online)));
    const offline = activeLogins
      .map((row) => {
        const end = day(row.ultima_conexao_final),
          start = day(row.ultima_conexao_inicial);
        const last = end >= day("2000-01-01") ? end : start;
        return Number.isFinite(last) && last >= day("2000-01-01") ? Math.min(7, Math.max(0, (today - last) / dayMs)) : null;
      })
      .filter((value): value is number => value !== null);
    // Mirror the normalized monthly table's (login,date) key before AVG/MAX.
    const consumption = new Map<string, Row>();
    for (const row of usage ?? []) consumption.set(`${text(row.id_login)}:${date(row.data)}`, row);
    const usageRows = [...consumption.values()];
    const previousUsage = usageRows.filter((row) => day(row.data) < monthStart);
    const baselineUse = previousUsage.length
      ? previousUsage.reduce((sum, row) => sum + (Number(row.consumo) || 0), 0) / previousUsage.length
      : 0;
    const currentUse = Math.max(0, ...usageRows.filter((row) => day(row.data) >= monthStart).map((row) => Number(row.consumo) || 0));
    const satisfaction = Number(text(customer.grau_satisfacao));
    if (!(satisfaction >= 1 && satisfaction <= 5)) warnings.push("Satisfação não informada; essa categoria não recebeu pontos.");
    if (sessions !== null && !sessions.length)
      warnings.push("Sem histórico Radius na janela. A conexão considera somente o estado e a última conexão dos logins ativos.");
    if (usage !== null && !baselineUse) warnings.push("Sem consumo anterior suficiente para comparar a queda de uso.");
    if (usage !== null && baselineUse && !usageRows.some((row) => day(row.data) >= monthStart))
      warnings.push("Sem consumo registrado no mês atual; o Churn compara zero com a média anterior.");
    const results = contracts
      .map((contract) => {
        const contractId = Number(contract.id);
        const overdue =
          financial?.filter(
            (row) =>
              text(row.id_contrato) === String(contractId) && ["A", "P"].includes(text(row.status)) && day(row.data_vencimento) < today
          ) ?? [];
        const recentBlock = recent(contract.dt_ult_bloq_auto) || recent(contract.dt_ult_bloq_manual);
        const context: RiskContext = {
          customerId,
          contractId,
          satisfaction: satisfaction >= 1 && satisfaction <= 5 ? satisfaction : null,
          financial: {
            overdueInvoices: overdue.length,
            maxOverdueDays: Math.max(0, ...overdue.map((row) => (today - day(row.data_vencimento)) / dayMs)),
            recentBlock,
            recentTrustUnlock: recent(contract.dt_ult_des_bloq_conf),
          },
          support: {
            tickets30d: recentTickets.length,
            recurringSubjects: [...subjects.values()].filter((count) => count >= 2).length,
            criticalTickets: tickets?.filter((row) => ["C", "CRITICO", "CRÍTICO"].includes(text(row.prioridade))).length ?? 0,
            pendingTickets: tickets?.filter((row) => ["N", "P"].includes(text(row.su_status) || text(row.status))).length ?? 0,
            slaProblems: tickets?.filter((row) => text(row.status_sla) && !["OK", "S"].includes(text(row.status_sla))).length ?? 0,
            serviceOrders30d:
              orders?.filter((row) => timestamp(row.data_abertura) >= recentStart && timestamp(row.data_abertura) <= now).length ?? 0,
          },
          network: {
            disconnects7d: sessions7.length,
            baselineDisconnects7d: baseline.length / 4,
            shortSessions7d: sessions7.filter((row) => Number(row.acctsessiontime ?? 0) < 300).length,
            offlineDays: sessions7.length || online ? 0 : offline.length ? Math.min(...offline) : 0,
            consumptionDropPercent: baselineUse > 0 ? Math.max(0, (1 - currentUse / baselineUse) * 100) : undefined,
            recurringTerminateCause: sessions7.length > 0 && (sessions ?? []).some((row) => !!text(row.acctterminatecause)),
          },
          contract: {
            fidelityDaysRemaining: Number.isFinite(day(contract.data_expiracao))
              ? (day(contract.data_expiracao) - today) / dayMs
              : undefined,
            recentBlock,
            recentSuspension: text(contract.contrato_suspenso) === "S" || recent(contract.data_inicial_suspensao),
          },
        };
        const risk = this.engine.calculate(context);
        return {
          id: contractId,
          name: text(contract.contrato) || "Plano não informado",
          ...risk,
          reasons: risk.reasons.sort((a, b) => b.points - a.points),
        };
      })
      .sort((a, b) => b.score - a.score);
    return {
      customer: { id: customerId, name: text(customer.razao) },
      queriedAt: this.now().toISOString(),
      partial: sources.some((source) => source.status === "unavailable"),
      sources,
      warnings,
      contracts: results,
      message: null,
    };
  }
}
