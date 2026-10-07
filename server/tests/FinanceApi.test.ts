import { afterEach, describe, expect, it, vi } from "vitest";
import { financeDashboard } from "../../client/src/financeApi.js";
const params = new URLSearchParams({ from: "2026-10-01", to: "2026-10-06" });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", { getItem: () => "FAKE_TOKEN" });
  const fetch = vi.fn(
    (_url: string, options: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        if (options.signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        const timer = setTimeout(
          () => resolve(new Response(JSON.stringify({ queriedAt: "2026-10-06T12:00:00Z" }), { status: 200 })),
          17_000
        );
        options.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true }
        );
      })
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
describe("Carregamento do Financeiro", () => {
  it("aguarda uma consulta que ultrapassa o antigo prazo de 8 segundos", async () => {
    const fetch = setup();
    const request = financeDashboard(params);
    await vi.advanceTimersByTimeAsync(17_000);
    expect(await request).toEqual({ queriedAt: "2026-10-06T12:00:00Z" });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store", headers: { Authorization: "Bearer FAKE_TOKEN" } });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("limita a espera e informa como refinar o período sem ficar carregando indefinidamente", async () => {
    setup();
    vi.stubGlobal(
      "fetch",
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) =>
          options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })
        )
    );
    const result = financeDashboard(params).catch((error) => error);
    await vi.advanceTimersByTimeAsync(80_000);
    expect((await result).message).toContain("Reduza o período");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancela a consulta anterior ao trocar de filtro ou sair da tela", async () => {
    setup();
    const controller = new AbortController();
    const result = financeDashboard(params, controller.signal).catch((error) => error);
    controller.abort();
    expect((await result).name).toBe("AbortError");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("traduz falhas de proxy sem JSON e respostas inválidas", async () => {
    setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Gateway timeout", { status: 504 })));
    await expect(financeDashboard(params)).rejects.toThrow("interrompida");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Unavailable</html>", { status: 200 })));
    await expect(financeDashboard(params)).rejects.toThrow("resposta financeira válida");
    expect(vi.getTimerCount()).toBe(0);
  });
});
