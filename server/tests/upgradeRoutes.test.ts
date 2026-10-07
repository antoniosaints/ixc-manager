import { rolePermissions } from "../src/config/permissions.js";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { upgradeRoutes } from "../src/controllers/upgradeController.js";
import { AuthService } from "../src/services/AuthService.js";
import { IxcApiService } from "../src/integrations/ixc/IxcApiService.js";

afterEach(() => vi.restoreAllMocks());

async function appForTest() {
  vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async (request) => {
    const role = request.headers.authorization;
    return role
      ? {
          id: 1,
          name: "Teste",
          email: "teste@example.test",
          role: role === "USER" ? "USER" : "OPERATOR",
          permissions: rolePermissions[role === "USER" ? "USER" : "OPERATOR"],
        }
      : null;
  });
  const list = vi.spyOn(IxcApiService.prototype, "listPage").mockResolvedValue({ rows: [], total: 0 });
  const app = Fastify();
  await app.register(upgradeRoutes, { prefix: "/api/upgrades" });
  return { app, list };
}

describe("Rotas de Upgrades", () => {
  it("exige autenticação e perfil operacional antes de consultar o IXC", async () => {
    const { app, list } = await appForTest();
    try {
      expect((await app.inject({ url: "/api/upgrades/opportunities" })).statusCode).toBe(401);
      expect((await app.inject({ url: "/api/upgrades/plans", headers: { authorization: "USER" } })).statusCode).toBe(403);
      expect(list).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("retorna respostas sem cache, valida paginação e sanitiza falhas do IXC", async () => {
    const { app, list } = await appForTest();
    const headers = { authorization: "OPERATOR" };
    try {
      const response = await app.inject({ url: "/api/upgrades/opportunities", headers });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toMatchObject({ total: 0, items: [] });
      for (const params of [
        "days=31",
        "limit=1000",
        "page=0",
        "status=any",
        "planId=-1",
        "planId=0",
        "planId=9007199254740992",
        "planId=abc",
      ])
        expect((await app.inject({ url: `/api/upgrades/opportunities?${params}`, headers })).statusCode).toBe(400);
      list.mockRejectedValueOnce(new Error("PRIVATE_CREDENTIAL"));
      const failed = await app.inject({ url: "/api/upgrades/plans", headers });
      expect(failed.statusCode).toBe(502);
      expect(failed.headers["cache-control"]).toBe("no-store");
      expect(failed.body).not.toContain("PRIVATE_CREDENTIAL");
      expect((await app.inject({ method: "PUT", url: "/api/upgrades/contracts/1", headers })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
  it("não registra URLs de busca nem dados dos contratos nos logs do servidor", async () => {
    const { app: original } = await appForTest();
    await original.close();
    const logs: string[] = [];
    const app = Fastify({
      logger: {
        stream: {
          write: (message: string) => {
            logs.push(message);
          },
        },
      },
    });
    await app.register(upgradeRoutes, { prefix: "/api/upgrades", logLevel: "silent" });
    try {
      await app.inject({ url: "/api/upgrades/opportunities?search=PRIVATE_CUSTOMER_NAME", headers: { authorization: "OPERATOR" } });
      expect(logs.join("")).not.toContain("PRIVATE_CUSTOMER_NAME");
      expect(logs).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
