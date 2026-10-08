import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "../../client/src/http.js";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
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

it("usa a URL configurada em produção em HTTP, PDFs e WebSocket, sem duplicar /api", async () => {
  vi.stubEnv("PROD", true);
  vi.stubEnv("VITE_BACKEND_URL", "https://backend.example.test/");
  vi.stubGlobal("location", { protocol: "https:", host: "frontend.example.test" });
  const { apiUrl, apiWebSocketUrl } = await import("../../client/src/http.js");
  expect(apiUrl("/api/auth/me")).toBe("https://backend.example.test/api/auth/me");
  expect(apiUrl("/api/finance/dashboard?from=2026-10-01")).toBe("https://backend.example.test/api/finance/dashboard?from=2026-10-01");
  expect(apiWebSocketUrl()).toBe("wss://backend.example.test/api/network/live");
  const fetchMock = vi.fn().mockResolvedValue(new Response("PDF", { headers: { "Content-Type": "application/pdf" } }));
  vi.stubGlobal("fetch", fetchMock);
  await apiFetch("/api/upgrades/export", { method: "POST" });
  expect(fetchMock).toHaveBeenCalledWith("https://backend.example.test/api/upgrades/export", { method: "POST" });
  vi.stubEnv("VITE_BACKEND_URL", " https://backend.example.test/api/ ");
  expect(apiUrl("/api/auth/me")).toBe("https://backend.example.test/api/auth/me");
  vi.stubEnv("VITE_BACKEND_URL", "http://backend.example.test:3000");
  expect(apiWebSocketUrl()).toBe("ws://backend.example.test:3000/api/network/live");
});
it("mantém desenvolvimento e produção sem variável na mesma origem e recusa URLs inseguras", async () => {
  const { apiUrl, apiWebSocketUrl } = await import("../../client/src/http.js");
  vi.stubEnv("PROD", false);
  vi.stubEnv("VITE_BACKEND_URL", "https://production.example.test");
  vi.stubGlobal("location", { protocol: "http:", host: "192.168.1.2:5173" });
  expect(apiUrl("/api/auth/me")).toBe("/api/auth/me");
  expect(apiWebSocketUrl()).toBe("ws://192.168.1.2:5173/api/network/live");
  vi.stubEnv("PROD", true);
  vi.stubEnv("VITE_BACKEND_URL", "");
  expect(apiUrl("/api/auth/me")).toBe("/api/auth/me");
  for (const invalid of [
    "javascript:alert(1)",
    "ftp://backend.example.test",
    "https://user:secret@example.test",
    "https://backend.example.test?token=secret",
    "https://backend.example.test#hash",
    "not-a-url",
  ])
    expect(() => apiUrl("/api/auth/me", invalid)).toThrow("VITE_BACKEND_URL");
  expect(() => apiUrl("//foreign.example.test/api")).toThrow("Caminho");
});
