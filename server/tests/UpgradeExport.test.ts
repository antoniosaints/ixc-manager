import { rolePermissions } from "../src/config/permissions.js";
import Fastify from "fastify";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { defaultAppearance, SettingsService } from "../src/services/settings/SettingsService.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpgradeService, type UpgradeQuery } from "../src/services/upgrades/UpgradeService.js";
import { createUpgradePdf } from "../src/services/upgrades/UpgradePdf.js";
import { upgradeRoutes } from "../src/controllers/upgradeController.js";
import { AuthService } from "../src/services/AuthService.js";
import { IxcApiService, type IxcListRequest } from "../src/integrations/ixc/IxcApiService.js";

const query: UpgradeQuery = {
  status: "expired",
  days: 30,
  search: "",
  searchBy: "name",
  plan: "",
  page: 8,
  limit: 10,
  planId: 215,
  branchId: 2,
};
const options = { peopleCount: 5, clientsPerPerson: 10, names: ["Ana", "João", "Lúcia", "Carlos", "José"] };
const contracts = Array.from({ length: 240 }, (_, index) => ({
  id: String(index + 1),
  id_cliente: String(Math.floor(index / 3) + 1),
  contrato: "Plano Fibra 600 Mega",
  data_expiracao: "2026-09-01",
  fidelidade: "12",
  endereco_padrao_cliente: "S",
}));
function fixture(rows = contracts) {
  const listPage = vi.fn(async (endpoint: string, request: IxcListRequest, page: number) => {
    if (endpoint === "cliente_contrato") {
      const ids = request.gridParam?.find((f) => f.TB === "cliente_contrato.id")?.P.split(",");
      const source = ids ? rows.filter((row) => ids.includes(row.id)) : rows;
      return { total: source.length, rows: source.slice((page - 1) * request.rp!, page * request.rp!) };
    }
    if (endpoint === "cliente")
      return {
        total: request.rp!,
        rows: request.query.split(",").map((id) => ({
          id,
          razao: `Cliente de demonstração ${id}`,
          telefone_celular: "(99) 99999-0000",
          cidade: "1",
          bairro: "Centro",
          ativo: "S",
        })),
      };
    return { total: 1, rows: [{ id: "1", nome: "Cidade Exemplo" }] };
  });
  return {
    listPage,
    service: new UpgradeService({ listPage } as unknown as Pick<IxcApiService, "listPage">, () => new Date("2026-10-06T12:00:00Z")),
  };
}
const pageContent = (pdf: PDFDocument, index: number) => {
  const contents = pdf.context.lookup(pdf.getPage(index).node.Contents()!);
  const streams =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_, i) => contents.lookup(i, PDFRawStream))
      : [contents as PDFRawStream];
  return streams.map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1")).join("\n");
};
const fillOperator = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255).join(" ") + " scn";
afterEach(() => vi.restoreAllMocks());

