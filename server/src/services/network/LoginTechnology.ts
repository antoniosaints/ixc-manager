/** IXC technology comes from tipo_conexao_mapa, not the Ethernet interface field. */
export function loginTechnology(value: unknown) {
  const code = String(value ?? "")
    .trim()
    .toUpperCase();
  const labels: Record<string, string> = {
    F: "Fibra",
    "58": "Rádio 5.8 GHz",
    "24": "Rádio 2.4 GHz",
    L: "Cabo",
    A: "ADSL",
    LTE: "LTE",
    LDD: "Linha dedicada",
  };
  return {
    code: code || null,
    label: labels[code] ?? "Não informado",
    kind: code === "F" ? "fiber" : ["58", "24"].includes(code) ? "radio" : labels[code] ? "other" : "unknown",
  };
}
