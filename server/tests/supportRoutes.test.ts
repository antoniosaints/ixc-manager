import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { directRetention } from "../src/services/retention/DirectRetentionService.js";
import { supportRoutes } from "../src/controllers/supportController.js";
import { AuthService } from "../src/services/AuthService.js";
import { IxcApiService } from "../src/integrations/ixc/IxcApiService.js";
import { SupportService } from "../src/services/support/SupportService.js";
import { UpgradeService } from "../src/services/upgrades/UpgradeService.js";
import { permissionKeys, rolePermissions } from "../src/config/permissions.js";
afterEach(() => vi.restoreAllMocks());
async function setup(permissions: string[] = rolePermissions.OPERATOR) {
  vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async (request) =>
    request.headers.authorization ? { id: 1, name: "Operador", email: "exemplo@example.test", role: "OPERATOR", permissions } : null
  );
  const list = vi.spyOn(IxcApiService.prototype, "listPage").mockResolvedValue({ rows: [], total: 0 });
  const app = Fastify();
  await app.register(supportRoutes, { prefix: "/api/support" });
  return { app, list };
}
const headers = { authorization: "test" };
describe("Permissões e rotas de Suporte", () => {
  it("exige permissão própria para analisar, consulta apenas por GET e não guarda a resposta", async () => {
    const { app, list } = await setup(["support.customer.view"]);
    try {
      expect((await app.inject({ url: "/api/support/customers/1/analysis" })).statusCode).toBe(401);
      expect((await app.inject({ url: "/api/support/customers/1/analysis", headers })).statusCode).toBe(403);
      expect(list).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
    vi.restoreAllMocks();
    const allowed = await setup(["support.customer.view", "support.customer.analyze"]);
    try {
      const analyze = vi.spyOn(directRetention, "analyze").mockResolvedValue({
        customer: { id: 1, name: "Cliente Exemplo" },
        contracts: [],
        partial: false,
        sources: [],
        warnings: [],
        message: null,
        queriedAt: "2026-10-09T12:00:00Z",
      } as any);
      const response = await allowed.app.inject({ url: "/api/support/customers/1/analysis", headers });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json().contracts).toEqual([]);
      const before = analyze.mock.calls.length;
      expect((await allowed.app.inject({ url: "/api/support/customers/0/analysis", headers })).statusCode).toBe(400);
      expect(analyze.mock.calls.length).toBe(before);
      expect((await allowed.app.inject({ method: "POST", url: "/api/support/customers/1/analysis", headers })).statusCode).toBe(404);
    } finally {
      await allowed.app.close();
    }
  });
  it("não consulta o IXC sem autenticação ou permissão de lista", async () => {
    const { app, list } = await setup([]);
    try {
      expect((await app.inject({ url: "/api/support/customers" })).statusCode).toBe(401);
      expect((await app.inject({ url: "/api/support/customers", headers })).statusCode).toBe(403);
      expect(list).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("ativa filtros padrão, impede paginação excessiva e sanitiza erros com no-store", async () => {
    const { app, list } = await setup();
    try {
      const response = await app.inject({ url: "/api/support/customers", headers });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(list.mock.calls[0]?.[1].gridParam).toEqual([{ TB: "cliente.ativo", OP: "=", P: "S" }]);
      for (const query of ["status=invalid", "page=0", "limit=1000", "searchBy=invalid", "search=ab", "searchBy=id&search=x"])
        expect((await app.inject({ url: `/api/support/customers?${query}`, headers })).statusCode).toBe(400);
      list.mockRejectedValueOnce(new Error("PRIVATE_TOKEN"));
      const failed = await app.inject({ url: "/api/support/customers", headers });
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain("PRIVATE_TOKEN");
    } finally {
      await app.close();
    }
  });
  it("aceita os três novos tipos de busca pela rota com no-store e valida os termos", async () => {
    const { app, list } = await setup();
    try {
      for (const [searchBy, search, qtype] of [
        ["login", "exemplo", "radusuarios.login"],
        ["document", "12345678900", "cliente.cnpj_cpf"],
        ["address", "Rua Central", "cliente.endereco"],
      ]) {
        list.mockClear();
        const params = new URLSearchParams({ searchBy: searchBy!, search: search! });
        const response = await app.inject({ url: `/api/support/customers?${params}`, headers });
        expect(response.statusCode).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(list.mock.calls[0]?.[1].qtype).toBe(qtype);
      }
      list.mockClear();
      for (const query of ["searchBy=login&search=ab", "searchBy=address&search=x", "searchBy=document&search=123"])
        expect((await app.inject({ url: `/api/support/customers?${query}`, headers })).statusCode).toBe(400);
      expect(list).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("isola as permissões de cadastro, contratos, logins, OS, atendimentos e comodatos", async () => {
    const { app, list } = await setup(["support.customers.view"]);
    try {
      for (const path of [
        "customers/1",
        "customers/1/contracts",
        "customers/1/logins",
        "customers/1/orders",
        "customers/1/tickets",
        "contracts/100",
        "contracts/100/logins",
        "contracts/100/logins/200",
        "contracts/100/comodato",
        "contracts/100/logins/200/secrets/router1",
      ])
        expect((await app.inject({ url: `/api/support/${path}`, headers })).statusCode).toBe(403);
      expect(list).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("exige as quatro permissões para copiar senha e acessar equipamento", async () => {
    const required = ["support.contract.view", "support.logins.view", "support.credentials.view", "support.equipment.access"];
    for (const missing of required) {
      const { app, list } = await setup(required.filter((key) => key !== missing));
      try {
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/api/support/contracts/100/logins/200/access",
              headers,
              payload: { protocol: "https", port: 7000 },
            })
          ).statusCode
        ).toBe(403);
        expect(list).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    }
    expect(rolePermissions.OPERATOR).not.toContain("support.credentials.view");
    expect(rolePermissions.OPERATOR).not.toContain("support.equipment.access");
  });
  it("reutiliza o acesso técnico para as seis combinações e rejeita portas arbitrárias", async () => {
    const { app } = await setup([...permissionKeys]);
    const access = vi
      .spyOn(UpgradeService.prototype, "loginAccess")
      .mockResolvedValue({ url: "http://192.0.2.1:7000/", password: "Senha de teste", queriedAt: "2026-10-06T12:00:00Z" });
    try {
      for (const protocol of ["http", "https"])
        for (const port of [80, 7000, 7001]) {
          const response = await app.inject({
            method: "POST",
            url: "/api/support/contracts/100/logins/200/access",
            headers,
            payload: { protocol, port },
          });
          expect(response.statusCode).toBe(200);
          expect(response.headers["cache-control"]).toBe("no-store");
          expect(access).toHaveBeenLastCalledWith(100, 200, protocol, port);
        }
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/support/contracts/100/logins/200/access",
            headers,
            payload: { protocol: "http", port: 22 },
          })
        ).statusCode
      ).toBe(400);
      expect(access).toHaveBeenCalledTimes(6);
    } finally {
      await app.close();
    }
  });
  it("só repassa a permissão de acesso a equipamento no DTO de logins", async () => {
    const { app } = await setup();
    const customerLogins = vi
      .spyOn(SupportService.prototype, "logins")
      .mockResolvedValue({ items: [], page: 1, limit: 10, total: 0, queriedAt: "2026-10-06T12:00:00Z" });
    const contractLogins = vi
      .spyOn(UpgradeService.prototype, "logins")
      .mockResolvedValue({ items: [], page: 1, limit: 10, total: 0, queriedAt: "2026-10-06T12:00:00Z" });
    try {
      expect((await app.inject({ url: "/api/support/customers/1/logins", headers })).statusCode).toBe(200);
      expect(customerLogins).toHaveBeenCalledWith(1, { page: 1, limit: 10 }, false);
      expect((await app.inject({ url: "/api/support/contracts/100/logins", headers })).statusCode).toBe(200);
      expect(contractLogins).toHaveBeenCalledWith(100, { page: 1, limit: 10 }, false);
    } finally {
      await app.close();
    }
  });
  it("não grava buscas e dados dos clientes em logs", async () => {
    const { app: original } = await setup();
    await original.close();
    const logs: string[] = [];
    const app = Fastify({
      logger: {
        stream: {
          write: (value: string) => {
            logs.push(value);
          },
        },
      },
    });
    await app.register(supportRoutes, { prefix: "/api/support", logLevel: "silent" });
    try {
      await app.inject({ url: "/api/support/customers?search=PRIVATE_CUSTOMER", headers });
      expect(logs).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
