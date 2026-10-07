import { IxcReadDatabase, type IxcReadQuery } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { RetentionRepository } from "../../repositories/RetentionRepository.js";
import { addDays, referenceDate } from "../upgrades/UpgradeService.js";

/** Operational totals use IXC only; no score calculation, API pagination or writes. */
export function retentionSummarySql(today: string): IxcReadQuery {
  return {
    name: "churn-operational-summary",
    sql: `SELECT
      (SELECT COUNT(*) FROM cliente WHERE ativo='S') activeCustomers,
      (SELECT COUNT(DISTINCT cc.id_cliente) FROM cliente_contrato cc
        JOIN cliente c ON c.id=cc.id_cliente
        WHERE c.ativo='S' AND cc.status='A' AND cc.status_internet IN ('CA','CM')) blocked,
      (SELECT COUNT(*) FROM cliente_contrato
        WHERE status='I' AND data_cancelamento>=? AND data_cancelamento<?) cancellationsThisMonth`,
    params: [`${today.slice(0, 7)}-01`, addDays(today, 1)],
    timeoutSeconds: 5,
  };
}

const count = (value: unknown): number => {
  const n = Number(value);
  if (value === undefined || value === null || !Number.isSafeInteger(n) || n < 0) throw new Error("Indicador inválido");
  return n;
};
const operationalCounts = (row?: Record<string, unknown>) => ({
  activeCustomers: count(row?.activeCustomers),
  blocked: count(row?.blocked),
  cancellationsThisMonth: count(row?.cancellationsThisMonth),
});

export class RetentionSummaryService {
  constructor(
    private readonly reader: Pick<IxcReadDatabase, "select" | "close"> = new IxcReadDatabase(),
    private readonly repo: Pick<RetentionRepository, "getSummary" | "getOperationalSummary"> = new RetentionRepository(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async close() {
    await this.reader.close();
  }

  async getSummary() {
    const today = referenceDate(this.now()),
      query = retentionSummarySql(today);
    // A failure in one source must not hide valid indicators from the other.
    const [operational, risk] = await Promise.all([this.operations(query), this.risk()]);
    return {
      ...operational.counts,
      ...risk.counts,
      operationalSource: operational.source,
      operationalQueriedAt: operational.source === "database" ? this.now().toISOString() : null,
      riskSource: risk.source,
      riskCalculatedAt: risk.calculatedAt,
      referenceDate: today,
      warnings: [...operational.warnings, ...risk.warnings],
    };
  }

  private async operations(query: IxcReadQuery) {
    try {
      const [row] = await this.reader.select<Record<string, unknown>>(query);
      return { counts: operationalCounts(row), source: "database", warnings: [] as string[] };
    } catch {
      try {
        const row = await this.repo.getOperationalSummary(String(query.params[0]), String(query.params[1]));
        return {
          counts: operationalCounts(row),
          source: "synchronized",
          warnings: ["IXC indisponível: ativos, bloqueados e cancelamentos usam a última sincronização e podem estar desatualizados."],
        };
      } catch {
        return {
          counts: { activeCustomers: null, blocked: null, cancellationsThisMonth: null },
          source: "unavailable",
          warnings: ["Ativos, bloqueados e cancelamentos indisponíveis. Tente atualizar os indicadores."],
        };
      }
    }
  }

  private async risk() {
    try {
      const row = await this.repo.getSummary();
      return {
        counts: {
          lowRisk: count(row?.lowRisk),
          attention: count(row?.attention),
          medium: count(row?.medium),
          highRisk: count(row?.highRisk),
          critical: count(row?.critical),
        },
        calculatedAt: row?.riskCalculatedAt instanceof Date ? row.riskCalculatedAt.toISOString() : (row?.riskCalculatedAt ?? null),
        source: "synchronized",
        warnings: [] as string[],
      };
    } catch {
      return {
        counts: { lowRisk: null, attention: null, medium: null, highRisk: null, critical: null },
        calculatedAt: null,
        source: "unavailable",
        warnings: ["Indicadores de risco indisponíveis. A consulta de ativos, bloqueados e cancelamentos é independente."],
      };
    }
  }
}
