import { contractExtras, equipmentTarget, loginDetails, secretFields, type SecretField } from "./UpgradeDetails.js";
import { IxcApiService, type IxcListRequest } from "../../integrations/ixc/IxcApiService.js";

type Row = Record<string, unknown>;
type Reader = Pick<IxcApiService, "listPage">;
type Grid = NonNullable<IxcListRequest["gridParam"]>;
export interface UpgradeQuery {
  status: "eligible" | "expired" | "expiring" | "missing";
  days: number;
  search: string;
  searchBy: "name" | "customerId" | "contractId";
  plan: string;
  planId?: number;
  branchId?: number;
  page: number;
  limit: number;
}
export interface UpgradeDistribution {
  includeNotes?: boolean;
  peopleCount: number;
  clientsPerPerson: number;
  names: string[];
  contractIds?: number[];
}

const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
const str = (value: unknown): string => (value === null || value === undefined ? "" : String(value).trim());
const positiveId = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const months = (value: unknown): number | null => {
  const raw = str(value);
  return /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
};

export function dateOnly(value: unknown): string | null {
  const raw = str(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/.exec(raw);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const date = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : br ? `${br[3]}-${br[2]}-${br[1]}` : "";
  if (!date || date.startsWith("0000")) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

export function referenceDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}
export function permanence(expiration: unknown, today: string) {
  const expiresAt = dateOnly(expiration);
  const daysRemaining = expiresAt
    ? Math.round((Date.parse(`${expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
    : null;
  return {
    expiresAt,
    daysRemaining,
    permanenceStatus: daysRemaining === null ? "missing" : daysRemaining < 0 ? "expired" : daysRemaining === 0 ? "today" : "expiring",
  };
}

export function expirationFilters(status: UpgradeQuery["status"], days: number, today: string): Grid {
  if (status === "missing") return [{ TB: "cliente_contrato.data_expiracao", OP: "=", P: "0000-00-00" }];
  const filters: Grid = [{ TB: "cliente_contrato.data_expiracao", OP: ">", P: "0000-00-00" }];
  if (status === "expired") filters.push({ TB: "cliente_contrato.data_expiracao", OP: "<", P: today });
  else {
    if (status === "expiring") filters.push({ TB: "cliente_contrato.data_expiracao", OP: ">=", P: today });
    filters.push({ TB: "cliente_contrato.data_expiracao", OP: "<=", P: addDays(today, days) });
  }
  return filters;
}

/** Upgrades reads IXC for each request. No repository, queue or persistent cache. */
export class UpgradeService {
  constructor(
    private readonly ixc: Reader = new IxcApiService({ timeout: 10_000, attempts: 2 }),
    private readonly now: () => Date = () => new Date(),
    private readonly options: { activeOnly?: boolean } = {}
  ) {}

  private async read(endpoint: string, request: IxcListRequest, page = 1) {
    try {
      const result = await this.ixc.listPage<Row>(endpoint, request, page);
      if (!Number.isSafeInteger(result.total) || result.total < 0 || !Array.isArray(result.rows)) throw new Error("Invalid IXC response");
      return result;
    } catch {
      // Never expose/log upstream payloads, credentials or Axios request config.
      throw fail("Não foi possível consultar o IXC agora. Tente atualizar a consulta.", 502);
    }
  }

  private async byIds(endpoint: string, ids: unknown[]) {
    const unique = [...new Set(ids.map(positiveId).filter((id): id is number => id !== null))];
    if (!unique.length) return new Map<string, Row>();
    const { rows } = await this.read(endpoint, {
      qtype: `${endpoint}.id`,
      query: unique.join(","),
      oper: "IN",
      sortname: `${endpoint}.id`,
      rp: unique.length,
    });
    return new Map(rows.map((row) => [str(row.id), row]));
  }

  private async commonFilters(query: UpgradeQuery): Promise<Grid | null> {
    const grid: Grid = [];
    if (query.plan) {
      const plans = await this.read("vd_contratos", {
        qtype: "vd_contratos.nome",
        query: query.plan,
        oper: "L",
        sortname: "vd_contratos.id",
        sortorder: "desc",
        rp: 200,
      });
      if (plans.total > 200) throw fail("A busca encontrou muitos planos. Informe um nome mais específico.", 422);
      const ids = plans.rows.map((row) => positiveId(row.id)).filter((id): id is number => id !== null);
      if (!ids.length) return null;
      grid.push({ TB: "cliente_contrato.id_vd_contrato", OP: "IN", P: ids.join(",") });
    }
    if (query.planId) grid.push({ TB: "cliente_contrato.id_vd_contrato", OP: "=", P: String(query.planId) });
    if (query.branchId) grid.push({ TB: "cliente_contrato.id_filial", OP: "=", P: String(query.branchId) });
    if (query.search) {
      if (query.searchBy === "name") {
        if (query.search.length < 3) throw fail("Digite ao menos 3 caracteres para buscar pelo nome.", 400);
        const result = await this.read("cliente", {
          qtype: "cliente.razao",
          query: query.search,
          oper: "L",
          sortname: "cliente.id",
          rp: 200,
        });
        if (result.total > 200) throw fail("A busca encontrou muitos clientes. Informe um nome mais específico.", 422);
        const ids = result.rows.map((row) => positiveId(row.id)).filter((id): id is number => id !== null);
        if (!ids.length) return null;
        grid.push({ TB: "cliente_contrato.id_cliente", OP: "IN", P: ids.join(",") });
      } else {
        if (!/^\d+$/.test(query.search) || !positiveId(query.search)) throw fail("Informe um ID válido para a busca.", 400);
        grid.push({
          TB: query.searchBy === "customerId" ? "cliente_contrato.id_cliente" : "cliente_contrato.id",
          OP: "=",
          P: query.search,
        });
      }
    }
    return grid;
  }

  private contractRequest(grid: Grid, limit: number): IxcListRequest {
    return {
      qtype: "cliente_contrato.status",
      query: "A",
      oper: "=",
      gridParam: grid,
      sortname: "cliente_contrato.data_expiracao",
      sortorder: "asc",
      rp: limit,
    };
  }

  private async enrich(contracts: Row[], today: string, details = false) {
    const customers = await this.byIds(
      "cliente",
      contracts.map((row) => row.id_cliente)
    );
    const addressFor = (contract: Row) =>
      str(contract.endereco_padrao_cliente) === "S" ? (customers.get(str(contract.id_cliente)) ?? {}) : contract;
    const cities = await this.byIds(
      "cidade",
      contracts.map((row) => addressFor(row).cidade)
    );
    return contracts.map((contract) => {
      const customer = customers.get(str(contract.id_cliente));
      const address = addressFor(contract);
      return {
        ...(details ? contractExtras(contract, customer ?? {}) : {}),
        contractId: positiveId(contract.id),
        customerId: positiveId(contract.id_cliente),
        customerName: str(customer?.razao) || `Cliente #${str(contract.id_cliente)}`,
        customerAvailable: Boolean(customer),
        customerActive: customer ? str(customer.ativo) === "S" : null,
        planId: positiveId(contract.id_vd_contrato),
        planName: str(contract.contrato) || "Plano não informado",
        branchId: positiveId(contract.id_filial),
        contractStatus: str(contract.status),
        internetStatus: str(contract.status_internet),
        suspended: str(contract.contrato_suspenso) === "S",
        fidelityMonths: months(contract.fidelidade),
        ...permanence(contract.data_expiracao, today),
        activatedAt: dateOnly(contract.data_ativacao),
        signedAt: dateOnly(contract.data_assinatura),
        renewedAt: dateOnly(contract.data_renovacao),
        phone: str(customer?.telefone_celular) || str(customer?.fone) || str(customer?.telefone_comercial) || null,
        whatsapp: str(customer?.whatsapp) || null,
        city: str(cities.get(str(address.cidade))?.nome) || null,
        neighborhood: str(address.bairro) || null,
        address: [address.endereco, address.numero, address.complemento].map(str).filter(Boolean).join(", ") || null,
      };
    });
  }

  async opportunities(query: UpgradeQuery) {
    const today = referenceDate(this.now());
    const common = await this.commonFilters(query);
    if (common === null)
      return { items: [], total: 0, page: query.page, limit: query.limit, referenceDate: today, queriedAt: this.now().toISOString() };
    const result = await this.read(
      "cliente_contrato",
      this.contractRequest([...common, ...expirationFilters(query.status, query.days, today)], query.limit),
      query.page
    );
    return {
      items: await this.enrich(result.rows, today),
      total: result.total,
      page: query.page,
      limit: query.limit,
      referenceDate: today,
      queriedAt: this.now().toISOString(),
    };
  }

  async summary(query: UpgradeQuery) {
    const today = referenceDate(this.now());
    const common = await this.commonFilters(query);
    const groups = [
      { key: "expired", status: "expired", days: 30 },
      { key: "next30", status: "expiring", days: 30 },
      { key: "next60", status: "expiring", days: 60 },
      { key: "next90", status: "expiring", days: 90 },
      { key: "missing", status: "missing", days: 30 },
    ] as const;
    const values = await Promise.all(
      groups.map(
        async (group) =>
          [
            group.key,
            common === null
              ? 0
              : (
                  await this.read(
                    "cliente_contrato",
                    this.contractRequest([...common, ...expirationFilters(group.status, group.days, today)], 1)
                  )
                ).total,
          ] as const
      )
    );
    return { counts: Object.fromEntries(values), referenceDate: today, queriedAt: this.now().toISOString() };
  }

  /** Re-read the filtered list, independently of screen pagination. Keep only request-local data. */
  async distribution(query: UpgradeQuery, options: UpgradeDistribution) {
    const needed = options.peopleCount * options.clientsPerPerson;
    if (
      !Number.isInteger(options.peopleCount) ||
      options.peopleCount < 1 ||
      options.peopleCount > 20 ||
      !Number.isInteger(options.clientsPerPerson) ||
      options.clientsPerPerson < 1 ||
      options.clientsPerPerson > 20 ||
      needed > 200
    )
      throw fail("Use até 20 pessoas, 20 clientes por pessoa e 200 clientes por PDF.", 400);
    const today = referenceDate(this.now());
    const common = await this.commonFilters(query);
    const picked: Row[] = [];
    const customers = new Set<number>();
    const selected = options.contractIds ? [...new Set(options.contractIds)] : undefined;
    if (selected && (!selected.length || selected.length > 200 || selected.some((id) => !positiveId(id))))
      throw fail("Selecione de 1 a 200 contratos válidos.", 400);
    const grid = [...(common ?? []), ...expirationFilters(query.status, query.days, today)];
    if (selected) grid.push({ TB: "cliente_contrato.id", OP: "IN", P: selected.join(",") });
    // Bound live work; do not download the whole customer base to produce a small work list.
    if (common !== null) {
      for (let page = 1; page <= 20 && picked.length < needed; page++) {
        const result = await this.read("cliente_contrato", this.contractRequest(grid, 100), page);
        for (const row of result.rows) {
          const customerId = positiveId(row.id_cliente);
          const contractId = positiveId(row.id);
          if (!customerId || !contractId || customers.has(customerId) || (selected && !selected.includes(contractId))) continue;
          customers.add(customerId);
          picked.push(row);
          if (picked.length === needed) break;
        }
        if (!result.rows.length || page * 100 >= result.total) break;
        if (page === 20 && picked.length < needed)
          throw fail("Há muitos contratos repetidos por cliente. Restrinja os filtros ou reduza a quantidade para exportar.", 422);
      }
    }
    if (picked.length < needed)
      throw fail(
        `São necessários ${needed} clientes distintos, mas a consulta encontrou ${picked.length}. Reduza a quantidade ou amplie a lista.`,
        409
      );
    const items = await this.enrich(picked, today);
    if (items.some((item) => !item.customerAvailable))
      throw fail("O IXC não retornou todos os cadastros de clientes. Atualize a consulta antes de exportar.", 409);
    return {
      groups: Array.from({ length: options.peopleCount }, (_, index) => ({
        name: options.names[index]?.trim() || `Responsável ${index + 1}`,
        items: items.slice(index * options.clientsPerPerson, (index + 1) * options.clientsPerPerson),
      })),
      queriedAt: this.now().toISOString(),
      referenceDate: today,
      query,
      selected: Boolean(selected),
      includeNotes: options.includeNotes ?? true,
    };
  }

  private async contractRow(id: number) {
    const { rows } = await this.read("cliente_contrato", {
      qtype: "cliente_contrato.id",
      query: String(id),
      oper: "=",
      sortname: "cliente_contrato.id",
      rp: 1,
      gridParam: this.options.activeOnly === false ? [] : [{ TB: "cliente_contrato.status", OP: "=", P: "A" }],
    });
    const row = rows.find((row) => positiveId(row.id) === id && (this.options.activeOnly === false || str(row.status) === "A"));
    if (!row)
      throw fail(this.options.activeOnly === false ? "Contrato não encontrado no IXC." : "Contrato ativo não encontrado no IXC.", 404);
    return row;
  }
  async contract(id: number) {
    const today = referenceDate(this.now()),
      row = await this.contractRow(id);
    const [contract] = await this.enrich([row], today, true);
    return { contract, referenceDate: today, queriedAt: this.now().toISOString() };
  }
  async logins(id: number, query: { page: number; limit: number }, allowAccess = false) {
    const contract = await this.contractRow(id);
    const { rows, total } = await this.read(
      "radusuarios",
      {
        qtype: "radusuarios.id_contrato",
        query: String(id),
        oper: "=",
        sortname: "radusuarios.id",
        rp: query.limit,
        gridParam: [{ TB: "radusuarios.id_cliente", OP: "=", P: str(contract.id_cliente) }],
      },
      query.page
    );
    const owned = rows.filter(
      (row) => positiveId(row.id) && positiveId(row.id_contrato) === id && str(row.id_cliente) === str(contract.id_cliente)
    );
    if (owned.length !== rows.length) throw fail("O IXC retornou logins que não correspondem a este contrato. Atualize a consulta.", 502);
    return {
      items: owned.map((row) => loginDetails(row, allowAccess)),
      total,
      page: query.page,
      limit: query.limit,
      queriedAt: this.now().toISOString(),
    };
  }
  private async loginRow(id: number, loginId: number) {
    const contract = await this.contractRow(id);
    const { rows } = await this.read("radusuarios", {
      qtype: "radusuarios.id",
      query: String(loginId),
      oper: "=",
      sortname: "radusuarios.id",
      rp: 1,
      gridParam: [
        { TB: "radusuarios.id_contrato", OP: "=", P: String(id) },
        { TB: "radusuarios.id_cliente", OP: "=", P: str(contract.id_cliente) },
      ],
    });
    const row = rows.find(
      (row) => positiveId(row.id) === loginId && positiveId(row.id_contrato) === id && str(row.id_cliente) === str(contract.id_cliente)
    );
    if (!row) throw fail("Login não encontrado neste contrato.", 404);
    return row;
  }
  async login(id: number, loginId: number, allowAccess = false) {
    return { login: loginDetails(await this.loginRow(id, loginId), allowAccess), queriedAt: this.now().toISOString() };
  }
  async loginAccess(id: number, loginId: number, protocol: "http" | "https", port: 80 | 7000 | 7001) {
    const row = await this.loginRow(id, loginId);
    const target = equipmentTarget("Roteador 1", row.ip, port, protocol);
    if (!target.url) throw fail("O login não possui um IP válido para acesso ao equipamento.", 422);
    const password = row.senha_router1;
    if (password == null || String(password).trim() === "") throw fail("Senha do roteador 1 não informada no IXC.", 422);
    return { url: target.url, password: String(password), queriedAt: this.now().toISOString() };
  }
  async loginSecret(id: number, loginId: number, field: SecretField) {
    const row = await this.loginRow(id, loginId);
    // Only the requested credential is exposed. MD5 hashes and upstream records are never returned.
    const value = row[secretFields[field].field];
    return { value: value == null || String(value).trim() === "" ? null : String(value), queriedAt: this.now().toISOString() };
  }

  async plans(query: { search: string; page: number; limit: number }) {
    const { rows, total } = await this.read(
      "vd_contratos",
      {
        qtype: "vd_contratos.ativo",
        query: "S",
        oper: "=",
        sortname: "vd_contratos.id",
        sortorder: "desc",
        rp: query.limit,
        gridParam: query.search ? [{ TB: "vd_contratos.nome", OP: "L", P: query.search }] : [],
      },
      query.page
    );
    return {
      items: rows.map((row) => ({
        id: positiveId(row.id),
        name: str(row.nome),
        description: str(row.descricao) || null,
        fidelityMonths: months(row.fidelidade),
        branchId: positiveId(row.id_filial),
        value: str(row.valor_contrato) !== "" && Number.isFinite(Number(row.valor_contrato)) ? Number(row.valor_contrato) : null,
      })),
      total,
      page: query.page,
      limit: query.limit,
      queriedAt: this.now().toISOString(),
    };
  }
}
