/** RX thresholds in dBm. TX uses a different scale and is deliberately not classified here. */
export function rxSignalLevel(rx: number | null) {
  if (rx === null || !Number.isFinite(rx)) return { label: "Sem leitura", className: "text-slate-500" };
  if (rx <= -29) return { label: "Crítico", className: "text-red-600" };
  if (rx <= -27) return { label: "Atenção", className: "text-amber-700" };
  return { label: "Bom", className: "text-emerald-700" };
}
