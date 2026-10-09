import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { DatabaseSync } from "node:sqlite";
import { SupportOrdersService, supportOrdersQuery, supportOrdersSql } from "../src/services/support/SupportOrdersService.js";
import { assertReadQuery, type IxcReadQuery, type IxcReadSession } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { supportRoutes } from "../src/controllers/supportController.js";
import { AuthService } from "../src/services/AuthService.js";
import { rolePermissions, accessPresets } from "../src/config/permissions.js";
import { canOpenRecord } from "../../client/src/recordNavigation.js";
afterEach(() => vi.restoreAllMocks());
const now = () => new Date("2026-10-09T15:00:00Z");
function fixture(extra = 0) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE cliente(id INTEGER PRIMARY KEY,razao TEXT,ativo TEXT);
    CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER,contrato TEXT);
    CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,id_cliente INTEGER,login TEXT);
    CREATE TABLE su_oss_assunto(id INTEGER PRIMARY KEY,assunto TEXT);
    CREATE TABLE funcionarios(id INTEGER PRIMARY KEY,funcionario TEXT);
    CREATE TABLE filial(id INTEGER PRIMARY KEY,fantasia TEXT,razao TEXT);
    CREATE TABLE su_oss_chamado(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato_kit INTEGER,id_login INTEGER,
    id_assunto INTEGER,id_tecnico INTEGER,id_filial INTEGER,protocolo TEXT,status TEXT,prioridade TEXT,
    data_abertura TEXT,data_agenda TEXT,data_fechamento TEXT);
    INSERT INTO cliente VALUES(1,'Cliente teste','S'),(2,'Cliente 100%_teste','N');
    INSERT INTO cliente_contrato VALUES(10,1,'Plano teste'),(20,2,'Outro cliente');
    INSERT INTO radusuarios VALUES(100,1,'login.teste'),(200,2,'outro.login');
    INSERT INTO su_oss_assunto VALUES(1,'Instalação'),(2,'Suporte');
    INSERT INTO funcionarios VALUES(1,'Técnico teste'),(2,'Não usado');
    INSERT INTO filial VALUES(1,'Filial teste','Razão teste');`);
  const insert = db.prepare("INSERT INTO su_oss_chamado VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const add = (
    id: number,
    status: string,
    priority = "N",
    schedule: string | null = null,
    customer = 1,
    contract = 10,
    login = 100,
    subject = 1
  ) =>
    insert.run(
      id,
      customer,
      contract,
      login,
      subject,
      1,
      1,
      `P-${id}`,
      status,
      priority,
      "2026-10-01 12:00:00",
      schedule,
      status === "F" ? "2026-10-02 12:00:00" : "0000-00-00 00:00:00"
    );
  add(1, "A", "A", "2026-10-09 11:59:59");
  add(2, "F", "C", "2026-10-01 12:00:00");
  add(3, "EX", "C", "2026-10-09 12:00:01");
  add(4, "AG", "N", "0000-00-00 00:00:00", 2, 20, 200, 2);
  add(5, "UNKNOWN");
  add(6, "A", "B", null, 1, 20, 200);
  add(7, "A", "N", null, 999, 0, 0);
  for (let i = 0; i < extra; i++) add(100 + i, "A");
  const select = vi.fn(async (q: IxcReadQuery) => {
    assertReadQuery(q);
    return db.prepare(q.sql).all(...q.params);
  });
  const service = new SupportOrdersService({ withSnapshot: async (read) => read({ select } as IxcReadSession) }, now);
  return { db, service, select };
}
describe("Listagem global de OS", () => {
  it("uses filtered totals and one row per OS; late appointments use Brasília time and exclude finalized/zero dates", async () => {
    const { db, service } = fixture();
    try {
      const open = await service.list({});
      expect(open.total).toBe(5);
      expect(open.summary).toEqual({ total: 5, open: 5, overdue: 1, urgent: 2 });
      expect(open.items.map((r) => r.id)).toEqual([7, 6, 4, 3, 1]);
      expect(open.items.find((r) => r.id === 6)).toMatchObject({ contractId: null, contractName: null, loginId: null, login: null });
      expect(open.items.find((r) => r.id === 7)?.customerId).toBeNull();
      expect(open.items.find((r) => r.id === 4)).toMatchObject({ scheduledAt: null, customerActive: false });
      expect((await service.list({ status: "all" })).total).toBe(7);
      expect((await service.list({ status: "F" })).summary).toEqual({ total: 1, open: 0, overdue: 0, urgent: 0 });
      expect((await service.list({ overdue: "yes" })).items.map((r) => r.id)).toEqual([1]);
    } finally {
      db.close();
    }
  });
  it("filters IDs, names, protocol, login, subject, technician, branch, priority and date basis", async () => {
    const { db, service } = fixture();
    try {
      for (const [query, expected] of [
        [{ searchBy: "id", search: "3" }, [3]],
        [{ searchBy: "protocol", search: "P-1" }, [1]],
        [{ searchBy: "customer", search: "100%_teste" }, [4]],
        [{ searchBy: "customerId", search: "2" }, [4]],
        [{ searchBy: "contractId", search: "20" }, [6, 4]],
        [{ searchBy: "login", search: "login.teste" }, [3, 1]],
        [{ subjectId: 2, technicianId: 1, branchId: 1 }, [4]],
        [{ technicianId: 2 }, []],
        [{ priority: "C" }, [3]],
        [{ dateBy: "scheduled", from: "2026-10-09", to: "2026-10-09" }, [3, 1]],
        [{ status: "all", dateBy: "closed", from: "2026-10-02", to: "2026-10-02" }, [2]],
      ] as const)
        expect((await service.list(query)).items.map((r) => r.id)).toEqual(expected);
      const options = await service.filters();
      expect(options.technicians).toEqual([{ id: 1, name: "Técnico teste" }]);
      expect(options.subjects).toHaveLength(2);
    } finally {
      db.close();
    }
  });
  it("paginates deterministically, keeps unscheduled orders last, rejects invalid/injected filters and binds user search", async () => {
    const { db, service } = fixture(12);
    try {
      const first = await service.list({ order: "oldest" }),
        second = await service.list({ order: "oldest", page: 2 });
      expect(first.total).toBe(17);
      expect(new Set([...first.items, ...second.items].map((r) => r.id)).size).toBe(17);
      expect((await service.list({ order: "scheduled" })).items.slice(0, 2).map((r) => r.id)).toEqual([1, 3]);
      for (const input of [
        { limit: 1000 },
        { from: "2026-02-30" },
        { from: "2026-10-10", to: "2026-10-01" },
        { searchBy: "id", search: "1 OR 1=1" },
        { status: "A';DELETE" },
      ])
        expect(supportOrdersQuery.safeParse(input).success).toBe(false);
      const malicious = "' OR 1=1";
      const { list, summary } = supportOrdersSql({ search: malicious }, now());
      for (const q of [list, summary]) {
        assertReadQuery(q);
        expect(q.sql).not.toContain(malicious);
        expect(q.params).toContain(`%${malicious}%`);
      }
    } finally {
      db.close();
    }
  });
  it("requires OS permission before any query, conceals SQL failures and preserves detail permission rules", async () => {
    vi.spyOn(AuthService.prototype, "requireUser").mockResolvedValue({ id: 1 } as never);
    const permission = vi.spyOn(AuthService.prototype, "requirePermission").mockResolvedValue({ id: 1 } as never);
    const list = vi.spyOn(SupportOrdersService.prototype, "list").mockRejectedValue(new Error("PRIVATE_PASSWORD"));
    const filters = vi.spyOn(SupportOrdersService.prototype, "filters").mockRejectedValue(new Error("PRIVATE_PASSWORD"));
    const app = Fastify();
    await app.register(supportRoutes, { prefix: "/api/support" });
    try {
      for (const url of ["/api/support/orders", "/api/support/orders/filters"]) {
        permission.mockRejectedValueOnce(Object.assign(new Error("Sem acesso"), { statusCode: 403 }));
        expect((await app.inject({ url })).statusCode).toBe(403);
        expect(list).not.toHaveBeenCalled();
        expect(filters).not.toHaveBeenCalled();
      }
      for (const url of ["/api/support/orders", "/api/support/orders/filters"]) {
        const response = await app.inject({ url });
        expect(response.statusCode).toBe(502);
        expect(response.body).not.toContain("PRIVATE_PASSWORD");
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(permission).toHaveBeenLastCalledWith(expect.anything(), "support.orders.view");
        expect((await app.inject({ url, method: "POST" })).statusCode).toBe(404);
      }
      expect((await app.inject({ url: "/api/support/orders?searchBy=id&search=invalid" })).statusCode).toBe(400);
      expect(canOpenRecord({ kind: "orders", id: 1, customerId: 1 }, (p) => p === "support.orders.view")).toBe(false);
      for (const role of ["ADMIN", "MANAGER", "OPERATOR"] as const) expect(rolePermissions[role]).toContain("support.orders.view");
      expect(accessPresets.find((p) => p.key === "SUPPORT")?.permissions).toContain("support.orders.view");
    } finally {
      await app.close();
    }
  });
});
