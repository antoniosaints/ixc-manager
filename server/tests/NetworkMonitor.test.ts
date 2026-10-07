import { DatabaseSync } from "node:sqlite";
import { EventEmitter } from "node:events";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectionChanges,
  networkMonitorSql,
  networkSubscription,
  NetworkMonitor,
  type ConnectionState,
} from "../src/services/network/NetworkMonitor.js";
import { assertReadQuery, IxcReadDatabase, type IxcReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { networkRoutes } from "../src/controllers/networkController.js";
import { AuthService } from "../src/services/AuthService.js";

afterEach(() => vi.restoreAllMocks());
const row = (id: number, online: string | null, active = "S", boxId = 1): ConnectionState => ({
  id,
  boxId,
  online,
  active,
  port: id,
  ip: online === "S" ? `192.0.2.${id}` : null,
});
describe("Monitor de Rede por WebSocket", () => {
  it("verifica a cada segundo por padrão, não sobrepõe consultas lentas e para ao fechar o modal/socket", async () => {
    vi.useFakeTimers();
    class Socket extends EventEmitter {
      readyState = 1;
      bufferedAmount = 0;
      send = vi.fn();
      ping = vi.fn();
      close() {
        this.readyState = 3;
        this.emit("close");
      }
      terminate() {
        this.close();
      }
    }
    const socket = new Socket();
    let finishRead: (rows: ConnectionState[]) => void = () => {};
    const read = vi
      .fn()
      .mockResolvedValue([row(1, "S")])
      .mockResolvedValueOnce([row(1, "S")])
      .mockImplementationOnce(
        () =>
          new Promise<ConnectionState[]>((resolve) => {
            finishRead = resolve;
          })
      );
    const db = { withSnapshot: async (callback: (session: object) => Promise<unknown>) => callback({ select: read }) } as never;
    const monitor = new NetworkMonitor(db, async () => ({ id: 1 }));
    try {
      monitor.attach(socket as unknown as WebSocket);
      socket.emit("message", Buffer.from(JSON.stringify({ type: "auth", token: "valid", boxIds: [1] })), false);
      await vi.advanceTimersByTimeAsync(0);
      expect(read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(read).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(3000);
      expect(read).toHaveBeenCalledTimes(2);
      finishRead([row(1, "N")]);
      await vi.advanceTimersByTimeAsync(0);
      expect(JSON.parse(socket.send.mock.calls.at(-1)![0])).toMatchObject({ type: "state", offlineCount: 1 });
      await vi.advanceTimersByTimeAsync(999);
      expect(read).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(read).toHaveBeenCalledTimes(3);
      socket.close();
      await vi.advanceTimersByTimeAsync(3000);
      expect(read).toHaveBeenCalledTimes(3);
    } finally {
      monitor.close();
      vi.useRealTimers();
    }
  });
  it("alerta somente transição real de ativo online para offline, sem falso alerta inicial/sem status/inativo", () => {
    const initial = [row(1, "S"), row(2, "N"), row(3, "S", "N"), row(4, "S"), row(5, "S")];
    expect(connectionChanges(undefined, initial)).toMatchObject({ changed: false, offline: [], offlineCount: 0 });
    const changes = connectionChanges(initial, [row(1, "N"), row(2, "S"), row(3, "N", "N"), row(4, "SS"), row(5, "N", "S", 2)]);
    expect(changes).toMatchObject({ changed: true, offline: [{ id: 1, boxId: 1 }], offlineCount: 1 });
    expect(connectionChanges(initial, [...initial].reverse()).changed).toBe(false);
    expect(connectionChanges(initial, initial.slice(1))).toMatchObject({ changed: true, offline: [] });
  });
  it("usa SQL parametrizado e limitado no índice de caixa, sem dados pessoais/senhas nem varredura global", () => {
    const q = networkMonitorSql([4, 1, 4]);
    assertReadQuery(q);
    expect(q.params).toEqual([1, 4]);
    expect(q.sql).toContain("r.id_caixa_ftth IN (?,?)");
    expect(q.sql).toContain("LIMIT 5001");
    expect(q.sql).not.toMatch(/senha|password|cliente|SELECT\s+\*/i);
    for (const boxIds of [[], [0], ["1 OR 1=1"], [Number.MAX_SAFE_INTEGER + 1], Array(26).fill(1)])
      expect(networkSubscription.safeParse({ type: "auth", token: "session", boxIds }).success).toBe(false);
  });
  it("entrega mudanças por um socket real, compartilha leitura e interrompe após revogação/fechamento", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,id_caixa_ftth INTEGER,ativo TEXT,online TEXT,ftth_porta INTEGER,ip TEXT);
      INSERT INTO radusuarios VALUES(1,1,'S','N',1,'192.0.2.1'),(2,1,'S','S',2,NULL),(3,2,'S','S',1,'192.0.2.3');`);
    let allowed = true;
    const read = vi.fn(async (q: IxcReadQuery) => {
      assertReadQuery(q);
      return sqlite.prepare(q.sql).all(...q.params);
    });
    const db = { withSnapshot: async (callback: (session: object) => Promise<unknown>) => callback({ select: read }) } as never;
    const monitor = new NetworkMonitor(
      db,
      async (token) => {
        if (token !== "valid") throw Object.assign(new Error("No session"), { statusCode: 401 });
        if (!allowed) throw Object.assign(new Error("Revoked"), { statusCode: 403 });
        return { id: 1 };
      },
      80
    );
    const app = Fastify();
    await app.register(websocket);
    app.get("/live", { websocket: true }, (socket) => monitor.attach(socket));
    await app.ready();
    const first: any[] = [],
      second: any[] = [];
    const sockets: WebSocket[] = [];
    try {
      const open = async (messages: any[]) => {
        const socket = await app.injectWS(
          "/live",
          {},
          { onInit: (ws) => ws.on("message", (raw) => messages.push(JSON.parse(raw.toString()))) }
        );
        sockets.push(socket);
        socket.send(JSON.stringify({ type: "auth", token: "valid", boxIds: [1] }));
        await vi.waitFor(() => expect(messages.some((m) => m.type === "state")).toBe(true));
        return socket;
      };
      const one = await open(first);
      await open(second);
      expect(first[0]).toMatchObject({ type: "state", changed: false, offlineCount: 0 });
      const before = read.mock.calls.length;
      read.mockRejectedValueOnce(new Error("SQL with PRIVATE-DETAILS"));
      await vi.waitFor(() => expect(first.some((m) => m.type === "unavailable")).toBe(true));
      expect(JSON.stringify(first)).not.toContain("PRIVATE-DETAILS");
      sqlite.exec("UPDATE radusuarios SET ip=NULL WHERE id=1");
      await vi.waitFor(() => expect(first.some((m) => m.offlineCount === 1)).toBe(true));
      expect(second.some((m) => m.offlineCount === 1)).toBe(true);
      expect(read.mock.calls.length - before).toBe(2); // One failed read + one recovery, shared by both sockets.
      expect(first.find((m) => m.offlineCount === 1)).toMatchObject({
        offline: [{ id: 1, boxId: 1 }],
        connections: [{ id: 1, online: "N" }],
      });
      const closed = new Promise<number>((resolve) => one.once("close", resolve));
      allowed = false;
      expect(await closed).toBe(4403);
      await vi.waitFor(() => expect(sockets.every((socket) => socket.readyState === 3)).toBe(true));
      const readsAfterClose = read.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(read.mock.calls.length).toBe(readsAfterClose);
    } finally {
      monitor.close();
      sockets.forEach((socket) => socket.terminate());
      await app.close();
      sqlite.close();
    }
  });
  it("nega origem, token em URL e acesso sem permissão antes de consultar o banco", async () => {
    const read = vi.spyOn(IxcReadDatabase.prototype, "withSnapshot");
    const authenticate = vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue(null);
    const app = Fastify();
    await app.register(websocket);
    await app.register(networkRoutes, { prefix: "/api/network" });
    await app.ready();
    const sockets: WebSocket[] = [];
    try {
      await expect(app.injectWS("/api/network/live", { headers: { origin: "https://evil.example.test" } })).rejects.toThrow("403");
      await expect(app.injectWS("/api/network/live?token=secret")).rejects.toThrow("400");
      for (const permission of ["invalid-session", "boxes-only"]) {
        if (permission === "boxes-only")
          authenticate.mockResolvedValue({
            id: 1,
            name: "Teste",
            email: "test@example.test",
            role: "USER",
            permissions: ["network.boxes.view"],
          });
        const socket = await app.injectWS("/api/network/live");
        sockets.push(socket);
        expect(read).not.toHaveBeenCalled();
        const closed = new Promise<number>((resolve) => socket.once("close", resolve));
        socket.send(JSON.stringify({ type: "auth", token: "test-session", boxIds: [1] }));
        expect(await closed).toBe(permission === "boxes-only" ? 4403 : 4401);
      }
      expect(read).not.toHaveBeenCalled();
    } finally {
      sockets.forEach((socket) => socket.terminate());
      await app.close();
    }
  });
});
