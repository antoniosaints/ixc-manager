import { describe, expect, it, vi } from "vitest";
import { CustomerAnalysisService } from "../src/services/support/CustomerAnalysisService.js";
import { RetentionRiskEngine } from "../src/services/retention/RetentionRiskEngine.js";
import type { IxcListRequest } from "../src/integrations/ixc/IxcApiService.js";
import type { RiskContext } from "../src/types/retention.js";

type Row = Record<string, unknown>;
const customer = { id: "1", razao: "Cliente Exemplo", ativo: "S", grau_satisfacao: "1", senha: "PRIVATE_CUSTOMER" };
const contract = {
  id: "100",
  id_cliente: "1",
  status: "A",
  contrato: "Fibra Exemplo",
  data_expiracao: "2026-10-20",
  dt_ult_bloq_auto: "2026-09-20",
  dt_ult_des_bloq_conf: "2026-09-25",
  contrato_suspenso: "S",
};
const login = {
  id: "200",
  id_cliente: "1",
  id_contrato: "100",
  login: "cliente.exemplo",
  ativo: "S",
  online: "N",
  ultima_conexao_final: "2026-10-01",
  senha: "PRIVATE_LOGIN",
  ip: "192.0.2.1",
};
const now = () => new Date("2026-10-06T15:00:00Z");
function setup(overrides: Record<string, Row[]> = {}) {
  const fixtures: Record<string, Row[]> = {
    cliente: [customer],
    cliente_contrato: [contract],
    radusuarios: [login],
    fn_areceber: Array.from({ length: 3 }, (_, index) => ({
      id: String(index + 1),
      id_cliente: "1",
      id_contrato: "100",
      status: "A",
      data_vencimento: "2026-08-01",
    })),
    su_ticket: Array.from({ length: 5 }, (_, index) => ({
      id: String(index + 1),
      id_cliente: "1",
      id_assunto: "7",
      data_criacao: "2026-10-01 09:00:00",
      prioridade: "C",
      su_status: "N",
      status_sla: "ATRASADO",
      mensagem: "PRIVATE_MESSAGE",
    })),
    su_oss_chamado: Array.from({ length: 2 }, (_, index) => ({
      id: String(index + 1),
      id_cliente: "1",
      data_abertura: "2026-10-02 09:00:00",
    })),
    radacct: Array.from({ length: 24 }, (_, index) => ({
      radacctid: String(index + 1),
      username: login.login,
      acctstarttime: index < 20 ? "2026-10-01 09:00:00" : "2026-09-10 09:00:00",
      acctsessiontime: "120",
      acctterminatecause: "Lost-Carrier",
    })),
    radusuarios_consumo_m: [
      { id: "1", id_login: "200", data: "2026-09-01", consumo: "100" },
      { id: "2", id_login: "200", data: "2026-10-01", consumo: "25" },
    ],
    ...overrides,
  };
  const listPage = vi.fn(async (endpoint: string, request: IxcListRequest, page: number) => {
    const match = (row: Row, field: string, op: string, query: string) => {
      const value = String(row[field.split(".").at(-1)!] ?? "");
      return op === "=" ? value === query : op === "IN" ? query.split(",").includes(value) : op === ">=" ? value >= query : true;
    };
    const rows = (fixtures[endpoint] ?? []).filter(
      (row) =>
        match(row, request.qtype, request.oper, request.query) &&
        (request.gridParam ?? []).every((grid) => match(row, grid.TB, grid.OP, grid.P))
    );
    return { total: rows.length, rows: rows.slice((page - 1) * request.rp!, page * request.rp!) };
  });
  return {
    fixtures,
    listPage,
    service: new CustomerAnalysisService({ listPage } as unknown as ConstructorParameters<typeof CustomerAnalysisService>[0], now),
  };
}
describe("Análise individual de cliente ao vivo", () => {
  it("reutiliza todas as regras e limites do Churn e retorna só análise sanitizada", async () => {
    const { service, listPage } = setup();
    const result = await service.analyze(1);
    const context: RiskContext = {
      customerId: 1,
      contractId: 100,
      satisfaction: 1,
      financial: { overdueInvoices: 3, maxOverdueDays: 66, recentBlock: true, recentTrustUnlock: true },
      support: { tickets30d: 5, recurringSubjects: 1, criticalTickets: 5, pendingTickets: 5, slaProblems: 5, serviceOrders30d: 2 },
      network: {
        disconnects7d: 20,
        baselineDisconnects7d: 1,
        shortSessions7d: 20,
        offlineDays: 0,
        consumptionDropPercent: 75,
        recurringTerminateCause: true,
      },
      contract: { fidelityDaysRemaining: 14, recentBlock: true, recentSuspension: true },
    };
    const expected = new RetentionRiskEngine().calculate(context);
    expect(result.contracts[0]).toMatchObject({ ...expected, reasons: [...expected.reasons].sort((a, b) => b.points - a.points) });
    expect(result.contracts[0]?.score).toBe(100);
    expect(result.partial).toBe(false);
    expect(result.sources).toHaveLength(8);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|senha|192\.0\.2\.1|cliente\.exemplo/);
    expect(new Set(listPage.mock.calls.map((call) => call[0]))).toEqual(
      new Set([
        "cliente",
        "cliente_contrato",
        "fn_areceber",
        "su_ticket",
        "su_oss_chamado",
        "radusuarios",
        "radacct",
        "radusuarios_consumo_m",
      ])
    );
    const radius = listPage.mock.calls.find((call) => call[0] === "radacct")?.[1];
    expect(radius).toMatchObject({
      qtype: "radacct.username",
      query: login.login,
      oper: "IN",
      gridParam: [{ TB: "radacct.acctstarttime", OP: ">=", P: "2026-09-01 00:00:00" }],
    });
  });
  it("isola financeiro e permanência por contrato e compartilha sinais de suporte do cliente", async () => {
    const { service } = setup({
      cliente_contrato: [
        contract,
        { id: "101", id_cliente: "1", status: "A", contrato: "Segundo contrato", data_expiracao: "2027-01-01" },
        { ...contract, id: "102", status: "I" },
      ],
    });
    const result = await service.analyze(1);
    expect(result.contracts.map((row) => row.id)).toEqual([100, 101]);
    expect(result.contracts[1]?.factors).toMatchObject({ financial: 0, contract: 0, support: 25, network: 25, satisfaction: 10 });
  });
  it("distingue indisponibilidade de ausência de motivos, sem retornar erros do IXC", async () => {
    const { service, listPage } = setup();
    const implementation = listPage.getMockImplementation()!;
    listPage.mockImplementation(async (...args) => {
      if (args[0] === "fn_areceber" || args[0] === "radacct") throw new Error("PRIVATE_TOKEN");
      return implementation(...args);
    });
    const result = await service.analyze(1);
    expect(result.partial).toBe(true);
    expect(
      result.sources
        .filter((row) => row.status === "unavailable")
        .map((row) => row.key)
        .sort()
    ).toEqual(["financial", "sessions"]);
    expect(result.sources.find((row) => row.key === "financial")?.count).toBeNull();
    expect(result.contracts[0]?.reasons.some((row) => row.code === "OVERDUE_INVOICES")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_TOKEN");
  });
  it("não inventa desconexões/offline na ausência de histórico e sinaliza falta de satisfação e consumo", async () => {
    const { service } = setup({
      cliente: [{ ...customer, grau_satisfacao: "0" }],
      radacct: [],
      radusuarios_consumo_m: [],
      radusuarios: [{ ...login, online: "S" }],
    });
    const result = await service.analyze(1);
    expect(result.contracts[0]?.factors.network).toBe(0);
    expect(result.contracts[0]?.factors.satisfaction).toBe(0);
    expect(result.warnings).toHaveLength(3);
    expect(result.partial).toBe(false);
  });
  it("usa a menor ausência entre logins ativos e ignora inativos, datas inválidas e status pagos", async () => {
    const { service } = setup({
      radacct: [],
      radusuarios_consumo_m: [],
      radusuarios: [
        login,
        { ...login, id: "201", login: "outro", ultima_conexao_final: "2026-10-02" },
        { ...login, id: "202", login: "inativo", ativo: "N", online: "S" },
      ],
      fn_areceber: [
        { id: "1", id_cliente: "1", id_contrato: "100", status: "R", data_vencimento: "2026-01-01" },
        { id: "2", id_cliente: "1", id_contrato: "100", status: "A", data_vencimento: "2026-10-06" },
      ],
    });
    const result = await service.analyze(1);
    expect(result.contracts[0]?.reasons.find((row) => row.code === "ABNORMAL_OFFLINE")).toBeDefined();
    expect(result.contracts[0]?.reasons.find((row) => row.code === "OVERDUE_INVOICES")).toBeUndefined();
  });
  it("pagina todas as fontes e rejeita truncamento, duplicação, excesso ou registros de outro cliente", async () => {
    const { service, fixtures, listPage } = setup({
      su_ticket: Array.from({ length: 501 }, (_, index) => ({ id: String(index + 1), id_cliente: "1", data_criacao: "2026-10-01" })),
    });
    expect((await service.analyze(1)).sources.find((row) => row.key === "tickets")?.count).toBe(501);
    expect(listPage.mock.calls.filter((call) => call[0] === "su_ticket").map((call) => call[2])).toEqual([1, 2]);
    fixtures.su_ticket = [{ id: "1", id_cliente: "2", data_criacao: "2026-10-01" }];
    const original = listPage.getMockImplementation()!;
    for (const response of [
      { rows: fixtures.su_ticket, total: 1 },
      { rows: [{ id: "1", id_cliente: "1", data_criacao: "2026-10-01" }], total: 501 },
      { rows: [], total: 10001 },
      {
        rows: [
          { id: "1", id_cliente: "1", data_criacao: "2026-10-01" },
          { id: "1", id_cliente: "1", data_criacao: "2026-10-01" },
        ],
        total: 2,
      },
      { rows: [{ id: "1", id_cliente: "1", data_criacao: "inválida" }], total: 1 },
    ]) {
      listPage.mockImplementation(async (...args) => (args[0] === "su_ticket" ? response : original(...args)));
      expect((await service.analyze(1)).sources.find((row) => row.key === "tickets")?.status).toBe("unavailable");
    }
  });
  it("consulta novamente a cada chamada e interrompe novas consultas quando fechada", async () => {
    const { service, fixtures, listPage } = setup();
    const first = await service.analyze(1);
    fixtures.cliente![0]!.grau_satisfacao = "5";
    expect((await service.analyze(1)).contracts[0]?.score).toBe(first.contracts[0]!.score - 10);
    listPage.mockClear();
    const controller = new AbortController();
    controller.abort();
    await expect(service.analyze(1, controller.signal)).rejects.toMatchObject({ statusCode: 499 });
    expect(listPage).not.toHaveBeenCalled();
  });
  it("não analisa cadastros inativos ou contratos cancelados e falha no cadastro/contrato essencial", async () => {
    for (const overrides of [{ cliente: [{ ...customer, ativo: "N" }] }, { cliente_contrato: [{ ...contract, status: "I" }] }]) {
      const { service, listPage } = setup(overrides);
      const result = await service.analyze(1);
      expect(result.contracts).toEqual([]);
      expect(result.message).toBeTruthy();
      expect(listPage).toHaveBeenCalledTimes(2);
    }
    const { service, listPage } = setup({ cliente: [] });
    await expect(service.analyze(1)).rejects.toMatchObject({ statusCode: 404 });
    listPage.mockRejectedValueOnce(new Error("PRIVATE_TOKEN"));
    await expect(service.analyze(1)).rejects.toMatchObject({ statusCode: 502, message: expect.not.stringContaining("PRIVATE") });
  });
});
