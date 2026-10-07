import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectionSubscription, connectionPermissions, type ConnectionScope } from "../src/services/network/ConnectionMonitorScope.js";
import { connectionMonitorSql } from "../src/services/network/NetworkMonitor.js";
import { connectionIp, connectionStatus } from "../src/services/network/LoginConnection.js";
import { loginDetails } from "../src/services/upgrades/UpgradeDetails.js";
import { IxcReadDatabase, assertReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { networkRoutes } from "../src/controllers/networkController.js";
import { AuthService } from "../src/services/AuthService.js";
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,id_caixa_ftth INTEGER,ativo TEXT,online TEXT,ip TEXT,ftth_porta INTEGER);
 CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER);
 INSERT INTO cliente_contrato VALUES(10,3),(11,4);
 INSERT INTO radusuarios VALUES(1,3,10,0,'S','N','192.0.2.1',0),(2,3,10,25,'S','S',NULL,2),
 (3,4,11,25,'S','N','192.0.2.3',3),(4,3,11,25,'S','S','0.0.0.0',4),(5,3,0,0,'S','SS','2001:db8::1',0);`);
  return db;
}
describe("Conexões por IP, com escopo de cliente e login", () => {
  it("classifica IP vazio/placeholder como offline e IPv4/IPv6 preenchidos como online, independente da ONU e do campo online", () => {
    for (const ip of [null, undefined, "", " ", "0", "0.0.0.0", "::", "::0"]) {
      expect(connectionIp(ip)).toBeNull();
      expect(connectionStatus(ip)).toBe("offline");
      expect(loginDetails({ id: 1, ip, online: "S" }, false).status).toBe("offline");
    }
    for (const ip of ["192.0.2.1", " 2001:db8::1 "]) {
      expect(connectionStatus(ip)).toBe("online");
      expect(loginDetails({ id: 1, ip, online: "N" }, false).status).toBe("online");
    }
  });
  it("consulta somente IDs visíveis do cliente e login/contrato ou login/caixa autorizados, mesmo sem ONU ou caixa", () => {
    const db = fixture();
    const read = (scope: ConnectionScope) => {
      const q = connectionMonitorSql(scope);
      assertReadQuery(q);
      expect(q.sql).not.toMatch(/ONU|radpop|senha|password/i);
      return db.prepare(q.sql).all(...q.params);
    };
    try {
      expect(read({ scope: "customer", module: "support", customerId: 3, loginIds: [1, 2, 3, 5] }).map((r) => r.id)).toEqual([1, 2, 5]);
      expect(read({ scope: "login", module: "support", loginId: 1, contractId: 10 })).toMatchObject([
        { id: 1, online: "S", ip: "192.0.2.1", boxId: 0 },
      ]);
      expect(read({ scope: "login", module: "support", loginId: 1, contractId: 11 })).toEqual([]);
      expect(read({ scope: "login", module: "support", loginId: 4, contractId: 11 })).toEqual([]);
      expect(read({ scope: "box-login", loginId: 1, boxId: 25 })).toEqual([]);
      expect(read({ scope: "box-login", loginId: 2, boxId: 25 })).toMatchObject([{ id: 2, online: "N", ip: null }]);
    } finally {
      db.close();
    }
  });
  it("recusa escopos misturados e IDs inválidos, limita a página e normaliza a ordem", () => {
    const valid = { type: "auth", token: "valid", scope: "customer", module: "support", customerId: 3, loginIds: [2, 1, 2] };
    expect(connectionSubscription.parse(valid)).toMatchObject({ loginIds: [1, 2] });
    for (const value of [
      { ...valid, customerId: 0 },
      { ...valid, loginIds: [] },
      { ...valid, loginIds: Array(26).fill(1) },
      { ...valid, loginIds: ["1 OR 1=1"] },
      { ...valid, module: "network" },
      { ...valid, boxIds: [25] },
    ])
      expect(connectionSubscription.safeParse(value).success).toBe(false);
  });
  for (const scope of [
    { scope: "customer", module: "support", customerId: 3, loginIds: [1, 2] },
    { scope: "login", module: "support", contractId: 10, loginId: 1 },
    { scope: "login", module: "upgrades", contractId: 10, loginId: 1 },
    { scope: "box-login", boxId: 25, loginId: 2 },
  ] as const)
    it(`protege o escopo ${scope.scope} ${"module" in scope ? scope.module : "network"} com permissões próprias`, async () => {
      const db = fixture();
      let permissions: string[] = [];
      vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async () => ({
        id: 1,
        name: "Teste",
        email: "teste@example.test",
        role: "USER",
        permissions,
      }));
      const read = vi.spyOn(IxcReadDatabase.prototype, "withSnapshot").mockImplementation(async (callback) =>
        callback({
          select: async (q) => {
            assertReadQuery(q);
            return db.prepare(q.sql).all(...q.params) as never;
          },
        })
      );
      const app = Fastify();
      await app.register(websocket);
      await app.register(networkRoutes, { prefix: "/api/network" });
      await app.ready();
      const sockets: Awaited<ReturnType<typeof app.injectWS>>[] = [];
      const required = connectionPermissions(scope as ConnectionScope);
      try {
        for (const missing of required) {
          permissions = required.filter((p) => p !== missing);
          const socket = await app.injectWS("/api/network/live");
          sockets.push(socket);
          const closed = new Promise<number>((resolve) => socket.once("close", resolve));
          socket.send(JSON.stringify({ type: "auth", token: "valid", ...scope }));
          expect(await closed).toBe(4403);
          expect(read).not.toHaveBeenCalled();
        }
        permissions = [...required];
        const messages: Record<string, any>[] = [];
        const socket = await app.injectWS(
          "/api/network/live",
          {},
          { onInit: (ws) => ws.on("message", (raw) => messages.push(JSON.parse(raw.toString()))) }
        );
        sockets.push(socket);
        socket.send(JSON.stringify({ type: "auth", token: "valid", ...scope }));
        await vi.waitFor(() => expect(messages[0]?.type).toBe("state"));
        expect(messages[0]?.snapshot).toBe(true);
        expect(messages[0]?.offlineCount).toBe(0);
        expect(messages[0]?.connections.map((r: any) => r.id)).toEqual(scope.scope === "customer" ? [1, 2] : [scope.loginId]);
        expect(JSON.stringify(messages)).not.toMatch(/senha|ONU|customerName/i);
        permissions = [];
        const closed = new Promise<number>((resolve) => socket.once("close", resolve));
        expect(await closed).toBe(4403);
      } finally {
        sockets.forEach((s) => s.terminate());
        await app.close();
        db.close();
      }
    });
});
