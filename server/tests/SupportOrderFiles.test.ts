import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import Fastify from "fastify";
import { SupportOrderFilesService, osFileName } from "../src/services/support/SupportOrderFilesService.js";
import { IxcOsFileApi, osFileContentType, MAX_OS_FILE_BYTES } from "../src/integrations/ixc/IxcOsFileApi.js";
import { AuthService } from "../src/services/AuthService.js";
import { supportRoutes } from "../src/controllers/supportController.js";
afterEach(() => vi.restoreAllMocks());
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const file = {
  id: "30",
  id_oss_chamado: "20",
  descricao: "Foto do serviço",
  nome_arquivo: "foto.png",
  data_envio: "2026-10-09 12:00:00",
  local_arquivo: "/private/path",
  secret: "PRIVATE",
};
function fixture(parent = { id: "20", id_cliente: "1" }, rows: Record<string, unknown>[] = [file], total = rows.length) {
  const listPage = vi.fn(async (endpoint: string) => (endpoint === "su_oss_chamado" ? { rows: [parent], total: 1 } : { rows, total }));
  const content = vi.fn(async () => png);
  return {
    listPage,
    content,
    service: new SupportOrderFilesService({ listPage: listPage as never }, { content }, () => new Date("2026-10-09T15:00:00Z")),
  };
}
describe("Arquivos da OS pela API IXC", () => {
  it("lists only exact order files with pagination and a safe public DTO", async () => {
    const f = fixture();
    const result = await f.service.list(1, 20, { page: 2, limit: 25, order: "oldest" });
    expect(f.listPage.mock.calls[1]).toEqual([
      "su_oss_chamado_arquivos",
      expect.objectContaining({ qtype: "su_oss_chamado_arquivos.id_oss_chamado", query: "20", oper: "=", rp: 25, sortorder: "asc" }),
      2,
      undefined,
    ]);
    expect(result).toMatchObject({
      source: "ixc-api",
      page: 2,
      limit: 25,
      total: 1,
      items: [{ id: 30, name: "foto.png", extension: "png" }],
    });
    expect(JSON.stringify(result)).not.toMatch(/private|PRIVATE|local_arquivo|secret/);
    expect(f.content).not.toHaveBeenCalled();
  });
  it("rejects a different client/order before listing or viewing files", async () => {
    for (const parent of [
      { id: "20", id_cliente: "2" },
      { id: "21", id_cliente: "1" },
    ]) {
      const f = fixture(parent);
      await expect(f.service.list(1, 20, {})).rejects.toMatchObject({ statusCode: 404 });
      expect(f.listPage).toHaveBeenCalledOnce();
      await expect(f.service.content(1, 20, 30)).rejects.toMatchObject({ statusCode: 404 });
      expect(f.content).not.toHaveBeenCalled();
    }
  });
  it("rejects files from a different order, invalid totals and duplicated rows", async () => {
    for (const [rows, total] of [
      [[file, file], 2],
      [[{ ...file, id_oss_chamado: "21" }], 1],
      [[file], NaN],
      [[file], 0],
    ] as const) {
      await expect(fixture(undefined, [...rows], total).service.list(1, 20, {})).rejects.toMatchObject({ statusCode: 502 });
    }
  });
  it("checks the file record belongs to this order before the read action", async () => {
    for (const row of [
      { ...file, id_oss_chamado: "21" },
      { ...file, id: "31" },
    ]) {
      const f = fixture(undefined, [row]);
      await expect(f.service.content(1, 20, 30)).rejects.toMatchObject({ statusCode: 404 });
      expect(f.content).not.toHaveBeenCalled();
    }
    const f = fixture(),
      signal = new AbortController().signal;
    expect(await f.service.content(1, 20, 30, signal)).toEqual({ buffer: png, contentType: "image/png", name: "foto.png" });
    expect(f.content).toHaveBeenCalledWith(30, signal);
  });
  it("uses only the documented fixed GET action and prevents redirects/unbounded responses", async () => {
    const get = vi.fn().mockResolvedValue({ data: png, headers: { "content-type": "image/png" } });
    const create = vi.spyOn(axios, "create").mockReturnValue({ get } as never);
    const reader = new IxcOsFileApi(),
      signal = new AbortController().signal;
    expect(await reader.content(30, signal)).toEqual(png);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ maxRedirects: 0, maxContentLength: MAX_OS_FILE_BYTES }));
    expect(get).toHaveBeenCalledWith("/visualizar_arquivo_os", { data: { id: "30" }, responseType: "arraybuffer", signal });
    get.mockResolvedValueOnce({ data: Buffer.from('{"message":"PRIVATE"}'), headers: { "content-type": "application/json" } });
    await expect(reader.content(30)).rejects.toThrow("Não foi possível abrir o arquivo");
    get.mockResolvedValueOnce({ data: Buffer.alloc(MAX_OS_FILE_BYTES + 1), headers: { "content-type": "image/png" } });
    await expect(reader.content(30)).rejects.toThrow("Não foi possível abrir o arquivo");
  });
  it("sniffs preview MIME types and treats active/unknown formats as inert downloads", () => {
    expect(osFileContentType(png)).toBe("image/png");
    expect(osFileContentType(Buffer.from([255, 216, 255, 0]))).toBe("image/jpeg");
    expect(osFileContentType(Buffer.from("GIF89a"))).toBe("image/gif");
    expect(osFileContentType(Buffer.from("RIFF0000WEBP"))).toBe("image/webp");
    expect(osFileContentType(Buffer.from("%PDF-1.4"))).toBe("application/pdf");
    for (const value of ["<svg onload='alert(1)'>", "<script>PRIVATE</script>", "", "PK00"])
      expect(osFileContentType(Buffer.from(value))).toBe("application/octet-stream");
    expect(osFileName("/private/foto\r\n.png", 30)).toBe("foto.png");
    expect(osFileName("..", 30)).toBe("arquivo-os-30");
  });
  it("requires existing customer/order permissions, protects downloads, and exposes only GET routes", async () => {
    const user = vi.spyOn(AuthService.prototype, "requireUser").mockResolvedValue({ id: 1 } as never);
    const permission = vi.spyOn(AuthService.prototype, "requirePermission").mockResolvedValue({ id: 1 } as never);
    const list = vi
      .spyOn(SupportOrderFilesService.prototype, "list")
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, source: "ixc-api", queriedAt: "now" });
    const content = vi
      .spyOn(SupportOrderFilesService.prototype, "content")
      .mockResolvedValue({ buffer: png, contentType: "image/png", name: "foto.png" });
    const app = Fastify();
    await app.register(supportRoutes, { prefix: "/api/support" });
    const url = "/api/support/customers/1/orders/20/files";
    try {
      expect((await app.inject({ url })).statusCode).toBe(200);
      expect(permission).toHaveBeenLastCalledWith(expect.anything(), "support.customer.view", "support.orders.view");
      const response = await app.inject({ url: `${url}/30/content` });
      expect(response.statusCode).toBe(200);
      expect(response.rawPayload).toEqual(png);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["content-disposition"]).toContain("attachment");
      permission.mockRejectedValueOnce(Object.assign(new Error("Sem permissão"), { statusCode: 403 }));
      expect((await app.inject({ url: `${url}/30/content` })).statusCode).toBe(403);
      expect(content).toHaveBeenCalledOnce();
      user.mockRejectedValueOnce(Object.assign(new Error("Não autenticado"), { statusCode: 401 }));
      expect((await app.inject({ url })).statusCode).toBe(401);
      expect(list).toHaveBeenCalledOnce();
      expect((await app.inject({ url: `${url}/0/content` })).statusCode).toBe(400);
      expect((await app.inject({ method: "POST", url })).statusCode).toBe(404);
      content.mockRejectedValueOnce(new Error("PRIVATE_AUTH"));
      const unavailable = await app.inject({ url: `${url}/30/content` });
      expect(unavailable.statusCode).toBe(502);
      expect(unavailable.body).not.toContain("PRIVATE_AUTH");
    } finally {
      await app.close();
    }
  });
});
