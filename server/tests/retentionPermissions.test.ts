import Fastify from "fastify";
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
import { RetentionRepository } from "../src/repositories/RetentionRepository.js";
import { db } from "../src/repositories/database.js";
import { enqueueFullSync, retentionQueue } from "../src/queues/retentionQueue.js";
afterEach(() => vi.restoreAllMocks());
it("nega todas as ações de Churn sem permissão antes de acessar dados ou filas", async () => {
  vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({
    id: 2,
    name: "Teste",
    email: "test@example.test",
    role: "MANAGER",
    permissions: [],
  });
  const query = vi.spyOn(db, "query"),
    execute = vi.spyOn(db, "execute"),
    summary = vi.spyOn(RetentionRepository.prototype, "getSummary");
  const app = Fastify();
  await app.register(retentionRoutes, { prefix: "/api/retention" });
  try {
    for (const url of [
      "/summary",
      "/customers",
      "/customers?attentionOnly=true",
      "/customers?workflowStatus=RESOLVED",
      "/customers/1",
      "/customers/1/timeline",
      "/customers/1/pdf",
      "/sync/status",
      "/jobs/1",
      "/analytics/city",
    ])
      expect((await app.inject({ url: `/api/retention${url}` })).statusCode).toBe(403);
    for (const [method, url, payload] of [
      ["POST", "/customers/1/notes", { content: "Teste" }],
      ["PATCH", "/customers/1/workflow", { status: "RESOLVED" }],
      ["PATCH", "/customers/1/attention", { contractId: 1, critical: true }],
      ["POST", "/recalculate", {}],
      ["POST", "/customers/1/recalculate", {}],
      ["POST", "/sync", {}],
    ] as const)
      expect((await app.inject({ method, url: `/api/retention${url}`, payload })).statusCode).toBe(403);
    expect(query).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(summary).not.toHaveBeenCalled();
    expect(enqueueFullSync).not.toHaveBeenCalled();
    expect(retentionQueue.add).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
it("a fila liberada não concede painel e a leitura do cliente não concede escrita", async () => {
  const authenticated = vi
    .spyOn(AuthService.prototype, "authenticate")
    .mockResolvedValue({ id: 2, name: "Teste", email: "test@example.test", role: "USER", permissions: ["churn.attention.view"] });
  vi.spyOn(RetentionRepository.prototype, "listCustomers").mockResolvedValue({ items: [], total: 0 });
  const query = vi.spyOn(db, "query");
  const app = Fastify();
  await app.register(retentionRoutes, { prefix: "/api/retention" });
  try {
    expect((await app.inject({ url: "/api/retention/customers?attentionOnly=true" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/retention/customers?workflowStatus=ALL" })).statusCode).toBe(403);
    authenticated.mockResolvedValue({
      id: 2,
      name: "Teste",
      email: "test@example.test",
      role: "USER",
      permissions: ["churn.customer.view"],
    });
    expect((await app.inject({ method: "POST", url: "/api/retention/customers/1/notes", payload: { content: "Teste" } })).statusCode).toBe(
      403
    );
    expect(
      (await app.inject({ method: "PATCH", url: "/api/retention/customers/1/workflow", payload: { status: "RESOLVED" } })).statusCode
    ).toBe(403);
    expect(query).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
