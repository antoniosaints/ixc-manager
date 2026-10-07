type Row = Record<string, unknown>;
const serial = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[:.\s-]/g, "");
const normalizeSql = (field: string) =>
  `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(${field},'')),':',''),'-',''),'.',''),' ',''))`;
/** A moved login may retain an old ONU contract. Require the same customer AND matching equipment serial. */
export const compatibleOnuSql = `(COALESCE(f.id_contrato,0)=0 OR f.id_contrato=r.id_contrato OR (
  onc.id_cliente=r.id_cliente AND ${normalizeSql("r.onu_mac")}<>''
  AND (${normalizeSql("r.onu_mac")}=${normalizeSql("f.mac")} OR ${normalizeSql("r.onu_mac")}=${normalizeSql("f.serial_number")})))`;
export function compatibleOnu(row: Row, contractId: number | null, customerId: number) {
  const contract = String(row.id_contrato ?? "").trim();
  if (contract === "" || contract === "0") return true;
  if (!/^[1-9]\d*$/.test(contract) || !Number.isSafeInteger(Number(contract))) return false;
  if (Number(contract) === contractId) return true;
  const loginSerial = serial(row.login_onu_mac);
  return Number(row.onu_customer_id) === customerId && !!loginSerial && [serial(row.mac), serial(row.serial_number)].includes(loginSerial);
}