describe("Distribuição de upgrades", () => {
  it("distribui 5 × 10 clientes únicos, ignora a página visível e busca mais contratos quando há duplicidade", async () => {
    const { service, listPage } = fixture();
    const result = await service.distribution(query, options);
    expect(result.groups.map((group) => group.name)).toEqual(options.names);
    expect(result.groups.map((group) => group.items.length)).toEqual([10, 10, 10, 10, 10]);
    const customers = result.groups.flatMap((group) => group.items.map((item) => item.customerId));
    expect(new Set(customers).size).toBe(50);
    expect(result.groups[0]?.items[0]?.contractId).toBe(1);
    const calls = listPage.mock.calls.filter(([endpoint]) => endpoint === "cliente_contrato");
    expect(calls.map(([, , page]) => page)).toEqual([1, 2]);
    for (const [, request] of calls)
      expect(request.gridParam).toEqual(
        expect.arrayContaining([
          { TB: "cliente_contrato.id_vd_contrato", OP: "=", P: "215" },
          { TB: "cliente_contrato.id_filial", OP: "=", P: "2" },
          { TB: "cliente_contrato.data_expiracao", OP: "<", P: "2026-10-06" },
        ])
      );
    await service.distribution(query, options);
    expect(listPage.mock.calls.filter(([endpoint]) => endpoint === "cliente_contrato")).toHaveLength(4);
  });
  it("usa somente contratos selecionados, mantém os filtros e preenche nomes vazios", async () => {
    const { service, listPage } = fixture();
    const result = await service.distribution(query, {
      peopleCount: 2,
      clientsPerPerson: 1,
      names: ["  Ana  ", ""],
      contractIds: [6, 1, 2],
    });
    expect(result.groups.map((group) => group.name)).toEqual(["Ana", "Responsável 2"]);
    expect(result.groups.flatMap((group) => group.items.map((item) => item.contractId))).toEqual([1, 6]);
    expect(listPage.mock.calls[0]?.[1].gridParam).toContainEqual({ TB: "cliente_contrato.id", OP: "IN", P: "6,1,2" });
  });
  it("não gera uma distribuição incompleta quando faltam clientes distintos", async () => {
    const { service } = fixture(contracts.slice(0, 12));
    await expect(service.distribution(query, options)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("encontrou 4"),
    });
    await expect(service.distribution(query, { ...options, contractIds: [1, 2, 3] })).rejects.toMatchObject({ statusCode: 409 });
  });
  it("limita a leitura de contratos e rejeita cadastros que o IXC não retornou", async () => {
    const repeated = Array.from({ length: 2001 }, (_, i) => ({ ...contracts[0]!, id: String(i + 1) }));
    const { service, listPage } = fixture(repeated);
    await expect(service.distribution(query, options)).rejects.toMatchObject({ statusCode: 422 });
    expect(listPage).toHaveBeenCalledTimes(20);
    const other = fixture();
    other.listPage.mockImplementation(async (endpoint, request, page) =>
      endpoint === "cliente_contrato"
        ? { rows: contracts.slice((page - 1) * request.rp!, page * request.rp!), total: contracts.length }
        : { rows: [], total: 0 }
    );
    await expect(other.service.distribution(query, options)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("cadastros"),
    });
  });
  it("rejeita quantidades inválidas antes de consultar o IXC", async () => {
    const { service, listPage } = fixture();
    for (const override of [{ peopleCount: 0 }, { clientsPerPerson: 21 }, { peopleCount: 20, clientsPerPerson: 11 }, { peopleCount: 1.5 }])
      await expect(service.distribution(query, { ...options, ...override })).rejects.toMatchObject({ statusCode: 400 });
    expect(listPage).not.toHaveBeenCalled();
  });
  it("produz exatamente uma página A4 por pessoa, inclusive com 20 clientes em cada", async () => {
    const { service } = fixture();
    for (const opts of [options, { peopleCount: 4, clientsPerPerson: 20, names: [] }, { ...options, includeNotes: false }]) {
      const result = await service.distribution(query, opts);
      const bytes = await createUpgradePdf(result);
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBe(opts.peopleCount);
      expect(pdf.getPage(0).getSize()).toMatchObject({ width: 595.28, height: 841.89 });
      expect(pdf.getTitle()).toBe("Lista de upgrades");
    }
  });
});

