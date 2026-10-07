import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthService, type AuthUser } from "../src/services/AuthService.js";
import { db } from "../src/repositories/database.js";
import { settingsRoutes } from "../src/controllers/settingsController.js";
import { authRoutes } from "../src/controllers/authController.js";
import { upgradeRoutes } from "../src/controllers/upgradeController.js";
import { IxcApiService } from "../src/integrations/ixc/IxcApiService.js";
import { effectivePermissions, permissionKeys, rolePermissions } from "../src/config/permissions.js";
import {
  appearanceSchema,
  defaultAppearance,
  profileSchema,
  overridesSchema,
  SettingsService,
} from "../src/services/settings/SettingsService.js";
const user: AuthUser = { id: 2, name: "Teste", email: "teste@example.test", role: "OPERATOR", permissions: [...permissionKeys] };
afterEach(() => vi.restoreAllMocks());
describe("Perfis e permissões", () => {
  it("preserva papéis existentes, substitui por perfil personalizado e aplica exceções", () => {
    for (const role of Object.keys(rolePermissions))
      expect(new Set(effectivePermissions(role, null))).toEqual(new Set(rolePermissions[role]));
    expect(effectivePermissions("MANAGER", [], {})).toEqual([]);
    expect(effectivePermissions("USER", ["upgrades.plans.view"], { "upgrades.plans.view": false, "churn.customer.view": true })).toEqual([
      "churn.customer.view",
    ]);
    expect(effectivePermissions("USER", ["settings.manage", "unknown"], {})).toEqual([]);
    expect(effectivePermissions("ADMIN", [], Object.fromEntries(permissionKeys.map((key) => [key, false])))).toEqual(permissionKeys);
    expect(overridesSchema.safeParse({ "settings.manage": true }).success).toBe(false);
    expect(profileSchema.safeParse({ name: "Perfil", permissions: ["unknown"] }).success).toBe(false);
  });
  it("recarrega o perfil por requisição e nunca expõe senha ou token", async () => {
    const query = vi.spyOn(db, "query");
    const row = {
      id: 2,
      name: "Teste",
      email: "teste@example.test",
      role: "MANAGER",
      profile_id: 5,
      profile_name: "Comercial",
      profile_permissions: JSON.stringify(["upgrades.plans.view"]),
      permission_overrides: JSON.stringify({ "upgrades.export": true }),
      password_hash: "SECRET",
    };
    query
      .mockResolvedValueOnce([[row], []] as never)
      .mockResolvedValueOnce([[{ ...row, profile_permissions: "[]", permission_overrides: "{}" }], []] as never);
    const auth = new AuthService();
    const request = { headers: { authorization: "Bearer test" } } as never;
    expect(await auth.authenticate(request)).toMatchObject({ profileId: 5, permissions: ["upgrades.plans.view", "upgrades.export"] });
    const next = await auth.authenticate(request);
    expect(next?.permissions).toEqual([]);
    expect(JSON.stringify(next)).not.toContain("SECRET");
    expect(auth.serializeAccess({ ...row, profile_permissions: null, permission_overrides: null }).permissions).toEqual([]);
  });
  it("Configurações e usuários exigem ADMIN mesmo com todas as permissões", async () => {
    const authenticated = vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue(user);
    const query = vi.spyOn(db, "query"),
      execute = vi.spyOn(db, "execute");
    const app = Fastify();
    await app.register(settingsRoutes, { prefix: "/api/settings" });
    await app.register(authRoutes, { prefix: "/api/auth" });
    try {
      for (const [method, url] of [
        ["GET", "/api/settings/access"],
        ["PUT", "/api/settings/appearance"],
        ["POST", "/api/settings/profiles"],
        ["PUT", "/api/settings/profiles/1"],
        ["GET", "/api/auth/users"],
        ["POST", "/api/auth/users"],
        ["PATCH", "/api/auth/users/1"],
      ] as const) {
        expect((await app.inject({ method, url, ...(method !== "GET" ? { payload: {} } : {}) })).statusCode).toBe(403);
      }
      expect(query).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
      authenticated.mockResolvedValue(null);
      expect((await app.inject({ url: "/api/settings/access" })).statusCode).toBe(401);
      vi.spyOn(SettingsService.prototype, "appearance").mockResolvedValue(defaultAppearance);
      expect((await app.inject({ url: "/api/settings/appearance" })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
  it("protege conta própria, valida perfis e salva exceções sem alterar senha inadvertidamente", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ ...user, id: 1, role: "ADMIN" });
    const query = vi.spyOn(db, "query").mockResolvedValue([[], []] as never),
      execute = vi.spyOn(db, "execute");
    const app = Fastify();
    await app.register(authRoutes, { prefix: "/api/auth" });
    try {
      for (const payload of [{ role: "USER" }, { active: false }, { profileId: 1 }, { permissionOverrides: {} }])
        expect((await app.inject({ method: "PATCH", url: "/api/auth/users/1", payload })).statusCode).toBe(403);
      expect((await app.inject({ method: "PATCH", url: "/api/auth/users/2", payload: { profileId: 99 } })).statusCode).toBe(400);
      expect(
        (await app.inject({ method: "PATCH", url: "/api/auth/users/2", payload: { permissionOverrides: { unknown: true } } })).statusCode
      ).toBe(400);
      const update = vi
        .fn()
        .mockResolvedValueOnce([
          [
            { id: 1, role: "ADMIN", active: 1 },
            { id: 2, role: "USER", active: 1 },
          ],
          [],
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
      vi.spyOn(db, "getConnection").mockResolvedValue({
        query: update,
        beginTransaction: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn(),
      } as never);
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: "/api/auth/users/2",
            payload: { profileId: null, permissionOverrides: { "upgrades.export": false } },
          })
        ).statusCode
      ).toBe(200);
      expect(update.mock.calls.at(-1)?.[0]).not.toContain("password_hash");
      expect(execute).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("autoriza Upgrades por ação e bloqueia exportação sem leitura das oportunidades", async () => {
    const authenticated = vi
      .spyOn(AuthService.prototype, "authenticate")
      .mockResolvedValue({ ...user, role: "USER", permissions: ["upgrades.plans.view", "upgrades.export"] });
    const list = vi.spyOn(IxcApiService.prototype, "listPage").mockResolvedValue({ total: 0, rows: [] });
    const app = Fastify();
    await app.register(upgradeRoutes, { prefix: "/api/upgrades" });
    try {
      expect((await app.inject({ url: "/api/upgrades/plans" })).statusCode).toBe(200);
      list.mockClear();
      for (const url of ["/api/upgrades/opportunities", "/api/upgrades/summary", "/api/upgrades/contracts/1"])
        expect((await app.inject({ url })).statusCode).toBe(403);
      expect((await app.inject({ method: "POST", url: "/api/upgrades/export", payload: {} })).statusCode).toBe(403);
      expect(list).not.toHaveBeenCalled();
      authenticated.mockResolvedValue({ ...user, permissions: [] });
      expect((await app.inject({ url: "/api/upgrades/plans" })).statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
describe("Aparência", () => {
  it("aceita padrões claro/escuro e rejeita contraste ilegível, scripts e arquivos falsos", () => {
    expect(appearanceSchema.safeParse(defaultAppearance).success).toBe(true);
    expect(
      appearanceSchema.safeParse({ ...defaultAppearance, dark: { ...defaultAppearance.dark, text: defaultAppearance.dark.surface } })
        .success
    ).toBe(false);
    for (const logo of [
      "https://external.example/logo.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,SGVsbG8=",
      "javascript:alert(1)",
      "data:image/png;base64," + Buffer.alloc(256 * 1024 + 1).toString("base64"),
    ])
      expect(appearanceSchema.safeParse({ ...defaultAppearance, logo }).success).toBe(false);
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR4QAAAAASUVORK5CYII=";
    expect(appearanceSchema.safeParse({ ...defaultAppearance, logo: png, favicon: png }).success).toBe(true);
  });
  it("salva aparência apenas após validar e não vaza erros internos", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ ...user, role: "ADMIN" });
    const execute = vi.spyOn(db, "execute").mockResolvedValue([{ affectedRows: 1 }, []] as never);
    const app = Fastify();
    await app.register(settingsRoutes, { prefix: "/api/settings" });
    try {
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/api/settings/appearance",
            payload: { ...defaultAppearance, light: { ...defaultAppearance.light, text: "#ffffff" } },
          })
        ).statusCode
      ).toBe(400);
      expect(execute).not.toHaveBeenCalled();
      const saved = await app.inject({ method: "PUT", url: "/api/settings/appearance", payload: defaultAppearance });
      expect(saved.statusCode).toBe(200);
      expect(saved.headers["cache-control"]).toBe("no-store");
      expect(execute).toHaveBeenCalledTimes(1);
      execute.mockRejectedValueOnce(new Error("PRIVATE_DATABASE"));
      const failed = await app.inject({ method: "PUT", url: "/api/settings/appearance", payload: defaultAppearance });
      expect(failed.statusCode).toBe(500);
      expect(failed.body).not.toContain("PRIVATE_DATABASE");
    } finally {
      await app.close();
    }
  });
});

describe("Gestão administrativa", () => {
  it("cria e edita perfis com permissões válidas e trata duplicidade", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ ...user, role: "ADMIN" });
    const execute = vi
      .spyOn(db, "execute")
      .mockResolvedValueOnce([{ insertId: 7 }, []] as never)
      .mockResolvedValueOnce([{ affectedRows: 1 }, []] as never)
      .mockRejectedValueOnce(Object.assign(new Error("PRIVATE_QUERY"), { code: "ER_DUP_ENTRY" }));
    const app = Fastify();
    await app.register(settingsRoutes, { prefix: "/api/settings" });
    try {
      const payload = {
        name: "Comercial",
        description: "Catálogo e exportação",
        permissions: ["upgrades.plans.view", "upgrades.opportunities.view", "upgrades.export"],
      };
      expect((await app.inject({ method: "POST", url: "/api/settings/profiles", payload })).json()).toEqual({ id: 7 });
      expect(
        (await app.inject({ method: "PUT", url: "/api/settings/profiles/7", payload: { ...payload, permissions: [] } })).statusCode
      ).toBe(200);
      const duplicate = await app.inject({ method: "POST", url: "/api/settings/profiles", payload });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.body).not.toContain("PRIVATE_QUERY");
      expect(
        (await app.inject({ method: "POST", url: "/api/settings/profiles", payload: { ...payload, permissions: ["settings.manage"] } }))
          .statusCode
      ).toBe(400);
      expect(execute).toHaveBeenCalledTimes(3);
    } finally {
      await app.close();
    }
  });
  it("cria usuários com perfil, exceções e status sem expor credenciais", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ ...user, role: "ADMIN" });
    vi.spyOn(AuthService.prototype, "hashPassword").mockResolvedValue("PRIVATE_PASSWORD_HASH");
    vi.spyOn(db, "query").mockResolvedValue([[{ id: 7 }], []] as never);
    const execute = vi.spyOn(db, "execute").mockResolvedValue([{ insertId: 9 }, []] as never);
    const app = Fastify();
    await app.register(authRoutes, { prefix: "/api/auth" });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/users",
        payload: {
          name: "Teste",
          email: "test@example.test",
          password: "test-fixture-only",
          role: "USER",
          profileId: 7,
          active: false,
          permissionOverrides: { "upgrades.export": false },
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ id: 9 });
      expect(response.body).not.toContain("PRIVATE_PASSWORD_HASH");
      expect(execute.mock.calls[0]?.[1]).toEqual([
        "Teste",
        "test@example.test",
        "PRIVATE_PASSWORD_HASH",
        "USER",
        7,
        '{"upgrades.export":false}',
        0,
      ]);
    } finally {
      await app.close();
    }
  });
  it("revalida o administrador após o bloqueio transacional e faz rollback quando seu acesso foi revogado", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ ...user, id: 1, role: "ADMIN" });
    const query = vi.fn().mockResolvedValue([
      [
        { id: 1, role: "USER", active: 1 },
        { id: 2, role: "ADMIN", active: 1 },
      ],
      [],
    ]);
    const commit = vi.fn(),
      rollback = vi.fn(),
      release = vi.fn();
    vi.spyOn(db, "getConnection").mockResolvedValue({ query, beginTransaction: vi.fn(), commit, rollback, release } as never);
    const app = Fastify();
    await app.register(authRoutes, { prefix: "/api/auth" });
    try {
      expect((await app.inject({ method: "PATCH", url: "/api/auth/users/2", payload: { role: "USER", active: false } })).statusCode).toBe(
        403
      );
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0]?.[0]).toContain("FOR UPDATE");
      expect(commit).not.toHaveBeenCalled();
      expect(rollback).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });
});
