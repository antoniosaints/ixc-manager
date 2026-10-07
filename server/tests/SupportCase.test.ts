import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { caseStatus } from "../../client/src/supportApi.js";
import { SupportCaseService, caseDetailQuery, caseHistoryQueries, casePageQuery } from "../src/services/support/SupportCaseService.js";
import { assertReadQuery, type IxcReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { supportRoutes } from "../src/controllers/supportController.js";
import { AuthService } from "../src/services/AuthService.js";
afterEach(() => vi.restoreAllMocks());
function fixture(
  parent: Record<string, unknown> | null = {
    id: 20,
    customerId: 1,
    openedAt: "2026-10-01 12:00:00",
    closedAt: "0000-00-00 00:00:00",
    message: "<script>Texto</script>",
    token: "PRIVATE",
    status: "A",
    messageTruncated: 0,
  }
) {
  const select = vi.fn(async (q: IxcReadQuery) => {
    assertReadQuery(q);
    if (q.name === "support-case-detail") return parent ? [parent] : [];
    if (q.name.endsWith("-count")) return [{ total: "1" }];
    return [
      { id: "9007199254740993", date: "2026-10-02 13:00:00", operator: "Teste", body: "Mensagem teste", token: "SECRET", truncated: 0 },
    ];
  });
  return { select, service: new SupportCaseService({ withSnapshot: async (read) => read({ select: select as never }) }) };
}
describe("Detalhes de OS e atendimentos SQL", () => {
  it("translates known states independently for OS and tickets, keeping unknown codes visible", () => {
    expect(caseStatus("EX", "orders")).toBe("Em execução");
    expect(caseStatus("EP", "tickets")).toBe("Em progresso");
    expect(caseStatus("C", "tickets")).toBe("Cancelado");
    expect(caseStatus("UNKNOWN", "orders")).toBe("Status UNKNOWN");
  });
  it("scopes detail by both client and case, with explicit fields and no credential columns", () => {
    for (const kind of ["orders", "tickets"] as const) {
      const q = caseDetailQuery(1, kind, 20);
      assertReadQuery(q);
      expect(q.params).toEqual([20, 1]);
      expect(q.sql).toContain("t.id=? AND t.id_cliente=?");
      expect(q.sql).not.toMatch(/SELECT \*|token|senha|email/);
    }
  });
  it("rejects records outside the selected customer before reading their messages", async () => {
    for (const parent of [null, { id: 20, customerId: 2 }]) {
      const { service, select } = fixture(parent);
      await expect(service.history(1, "orders", 20, "messages", {})).rejects.toMatchObject({ statusCode: 404 });
      expect(select).toHaveBeenCalledOnce();
    }
  });
  it("uses the correct linked history sources with stable ordering and pagination", () => {
    for (const [kind, section, table, field] of [
      ["orders", "messages", "su_oss_chamado_mensagem", "id_chamado"],
      ["orders", "movements", "su_oss_chamado_historico", "su_oss_chamado_id"],
      ["tickets", "messages", "su_mensagens", "id_ticket"],
      ["tickets", "movements", "su_mensagens", "id_ticket"],
    ] as const) {
      const { summary, details } = caseHistoryQueries(kind, 20, section, { page: 2, limit: 25, order: "oldest" });
      assertReadQuery(summary);
      assertReadQuery(details);
      expect(details.sql).toContain(`FROM ${table} m`);
      expect(details.sql).toContain(`m.${field}=?`);
      expect(details.params).toEqual([20, 25, 25]);
      expect(details.sql).toContain("m.id ASC");
    }
  });
  it("maps only explicit public detail/history fields, dates and large IDs without executing HTML", async () => {
    const { service } = fixture();
    const detail = await service.detail(1, "orders", 20);
    expect(detail.record.closedAt).toBeNull();
    expect(detail.record.message).toBe("<script>Texto</script>");
    expect(JSON.stringify(detail)).not.toContain("PRIVATE");
    const history = await service.history(1, "tickets", 20, "messages", {});
    expect(history.items[0]?.id).toBe("9007199254740993");
    expect(history.items[0]?.body).toBe("Mensagem teste");
    expect(JSON.stringify(history)).not.toContain("SECRET");
    expect(history.source).toBe("ticket-interactions");
    expect(casePageQuery.safeParse({ limit: 500 }).success).toBe(false);
  });
  it("requires customer and section permissions for every new GET route and conceals connection errors", async () => {
    vi.spyOn(AuthService.prototype, "requireUser").mockResolvedValue({ id: 1 } as never);
    const permission = vi.spyOn(AuthService.prototype, "requirePermission").mockResolvedValue({ id: 1 } as never);
    const detail = vi.spyOn(SupportCaseService.prototype, "detail").mockRejectedValue(new Error("SQL_PASSWORD"));
    const history = vi.spyOn(SupportCaseService.prototype, "history").mockRejectedValue(new Error("SQL_PASSWORD"));
    const app = Fastify();
    await app.register(supportRoutes, { prefix: "/api/support" });
    try {
      for (const kind of ["orders", "tickets"]) {
        for (const section of ["", "/messages", "/movements"]) {
          const url = `/api/support/customers/1/${kind}/20${section}`;
          const response = await app.inject({ url });
          expect(response.statusCode).toBe(502);
          expect(response.headers["cache-control"]).toBe("no-store");
          expect(response.body).not.toContain("SQL_PASSWORD");
          expect(permission).toHaveBeenLastCalledWith(expect.anything(), "support.customer.view", `support.${kind}.view`);
          expect((await app.inject({ method: "POST", url })).statusCode).toBe(404);
        }
      }
      permission.mockRejectedValueOnce(Object.assign(new Error("Sem permissão"), { statusCode: 403 }));
      const before = detail.mock.calls.length;
      expect((await app.inject({ url: "/api/support/customers/1/orders/20" })).statusCode).toBe(403);
      expect(detail).toHaveBeenCalledTimes(before);
      expect(history).toHaveBeenCalledTimes(4);
    } finally {
      await app.close();
    }
  });
});
