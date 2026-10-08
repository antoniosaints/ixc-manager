import Fastify from "fastify";
import cors from "@fastify/cors";
import { afterEach, expect, it, vi } from "vitest";
import { corsOptions } from "../src/http/cors.js";
import { authRoutes } from "../src/controllers/authController.js";
import { AuthService } from "../src/services/AuthService.js";
import { db } from "../src/repositories/database.js";

const origin = "https://analitc.ngoezu.easypanel.host";
afterEach(() => vi.restoreAllMocks());

it("permite o preflight de PATCH e PUT com token e JSON entre frontend e backend", async () => {
  const app = Fastify();
  await app.register(cors, corsOptions(origin));
  await app.register(authRoutes, { prefix: "/api/auth" });
  const authenticate = vi.spyOn(AuthService.prototype, "authenticate");
  const execute = vi.spyOn(db, "execute");
  try {
    for (const [method, url] of [
      ["PATCH", "/api/auth/users/2"],
      ["PUT", "/api/settings/appearance"],
    ]) {
      const response = await app.inject({
        method: "OPTIONS",
        url,
        headers: { origin, "access-control-request-method": method, "access-control-request-headers": "authorization,content-type" },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
      expect(
        String(response.headers["access-control-allow-methods"])
          .split(",")
          .map((value) => value.trim())
      ).toContain(method);
      expect(
        String(response.headers["access-control-allow-headers"])
          .toLowerCase()
          .split(",")
          .map((value) => value.trim())
      ).toEqual(["authorization", "content-type"]);
    }
    expect(authenticate).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it("mantém a origem restrita e não reflete origens externas no preflight", async () => {
  const app = Fastify();
  await app.register(cors, corsOptions(origin));
  try {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/auth/users/2",
      headers: {
        origin: "https://untrusted.example.test",
        "access-control-request-method": "PATCH",
      },
    });
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-allow-origin"]).not.toBe("*");
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  } finally {
    await app.close();
  }
});

it("preserva autenticação e permissão de ADMIN no PATCH real com headers CORS", async () => {
  const app = Fastify();
  await app.register(cors, corsOptions(origin));
  await app.register(authRoutes, { prefix: "/api/auth" });
  const authenticate = vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue(null);
  const execute = vi.spyOn(db, "execute");
  try {
    const unauthorized = await app.inject({ method: "PATCH", url: "/api/auth/users/2", headers: { origin }, payload: { name: "Teste" } });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.headers["access-control-allow-origin"]).toBe(origin);
    authenticate.mockResolvedValue({ id: 3, name: "Teste", email: "test@example.test", role: "USER", permissions: [] });
    const forbidden = await app.inject({ method: "PATCH", url: "/api/auth/users/2", headers: { origin }, payload: { name: "Teste" } });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.headers["access-control-allow-origin"]).toBe(origin);
    expect(execute).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
