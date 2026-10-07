import type { IxcDecimal } from "../types.js";

/** Exact decimal conversion: no floating-point rounding or loss beyond Number.MAX_SAFE_INTEGER. */
export function decimalToUnits(value: IxcDecimal, scale = 2): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 9) throw new Error("Escala decimal inválida");
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match || (match[3]?.length ?? 0) > scale) throw new Error("Decimal IXC inválido");
  const units = BigInt(match[2]!) * 10n ** BigInt(scale) + BigInt((match[3] ?? "").padEnd(scale, "0") || "0");
  return match[1] ? -units : units;
}
export function mapMoney(value: string | null): { decimal: string; cents: string } | null {
  return value === null ? null : { decimal: value, cents: decimalToUnits(value).toString() };
}
/** MariaDB legacy zero dates must not become a real date or roll forward to another month. */
export function mapDate(value: string | null): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date === "0000-00-00") return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}
export function mapIdentifier(value: string | number): string {
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error("ID IXC excede a precisão numérica");
  const id = String(value);
  if (!/^[1-9]\d*$/.test(id)) throw new Error("ID IXC inválido");
  return id;
}
export function mapAccountingRegime(code: string | null): "cash" | "competence" | "manual" | "unknown" {
  return code === "S" ? "cash" : code === "N" ? "competence" : code === "M" ? "manual" : "unknown";
}
export function mapLoginConnection(code: string | null): "online" | "offline" | "never-authenticated" | "unknown" {
  return code === "S" ? "online" : code === "N" ? "offline" : code === "SS" ? "never-authenticated" : "unknown";
}
