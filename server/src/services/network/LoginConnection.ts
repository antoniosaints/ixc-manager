/** Normalize the access address independently of the session state. */
export function connectionIp(value: unknown): string | null {
  const ip = String(value ?? "").trim();
  return ["", "0", "0.0.0.0", "::", "::0"].includes(ip) ? null : ip;
}
export const connectedIpSql = "TRIM(COALESCE(r.ip,'')) NOT IN ('','0','0.0.0.0','::','::0')";
/** IXC session state takes precedence over an IP retained after disconnecting.
 * Missing/unknown state falls back to IP; neither path depends on an ONU.
 */
export const connectedLoginSql = `(CASE UPPER(TRIM(COALESCE(r.online,'')))
  WHEN 'S' THEN 1 WHEN 'N' THEN 0 WHEN 'SS' THEN 0 ELSE (${connectedIpSql}) END = 1)`;
export function connectionStatus(ip: unknown, online?: unknown): "online" | "offline" {
  const state = String(online ?? "")
    .trim()
    .toUpperCase();
  if (state === "S") return "online";
  if (state === "N" || state === "SS") return "offline";
  return connectionIp(ip) === null ? "offline" : "online";
}
