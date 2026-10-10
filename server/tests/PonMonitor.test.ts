import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { AuthService } from "../src/services/AuthService.js";
import { networkRoutes } from "../src/controllers/networkController.js";
import { IxcReadDatabase } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { DatabaseSync } from "node:sqlite";
import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  PonMonitorService,
  ponPosition,
  ponConnection,
  ponChanges,
  ponScope,
  type PonSnapshot,
} from "../src/services/network/PonMonitorService.js";
import { NetworkMonitor } from "../src/services/network/NetworkMonitor.js";
import { connectionSubscription, connectionPermissions, subscriptionScope } from "../src/services/network/ConnectionMonitorScope.js";
import { assertReadQuery, type IxcReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { accessPresets, effectivePermissions } from "../src/config/permissions.js";
const row = (online = "S", overrides: Record<string, unknown> = {}) => ({
  oltId: 1,
  pon: "1-1-2-6",
  onuId: 100,
  onuNumber: 32,
  id_contrato: 5,
  contractId: 5,
  customerId: 9,
  loginId: 10,
  login: "teste@example.test",
  active: "S",
  online,
  boxId: 7,
  boxName: "CTO Teste",
  port: 3,
  sessionId: 20,
  sessionStartedAt: "2026-10-10 09:00:00",
  sessionStoppedAt: null,
  lastConnectedAt: "2026-10-10 09:00:00",
  ip: "192.0.2.1",
  ...overrides,
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  send = vi.fn();
  ping = vi.fn();
  close(code = 1000) {
    this.readyState = 3;
    this.emit("close", code);
  }
  terminate() {
    this.close();
  }
}
const authMessage = () => Buffer.from(JSON.stringify({ type: "auth", token: "session", scope: "pon", oltId: 1, pon: "1-1-2-6" }));
describe("Monitor de PON", () => {
  it("oferece somente PONs da OLT escolhida e identifica as vinculadas à CTO do atalho", async () => {
    const select = vi.fn(async (q: IxcReadQuery) => {
      assertReadQuery(q);
      if (q.name === "pon-olts") return [{ id: "1", name: "OLT Teste" }];
      if (q.name === "pon-box-options") {
        expect(q.params).toEqual([1, 1]);
        return [{ id: "7", name: "CTO Teste", capacity: "8" }];
      }
      expect(q.params).toEqual([7, 1]);
      return [
        { pon: "1-1-2-6", total: "32", containsBox: 1 },
        { pon: "1-1-2-7", total: "20", containsBox: 0 },
      ];
    });
    const svc = new PonMonitorService({ withSnapshot: async (cb: (s: object) => Promise<unknown>) => cb({ select }) } as never);
    expect(await svc.options()).toEqual({ olts: [{ id: 1, name: "OLT Teste" }], pons: [], boxes: [] });
    expect(await svc.options(1, undefined, 7)).toMatchObject({
      boxes: [{ id: 7, name: "CTO Teste", capacity: 8 }],
      pons: [{ pon: "1-1-2-6", total: 32, containsBox: true }, { containsBox: false }],
    });
    await expect(svc.options(2)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("protege HTTP e WebSocket com network.pon.view antes de ler dados", async () => {
    const read = vi.spyOn(IxcReadDatabase.prototype, "withSnapshot");
    const authenticate = vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({
      id: 1,
      name: "Teste",
      email: "test@example.test",
      role: "USER",
      permissions: ["network.onus.view", "network.logins.list"],
    });
    const app = Fastify();
    await app.register(websocket);
    await app.register(networkRoutes, { prefix: "/api/network" });
    await app.ready();
    let socket: WebSocket | undefined;
    try {
      expect((await app.inject({ url: "/api/network/pon/options?oltId=1" })).statusCode).toBe(403);
      socket = await app.injectWS("/api/network/live");
      const closed = new Promise<number>((resolve) => socket!.once("close", resolve));
      socket.send(authMessage().toString());
      expect(await closed).toBe(4403);
      expect(read).not.toHaveBeenCalled();
      authenticate.mockResolvedValue(null);
      expect((await app.inject({ url: "/api/network/pon/options?oltId=1" })).statusCode).toBe(401);
      expect(read).not.toHaveBeenCalled();
    } finally {
      socket?.terminate();
      await app.close();
    }
  });
  it("usa ONU 32 para a porta 3 da CTO; nunca interpreta o final do endereço PON como número da ONU", () => {
    expect(ponPosition(row("S", { ponid: "1-1-2-6" }))).toMatchObject({
      position: 32,
      port: 3,
      loginId: 10,
      status: "online",
      source: "RADIUS",
    });
    expect(ponPosition(row("S", { onuNumber: 128 })).position).toBe(128);
    for (const n of [null, 0, 129, -1, "invalid"])
      expect(ponPosition(row("S", { onuNumber: n }))).toMatchObject({ position: null, warning: expect.any(String) });
  });
  it("honra offline do IXC mesmo com IP/sessão RADIUS retidos e detecta encerramento RADIUS antes do IXC", () => {
    for (const state of ["N", "SS"]) expect(ponConnection(row(state))).toEqual({ status: "offline", source: "IXC" });
    expect(ponConnection(row("S", { sessionStoppedAt: "2026-10-10 09:01:00" }))).toEqual({ status: "offline", source: "RADIUS" });
    expect(ponConnection(row("S", { sessionStoppedAt: "2026-10-10 08:50:00" }))).toEqual({ status: "online", source: "IXC" });
    expect(ponConnection(row("S", { sessionId: null }))).toEqual({ status: "online", source: "IXC" });
    expect(ponConnection(row("I", { sessionId: null, ip: null }))).toEqual({ status: "unknown", source: null });
    expect(ponConnection(row("I", { sessionStoppedAt: "0000-00-00 00:00:00" }))).toEqual({ status: "online", source: "RADIUS" });
  });
  it("não atribui sessão a ONU sem login, cliente incompatível ou username duplicado; alerta porta divergente/compartilhamento", () => {
    for (const overrides of [{ loginId: null }, { id_contrato: 99, onu_customer_id: 77 }, { loginMatches: 2 }])
      expect(ponPosition(row("S", overrides))).toMatchObject({ loginId: null, login: null, status: "unknown", ip: null, source: null });
    expect(ponPosition(row("S", { loginBoxId: 9 })).warning).toMatch(/divergente/);
    expect(ponPosition(row("S", { loginPort: 4 })).warning).toMatch(/divergente/);
    expect(ponPosition(row("S", { shared: "S" })).warning).toMatch(/compartilhada/);
    expect(ponPosition(row("S", { onuMatches: 2 }))).toMatchObject({
      status: "unknown",
      source: null,
      warning: expect.stringContaining("mesmo login"),
    });
  });
  it("gera queda/retorno apenas depois da leitura inicial e com identidade/porta inalteradas", () => {
    const snapshot = (r: Record<string, unknown>): PonSnapshot => ({ oltId: 1, pon: "1-1-2-6", positions: [ponPosition(r)] });
    const on = snapshot(row()),
      off = snapshot(row("N"));
    expect(ponChanges(undefined, off)).toEqual([]);
    expect(ponChanges(on, off)).toEqual([expect.objectContaining({ position: 32, port: 3, loginId: 10, status: "offline" })]);
    expect(ponChanges(off, on)).toEqual([expect.objectContaining({ status: "online" })]);
    for (const r of [
      row("N", { port: 4 }),
      row("N", { onuNumber: 33 }),
      row("N", { loginId: 11 }),
      row("N", { boxId: 8 }),
      row("N", { pon: "1-1-2-7" }),
      row("N", { oltId: 2 }),
      row("I", { sessionId: null, ip: null }),
    ])
      expect(ponChanges(on, snapshot(r))).toEqual([]);
  });
  it("consulta só OLT/PON selecionada e a última sessão por username; duplicidades ficam indeterminadas", async () => {
    const sql = new DatabaseSync(":memory:");
    sql.exec(`CREATE TABLE radpop_radio_cliente_fibra(id INT,onu_numero INT,onu_compartilhada TEXT,id_contrato INT,mac TEXT,serial_number TEXT,id_login INT,id_caixa_ftth INT,porta_ftth INT,id_transmissor INT,ponid TEXT);
    CREATE TABLE radusuarios(id INT,login TEXT,id_contrato INT,id_cliente INT,ativo TEXT,online TEXT,ip TEXT,ultima_conexao_inicial TEXT,onu_mac TEXT,id_caixa_ftth INT,ftth_porta INT);
    CREATE TABLE cliente_contrato(id INT,id_cliente INT); CREATE TABLE rad_caixa_ftth(id INT,descricao TEXT,capacidade INT);
    CREATE TABLE radacct(radacctid INT,username TEXT,acctstarttime TEXT,acctstoptime TEXT,acctupdatetime TEXT,acctterminatecause TEXT);
    INSERT INTO radpop_radio_cliente_fibra VALUES(100,32,'N',5,'serial','',10,7,3,1,'1-1-2-6'),(101,32,'N',5,'serial','',11,7,4,1,'1-1-2-7'),(102,32,'N',5,'serial','',12,7,5,2,'1-1-2-6');
    INSERT INTO radusuarios VALUES(10,'teste@example.test',5,9,'S','S','192.0.2.1','2026-10-10 09:00:00','serial',7,3);
    INSERT INTO radusuarios VALUES(11,'segundo@example.test',5,9,'S','S','192.0.2.2','2026-10-10 09:00:00','serial',7,4),(12,'terceiro@example.test',5,9,'S','N',NULL,'2026-10-10 09:00:00','serial',7,5),(13,'sem-onu@example.test',5,9,'S','S','192.0.2.3','2026-10-10 09:00:00','',7,6),(14,'fora@example.test',5,9,'S','S','192.0.2.4','2026-10-10 09:00:00','',8,1);
    INSERT INTO cliente_contrato VALUES(5,9); INSERT INTO rad_caixa_ftth VALUES(7,'CTO Teste',8),(8,'Outra CTO',8),(9,'Vazia',8);
    INSERT INTO radacct VALUES(1,'teste@example.test','2026-10-09 09:00:00','2026-10-09 09:01:00',NULL,'Old'),(2,'teste@example.test','2026-10-10 09:00:00',NULL,NULL,''),(3,'outro@example.test','2026-10-10 10:00:00',NULL,NULL,'');`);
    const select = vi.fn(async (q: IxcReadQuery) => {
      assertReadQuery(q);
      if (q.name === "pon-live-positions" && q.params.length === 2) expect(q.params).toEqual([1, "1-1-2-6"]);
      else expect(q.params).toEqual([7]);
      expect(q.sql).not.toMatch(/senha|password|SELECT\s+\*/i);
      return sql.prepare(q.sql).all(...q.params);
    });
    const svc = new PonMonitorService({ withSnapshot: vi.fn() } as never);
    try {
      const scope = ponScope.parse({ scope: "pon", oltId: 1, pon: "1-1-2-6" });
      const r = await svc.read(scope, { select } as never);
      expect(r.positions).toHaveLength(1);
      expect(r.positions[0]).toMatchObject({ position: 32, status: "online", sessionStoppedAt: null });
      const cto = await svc.read({ scope: "pon-box", boxId: 7 }, { select } as never);
      expect(cto).toMatchObject({ oltId: null, pon: null, boxId: 7, boxName: "CTO Teste", capacity: 8 });
      expect(cto.positions).toHaveLength(4);
      expect(cto.positions.map((p) => p.loginId).sort()).toEqual([10, 11, 12, 13]);
      expect(cto.positions.filter((p) => p.onuId !== null)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ oltId: 1, pon: "1-1-2-6", position: 32, status: "online" }),
          expect.objectContaining({ oltId: 1, pon: "1-1-2-7", position: 32, status: "online" }),
          expect.objectContaining({ oltId: 2, pon: "1-1-2-6", position: 32, status: "offline" }),
        ])
      );
      expect(cto.positions.find((p) => p.loginId === 13)).toMatchObject({
        entryId: "login:13",
        onuId: null,
        position: null,
        port: 6,
        status: "online",
        source: "IXC",
      });
      sql.exec("UPDATE radusuarios SET online='N' WHERE id=13");
      expect(ponChanges(cto, await svc.read({ scope: "pon-box", boxId: 7 }, { select } as never))).toEqual([
        expect.objectContaining({ entryId: "login:13", onuId: null, loginId: 13, port: 6, status: "offline" }),
      ]);
      sql.exec("UPDATE radacct SET acctstoptime='2026-10-10 09:02:00',acctterminatecause='Lost-Carrier' WHERE radacctid=2");
      expect((await svc.read(scope, { select } as never)).positions[0]).toMatchObject({
        status: "offline",
        source: "RADIUS",
        disconnectReason: "Lost-Carrier",
      });
      sql.exec(
        "INSERT INTO radpop_radio_cliente_fibra SELECT 104,onu_numero,onu_compartilhada,id_contrato,mac,serial_number,id_login,id_caixa_ftth,porta_ftth,id_transmissor,ponid FROM radpop_radio_cliente_fibra WHERE id=100"
      );
      expect((await svc.read(scope, { select } as never)).positions.every((p) => p.status === "unknown" && !!p.warning)).toBe(true);
    } finally {
      sql.close();
    }
  });
  it("transmite snapshots e mudanças a cada segundo, compartilha canal, preserva baseline na falha e para sem espectadores", async () => {
    vi.useFakeTimers();
    let current = [row()];
    const read = vi.fn(async () => current);
    const db = { withSnapshot: async (cb: (s: object) => Promise<unknown>) => cb({ select: read }) } as never;
    const authorize = vi.fn(async () => ({ id: 1 }));
    const monitor = new NetworkMonitor(db, authorize);
    const a = new Socket(),
      b = new Socket();
    try {
      monitor.attach(a as unknown as WebSocket);
      a.emit("message", authMessage(), false);
      await vi.advanceTimersByTimeAsync(0);
      expect(JSON.parse(a.send.mock.calls[0][0])).toMatchObject({ type: "pon-state", snapshot: true, events: [] });
      monitor.attach(b as unknown as WebSocket);
      b.emit("message", authMessage(), false);
      await vi.advanceTimersByTimeAsync(0);
      expect(read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(read).toHaveBeenCalledTimes(1);
      current = [row("N")];
      await vi.advanceTimersByTimeAsync(1);
      expect(read).toHaveBeenCalledTimes(2);
      expect(JSON.parse(a.send.mock.calls.at(-1)![0])).toMatchObject({
        type: "pon-state",
        events: [{ status: "offline", position: 32, port: 3 }],
      });
      expect(a.send.mock.calls.at(-1)![0]).toEqual(b.send.mock.calls.at(-1)![0]);
      read.mockRejectedValueOnce(new Error("PRIVATE SQL/password"));
      await vi.advanceTimersByTimeAsync(1000);
      expect(JSON.parse(a.send.mock.calls.at(-1)![0])).toMatchObject({ type: "unavailable" });
      expect(JSON.stringify(a.send.mock.calls)).not.toContain("PRIVATE");
      current = [row()];
      await vi.advanceTimersByTimeAsync(1000);
      expect(JSON.parse(a.send.mock.calls.at(-1)![0])).toMatchObject({ events: [{ status: "online" }] });
      a.close();
      b.close();
      const reads = read.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(read).toHaveBeenCalledTimes(reads);
    } finally {
      monitor.close();
    }
  });
  it("monitora todas as portas sem teste individual; CTO transmite somente sua caixa, incluindo login sem ONU", async () => {
    vi.useFakeTimers();
    let offline = false;
    const inside = row("S", { onuId: 101, onuNumber: 33, loginId: 11, port: 4 });
    const outside = row("S", { onuId: 102, onuNumber: 34, loginId: 12, port: 5, boxId: 8 });
    const select = vi.fn(async (q: IxcReadQuery) => {
      assertReadQuery(q);
      if (q.name === "pon-box-detail") return [{ id: 7, name: "CTO Teste", capacity: 8 }];
      if (q.name === "pon-box-unmapped-logins") return [row(offline ? "N" : "S", { onuId: null, onuNumber: null, loginId: 13, port: 6 })];
      const positions = [row(), { ...inside, online: offline ? "N" : "S" }, { ...outside, online: offline ? "N" : "S" }];
      return q.params.length === 1 ? positions.filter((p) => p.boxId === q.params[0]) : positions;
    });
    const monitor = new NetworkMonitor(
      { withSnapshot: async (cb: (s: object) => Promise<unknown>) => cb({ select }) } as never,
      async () => ({ id: 1 })
    );
    const a = new Socket(),
      b = new Socket();
    try {
      monitor.attach(a as unknown as WebSocket);
      a.emit("message", authMessage(), false);
      monitor.attach(b as unknown as WebSocket);
      b.emit("message", Buffer.from(JSON.stringify({ type: "auth", token: "session", scope: "pon-box", boxId: 7 })), false);
      await vi.advanceTimersByTimeAsync(0);
      expect(JSON.parse(b.send.mock.calls.at(-1)![0])).toMatchObject({ type: "pon-state", snapshot: true, boxId: 7, events: [] });
      offline = true;
      await vi.advanceTimersByTimeAsync(1000);
      expect(JSON.parse(a.send.mock.calls.at(-1)![0]).events).toEqual([
        expect.objectContaining({ loginId: 11, boxId: 7, port: 4, status: "offline" }),
        expect.objectContaining({ loginId: 12, boxId: 8, port: 5, status: "offline" }),
      ]);
      const cto = JSON.parse(b.send.mock.calls.at(-1)![0]);
      expect(cto.positions.every((p: { boxId: number }) => p.boxId === 7)).toBe(true);
      expect(cto.events).toEqual([
        expect.objectContaining({ loginId: 11, port: 4, status: "offline" }),
        expect.objectContaining({ entryId: "login:13", onuId: null, loginId: 13, port: 6, status: "offline" }),
      ]);
      a.close();
      b.close();
      const reads = select.mock.calls.length;
      await vi.advanceTimersByTimeAsync(2000);
      expect(select).toHaveBeenCalledTimes(reads);
    } finally {
      monitor.close();
    }
  });
  it("aplica permissão exclusiva e revogação em cada tick; sem escrita/senhas nos perfis de monitoramento", async () => {
    const input = connectionSubscription.parse({ type: "auth", token: "session", scope: "pon", oltId: 1, pon: "1-1-2-6" });
    expect(subscriptionScope(input)).toEqual({ scope: "pon", oltId: 1, pon: "1-1-2-6" });
    expect(connectionPermissions(subscriptionScope(input))).toEqual(["network.pon.view"]);
    const ctoInput = connectionSubscription.parse({ type: "auth", token: "session", scope: "pon-box", boxId: 7 });
    expect(subscriptionScope(ctoInput)).toEqual({ scope: "pon-box", boxId: 7 });
    expect(connectionPermissions(subscriptionScope(ctoInput))).toEqual(["network.pon.view"]);
    for (const boxId of [0, -1, 1.5, "7"])
      expect(connectionSubscription.safeParse({ type: "auth", token: "session", scope: "pon-box", boxId }).success).toBe(false);
    expect(effectivePermissions("USER", [], {})).not.toContain("network.pon.view");
    for (const key of ["NETWORK", "SUPPORT"]) {
      const p = accessPresets.find((p) => p.key === key)!;
      expect(p.permissions).toContain("network.pon.view");
      expect(p.permissions).not.toContain("network.equipment.authorize");
    }
    expect(connectionSubscription.safeParse({ type: "auth", token: "session", scope: "pon", oltId: 0, pon: "x" }).success).toBe(false);
    expect(
      connectionSubscription.safeParse({ type: "auth", token: "session", scope: "pon", oltId: 1, pon: "x", extra: true }).success
    ).toBe(false);
    vi.useFakeTimers();
    let allowed = true;
    const read = vi.fn(async () => [row()]);
    const monitor = new NetworkMonitor(
      { withSnapshot: async (cb: (s: object) => Promise<unknown>) => cb({ select: read }) } as never,
      async () => {
        if (!allowed) throw Object.assign(new Error("revoked"), { statusCode: 403 });
        return { id: 1 };
      }
    );
    const socket = new Socket();
    const close = vi.spyOn(socket, "close");
    try {
      monitor.attach(socket as unknown as WebSocket);
      socket.emit("message", authMessage(), false);
      await vi.advanceTimersByTimeAsync(0);
      allowed = false;
      await vi.advanceTimersByTimeAsync(1000);
      expect(close).toHaveBeenCalledWith(4403, expect.any(String));
      expect(read).toHaveBeenCalledTimes(1);
    } finally {
      monitor.close();
    }
  });
});
