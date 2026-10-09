import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChurnSettingsService, churnSettingsSchema, defaultChurnSettings } from "../src/services/settings/ChurnSettingsService.js";
import { db } from "../src/repositories/database.js";
import { getRiskLevel } from "../src/config/risk.js";
import { settingsRoutes } from "../src/controllers/settingsController.js";
import { AuthService } from "../src/services/AuthService.js";
import { permissionKeys } from "../src/config/permissions.js";

afterEach(() => vi.restoreAllMocks());
const custom = { low: 0 as const, attention: 20, medium: 40, high: 55, critical: 75 };
describe("Faixas configuráveis de Churn", () => {
  it("cobre todos os scores com limites inclusivos e sem lacunas", () => {
    for (const [score, level] of [
      [0, "LOW"],
      [19, "LOW"],
      [20, "ATTENTION"],
      [39, "ATTENTION"],
      [40, "MEDIUM"],
      [54, "MEDIUM"],
      [55, "HIGH"],
      [74, "HIGH"],
      [75, "CRITICAL"],
      [100, "CRITICAL"],
    ] as const)
      expect(getRiskLevel(score, custom)).toBe(level);
    expect(getRiskLevel(60)).toBe("HIGH");
    expect(getRiskLevel(85)).toBe("CRITICAL");
  });
  it("rejeita limites fora da escala, fracionados, repetidos, invertidos ou campos extras", () => {
    for (const invalid of [
      { ...custom, low: 1 },
      { ...custom, attention: 0 },
      { ...custom, medium: 20 },
      { ...custom, high: 39 },
      { ...custom, critical: 101 },
      { ...custom, high: 55.5 },
      { ...custom, high: "55" },
      { ...custom, unknown: true },
    ])
      expect(churnSettingsSchema.safeParse(invalid).success).toBe(false);
    expect(churnSettingsSchema.parse(custom)).toEqual(custom);
  });
  it("preserva os padrões sem cadastro ou migração e não mascara falha de conexão/configuração", async () => {
    const service = new ChurnSettingsService();
    const query = vi.spyOn(db, "query").mockResolvedValue([[], []] as never);
    expect(await service.read()).toEqual(defaultChurnSettings);
    query.mockRejectedValueOnce({ code: "ER_NO_SUCH_TABLE" });
    expect(await service.read()).toEqual(defaultChurnSettings);
    query.mockRejectedValueOnce(new Error("CONNECTION_FAILURE"));
    await expect(service.read()).rejects.toThrow("CONNECTION_FAILURE");
    query.mockResolvedValueOnce([[{ configuration: JSON.stringify({ ...custom, high: 10 }) }], []] as never);
    await expect(service.read()).rejects.toThrow();
  });
  it("salva na base local com identificação do administrador e relê o valor salvo", async () => {
    const service = new ChurnSettingsService();
    const execute = vi.spyOn(db, "execute").mockResolvedValue([{}, []] as never);
    expect(await service.save(custom, 7)).toEqual(custom);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO retention_churn_settings"), [JSON.stringify(custom), 7]);
    vi.spyOn(db, "query").mockResolvedValue([[{ configuration: JSON.stringify(custom) }], []] as never);
    expect(await service.get()).toEqual({ configuration: custom, defaults: defaultChurnSettings });
    await expect(service.save({ ...custom, high: 1 }, 7)).rejects.toThrow();
    expect(execute).toHaveBeenCalledOnce();
  });
  it("restringe leitura e gravação ao ADMIN, mesmo com permissões personalizadas", async () => {
    const auth = vi.spyOn(AuthService.prototype, "authenticate");
    const query = vi.spyOn(db, "query"),
      execute = vi.spyOn(db, "execute");
    const app = Fastify();
    await app.register(settingsRoutes, { prefix: "/api/settings" });
    try {
      for (const role of ["OPERATOR", "MANAGER", "USER"]) {
        auth.mockResolvedValue({ id: 2, role, permissions: permissionKeys } as never);
        for (const method of ["GET", "PUT"] as const)
          expect(
            (await app.inject({ method, url: "/api/settings/churn", ...(method === "PUT" ? { payload: custom } : {}) })).statusCode
          ).toBe(403);
      }
      auth.mockResolvedValue(null);
      expect((await app.inject({ url: "/api/settings/churn" })).statusCode).toBe(401);
      expect(query).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("valida os dados no endpoint, identifica o editor e sanitiza falhas", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ id: 8, role: "ADMIN" } as never);
    vi.spyOn(db, "query").mockResolvedValue([[], []] as never);
    const execute = vi.spyOn(db, "execute").mockResolvedValue([{}, []] as never);
    const app = Fastify();
    await app.register(settingsRoutes, { prefix: "/api/settings" });
    try {
      const read = await app.inject({ url: "/api/settings/churn" });
      expect(read.statusCode).toBe(200);
      expect(read.headers["cache-control"]).toBe("no-store");
      expect((await app.inject({ method: "PUT", url: "/api/settings/churn", payload: { ...custom, critical: 50 } })).statusCode).toBe(400);
      expect(execute).not.toHaveBeenCalled();
      const saved = await app.inject({ method: "PUT", url: "/api/settings/churn", payload: custom });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toEqual(custom);
      expect(execute.mock.calls[0]?.[1]).toEqual([JSON.stringify(custom), 8]);
      execute.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_CREDENTIALS"));
      const failed = await app.inject({ method: "PUT", url: "/api/settings/churn", payload: custom });
      expect(failed.statusCode).toBe(500);
      expect(failed.body).not.toContain("PRIVATE_DATABASE_CREDENTIALS");
    } finally {
      await app.close();
    }
  });
});
