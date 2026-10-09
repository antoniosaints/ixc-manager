/** Translate browser transport errors while preserving useful messages supplied by the API. */
export function queryErrorMessage(reason: unknown, fallback = "Não foi possível concluir a consulta. Tente novamente."): string {
  const message = (reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "").trim();
  if (/failed to fetch|networkerror|network request failed|load failed|failed to load resource/i.test(message))
    return "Não conseguimos conectar ao servidor. Verifique sua conexão e tente novamente.";
  if (/timeout|timed out|tempo limite/i.test(message))
    return "A consulta demorou mais que o esperado. Aguarde um instante e tente novamente.";
  if (/unexpected token|unexpected end of json|json\.parse/i.test(message))
    return "O servidor retornou uma resposta inesperada. Tente novamente.";
  return message || fallback;
}
