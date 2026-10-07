import axios, { type AxiosInstance } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IxcApiService } from "../src/integrations/ixc/IxcApiService.js";
afterEach(() => vi.restoreAllMocks());
const request = { qtype: "su_ticket.id_cliente", query: "1", oper: "=", sortname: "su_ticket.id", rp: 10 };
function setup(data: unknown) {
  vi.spyOn(axios, "create").mockReturnValue({ get: vi.fn().mockResolvedValue({ data }) } as unknown as AxiosInstance);
  return new IxcApiService({ attempts: 1 });
}
describe("Resposta vazia da API IXC", () => {
  it("encaminha o cancelamento ao GET em andamento", async () => {
    const get = vi.fn(
      (_path: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("Canceled")), { once: true });
        })
    );
    vi.spyOn(axios, "create").mockReturnValue({ get } as unknown as AxiosInstance);
    const controller = new AbortController();
    const pending = new IxcApiService({ attempts: 1 }).listPage("su_ticket", request, 1, controller.signal);
    const rejected = expect(pending).rejects.toThrow("Canceled");
    controller.abort();
    await rejected;
    expect(get.mock.calls[0]?.[1].signal).toBe(controller.signal);
    expect(get).toHaveBeenCalledTimes(1);
  });
  it("aceita page e total zero sem registros, em vez de reportar indisponibilidade", async () => {
    expect(await setup({ page: "1", total: "0" }).listPage("su_ticket", request, 1)).toEqual({ rows: [], total: 0 });
    expect(await setup({ page: 2, total: 0 }).listPage("cliente_contrato_comodato", request, 2)).toEqual({ rows: [], total: 0 });
  });
  it("continua rejeitando erro, resposta incompleta e total não vazio sem registros", async () => {
    for (const data of [
      null,
      {},
      { total: "0" },
      { page: "1", total: "1" },
      { page: "1", total: "" },
      { page: "1", total: null },
      { page: "1", total: "0", type: "error" },
    ])
      await expect(setup(data).listPage("su_ticket", request, 1)).rejects.toThrow("listagem válida");
  });
  it("preserva registros e o formato rows já suportado", async () => {
    expect(await setup({ page: "1", total: "1", registros: [{ id: "2" }] }).listPage("su_ticket", request, 1)).toEqual({
      total: 1,
      rows: [{ id: "2" }],
    });
    expect(await setup({ rows: [] }).listPage("su_ticket", request, 1)).toEqual({ total: 0, rows: [] });
  });
});
