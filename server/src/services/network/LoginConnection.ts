/** Presence of the primary IP is the requested connection criterion; no ONU lookup or ping. */
export function connectionIp(value: unknown): string | null {
  const ip = String(value ?? "").trim();
  return ["", "0", "0.0.0.0", "::", "::0"].includes(ip) ? null : ip;
}
export const connectedIpSql = "TRIM(COALESCE(r.ip,'')) NOT IN ('','0','0.0.0.0','::','::0')";
export const connectionStatus = (ip: unknown) => (connectionIp(ip) === null ? ("offline" as const) : ("online" as const));
