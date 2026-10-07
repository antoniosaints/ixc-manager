import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { createServer, type ProxyOptions } from "vite";
import WebSocket from "ws";
import { afterEach, expect, it, vi } from "vitest";
import viteConfig from "../../client/vite.config.js";
import { networkRoutes } from "../src/controllers/networkController.js";
import { AuthService } from "../src/services/AuthService.js";
import { IxcReadDatabase } from "../src/integrations/ixc/database/IxcReadDatabase.js";

afterEach(() => vi.restoreAllMocks());

it("atravessa o proxy do frontend, mantém a origem, recebe atualizações e rejeita origens externas", async () => {
  vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({
    id: 1,
    name: "Demonstração",
    email: "demo@example.test",
    role: "USER",
    permissions: ["network.boxes.view", "network.logins.view"],
  });
  let ip: string | null = "192.0.2.1";
  const read = vi
    .spyOn(IxcReadDatabase.prototype, "withSnapshot")
    .mockImplementation(async () => [{ id: 1, boxId: 4663, active: "S", port: 1, ip }] as never);
  const app = Fastify();
  await app.register(websocket);
  await app.register(networkRoutes, { prefix: "/api/network" });
  const target = await app.listen({ port: 0, host: "127.0.0.1" });
  const proxy = viteConfig.server!.proxy!["/api/network/live"] as ProxyOptions;
  const vite = await createServer({
    configFile: false,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, proxy: { "/api/network/live": { ...proxy, target } } },
  });
  const sockets: WebSocket[] = [];
  try {
    await vite.listen();
    const address = vite.httpServer!.address();
    if (!address || typeof address === "string") throw new Error("Porta de teste indisponível");
    const origin = `http://127.0.0.1:${address.port}`;
    const url = `ws://127.0.0.1:${address.port}/api/network/live`;
    const messages: any[] = [];
    const socket = new WebSocket(url, { headers: { Origin: origin } });
    sockets.push(socket);
    socket.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
    socket.on("open", () => socket.send(JSON.stringify({ type: "auth", token: "fictitious-session", boxIds: [4663] })));
    await vi.waitFor(() => expect(messages[0]?.type).toBe("state"));
    expect(messages[0]?.connections).toMatchObject([{ id: 1, online: "S", ip: "192.0.2.1" }]);
    ip = null;
    await vi.waitFor(() => expect(messages.at(-1)?.connections).toMatchObject([{ id: 1, online: "N", ip: null }]), { timeout: 2500 });
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
    await vi.waitFor(() => expect(socket.readyState).toBe(WebSocket.CLOSED));
    const stopped = read.mock.calls.length;
    const rejected = new WebSocket(url, { headers: { Origin: "https://foreign.example.test" } });
    sockets.push(rejected);
    rejected.on("error", () => {});
    const status = await new Promise<number | undefined>((resolve) => {
      rejected.on("unexpected-response", (_req, response) => {
        response.resume();
        resolve(response.statusCode);
      });
    });
    expect(status).toBe(403);
    expect(read).toHaveBeenCalledTimes(stopped);
  } finally {
    sockets.forEach((socket) => socket.terminate());
    await vite.close();
    await app.close();
  }
}, 10_000);
