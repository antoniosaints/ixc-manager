import Fastify from "fastify";
import websocket from "@fastify/websocket";
import WebSocket from "ws";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerFrontend, defaultFrontendDirectory } from "../src/http/frontend.js";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function build() {
  const root = await mkdtemp(join(tmpdir(), "cas-production-"));
  dirs.push(root);
  await mkdir(join(root, "assets"));
  await mkdir(join(root, "api"));
  await writeFile(join(root, "index.html"), '<html><head><title>Frontend fictício</title></head><body><div id="app"></div></body></html>');
  await writeFile(join(root, "assets", "main.js"), 'console.log("fictitious asset")');
  await writeFile(join(root, ".env"), "PRIVATE_SECRET");
  await writeFile(join(root, "api", "private"), "PRIVATE_API_FILE");
  return root;
}
describe("Frontend de produção junto da API", () => {
  it("serves compiled frontend, SPA routes and assets while preserving JSON health and authentication", async () => {
    const app = Fastify();
    app.get("/health", async () => ({ status: "ok" }));
    app.get("/api/auth/me", async (_request, reply) => reply.code(401).send({ message: "Autenticação necessária." }));
    expect(await registerFrontend(app, await build())).toBe(true);
    try {
      for (const url of ["/", "/finance/list?from=2026-10-01", "/support/customers/123", "/network/logins"]) {
        const response = await app.inject({ url });
        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("text/html");
        expect(response.body).toContain("Frontend fictício");
        expect(response.headers["cache-control"]).toBe("no-store");
      }
      const asset = await app.inject({ url: "/assets/main.js" });
      expect(asset.statusCode).toBe(200);
      expect(asset.headers["content-type"]).toMatch(/javascript/);
      expect(asset.headers["x-content-type-options"]).toBe("nosniff");
      expect((await app.inject({ url: "/health" })).json()).toEqual({ status: "ok" });
      const auth = await app.inject({ url: "/api/auth/me" });
      expect(auth.statusCode).toBe(401);
      expect(auth.headers["content-type"]).toContain("application/json");
      const head = await app.inject({ method: "HEAD", url: "/support" });
      expect(head.statusCode).toBe(200);
      expect(head.body).toBe("");
    } finally {
      await app.close();
    }
  });
  it("never hides unknown API paths or missing assets behind a successful HTML response, or serves private files", async () => {
    const app = Fastify();
    await registerFrontend(app, await build());
    try {
      for (const url of ["/api/unknown", "/api/private", "/api", "/API/unknown", "/assets/missing.js", "/.env", "/assets/%2e%2e/%2eenv"]) {
        const response = await app.inject({ url });
        expect(response.statusCode).toBeGreaterThanOrEqual(400);
        expect(response.body).not.toMatch(/PRIVATE_|Frontend fictício/);
      }
      const post = await app.inject({ method: "POST", url: "/support" });
      expect(post.statusCode).toBe(404);
      expect(post.headers["content-type"]).toContain("application/json");
    } finally {
      await app.close();
    }
  });
  it("continues serving backend-only deployments when the frontend build is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "cas-backend-only-"));
    dirs.push(root);
    const app = Fastify();
    app.get("/health", async () => ({ status: "ok" }));
    expect(await registerFrontend(app, root)).toBe(false);
    try {
      expect((await app.inject({ url: "/health" })).statusCode).toBe(200);
      expect((await app.inject({ url: "/" })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
    expect(defaultFrontendDirectory).toMatch(/client[\\/]dist[\\/]/);
  });
  it("serves HTTP and WebSocket routes on the same production port without a Vite proxy", async () => {
    const app = Fastify();
    await app.register(websocket);
    app.get("/api/network/live", { websocket: true }, (socket) =>
      socket.on("message", () => socket.send(JSON.stringify({ type: "state", fictitious: true })))
    );
    await registerFrontend(app, await build());
    const origin = await app.listen({ port: 0, host: "127.0.0.1" });
    const socket = new WebSocket(origin.replace("http:", "ws:") + "/api/network/live", { origin });
    try {
      const message = new Promise<string>((resolve, reject) => {
        socket.on("message", (raw) => resolve(raw.toString()));
        socket.on("error", reject);
        socket.on("open", () => socket.send("fictitious-observation"));
      });
      expect(JSON.parse(await message)).toEqual({ type: "state", fictitious: true });
      const response = await fetch(origin + "/support");
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Frontend fictício");
    } finally {
      socket.terminate();
      await app.close();
    }
  }, 10000);
});
