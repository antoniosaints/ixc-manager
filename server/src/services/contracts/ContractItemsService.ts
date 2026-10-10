import { IxcApiService, type IxcListRequest } from "../../integrations/ixc/IxcApiService.js";
import { dateOnly } from "../upgrades/UpgradeService.js";
type Row = Record<string, unknown>;
type Reader = Pick<IxcApiService, "listPage">;
type Page = { page: number; limit: number };
const text = (v: unknown) => (v == null ? null : String(v).trim() || null);
const id = (v: unknown) => (/^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const fail = (message: string, statusCode = 502) => Object.assign(new Error(message), { statusCode });
const number = (v: unknown, localized = false) => {
  let s = text(v);
  if (!s) return null;
  if (localized && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) && Number.isFinite(Number(s)) ? Number(s) : null;
};
/** Read only, request scoped. The consolidated IXC grid includes products inherited from the sales plan. */
export class ContractItemsService {
  constructor(
    private readonly api: Reader = new IxcApiService({ timeout: 10000, attempts: 1 }),
    private readonly now = () => new Date()
  ) {}
  private async read(endpoint: string, request: IxcListRequest, page: number, signal?: AbortSignal) {
    try {
      const r = await this.api.listPage<Row>(endpoint, request, page, signal);
      if (
        !Array.isArray(r.rows) ||
        !Number.isSafeInteger(r.total) ||
        r.total < r.rows.length ||
        r.rows.length > (request.rp ?? 500) ||
        r.rows.some((x) => !x || !id(x.id))
      )
        throw new Error("Invalid response");
      if (signal?.aborted) throw new Error("Aborted");
      return r;
    } catch {
      throw fail("Não foi possível consultar os itens do contrato no IXC. Tente novamente.");
    }
  }
  private async contract(contractId: number, activeOnly: boolean, signal?: AbortSignal) {
    const r = await this.read(
      "cliente_contrato",
      {
        qtype: "cliente_contrato.id",
        query: String(contractId),
        oper: "=",
        sortname: "cliente_contrato.id",
        rp: 1,
        gridParam: activeOnly ? [{ TB: "cliente_contrato.status", OP: "=", P: "A" }] : [],
      },
      1,
      signal
    );
    const c = r.rows.find((c) => id(c.id) === contractId && (!activeOnly || c.status === "A"));
    if (!c) throw fail(activeOnly ? "Contrato ativo não encontrado no IXC." : "Contrato não encontrado no IXC.", 404);
    return c;
  }
  async products(contractId: number, page: Page, activeOnly = false, signal?: AbortSignal) {
    const c = await this.contract(contractId, activeOnly, signal);
    const r = await this.read(
      "view_vd_contratos_produtos_gen",
      {
        qtype: "view_vd_contratos_produtos_gen.cliente_contrato_id",
        query: String(contractId),
        oper: "=",
        sortname: "view_vd_contratos_produtos_gen.id",
        sortorder: "asc",
        rp: page.limit,
      },
      page.page,
      signal
    );
    // This IXC view can return its grid as rows/id/cell rather than named registros.
    // Check membership against the structured source records before exposing any grid values.
    const ids = r.rows.map((x) => id(x.id)!);
    if (new Set(ids).size !== ids.length) throw fail("O IXC retornou produtos duplicados. Atualize a consulta.");
    const raw = ids.length
      ? (
          await this.read(
            "vd_contratos_produtos",
            {
              qtype: "vd_contratos_produtos.id",
              query: ids.join(","),
              oper: "IN",
              sortname: "vd_contratos_produtos.id",
              rp: ids.length,
            },
            1,
            signal
          )
        ).rows
      : [];
    const items = r.rows.map((row) => {
      const record = raw.find((x) => id(x.id) === id(row.id));
      if (
        !record ||
        (id(record.id_contrato)
          ? id(record.id_contrato) !== contractId
          : !id(c.id_vd_contrato) || id(record.id_vd_contrato) !== id(c.id_vd_contrato))
      )
        throw fail("O vínculo de um produto não corresponde ao contrato. Atualize a consulta.");
      const cell = row.cell;
      if (Array.isArray(cell) && (cell.length !== 15 || id(cell[0]) !== id(row.id)))
        throw fail("O IXC retornou uma grade de produtos incompatível. Atualize a consulta.");
      if (!Array.isArray(cell) && id(row.cliente_contrato_id) !== contractId)
        throw fail("O vínculo de um produto não corresponde ao contrato. Atualize a consulta.");
      const value = (key: string, index: number) => number(Array.isArray(cell) ? cell[index] : row[key], Array.isArray(cell));
      return {
        id: id(row.id)!,
        productId: id(record.id_produto),
        planId: id(record.id_plano),
        type: text(record.tipo),
        description: text(record.descricao) ?? text(Array.isArray(cell) ? cell[1] : row.descricao),
        source: id(record.id_contrato) ? ("contract" as const) : ("plan" as const),
        quantity: value("qtde", 4),
        unitPrice: value("valor_unit", 5),
        gross: value("valor_bruto", 6),
        discount: value("valor_desconto", 7),
        surcharge: value("valor_acrescimo", 8),
        untilDue: value("valor_ate_vencimento", 9),
        net: value("valor_liquido", 10),
        notes: text(record.obs),
      };
    });
    return { items, total: r.total, ...page, queriedAt: this.now().toISOString() };
  }
  async additionalServices(contractId: number, page: Page, activeOnly = false, signal?: AbortSignal) {
    await this.contract(contractId, activeOnly, signal);
    const r = await this.read(
      "cliente_contrato_servicos",
      {
        qtype: "cliente_contrato_servicos.id_contrato",
        query: String(contractId),
        oper: "=",
        sortname: "cliente_contrato_servicos.id",
        sortorder: "desc",
        rp: page.limit,
        gridParam: [{ TB: "cliente_contrato_servicos.tipo_acres_desc", OP: "=", P: "A" }],
      },
      page.page,
      signal
    );
    if (r.rows.some((x) => id(x.id_contrato) !== contractId || x.tipo_acres_desc !== "A"))
      throw fail("O vínculo de um serviço não corresponde ao contrato. Atualize a consulta.");
    return {
      items: r.rows.map((x) => ({
        id: id(x.id)!,
        productId: id(x.id_produto),
        description: text(x.descricao),
        type: text(x.tipo),
        quantity: number(x.quantidade),
        unitPrice: number(x.valor_unitario),
        total: number(x.valor_total),
        status: text(x.status),
        recurring: x.repetir === "S" ? true : x.repetir === "V" ? false : null,
        repetitions: number(x.repetir_qtde),
        executions: number(x.execucoes),
        date: dateOnly(x.data),
        validUntil: dateOnly(x.data_validade),
        lastExecutedAt: dateOnly(x.ultima_execucao),
      })),
      total: r.total,
      ...page,
      queriedAt: this.now().toISOString(),
    };
  }
}
