import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { supportRoutes } from "../src/controllers/supportController.js";
import { AuthService } from "../src/services/AuthService.js";
import { SupportService } from "../src/services/support/SupportService.js";
import { loginDetails } from "../src/services/upgrades/UpgradeDetails.js";

afterEach(() => vi.restoreAllMocks());

describe("Detalhes do login pelo cliente", () => {
  it("exige cadastro e logins, valida IDs e mantém acesso ao equipamento e falhas separados", async () => {
    let permissions: string[] = [];
    vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async (request) =>
      request.headers.authorization ? { id: 1, name: "Teste", email: "teste@example.test", role: "OPERATOR", permissions } : null
    );
    const read = vi.spyOn(SupportService.prototype, "customerLogin").mockResolvedValue({
      login: loginDetails({ id: "13621", id_cliente: "6263", id_contrato: "0", login: "exemplo" }, false),
      queriedAt: "2026-10-13T19:00:00.000Z",
    });
    const app = Fastify();
    await app.register(supportRoutes, { prefix: "/api/support" });
    const url = "/api/support/customers/6263/logins/13621";
    const headers = { authorization: "test" };
    try {
      expect((await app.inject({ url })).statusCode).toBe(401);
      for (const grants of [[], ["support.customer.view"], ["support.logins.view"], ["support.contract.view", "support.logins.view"]]) {
        permissions = grants;
        expect((await app.inject({ url, headers })).statusCode).toBe(403);
      }
      expect(read).not.toHaveBeenCalled();
      permissions = ["support.customer.view", "support.logins.view"];
      for (const invalid of ["/customers/0/logins/13621", "/customers/6263/logins/NaN", "/customers/6263/logins/-1"]) {
        expect((await app.inject({ url: `/api/support${invalid}`, headers })).statusCode).toBe(400);
      }
      expect(read).not.toHaveBeenCalled();
      const response = await app.inject({ url, headers });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json().login).toMatchObject({ id: 13621, customerId: 6263, contractId: null });
      expect(read).toHaveBeenLastCalledWith(6263, 13621, false);
      permissions.push("support.equipment.access");
      expect((await app.inject({ url, headers })).statusCode).toBe(200);
      expect(read).toHaveBeenLastCalledWith(6263, 13621, true);
      read.mockRejectedValueOnce(Object.assign(new Error("Login não encontrado para este cliente."), { statusCode: 404 }));
      expect((await app.inject({ url, headers })).statusCode).toBe(404);
      read.mockRejectedValueOnce(new Error("PRIVATE_CONNECTION_DETAIL"));
      const failed = await app.inject({ url, headers });
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain("PRIVATE_CONNECTION_DETAIL");
    } finally {
      await app.close();
    }
  });
});
