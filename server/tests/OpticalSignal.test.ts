import { describe, expect, it } from "vitest";
import { rxSignalLevel } from "../../client/src/opticalSignal.js";
describe("Faixas de RX em dBm", () => {
  it("aplica os limites confirmados sem inverter a ordem dos números negativos", () => {
    for (const value of [-21.54, -26.99]) expect(rxSignalLevel(value)).toEqual({ label: "Bom", className: "text-emerald-700" });
    for (const value of [-27, -28.99]) expect(rxSignalLevel(value)).toEqual({ label: "Atenção", className: "text-amber-700" });
    for (const value of [-29, -31]) expect(rxSignalLevel(value)).toEqual({ label: "Crítico", className: "text-red-600" });
    for (const value of [null, NaN, Infinity]) expect(rxSignalLevel(value)).toEqual({ label: "Sem leitura", className: "text-slate-500" });
  });
});
