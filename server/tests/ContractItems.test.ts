import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { ContractItemsService } from "../src/services/contracts/ContractItemsService.js";
import type { IxcApiService } from "../src/integrations/ixc/IxcApiService.js";
import { AuthService } from "../src/services/AuthService.js";
import { supportRoutes } from "../src/controllers/supportController.js";
import { upgradeRoutes } from "../src/controllers/upgradeController.js";
afterEach(() => vi.restoreAllMocks());
const contract = { id: "10", id_cliente: "20", id_vd_contrato: "50", status: "A" };
const planProduct = {
  id: "100",
  id_contrato: "0",
  id_vd_contrato: "50",
  id_produto: "5",
  id_plano: "8",
  tipo: "I",
  descricao: "Fibra",
  obs: "Observação",
  senha: "PRIVATE_SECRET",
};
const ownProduct = { ...planProduct, id: "101", id_contrato: "10", id_vd_contrato: "0", descricao: "TV", tipo: "TV" };
const grid = (product = planProduct) => ({
  id: product.id,
  cell: [
    product.id,
    product.descricao,
    "Plano",
    product.tipo,
    "2",
    "1.234,56",
    "2.469,12",
    "10,00",
    "5,00",
    "2.459,12",
    "2.464,12",
    product.id_contrato === "0" ? "Plano" : "Contrato",
    product.id_vd_contrato,
    "",
    product.id_contrato,
  ],
});
const serviceRow = {
  id: "200",
  id_contrato: "10",
  tipo_acres_desc: "A",
  tipo: "S",
  id_produto: "6",
  descricao: "IP adicional",
  status: "A",
  quantidade: "1.50",
  valor_unitario: "10.00",
  valor_total: "15.00",
  repetir: "S",
  repetir_qtde: "0",
  execucoes: "2",
  data: "2026-10-01",
  data_validade: "0000-00-00",
  ultima_execucao: "2026-10-05 12:00:00",
  senha: "PRIVATE_SECRET",
};
function fixture(overrides: Record<string, unknown[]> = {}) {
  const rows: Record<string, unknown[]> = {
    cliente_contrato: [contract],
    view_vd_contratos_produtos_gen: [grid(), grid(ownProduct)],
    vd_contratos_produtos: [planProduct, ownProduct],
    cliente_contrato_servicos: [serviceRow],
    ...overrides,
  };
  const listPage = vi.fn(async (endpoint: string) => ({ rows: rows[endpoint] ?? [], total: (rows[endpoint] ?? []).length }));
  const service = new ContractItemsService(
    { listPage } as unknown as Pick<IxcApiService, "listPage">,
    () => new Date("2026-10-10T12:00:00Z")
  );
  return { service, listPage };
}
describe("Produtos e serviços adicionais dos contratos", () => {
  it("maps consolidated grid values, includes plan and contract products and validates structured membership", async () => {
    const { service, listPage } = fixture();
    const signal = new AbortController().signal;
    const result = await service.products(10, { page: 2, limit: 10 }, false, signal);
    expect(result.items[0]).toMatchObject({
      id: 100,
      source: "plan",
      quantity: 2,
      unitPrice: 1234.56,
      gross: 2469.12,
      discount: 10,
      surcharge: 5,
      untilDue: 2459.12,
      net: 2464.12,
    });
    expect(result.items[1]).toMatchObject({ id: 101, source: "contract", type: "TV" });
    expect(result).toMatchObject({ page: 2, limit: 10, total: 2, queriedAt: "2026-10-10T12:00:00.000Z" });
    expect(listPage).toHaveBeenNthCalledWith(
      2,
      "view_vd_contratos_produtos_gen",
      expect.objectContaining({ query: "10", qtype: "view_vd_contratos_produtos_gen.cliente_contrato_id", rp: 10 }),
      2,
      signal
    );
    expect(listPage).toHaveBeenNthCalledWith(
      3,
      "vd_contratos_produtos",
      expect.objectContaining({ query: "100,101", oper: "IN", rp: 2 }),
      1,
      signal
    );
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SECRET");
  });
  it("supports named view records and preserves missing values without guessing totals", async () => {
    const { service } = fixture({
      view_vd_contratos_produtos_gen: [{ id: "100", cliente_contrato_id: "10", qtde: "1", valor_unit: "0.000000000", valor_liquido: "" }],
      vd_contratos_produtos: [planProduct],
    });
    expect((await service.products(10, { page: 1, limit: 25 })).items[0]).toMatchObject({
      quantity: 1,
      unitPrice: 0,
      gross: null,
      net: null,
    });
    const empty = fixture({ view_vd_contratos_produtos_gen: [] });
    expect((await empty.service.products(10, { page: 1, limit: 10 })).total).toBe(0);
    expect(empty.listPage).toHaveBeenCalledTimes(2);
  });
  it("refuses foreign, missing, duplicated and malformed product links and grids", async () => {
    for (const overrides of [
      { vd_contratos_produtos: [{ ...planProduct, id_vd_contrato: "999" }, ownProduct] },
      { vd_contratos_produtos: [planProduct, { ...ownProduct, id_contrato: "999" }] },
      { vd_contratos_produtos: [] },
      { view_vd_contratos_produtos_gen: [grid(), grid()] },
      { view_vd_contratos_produtos_gen: [{ id: "100", cell: ["100", "Incomplete"] }] },
      { view_vd_contratos_produtos_gen: [{ id: "100", cliente_contrato_id: "999" }] },
    ])
      await expect(fixture(overrides).service.products(10, { page: 1, limit: 10 })).rejects.toMatchObject({ statusCode: 502 });
  });
  it("filters additions by contract and A, includes inactive history and normalizes numbers/dates", async () => {
    const { service, listPage } = fixture({
      cliente_contrato_servicos: [
        serviceRow,
        { ...serviceRow, id: "201", status: "I", repetir: "V", repetir_qtde: "3", data: "01/10/2026", ultima_execucao: "" },
      ],
    });
    const r = await service.additionalServices(10, { page: 1, limit: 25 });
    expect(r.items[0]).toMatchObject({
      quantity: 1.5,
      unitPrice: 10,
      total: 15,
      recurring: true,
      status: "A",
      date: "2026-10-01",
      validUntil: null,
      lastExecutedAt: "2026-10-05",
    });
    expect(r.items[1]).toMatchObject({ recurring: false, repetitions: 3, status: "I", lastExecutedAt: null });
    expect(listPage).toHaveBeenLastCalledWith(
      "cliente_contrato_servicos",
      expect.objectContaining({
        qtype: "cliente_contrato_servicos.id_contrato",
        query: "10",
        gridParam: [{ TB: "cliente_contrato_servicos.tipo_acres_desc", OP: "=", P: "A" }],
      }),
      1,
      undefined
    );
    expect(JSON.stringify(r)).not.toContain("PRIVATE_SECRET");
    for (const row of [
      { ...serviceRow, id_contrato: "999" },
      { ...serviceRow, tipo_acres_desc: "D" },
    ])
      await expect(
        fixture({ cliente_contrato_servicos: [row] }).service.additionalServices(10, { page: 1, limit: 10 })
      ).rejects.toMatchObject({ statusCode: 502 });
  });
  it("preserves active-only upgrades, allows inactive support, rejects absent contracts, propagates cancellation and sanitizes API failures", async () => {
    const inactive = fixture({ cliente_contrato: [{ ...contract, status: "I" }] });
    expect((await inactive.service.products(10, { page: 1, limit: 10 }, false)).total).toBe(2);
    await expect(inactive.service.products(10, { page: 1, limit: 10 }, true)).rejects.toMatchObject({ statusCode: 404 });
    const absent = fixture({ cliente_contrato: [] });
    await expect(absent.service.additionalServices(10, { page: 1, limit: 10 })).rejects.toMatchObject({ statusCode: 404 });
    expect(absent.listPage).toHaveBeenCalledTimes(1);
    const bad = fixture();
    bad.listPage.mockRejectedValueOnce(new Error("PRIVATE_TOKEN"));
    await expect(bad.service.products(10, { page: 1, limit: 10 })).rejects.toThrow("Não foi possível consultar os itens");
    const cancelled = new AbortController();
    cancelled.abort();
    const aborted = fixture();
    await expect(aborted.service.products(10, { page: 1, limit: 10 }, false, cancelled.signal)).rejects.toMatchObject({ statusCode: 502 });
    expect(aborted.listPage).toHaveBeenCalledTimes(1);
  });
  it("requires the contextual permission before querying, validates pages, uses GET/no-store and conceals failures in both modules", async () => {
    vi.spyOn(AuthService.prototype, "requireUser").mockResolvedValue({ id: 1 } as never);
    const permission = vi.spyOn(AuthService.prototype, "requirePermission").mockResolvedValue({ id: 1 } as never);
    const products = vi
      .spyOn(ContractItemsService.prototype, "products")
      .mockResolvedValue({ items: [], page: 1, limit: 10, total: 0, queriedAt: "" });
    const services = vi
      .spyOn(ContractItemsService.prototype, "additionalServices")
      .mockResolvedValue({ items: [], page: 1, limit: 10, total: 0, queriedAt: "" });
    const app = Fastify();
    await app.register(supportRoutes, { prefix: "/api/support" });
    await app.register(upgradeRoutes, { prefix: "/api/upgrades" });
    try {
      for (const module of ["support", "upgrades"])
        for (const section of ["products", "additional-services"]) {
          const url = `/api/${module}/contracts/10/${section}`;
          permission.mockRejectedValueOnce(Object.assign(new Error("Sem acesso"), { statusCode: 403 }));
          expect((await app.inject({ url })).statusCode).toBe(403);
          const count = products.mock.calls.length + services.mock.calls.length;
          const response = await app.inject({ url });
          expect(response.statusCode).toBe(200);
          expect(response.headers["cache-control"]).toBe("no-store");
          expect(permission).toHaveBeenLastCalledWith(expect.anything(), `${module}.contract.view`);
          expect(section === "products" ? products : services).toHaveBeenLastCalledWith(
            10,
            { page: 1, limit: 10 },
            module === "upgrades",
            expect.any(AbortSignal)
          );
          expect((await app.inject({ url: `${url}?limit=100` })).statusCode).toBe(400);
          expect((await app.inject({ url, method: "POST" })).statusCode).toBe(404);
          expect(products.mock.calls.length + services.mock.calls.length).toBe(count + 1);
        }
      products.mockRejectedValueOnce(new Error("PRIVATE_TOKEN"));
      const failed = await app.inject({ url: "/api/support/contracts/10/products" });
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain("PRIVATE_TOKEN");
    } finally {
      await app.close();
    }
  });
});
