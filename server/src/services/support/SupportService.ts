import { IxcApiService, type IxcListRequest } from "../../integrations/ixc/IxcApiService.js";
import { contactNumbers, loginDetails } from "../upgrades/UpgradeDetails.js";
import { UpgradeService, dateOnly } from "../upgrades/UpgradeService.js";
import { LoginNetworkService } from "../upgrades/LoginNetworkService.js";

type Row = Record<string, unknown>;
type Reader = Pick<IxcApiService, "listPage">;
export interface SupportPage {
  page: number;
  limit: number;
}
export interface CustomerQuery extends SupportPage {
  status: "active" | "inactive" | "all";
  search: string;
  searchBy: "name" | "id" | "login" | "document" | "address";
}
const text = (value: unknown) => (value == null ? "" : String(value).trim());
const nullable = (value: unknown) => text(value) || null;
const id = (value: unknown): number | null =>
  /^\d+$/.test(text(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const flag = (value: unknown) => (text(value) === "S" ? true : text(value) === "N" ? false : null);
const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

/** Request-scoped IXC queries only: no persistence, queues or customer cache. */
export class SupportService {
  readonly technical: UpgradeService;
  constructor(
    private readonly ixc: Reader = new IxcApiService({ timeout: 10_000, attempts: 2 }),
    private readonly now = () => new Date(),
    private readonly network = new LoginNetworkService()
  ) {
    this.technical = new UpgradeService(ixc, now, { activeOnly: false }, network);
  }
  async close() {
    await this.technical.close();
  }
  private async read(endpoint: string, request: IxcListRequest, page = 1) {
    try {
      const result = await this.ixc.listPage<Row>(endpoint, request, page);
      if (
        !Array.isArray(result.rows) ||
        !Number.isSafeInteger(result.total) ||
        result.total < result.rows.length ||
        result.rows.some((row) => !row || typeof row !== "object" || Array.isArray(row) || !id(row.id))
      )
        throw new Error("Invalid response");
      return result;
    } catch {
      throw fail("Não foi possível consultar o IXC agora. Tente atualizar a consulta.", 502);
    }
  }
  private async cities(rows: Row[]) {
    const ids = [...new Set(rows.map((row) => id(row.cidade)).filter((value): value is number => value !== null))];
    if (!ids.length) return new Map<number, string>();
    const result = await this.read("cidade", {
      qtype: "cidade.id",
      query: ids.join(","),
      oper: "IN",
      sortname: "cidade.id",
      rp: ids.length,
    });
    return new Map(result.rows.filter((row) => ids.includes(id(row.id)!)).map((row) => [id(row.id)!, text(row.nome)]));
  }
  private customerDto(row: Row, cities: Map<number, string>) {
    return {
      id: id(row.id)!,
      name: text(row.razao) || "Nome não informado",
      active: flag(row.ativo),
      document: nullable(row.cnpj_cpf),
      phone: nullable(row.telefone_celular) ?? nullable(row.fone),
      city: cities.get(id(row.cidade)!) || null,
      neighborhood: nullable(row.bairro),
      address: [row.endereco, row.numero, row.complemento].map(text).filter(Boolean).join(", ") || null,
    };
  }
  private page<T>(items: T[], total: number, query: SupportPage) {
    return { items, total, ...query, queriedAt: this.now().toISOString() };
  }
  private async customerRow(customerId: number) {
    const { rows } = await this.read("cliente", {
      qtype: "cliente.id",
      query: String(customerId),
      oper: "=",
      sortname: "cliente.id",
      rp: 1,
    });
    const row = rows.find((row) => id(row.id) === customerId);
    if (!row) throw fail("Cliente não encontrado no IXC.", 404);
    return row;
  }
  private async customerIdsByLogin(search: string) {
    const customerIds = new Set<number>();
    const seen = new Set<number>();
    for (let page = 1; page <= 10; page++) {
      const { rows, total } = await this.read(
        "radusuarios",
        {
          qtype: "radusuarios.login",
          query: search,
          oper: "L",
          sortname: "radusuarios.id",
          rp: 500,
        },
        page
      );
      if (total > 5000) throw fail("Muitos logins encontrados. Digite uma parte maior do login para refinar a busca.", 400);
      for (const row of rows) {
        if (!text(row.login).toLocaleLowerCase().includes(search.toLocaleLowerCase()) || seen.has(id(row.id)!))
          throw fail("A resposta do IXC não corresponde à busca por login. Atualize a consulta.", 502);
        seen.add(id(row.id)!);
        const customerId = id(row.id_cliente);
        if (customerId) customerIds.add(customerId);
      }
      if (seen.size >= total) return [...customerIds];
      if (rows.length !== 500) break;
    }
    throw fail("Não foi possível concluir a busca por login no IXC. Atualize a consulta.", 502);
  }
  private async customerIdsByDocument(search: string) {
    if (!/^[\d.\-/\s]+$/.test(search)) throw fail("Informe o CPF ou CNPJ completo, com ou sem pontuação.", 400);
    const digits = search.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) throw fail("Informe o CPF ou CNPJ completo, com ou sem pontuação.", 400);
    const formatted =
      digits.length === 11
        ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
        : digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    const customerIds = new Set<number>();
    for (const term of [formatted, digits]) {
      const { rows, total } = await this.read("cliente", {
        qtype: "cliente.cnpj_cpf",
        query: term,
        oper: "=",
        sortname: "cliente.id",
        rp: 500,
      });
      if (total > rows.length || rows.some((row) => text(row.cnpj_cpf).replace(/\D/g, "") !== digits))
        throw fail("A resposta do IXC não corresponde à busca por CPF/CNPJ. Atualize a consulta.", 502);
      for (const row of rows) customerIds.add(id(row.id)!);
    }
    return [...customerIds];
  }
  async customers(query: CustomerQuery) {
    const grid: NonNullable<IxcListRequest["gridParam"]> = [];
    if (query.status !== "all") grid.push({ TB: "cliente.ativo", OP: "=", P: query.status === "active" ? "S" : "N" });
    if (query.search && query.searchBy === "name" && query.search.length < 3)
      throw fail("Digite ao menos 3 caracteres para buscar pelo nome.", 400);
    if (query.search && query.searchBy === "id" && !id(query.search)) throw fail("Informe um ID de cliente válido.", 400);
    if (query.search && ["login", "address"].includes(query.searchBy) && query.search.length < 3)
      throw fail(`Digite ao menos 3 caracteres para buscar por ${query.searchBy === "login" ? "login" : "endereço"}.`, 400);
    const customerIds =
      query.search && query.searchBy === "login"
        ? await this.customerIdsByLogin(query.search)
        : query.search && query.searchBy === "document"
          ? await this.customerIdsByDocument(query.search)
          : null;
    if (customerIds && !customerIds.length) return this.page([], 0, { page: query.page, limit: query.limit });
    const field = query.searchBy === "id" ? "id" : query.searchBy === "address" ? "endereco" : "razao";
    const { rows, total } = await this.read(
      "cliente",
      {
        qtype: customerIds || !query.search ? "cliente.id" : `cliente.${field}`,
        query: customerIds ? customerIds.join(",") : query.search || "0",
        oper: customerIds ? "IN" : query.search ? (query.searchBy === "id" ? "=" : "L") : ">",
        gridParam: grid,
        sortname: "cliente.razao",
        rp: query.limit,
      },
      query.page
    );
    if (
      rows.some(
        (row) =>
          (query.status !== "all" && flag(row.ativo) !== (query.status === "active")) ||
          (customerIds !== null && !customerIds.includes(id(row.id)!)) ||
          (query.searchBy === "id" && query.search && id(row.id) !== id(query.search))
      )
    )
      throw fail("A resposta do IXC não corresponde aos filtros. Atualize a consulta.", 502);
    const cities = await this.cities(rows);
    return this.page(
      rows.map((row) => this.customerDto(row, cities)),
      total,
      { page: query.page, limit: query.limit }
    );
  }
  async customer(customerId: number) {
    const row = await this.customerRow(customerId);
    return {
      customer: {
        ...this.customerDto(row, await this.cities([row])),
        email: nullable(row.email),
        contactName: nullable(row.contato),
        zip: nullable(row.cep),
        reference: nullable(row.referencia),
        contacts: contactNumbers({}, row),
        notes: [
          { label: "Alerta", content: text(row.alerta) },
          { label: "Observações", content: text(row.obs) },
        ].filter((note) => note.content),
      },
      queriedAt: this.now().toISOString(),
    };
  }
  private async owned(customerId: number, endpoint: string, query: SupportPage) {
    await this.customerRow(customerId);
    const result = await this.read(
      endpoint,
      {
        qtype: `${endpoint}.id_cliente`,
        query: String(customerId),
        oper: "=",
        sortname: `${endpoint}.id`,
        sortorder: "desc",
        rp: query.limit,
      },
      query.page
    );
    if (result.rows.some((row) => id(row.id_cliente) !== customerId))
      throw fail("O IXC retornou registros de outro cliente. Atualize a consulta.", 502);
    return result;
  }
  async contracts(customerId: number, query: SupportPage) {
    const { rows, total } = await this.owned(customerId, "cliente_contrato", query);
    return this.page(
      rows.map((row) => ({
        id: id(row.id)!,
        customerId,
        name: text(row.contrato) || "Plano não informado",
        status: text(row.status),
        internetStatus: text(row.status_internet),
        branchId: id(row.id_filial),
        activatedAt: dateOnly(row.data_ativacao),
        expiresAt: dateOnly(row.data_expiracao),
        address: [row.endereco, row.numero].map(text).filter(Boolean).join(", ") || null,
      })),
      total,
      query
    );
  }
  async logins(customerId: number, query: SupportPage, allowAccess: boolean) {
    const { rows, total } = await this.owned(customerId, "radusuarios", query);
    return this.page(await this.network.enrich(rows.map((row) => loginDetails(row, allowAccess))), total, query);
  }
  async cases(customerId: number, kind: "orders" | "tickets", query: SupportPage) {
    const endpoint = kind === "orders" ? "su_oss_chamado" : "su_ticket";
    const { rows, total } = await this.owned(customerId, endpoint, query);
    // OS/tickets return id_assunto; the name belongs to the separate IXC subject catalogue.
    const subjectIds = [...new Set(rows.map((row) => id(row.id_assunto)).filter((value): value is number => value !== null))];
    const subjects = new Map<number, string>();
    if (subjectIds.length) {
      const result = await this.read("su_oss_assunto", {
        qtype: "su_oss_assunto.id",
        query: subjectIds.join(","),
        oper: "IN",
        sortname: "su_oss_assunto.id",
        rp: subjectIds.length,
      });
      for (const row of result.rows) if (subjectIds.includes(id(row.id)!)) subjects.set(id(row.id)!, text(row.assunto));
    }
    return this.page(
      rows.map((row) => ({
        id: id(row.id)!,
        protocol: nullable(row.protocolo),
        contractId: id(kind === "orders" ? row.id_contrato_kit : row.id_contrato),
        loginId: id(row.id_login),
        subjectId: id(row.id_assunto),
        subjectName: subjects.get(id(row.id_assunto)!) || null,
        title: nullable(row.titulo) ?? nullable(row.assunto),
        status: text(kind === "orders" ? row.status : row.su_status || row.status),
        priority: nullable(row.prioridade),
        openedAt: nullable(kind === "orders" ? row.data_abertura : row.data_criacao),
        scheduledAt: kind === "orders" ? nullable(row.data_agenda) : null,
        closedAt: kind === "orders" ? nullable(row.data_fechamento || row.data_final) : null,
        updatedAt: kind === "tickets" ? nullable(row.data_ultima_alteracao) : null,
        message: nullable(kind === "orders" ? row.mensagem : row.menssagem),
        response: kind === "orders" ? nullable(row.mensagem_resposta) : null,
      })),
      total,
      query
    );
  }
  async comodato(contractId: number, query: SupportPage) {
    await this.technical.contract(contractId);
    const { rows, total } = await this.read(
      "cliente_contrato_comodato",
      {
        qtype: "movimento_produtos.id_contrato",
        query: String(contractId),
        oper: "=",
        sortname: "movimento_produtos.id",
        sortorder: "desc",
        rp: query.limit,
      },
      query.page
    );
    if (rows.some((row) => id(row.id_contrato) !== contractId))
      throw fail("O IXC retornou comodatos de outro contrato. Atualize a consulta.", 502);
    const assetIds = [
      ...new Set(
        rows
          .filter((row) => !nullable(row.numero_serie) || !nullable(row.mac) || !nullable(row.descricao))
          .map((row) => id(row.id_patrimonio))
          .filter((value): value is number => value !== null)
      ),
    ];
    const assets = new Map<number, Row>();
    if (assetIds.length) {
      const result = await this.read("patrimonio", {
        qtype: "patrimonio.id",
        query: assetIds.join(","),
        oper: "IN",
        sortname: "patrimonio.id",
        rp: assetIds.length,
      });
      for (const row of result.rows) if (assetIds.includes(id(row.id)!)) assets.set(id(row.id)!, row);
    }
    return this.page(
      rows.map((row) => ({
        id: id(row.id)!,
        contractId,
        loginId: id(row.id_login),
        productId: id(row.id_produto),
        description: nullable(row.descricao) ?? nullable(assets.get(id(row.id_patrimonio)!)?.descricao),
        status: nullable(row.status_comodato),
        movement: nullable(row.tipo),
        date: dateOnly(row.data),
        quantity: Number.isFinite(Number(row.quantidade)) && text(row.quantidade) !== "" ? Number(row.quantidade) : null,
        assetId: id(row.id_patrimonio),
        assetNumber: nullable(row.numero_patrimonial) ?? nullable(row.patrimonio),
        serial:
          nullable(row.numero_serie) ??
          nullable(assets.get(id(row.id_patrimonio)!)?.serial) ??
          nullable(assets.get(id(row.id_patrimonio)!)?.serial_fornecedor),
        mac: nullable(row.mac) ?? nullable(assets.get(id(row.id_patrimonio)!)?.id_mac),
        returnId: id(row.id_devolucao),
      })),
      total,
      query
    );
  }
}
