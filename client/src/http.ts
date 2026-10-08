/** API requests stay on the current origin in dev (Vite proxy) and production (Fastify). */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, init);
  if (response.ok && response.headers.get("Content-Type")?.toLowerCase().includes("text/html"))
    throw new Error(
      "O endereço está retornando o frontend em vez da API. Verifique se o backend está iniciado e se /api é encaminhado para ele no deploy."
    );
  return response;
}
