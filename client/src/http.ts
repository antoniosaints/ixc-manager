/** Empty URL keeps same-origin routing; dev always uses the local Vite proxy. */
export function apiUrl(path: string, base = import.meta.env.PROD ? (import.meta.env.VITE_BACKEND_URL ?? "") : ""): string {
  if (!/^\/api(?:\/|\?|$)/.test(path)) throw new Error("Caminho de API inválido.");
  const configured = base.trim();
  if (!configured) return path;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("VITE_BACKEND_URL deve ser uma URL HTTP ou HTTPS válida.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error("VITE_BACKEND_URL deve conter somente a URL pública do backend, sem credenciais ou parâmetros.");
  const prefix = url.pathname.replace(/\/+$/, "");
  // Accept both https://backend.example and https://backend.example/api.
  return `${url.origin}${prefix}${prefix.endsWith("/api") ? path.slice(4) : path}`;
}

export function apiWebSocketUrl(path = "/api/network/live"): string {
  const url = new URL(apiUrl(path), `${location.protocol}//${location.host}`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(apiUrl(path), init);
  if (response.ok && response.headers.get("Content-Type")?.toLowerCase().includes("text/html"))
    throw new Error(
      "O endereço está retornando o frontend em vez da API. Verifique VITE_BACKEND_URL, se o backend está iniciado e se /api é encaminhado para ele no deploy."
    );
  return response;
}
