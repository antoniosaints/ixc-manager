import { describe, expect, it, vi } from "vitest";
import {
  UpgradeService,
  dateOnly,
  referenceDate,
  permanence,
  expirationFilters,
  type UpgradeQuery,
} from "../src/services/upgrades/UpgradeService.js";
import type { IxcApiService, IxcListRequest } from "../src/integrations/ixc/IxcApiService.js";

const now = () => new Date("2026-10-06T12:00:00Z");
const query = (overrides: Partial<UpgradeQuery> = {}): UpgradeQuery => ({
  status: "eligible",
  days: 30,
  search: "",
  searchBy: "name",
  plan: "",
  page: 1,
  limit: 10,
  ...overrides,
});
const fixture = (
  handler: (endpoint: string, request: IxcListRequest, page: number) => { rows: Record<string, unknown>[]; total: number }
) => {
  const listPage = vi.fn(async (endpoint: string, request: IxcListRequest, page: number) => handler(endpoint, request, page));
  return { service: new UpgradeService({ listPage } as unknown as Pick<IxcApiService, "listPage">, now), listPage };
};

describe("Permanência dos contratos", () => {
  it("não transforma datas zeradas, ausentes ou impossíveis em contratos vencidos", () => {
    for (const value of [null, undefined, "", "0000-00-00", "2026-02-30", "2025-02-29", "06/99/2026"]) {
      expect(permanence(value, "2026-10-06")).toEqual({ expiresAt: null, daysRemaining: null, permanenceStatus: "missing" });
    }
    expect(dateOnly("29/02/2024")).toBe("2024-02-29");
  });
  it("usa o dia de Brasília e calcula dias inteiros sem depender do fuso do servidor", () => {
    expect(referenceDate(new Date("2026-10-06T01:00:00Z"))).toBe("2026-10-05");
    expect(permanence("2026-10-05", "2026-10-06").daysRemaining).toBe(-1);
    expect(permanence("2026-10-06", "2026-10-06").permanenceStatus).toBe("today");
    expect(permanence("2026-11-05", "2026-10-06").daysRemaining).toBe(30);
  });
  it("separa vencidos, hoje, próximos do fim e sem data nos filtros enviados ao IXC", () => {
    expect(expirationFilters("expired", 30, "2026-10-06")).toContainEqual({
      TB: "cliente_contrato.data_expiracao",
      OP: "<",
      P: "2026-10-06",
    });
    expect(expirationFilters("expiring", 30, "2026-10-06")).toContainEqual({
      TB: "cliente_contrato.data_expiracao",
      OP: "<=",
      P: "2026-11-05",
    });
    expect(expirationFilters("expiring", 30, "2026-10-06")).toContainEqual({
      TB: "cliente_contrato.data_expiracao",
      OP: ">=",
      P: "2026-10-06",
    });
    expect(expirationFilters("eligible", 30, "2026-10-06")).not.toContainEqual(expect.objectContaining({ OP: ">=" }));
    expect(expirationFilters("missing", 30, "2026-10-06")).toEqual([{ TB: "cliente_contrato.data_expiracao", OP: "=", P: "0000-00-00" }]);
  });
});

