import Fastify from "fastify";
import axios, { type AxiosInstance } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceService, cents, comparisonPeriod, financeQuery } from "../src/services/finance/FinanceService.js";
import { FinanceSqlService } from "../src/services/finance/FinanceSqlService.js";
import { financeRoutes } from "../src/controllers/financeController.js";
import { IxcApiService, type IxcListRequest } from "../src/integrations/ixc/IxcApiService.js";
import { AuthService } from "../src/services/AuthService.js";
import { rolePermissions } from "../src/config/permissions.js";
type Row = Record<string, unknown>;
const query = { from: "2026-10-01", to: "2026-10-06" };
const account = (id: string, type: string) => ({
  id,
  tipo: type,
  planejamento_analitico: `Conta ${id}`,
  classificacao: `${id}.01`,
  integration_client_secret: "PRIVATE_SECRET",
});
const movement = (id: string, account: string, date: string, debit: string, credit: string) => ({
  id,
  id_conta: account,
  filial_id: "1",
  data: date,
  debito: debit,
  credito: credit,
  historico: "PRIVATE_HISTORY",
});
function fixture(extra: Record<string, Row[]> = {}, maxRows = 40000) {
  const source: Record<string, Row[]> = {
    fn_movim_finan: [
      movement("1", "10", "2026-09-25", "0", "50"),
      movement("2", "20", "2026-09-26", "20", "0"),
      movement("3", "10", "2026-10-01", "0", "100.10"),
      movement("4", "20", "2026-10-02", "30.20", "0"),
      movement("5", "10", "2026-10-02", "10.10", "0"),
      movement("6", "20", "2026-10-03", "0", "5.20"),
      movement("7", "30", "2026-10-01", "100.10", "0"),
      movement("8", "40", "2026-10-02", "500", "0"),
    ],
    planejamento_analitico: [account("10", "R"), account("20", "D"), account("30", "A"), account("40", "P")],
    fn_areceber: [
      { id: "1", data_vencimento: "2026-10-01", valor_aberto: "20.10", status: "A" },
      { id: "2", data_vencimento: "2026-10-06", valor_aberto: "10", status: "A" },
      { id: "3", data_vencimento: "2026-10-01", valor_aberto: "99", status: "C" },
      { id: "4", data_vencimento: "2026-10-01", valor_aberto: "99", estornado: "S" },
    ],
    fn_apagar: [{ id: "1", data_vencimento: "2026-10-04", valor_aberto: "3.10", status: "A" }],
    ...extra,
  };
  const listPage = vi.fn(async (ep: string, request: IxcListRequest, page: number) => {
    const rows = (source[ep] ?? []).filter((row) => request.oper !== "IN" || request.query.split(",").includes(String(row.id)));
    return { rows: rows.slice((page - 1) * 500, page * 500), total: rows.length };
  });
  return {
    listPage,
    service: new FinanceService(
      { listPage } as unknown as Pick<IxcApiService, "listPage">,
      () => new Date("2026-10-06T12:00:00Z"),
      maxRows
    ),
  };
}
afterEach(() => vi.restoreAllMocks());
describe("Financeiro somente leitura", () => {
  it("calcula em centavos, desconta estornos e exclui contrapartidas de ativo/passivo do resultado", async () => {
    const { service } = fixture();
    const result = await service.dashboard(query);
    expect(result.totals).toMatchObject({ revenue: 90, expense: 25, result: 65 });
    expect(result.previous).toMatchObject({ from: "2026-09-25", to: "2026-09-30", revenue: 50, expense: 20, result: 30 });
    expect(result.growth).toEqual({ revenue: 80, expense: 25, resultDifference: 35 });
    expect(result.accounts.map((item) => item.type)).toEqual(["R", "D"]);
    expect(result.ledger.map((item) => item.type)).toEqual(["R", "D", "A", "P"]);
    expect(result.series).toHaveLength(6);
    expect(result.series[5]).toMatchObject({ revenue: 0, expense: 0 });
    expect(result.receivable).toEqual({ total: 30.1, overdue: 20.1, count: 2 });
    expect(result.payable).toEqual({ total: 3.1, overdue: 3.1, count: 1 });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_SECRET|PRIVATE_HISTORY/);
  });
  it("valida datas reais, limites inclusivos e comparação com virada de ano", () => {
    expect(financeQuery.safeParse({ ...query, from: "2026-02-30" }).success).toBe(false);
    expect(financeQuery.safeParse({ ...query, from: "2026-10-07" }).success).toBe(false);
    expect(financeQuery.safeParse({ from: "2024-01-01", to: "2024-12-31" }).success).toBe(true);
    expect(financeQuery.safeParse({ from: "2024-01-01", to: "2025-01-01" }).success).toBe(false);
    expect(comparisonPeriod({ from: "2026-01-01", to: "2026-01-03" })).toEqual({ from: "2025-12-29", to: "2025-12-31", days: 3 });
    expect(cents("1.234,56")).toBe(123456);
    expect(cents("0.10")).toBe(10);
    expect(cents("invalid")).toBeNull();
    expect(cents("1.2,34")).toBeNull();
    expect(cents(undefined)).toBeNull();
  });
  it("pagina todas as movimentações e recusa totais parciais ou registros duplicados", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => movement(String(i + 1), "10", "2026-10-01", "0", "0.10"));
    const { service, listPage } = fixture({ fn_movim_finan: rows });
    expect((await service.dashboard(query)).totals.revenue).toBe(50.1);
    expect(listPage.mock.calls.filter(([ep]) => ep === "fn_movim_finan").map(([, , page]) => page)).toEqual([1, 2]);
    const limited = fixture({ fn_movim_finan: rows }, 500);
    await expect(limited.service.dashboard(query)).rejects.toMatchObject({ statusCode: 422 });
    const duplicates = fixture({ fn_movim_finan: [rows[0]!, rows[0]!] });
    await expect(duplicates.service.dashboard(query)).rejects.toThrow("mudaram");
    const incomplete = fixture();
    incomplete.listPage.mockResolvedValueOnce({ rows: [], total: 5 });
    await expect(incomplete.service.dashboard(query)).rejects.toThrow("incompleta");
  });
  it("agrupa períodos longos por mês e mantém zero distinto de ausência de dados", async () => {
    const result = await fixture({ fn_movim_finan: [], fn_areceber: [], fn_apagar: [] }).service.dashboard({
      from: "2026-01-01",
      to: "2026-04-01",
    });
    expect(result.series.map((item) => item.date)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(result.totals.result).toBe(0);
    expect(result.growth.revenue).toBeNull();
    expect(result.receivable).toEqual({ total: 0, overdue: 0, count: 0 });
  });
  it("bloqueia valores ausentes ou totais alterados entre páginas", async () => {
    const missing = movement("1", "10", "2026-10-01", "0", "1");
    delete missing.credito;
    await expect(fixture({ fn_movim_finan: [missing] }).service.dashboard(query)).rejects.toMatchObject({ statusCode: 422 });
    const { service, listPage } = fixture();
    const batch = Array.from({ length: 500 }, (_, i) => movement(String(i + 1), "10", "2026-10-01", "0", "0.10"));
    listPage
      .mockResolvedValueOnce({ rows: batch, total: 501 })
      .mockResolvedValueOnce({ rows: [movement("501", "10", "2026-10-01", "0", "1")], total: 502 });
    await expect(service.dashboard(query)).rejects.toThrow("mudaram");
  });
  it("usa filtros do IXC e rejeita respostas fora da filial ou conta", async () => {
    const { service, listPage } = fixture({ fn_movim_finan: [] });
    await service.dashboard({ ...query, branchId: 2, accountId: 10 });
    const req = listPage.mock.calls[0]![1];
    expect(req.gridParam).toEqual(
      expect.arrayContaining([
        { TB: "fn_movim_finan.data", OP: "<=", P: "2026-10-06 23:59:59" },
        { TB: "fn_movim_finan.filial_id", OP: "=", P: "2" },
        { TB: "fn_movim_finan.id_conta", OP: "=", P: "10" },
      ])
    );
    await expect(fixture().service.dashboard({ ...query, branchId: 2 })).rejects.toThrow("fora dos filtros");
  });
  it("distingue indisponibilidade de zero e avisa sobre classificação incompleta", async () => {
    const { service, listPage } = fixture({ planejamento_analitico: [account("20", "D")] });
    const original = listPage.getMockImplementation()!;
    listPage.mockImplementation(async (ep, request, page) => {
      if (ep === "fn_apagar") throw new Error("PRIVATE_TOKEN");
      return original(ep, request, page);
    });
    const result = await service.dashboard(query);
    expect(result.payable).toBeNull();
    expect(result.warnings).toHaveLength(2);
    expect(result.growth.revenue).toBeNull();
    expect(JSON.stringify(result)).not.toContain("PRIVATE_TOKEN");
  });
  it("usa apenas GET e header listar no limite da API IXC", async () => {
    const get = vi.fn().mockResolvedValue({ data: { page: "1", total: "0" } });
    const create = vi.spyOn(axios, "create").mockReturnValue({ get } as unknown as AxiosInstance);
    await new FinanceService().dashboard(query);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ headers: expect.objectContaining({ ixcsoft: "listar" }) }));
    expect(get.mock.calls.map(([path]) => path)).toEqual(["/fn_movim_finan", "/fn_areceber", "/fn_apagar"]);
  });
  it("interrompe a paginação ao cancelar e não consulta novas fontes", async () => {
    const { service, listPage } = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(service.dashboard(query, controller.signal)).rejects.toMatchObject({ statusCode: 499 });
    expect(listPage).not.toHaveBeenCalled();
    const next = new AbortController();
    listPage.mockImplementationOnce(async () => {
      next.abort();
      return { rows: [], total: 0 };
    });
    await expect(service.dashboard(query, next.signal)).rejects.toMatchObject({ statusCode: 499 });
    expect(listPage).toHaveBeenCalledTimes(1);
  });
  it("aplica o limite de tempo inclusive à última página", async () => {
    vi.useFakeTimers();
    try {
      const { service, listPage } = fixture();
      listPage.mockImplementationOnce(async () => {
        vi.advanceTimersByTime(61_000);
        return { rows: [], total: 0 };
      });
      await expect(service.dashboard(query)).rejects.toMatchObject({ statusCode: 422 });
      expect(listPage).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("protege a rota com permissão própria e não oferece operações de escrita", async () => {
    const authenticate = vi
      .spyOn(AuthService.prototype, "authenticate")
      .mockResolvedValue({ id: 1, name: "Operador", email: "example@example.test", role: "OPERATOR", permissions: [] });
    const fixtureResult = await fixture().service.dashboard(query);
    const dashboard = vi.spyOn(FinanceSqlService.prototype, "dashboard").mockResolvedValue(fixtureResult as never);
    const app = Fastify();
    await app.register(financeRoutes, { prefix: "/api/finance" });
    const url = "/api/finance/dashboard?from=2026-10-01&to=2026-10-06";
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(403);
    expect(dashboard).not.toHaveBeenCalled();
    authenticate.mockResolvedValue({ id: 1, name: "Admin", email: "example@example.test", role: "ADMIN" });
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect((await app.inject({ method: "GET", url: "/api/finance/dashboard?from=bad&to=2026-10-06" })).statusCode).toBe(400);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) expect((await app.inject({ method, url })).statusCode).toBe(404);
    expect(rolePermissions.OPERATOR).not.toContain("finance.dashboard.view");
    expect(rolePermissions.ADMIN).toContain("finance.dashboard.view");
    await app.close();
  });
});
