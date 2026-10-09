import Fastify from "fastify";
import { PDFDocument } from "pdf-lib";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/queues/retentionQueue.js", () => ({
  enqueueCustomerRecalculate: vi.fn(),
  enqueueFullSync: vi.fn(),
  getRetentionJobStatus: vi.fn(),
  getRetentionQueueStatus: vi.fn(),
  retentionQueue: { add: vi.fn() },
}));
import { retentionRoutes } from "../src/controllers/retentionController.js";
import { AuthService } from "../src/services/AuthService.js";
import { db } from "../src/repositories/database.js";
import { directRetention } from "../src/services/retention/DirectRetentionService.js";
import { createCustomerRiskPdf, type CustomerRiskReport } from "../src/services/retention/CustomerRiskPdf.js";
const report: CustomerRiskReport = {
  customer: {
    id: 6001,
    contract_id: 14001,
    name: "Cliente de demonstração",
    city: "Cidade Exemplo",
    neighborhood: "Centro",
    plan_name: "Fibra 600 Mega",
    score: 50,
    risk_level: "MEDIUM",
    financial_score: 15,
    support_score: 25,
    network_score: 5,
    contract_score: 5,
    satisfaction_score: 0,
    calculated_at: "2026-10-06T12:00:00Z",
  },
  reasons: [
    { category: "support", description: "5 atendimentos nos últimos 30 dias", points: 15 },
    { category: "financial", description: "Bloqueio financeiro recente", points: 10 },
  ],
};
afterEach(() => vi.restoreAllMocks());
const appWith = async (permissions: string[]) => {
  vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({
    id: 2,
    name: "Teste",
    email: "test@example.test",
    role: "OPERATOR",
    permissions,
  });
  const app = Fastify();
  await app.register(retentionRoutes, { prefix: "/api/retention" });
  return app;
};
it("exige leitura e exportação antes de consultar qualquer dado", async () => {
  const query = vi.spyOn(db, "query");
  for (const permissions of [[], ["churn.customer.view"], ["churn.customer.export"]]) {
    const app = await appWith(permissions);
    try {
      expect((await app.inject({ url: "/api/retention/customers/6001/pdf?contractId=14001" })).statusCode).toBe(403);
    } finally {
      await app.close();
    }
  }
  expect(query).not.toHaveBeenCalled();
});
it("exporta o contrato selecionado, com fatores do mesmo score, sem cache", async () => {
  const query = vi.spyOn(directRetention, "getSnapshot").mockResolvedValue(report as any);
  const app = await appWith(["churn.customer.view", "churn.customer.export"]);
  try {
    const response = await app.inject({ url: "/api/retention/customers/6001/pdf?contractId=14001" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-disposition"]).toContain("churn-cliente-6001-contrato-14001.pdf");
    expect(query).toHaveBeenCalledWith(6001, 14001, expect.any(AbortSignal));
    expect(query).toHaveBeenCalledOnce();
    expect((await PDFDocument.load(response.rawPayload)).getPageCount()).toBe(1);
  } finally {
    await app.close();
  }
});
it("retorna 404 para contrato de outro cliente e não expõe erros internos", async () => {
  const query = vi
    .spyOn(directRetention, "getSnapshot")
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error("Dados internos que não devem sair"));
  const app = await appWith(["churn.customer.view", "churn.customer.export"]);
  try {
    expect((await app.inject({ url: "/api/retention/customers/6001/pdf?contractId=9999" })).statusCode).toBe(404);
    const failure = await app.inject({ url: "/api/retention/customers/6001/pdf" });
    expect(failure.statusCode).toBe(500);
    expect(failure.body).not.toContain("Dados internos");
    expect(query).toHaveBeenCalledTimes(2);
    expect((await app.inject({ url: "/api/retention/customers/6001/pdf?contractId=-1" })).statusCode).toBe(400);
    expect(query).toHaveBeenCalledTimes(2);
  } finally {
    await app.close();
  }
});
it("pagina motivos extensos e suporta análise ainda não calculada", async () => {
  const long = await createCustomerRiskPdf({
    ...report,
    customer: { ...report.customer, name: "Cliente com nome completo extenso ".repeat(6) },
    reasons: Array.from({ length: 35 }, (_, i) => ({
      category: "support",
      points: 5,
      description: `Motivo ${i + 1}: ` + "Descrição detalhada do atendimento e da causa de risco. ".repeat(6),
    })),
  });
  expect((await PDFDocument.load(long)).getPageCount()).toBeGreaterThan(1);
  const empty = await createCustomerRiskPdf({
    customer: {
      ...report.customer,
      score: null,
      risk_level: null,
      calculated_at: null,
      financial_score: null,
      support_score: null,
      network_score: null,
      contract_score: null,
      satisfaction_score: null,
    },
    reasons: [],
  });
  expect((await PDFDocument.load(empty)).getPageCount()).toBe(1);
});