describe("UpgradeService em tempo real", () => {
  it("preserva fidelidade cadastrada como zero sem inventar uma data de expiração", async () => {
    const { service } = fixture((endpoint) =>
      endpoint === "cliente_contrato"
        ? { total: 1, rows: [{ id: "10", id_cliente: "3", status: "A", fidelidade: "0", data_expiracao: "0000-00-00" }] }
        : { total: 0, rows: [] }
    );
    expect((await service.contract(10)).contract).toMatchObject({ fidelityMonths: 0, expiresAt: null, permanenceStatus: "missing" });
  });
  it("pagina no IXC, mantém contratos distintos do mesmo cliente e consulta só os IDs da página", async () => {
    const { service, listPage } = fixture((endpoint) =>
      endpoint === "cliente_contrato"
        ? {
            total: 100,
            rows: [
              { id: "1", id_cliente: "8", status: "A", contrato: "Plano A", endereco_padrao_cliente: "S", data_expiracao: "2026-10-05" },
              {
                id: "2",
                id_cliente: "8",
                status: "A",
                contrato: "Plano B",
                endereco_padrao_cliente: "N",
                cidade: "22",
                data_expiracao: "2026-10-07",
              },
            ],
          }
        : endpoint === "cliente"
          ? { total: 1, rows: [{ id: "8", razao: "Cliente de teste", cidade: "11", ativo: "S" }] }
          : {
              total: 2,
              rows: [
                { id: "11", nome: "Cidade do cadastro" },
                { id: "22", nome: "Cidade da instalação" },
              ],
            }
    );
    const result = await service.opportunities(query({ page: 3, limit: 25 }));
    expect(result.total).toBe(100);
    expect(result.items.map((x) => x.contractId)).toEqual([1, 2]);
    expect(result.items.map((x) => x.city)).toEqual(["Cidade do cadastro", "Cidade da instalação"]);
    expect(listPage).toHaveBeenCalledWith(
      "cliente_contrato",
      expect.objectContaining({ qtype: "cliente_contrato.status", query: "A", rp: 25 }),
      3
    );
    expect(listPage).toHaveBeenCalledWith("cliente", expect.objectContaining({ query: "8", oper: "IN", rp: 1 }), 1);
    expect(listPage).toHaveBeenCalledWith("cidade", expect.objectContaining({ query: "11,22", rp: 2 }), 1);
  });
  it("filtra o plano exato pelo vínculo do contrato e mantém período, filial e paginação", async () => {
    const { service, listPage } = fixture(() => ({ total: 0, rows: [] }));
    await service.opportunities(query({ planId: 215, branchId: 8, page: 2, limit: 25 }));
    expect(listPage).toHaveBeenCalledWith(
      "cliente_contrato",
      expect.objectContaining({
        qtype: "cliente_contrato.status",
        query: "A",
        rp: 25,
        gridParam: expect.arrayContaining([
          { TB: "cliente_contrato.id_vd_contrato", OP: "=", P: "215" },
          { TB: "cliente_contrato.id_filial", OP: "=", P: "8" },
          { TB: "cliente_contrato.data_expiracao", OP: "<=", P: "2026-11-05" },
        ]),
      }),
      2
    );
    expect(listPage).toHaveBeenCalledTimes(1);
  });
  it("resolve nomes no catálogo mesmo que a descrição do contrato seja diferente", async () => {
    const { service, listPage } = fixture((endpoint) =>
      endpoint === "vd_contratos"
        ? {
            total: 2,
            rows: [
              { id: "215", nome: "Fibra 500" },
              { id: "216", nome: "Fibra 500 Empresas" },
            ],
          }
        : { total: 0, rows: [] }
    );
    await service.opportunities(query({ plan: "Fibra 500" }));
    await service.summary(query({ plan: "Fibra 500" }));
    expect(listPage).toHaveBeenCalledWith(
      "vd_contratos",
      expect.objectContaining({ qtype: "vd_contratos.nome", query: "Fibra 500", oper: "L" }),
      1
    );
    const contracts = listPage.mock.calls.filter(([endpoint]) => endpoint === "cliente_contrato");
    expect(contracts).toHaveLength(6);
    for (const [, request] of contracts) {
      expect(request.gridParam).toContainEqual({ TB: "cliente_contrato.id_vd_contrato", OP: "IN", P: "215,216" });
      expect(request.gridParam).not.toContainEqual(expect.objectContaining({ TB: "cliente_contrato.contrato" }));
    }
  });
  it("não varre contratos nem indicadores quando o plano buscado não existe", async () => {
    const { service, listPage } = fixture(() => ({ total: 0, rows: [] }));
    expect((await service.opportunities(query({ plan: "Plano inexistente" }))).total).toBe(0);
    expect((await service.summary(query({ plan: "Plano inexistente" }))).counts).toEqual({
      expired: 0,
      next30: 0,
      next60: 0,
      next90: 0,
      missing: 0,
    });
    expect(listPage.mock.calls.map(([endpoint]) => endpoint)).toEqual(["vd_contratos", "vd_contratos"]);
  });
  it("pede um nome mais específico quando o catálogo excede o limite de busca", async () => {
    const { service, listPage } = fixture(() => ({ total: 201, rows: [] }));
    await expect(service.opportunities(query({ plan: "Fibra" }))).rejects.toMatchObject({ statusCode: 422 });
    expect(listPage).toHaveBeenCalledTimes(1);
  });
  it("não reutiliza resultados: cada nova consulta lê o IXC", async () => {
    let calls = 0;
    const { service, listPage } = fixture(() => ({ total: ++calls, rows: [] }));
    expect((await service.opportunities(query())).total).toBe(1);
    expect((await service.opportunities(query())).total).toBe(2);
    expect(listPage).toHaveBeenCalledTimes(2);
  });
  it("consulta totais sem baixar toda a base e aplica os filtros comerciais aos indicadores", async () => {
    const { service, listPage } = fixture(() => ({ total: 20, rows: [] }));
    const result = await service.summary(query({ planId: 10, branchId: 2 }));
    expect(result.counts).toEqual({ expired: 20, next30: 20, next60: 20, next90: 20, missing: 20 });
    expect(listPage).toHaveBeenCalledTimes(5);
    for (const [, request] of listPage.mock.calls) {
      expect(request.rp).toBe(1);
      expect(request.gridParam).toContainEqual({ TB: "cliente_contrato.id_vd_contrato", OP: "=", P: "10" });
      expect(request.gridParam).toContainEqual({ TB: "cliente_contrato.id_filial", OP: "=", P: "2" });
    }
  });
  it("retorna vazio sem varrer contratos se a busca não encontrou clientes", async () => {
    const { service, listPage } = fixture(() => ({ total: 0, rows: [] }));
    expect((await service.opportunities(query({ search: "Inexistente" }))).items).toEqual([]);
    expect(listPage).toHaveBeenCalledTimes(1);
    expect(listPage.mock.calls[0]?.[0]).toBe("cliente");
  });
  it("limita buscas amplas e rejeita IDs inválidos antes de consultar contratos", async () => {
    const { service, listPage } = fixture(() => ({ total: 201, rows: [] }));
    await expect(service.opportunities(query({ search: "Silva" }))).rejects.toMatchObject({ statusCode: 422 });
    await expect(service.opportunities(query({ search: "abc", searchBy: "contractId" }))).rejects.toMatchObject({ statusCode: 400 });
    expect(listPage).toHaveBeenCalledTimes(1);
  });
  it("não usa data de renovação como expiração e representa falta de cliente explicitamente", async () => {
    const { service } = fixture((endpoint) =>
      endpoint === "cliente_contrato"
        ? { total: 1, rows: [{ id: "10", id_cliente: "3", status: "A", data_expiracao: "0000-00-00", data_renovacao: "2026-10-01" }] }
        : { total: 0, rows: [] }
    );
    const result = await service.contract(10);
    expect(result.contract).toMatchObject({
      customerAvailable: false,
      expiresAt: null,
      permanenceStatus: "missing",
      renewedAt: "2026-10-01",
    });
  });
  it("protege erros upstream e diferencia contrato inexistente", async () => {
    const { service, listPage } = fixture(() => ({ total: 0, rows: [] }));
    await expect(service.contract(99)).rejects.toMatchObject({ statusCode: 404 });
    listPage.mockRejectedValueOnce(new Error("Authorization: SECRET; cliente privado"));
    await expect(service.opportunities(query())).rejects.toMatchObject({
      statusCode: 502,
      message: "Não foi possível consultar o IXC agora. Tente atualizar a consulta.",
    });
  });
});
