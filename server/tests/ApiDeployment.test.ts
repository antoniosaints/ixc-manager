import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "../../client/src/http.js";
afterEach(() => vi.unstubAllGlobals());
it("identifica o fallback HTML indevido no deploy antes de tratar JSON ou exportar PDFs", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response("<html>Frontend</html>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }))
  );
  await expect(apiFetch("/api/auth/login")).rejects.toThrow("frontend em vez da API");
  await expect(apiFetch("/api/upgrades/export")).rejects.toThrow("backend está iniciado");
});
it("preserva destino relativo, token, cancelamento e respostas JSON/PDF/erros da API", async () => {
  const response = new Response('{"ok":true}', { headers: { "Content-Type": "application/json" } });
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  const options = { headers: { Authorization: "Bearer FICTITIOUS" }, signal: new AbortController().signal };
  expect(await apiFetch("/api/auth/me", options)).toBe(response);
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", options);
  const pdf = new Response("fictitious", { headers: { "Content-Type": "application/pdf" } });
  fetchMock.mockResolvedValueOnce(pdf);
  expect(await apiFetch("/api/upgrades/export")).toBe(pdf);
  const failure = new Response("<html>Proxy failure</html>", { status: 502, headers: { "Content-Type": "text/html" } });
  fetchMock.mockResolvedValueOnce(failure);
  expect(await apiFetch("/api/finance/dashboard")).toBe(failure);
});
