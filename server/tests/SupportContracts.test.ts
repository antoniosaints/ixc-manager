import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { DatabaseSync } from "node:sqlite";
import { SupportContractsService, supportContractsQuery, supportContractsSql } from "../src/services/support/SupportContractsService.js";
import { assertReadQuery, type IxcReadQuery, type IxcReadSession } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { supportRoutes } from "../src/controllers/supportController.js";
import { AuthService } from "../src/services/AuthService.js";
import { rolePermissions, accessPresets } from "../src/config/permissions.js";
afterEach(() => vi.restoreAllMocks());
function fixture(extra = 0) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE cliente(id INTEGER PRIMARY KEY,razao TEXT,ativo TEXT,cnpj_cpf TEXT,telefone_celular TEXT,fone TEXT,cidade INTEGER,bairro TEXT);
    CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_vd_contrato INTEGER,id_filial INTEGER,contrato TEXT,
      status TEXT,status_internet TEXT,contrato_suspenso TEXT,endereco_padrao_cliente TEXT,cidade INTEGER,bairro TEXT,data_ativacao TEXT);
    CREATE TABLE vd_contratos(id INTEGER PRIMARY KEY,nome TEXT);
    CREATE TABLE cidade(id INTEGER PRIMARY KEY,nome TEXT);
    CREATE TABLE filial(id INTEGER PRIMARY KEY,fantasia TEXT,razao TEXT);
    CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,login TEXT,senha TEXT);
    INSERT INTO cliente VALUES(1,'Alice teste','S','123.456.789-01','9999','8888',1,'Centro'),
      (2,'Cliente 100%_teste','N','12.345.678/0001-90','','7777',2,'Bairro cliente');
    INSERT INTO vd_contratos VALUES(1,'Plano fibra'),(2,'Plano rádio'),(3,'Não usado');
    INSERT INTO cidade VALUES(1,'Cidade cliente'),(2,'Cidade instalação');
    INSERT INTO filial VALUES(1,'Filial um','Razão um'),(2,'','Razão dois');
    INSERT INTO cliente_contrato VALUES
      (10,1,1,1,'Contrato fibra','A','A','N','S',2,'Outro bairro','2026-10-01 12:00:00'),
      (20,2,2,2,'Contrato rádio','I','D','N','N',1,'Local contrato','0000-00-00'),
      (30,1,1,2,'Suspenso','A','A','S','S',1,'','2026-01-01'),
      (40,1,2,1,'Bloqueado','A','CA','N','S',1,'','2026-01-01');
    INSERT INTO radusuarios VALUES(1,1,10,'alice.teste','PRIVATE_PASSWORD'),(2,1,10,'alice.segundo','PRIVATE_PASSWORD'),
      (3,2,10,'vinculo.errado','PRIVATE_PASSWORD');`);
  const insert = db.prepare("INSERT INTO cliente_contrato VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let i = 0; i < extra; i++) insert.run(100 + i, 1, 1, 1, "Contrato extra", "A", "A", "N", "S", 1, "", "2026-01-01");
  const select = vi.fn(async (q: IxcReadQuery) => {
    assertReadQuery(q);
    return db.prepare(q.sql).all(...q.params);
  });
  const service = new SupportContractsService(
    { withSnapshot: async (read) => read({ select } as IxcReadSession) },
    () => new Date("2026-10-10T12:00:00Z")
  );
  return { db, service, select };
}
describe("Listagem global de contratos do Suporte", () => {
  it("defaults to active contracts, maps installation address and access state, exposes no credentials", async () => {
    const { db, service } = fixture();
    try {
      const result = await service.list({});
      expect(result.total).toBe(3);
      expect(result.items.map((r) => r.id)).toEqual([10, 30, 40]);
      expect(result.items[0]).toMatchObject({ city: "Cidade cliente", neighborhood: "Centro", phone: "9999", activatedAt: "2026-10-01" });
      expect((await service.list({ status: "I" })).items[0]).toMatchObject({
        city: "Cidade cliente",
        neighborhood: "Local contrato",
        phone: "7777",
        customerActive: false,
        activatedAt: null,
      });
      expect((await service.list({ status: "all" })).total).toBe(4);
      expect((await service.list({ access: "A" })).items.map((r) => r.id)).toEqual([10]);
      expect((await service.list({ access: "suspended" })).items.map((r) => r.id)).toEqual([30]);
      expect((await service.list({ access: "CA" })).items.map((r) => r.id)).toEqual([40]);
      expect(JSON.stringify(result)).not.toMatch(/senha|PRIVATE_PASSWORD/);
    } finally {
      db.close();
    }
  });
  it("filters exact IDs, CPF/CNPJ, escaped names, plan, branch and login without duplicate contracts or invalid customer links", async () => {
    const { db, service } = fixture();
    try {
      for (const [query, ids] of [
        [{ searchBy: "id", search: "10" }, [10]],
        [{ searchBy: "customerId", search: "2", status: "all" }, [20]],
        [{ searchBy: "document", search: "12345678901" }, [10, 30, 40]],
        [{ searchBy: "document", search: "12.345.678/0001-90", status: "all" }, [20]],
        [{ searchBy: "customer", search: "100%_teste", status: "all" }, [20]],
        [{ searchBy: "contract", search: "fibra" }, [10]],
        [{ searchBy: "login", search: "alice." }, [10]],
        [{ searchBy: "login", search: "vinculo.errado" }, []],
        [{ planId: 2, branchId: 1 }, [40]],
      ] as const) {
        const result = await service.list(query);
        expect(result.items.map((r) => r.id)).toEqual(ids);
        expect(result.total).toBe(ids.length);
      }
      expect(await service.filters()).toEqual({
        branches: [
          { id: 1, name: "Filial um" },
          { id: 2, name: "Razão dois" },
        ],
        plans: [
          { id: 1, name: "Plano fibra" },
          { id: 2, name: "Plano rádio" },
        ],
      });
    } finally {
      db.close();
    }
  });
  it("paginates with consistent totals and deterministic ordering, validates input and parameterizes searches", async () => {
    const { db, service } = fixture(12);
    try {
      const first = await service.list({}),
        second = await service.list({ page: 2 });
      expect(first.total).toBe(15);
      expect(second.total).toBe(15);
      expect(new Set([...first.items, ...second.items].map((r) => r.id)).size).toBe(15);
      expect((await service.list({ limit: 25 })).items).toHaveLength(15);
      for (const input of [
        { limit: 50 },
        { page: 0 },
        { branchId: -1 },
        { status: "A';DELETE" },
        { access: "INVALID" },
        { searchBy: "id", search: "1 OR 1=1" },
        { searchBy: "id", search: "9007199254740993" },
        { searchBy: "document", search: "123" },
        { search: "ab" },
      ])
        expect(supportContractsQuery.safeParse(input).success).toBe(false);
      const malicious = "' OR 1=1";
      const { list, total } = supportContractsSql({ search: malicious });
      for (const q of [list, total]) {
        assertReadQuery(q);
        expect(q.sql).not.toContain(malicious);
        expect(q.params).toContain(`%${malicious}%`);
      }
    } finally {
      db.close();
    }
  });
  it("checks contract permission before querying, protects errors and includes support defaults", async () => {
    vi.spyOn(AuthService.prototype, "requireUser").mockResolvedValue({ id: 1 } as never);
    const permission = vi.spyOn(AuthService.prototype, "requirePermission").mockResolvedValue({ id: 1 } as never);
    const list = vi.spyOn(SupportContractsService.prototype, "list").mockRejectedValue(new Error("PRIVATE_PASSWORD"));
    const filters = vi.spyOn(SupportContractsService.prototype, "filters").mockRejectedValue(new Error("PRIVATE_PASSWORD"));
    const app = Fastify();
    await app.register(supportRoutes, { prefix: "/api/support" });
    try {
      for (const url of ["/api/support/contracts", "/api/support/contracts/filters"]) {
        permission.mockRejectedValueOnce(Object.assign(new Error("Sem acesso"), { statusCode: 403 }));
        expect((await app.inject({ url })).statusCode).toBe(403);
        expect(list).not.toHaveBeenCalled();
        expect(filters).not.toHaveBeenCalled();
      }
      for (const url of ["/api/support/contracts", "/api/support/contracts/filters"]) {
        const response = await app.inject({ url });
        expect(response.statusCode).toBe(502);
        expect(response.body).not.toContain("PRIVATE_PASSWORD");
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(permission).toHaveBeenLastCalledWith(expect.anything(), "support.contract.view");
        expect((await app.inject({ url, method: "POST" })).statusCode).toBe(404);
      }
      expect((await app.inject({ url: "/api/support/contracts?searchBy=id&search=invalid" })).statusCode).toBe(400);
      for (const role of ["ADMIN", "MANAGER", "OPERATOR"] as const) expect(rolePermissions[role]).toContain("support.contract.view");
      expect(accessPresets.find((p) => p.key === "SUPPORT")?.permissions).toContain("support.contract.view");
    } finally {
      await app.close();
    }
  });
});
