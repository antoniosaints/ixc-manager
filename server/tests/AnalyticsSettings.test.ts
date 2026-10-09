import Fastify from "fastify";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  AnalyticsSettingsService,
  activationSettingsSchema,
  defaultActivationSettings,
} from "../src/services/settings/AnalyticsSettingsService.js";
import { db } from "../src/repositories/database.js";
import { AuthService } from "../src/services/AuthService.js";
import { settingsRoutes } from "../src/controllers/settingsController.js";
import { permissionKeys } from "../src/config/permissions.js";
import { IxcReadDatabase, assertReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
afterEach(() => vi.restoreAllMocks());
describe("Configuração de assuntos de ativação", () => {
  it("valida seleção explícita e mantém a regra antiga antes de configurar", async () => {
    const query = vi.spyOn(db, "query").mockResolvedValue([[], []] as never);
    const service = new AnalyticsSettingsService();
    expect(await service.read()).toEqual(defaultActivationSettings);
    expect(query).toHaveBeenCalledOnce();
    for (const value of [
      { source: "serviceOrders", subjectIds: [] },
      { source: "all", subjectIds: [1] },
      { source: "serviceOrders", subjectIds: [0] },
      { source: "serviceOrders", subjectIds: ["1 OR 1=1"] },
      { source: "serviceOrders", subjectIds: Array(201).fill(1) },
    ])
      expect(activationSettingsSchema.safeParse(value).success).toBe(false);
    expect(activationSettingsSchema.parse({ source: "serviceOrders", subjectIds: [3, 1, 3] }).subjectIds).toEqual([1, 3]);
  });
  it("salva somente na base do sistema com auditoria do admin e valida IDs no IXC por leitura", async () => {
    const select = vi.fn(async (q: any) => {
      assertReadQuery(q);
      return [
        { id: 1, assunto: "Instalação" },
        { id: 2, assunto: "Suporte" },
      ];
    });
    const service = new AnalyticsSettingsService({ select } as never);
    const execute = vi.spyOn(db, "execute").mockResolvedValue([{}, []] as never);
    expect(await service.save({ source: "serviceOrders", subjectIds: [1, 1] }, 7)).toEqual({ source: "serviceOrders", subjectIds: [1] });
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO retention_analytics_settings"), [
      JSON.stringify({ source: "serviceOrders", subjectIds: [1] }),
      7,
    ]);
    await expect(service.save({ source: "serviceOrders", subjectIds: [999] }, 7)).rejects.toMatchObject({ statusCode: 400 });
    expect(execute).toHaveBeenCalledOnce();
    vi.spyOn(db, "query").mockResolvedValue([
      [{ configuration: JSON.stringify({ source: "serviceOrders", subjectIds: [1] }) }],
      [],
    ] as never);
    expect(await service.read()).toEqual({ source: "serviceOrders", subjectIds: [1] });
    for (const [q] of select.mock.calls) expect(q.sql).toMatch(/^SELECT id,assunto/);
  });
  it("nega configurações para operadores e gestores mesmo com todas as permissões", async () => {
    const auth = vi.spyOn(AuthService.prototype, "authenticate");
    const query = vi.spyOn(db, "query"),
      execute = vi.spyOn(db, "execute"),
      ixc = vi.spyOn(IxcReadDatabase.prototype, "select");
    const app = Fastify();
    await app.register(settingsRoutes, { prefix: "/api/settings" });
    try {
      for (const role of ["OPERATOR", "MANAGER", "USER"]) {
        auth.mockResolvedValue({ id: 2, role, permissions: permissionKeys } as never);
        for (const method of ["GET", "PUT"] as const)
          expect(
            (
              await app.inject({
                method,
                url: "/api/settings/analytics",
                ...(method === "PUT" ? { payload: defaultActivationSettings } : {}),
              })
            ).statusCode
          ).toBe(403);
      }
      expect(query).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
      expect(ixc).not.toHaveBeenCalled();
      auth.mockResolvedValue(null);
      expect((await app.inject({ url: "/api/settings/analytics" })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
  it("permite admin ler/salvar e sanitiza falhas sem conceder escrita no IXC", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({ id: 8, role: "ADMIN" } as never);
    const get = vi
      .spyOn(AnalyticsSettingsService.prototype, "get")
      .mockResolvedValue({ configuration: defaultActivationSettings, subjects: [{ id: 1, name: "Instalação" }] });
    const save = vi.spyOn(AnalyticsSettingsService.prototype, "save").mockResolvedValue({ source: "serviceOrders", subjectIds: [1] });
    const app = Fastify();
    await app.register(settingsRoutes, { prefix: "/api/settings" });
    try {
      const response = await app.inject({ url: "/api/settings/analytics" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(get).toHaveBeenCalledOnce();
      expect(
        (await app.inject({ method: "PUT", url: "/api/settings/analytics", payload: { source: "serviceOrders", subjectIds: [1] } }))
          .statusCode
      ).toBe(200);
      expect(save).toHaveBeenCalledWith({ source: "serviceOrders", subjectIds: [1] }, 8);
      get.mockRejectedValueOnce(new Error("PRIVATE_CREDENTIALS"));
      const failed = await app.inject({ url: "/api/settings/analytics" });
      expect(failed.statusCode).toBe(500);
      expect(failed.body).not.toContain("PRIVATE_CREDENTIALS");
    } finally {
      await app.close();
    }
  });
});