describe("Cores do PDF de upgrades", () => {
  it("aplica a cor personalizada em todas as páginas e remove os destaques violetas fixos", async () => {
    const { service } = fixture();
    const distribution = await service.distribution(query, options);
    const pdf = await PDFDocument.load(await createUpgradePdf(distribution, { accentColor: "#0066ff" }));
    for (let i = 0; i < pdf.getPageCount(); i++) {
      const content = pageContent(pdf, i);
      expect(content).toContain(fillOperator("#0066ff"));
      expect(content).not.toContain(fillOperator("#7c3aed"));
    }
  });
  it("preserva uma cor clara nos elementos gráficos e mantém o texto legível sobre branco", async () => {
    const { service } = fixture();
    const distribution = await service.distribution(query, { peopleCount: 1, clientsPerPerson: 1, names: [] });
    const pdf = await PDFDocument.load(await createUpgradePdf(distribution, { accentColor: "#ffffff" }));
    const content = pageContent(pdf, 0);
    expect(content).toContain("1 1 1 scn");
    // The first colored text after the accent rectangle is the section title.
    const ink = content
      .match(/1 1 1 scn[\s\S]*?([0-9.]+) ([0-9.]+) ([0-9.]+) scn/)!
      .slice(1)
      .map(Number);
    const luminance = ink
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
      .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i]!, 0);
    expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Exportação autenticada", () => {
  it("protege o POST, valida limites e retorna PDF sem cache", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async (request) =>
      request.headers.authorization
        ? {
            id: 1,
            name: "Teste",
            email: "teste@example.test",
            role: request.headers.authorization === "USER" ? "USER" : "OPERATOR",
            permissions: rolePermissions[request.headers.authorization === "USER" ? "USER" : "OPERATOR"],
          }
        : null
    );
    const appearance = structuredClone(defaultAppearance);
    appearance.light.upgrades = "#0066ff";
    appearance.dark.upgrades = "#38bdf8";
    // General buttons and Churn have distinct colors; neither should color this export.
    appearance.light.primary = "#dc2626";
    appearance.light.churn = "#059669";
    const readAppearance = vi.spyOn(SettingsService.prototype, "appearance").mockResolvedValue(appearance);
    const { listPage } = fixture();
    vi.spyOn(IxcApiService.prototype, "listPage").mockImplementation(listPage as unknown as IxcApiService["listPage"]);
    const app = Fastify();
    await app.register(upgradeRoutes, { prefix: "/api/upgrades" });
    const payload = { filters: query, ...options };
    const request = { method: "POST" as const, url: "/api/upgrades/export", payload };
    try {
      expect((await app.inject(request)).statusCode).toBe(401);
      expect((await app.inject({ ...request, headers: { authorization: "USER" } })).statusCode).toBe(403);
      for (const extra of [
        { peopleCount: 21 },
        { peopleCount: 20, clientsPerPerson: 11 },
        { names: ["x".repeat(81)] },
        { contractIds: [] },
        { themeMode: "system" },
      ])
        expect(
          (await app.inject({ ...request, payload: { ...payload, ...extra }, headers: { authorization: "OPERATOR" } })).statusCode
        ).toBe(400);
      expect(listPage).not.toHaveBeenCalled();
      expect(readAppearance).not.toHaveBeenCalled();
      const response = await app.inject({ ...request, headers: { authorization: "OPERATOR" } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("application/pdf");
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["content-disposition"]).toContain("attachment;");
      const lightPdf = await PDFDocument.load(response.rawPayload);
      expect(lightPdf.getPageCount()).toBe(5);
      expect(pageContent(lightPdf, 0)).toContain(fillOperator(appearance.light.upgrades));
      expect(pageContent(lightPdf, 0)).not.toContain(fillOperator(appearance.light.primary));
      expect(pageContent(lightPdf, 0)).not.toContain(fillOperator(appearance.light.churn));
      const darkResponse = await app.inject({
        ...request,
        payload: { ...payload, themeMode: "dark" },
        headers: { authorization: "OPERATOR" },
      });
      expect(darkResponse.statusCode).toBe(200);
      const darkPdf = await PDFDocument.load(darkResponse.rawPayload);
      expect(pageContent(darkPdf, 0)).toContain(fillOperator(appearance.dark.upgrades));
      expect(readAppearance).toHaveBeenCalledTimes(2);
      listPage.mockRejectedValueOnce(new Error("PRIVATE_CUSTOMER"));
      const failed = await app.inject({ ...request, headers: { authorization: "OPERATOR" } });
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain("PRIVATE_CUSTOMER");
    } finally {
      await app.close();
    }
  });
});
