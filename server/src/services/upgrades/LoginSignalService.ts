import { IxcApiService } from "../../integrations/ixc/IxcApiService.js";
import { IxcReadDatabase, type IxcReadQuery, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { compatibleOnu, compatibleOnuSql } from "./LoginOnuLink.js";

type Row = Record<string, unknown>;
export interface LoginSignalScope {
  loginId: number;
  customerId: number;
  contractId: number | null;
  boxId?: number;
}
const text = (value: unknown) => (value == null ? "" : String(value).trim());
const id = (value: unknown) =>
  /^\d+$/.test(text(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const decimal = (value: unknown) =>
  text(value) !== "" && /^-?\d+(?:\.\d+)?$/.test(text(value)) && Number.isFinite(Number(value)) ? Number(value) : null;
const fail = () => Object.assign(new Error("Não foi possível consultar o sinal no IXC. Tente novamente."), { statusCode: 502 });
function readingDate(value: unknown) {
  const raw = text(value);
  if (raw.startsWith("0000") || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return null;
  const parsed = new Date(raw.replace(" ", "T") + "Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === raw.replace(" ", "T") ? raw : null;
}
export function loginSignalQuery(scope: LoginSignalScope): IxcReadQuery {
  for (const value of [
    scope.loginId,
    scope.customerId,
    ...(scope.contractId === null ? [] : [scope.contractId]),
    ...(scope.boxId === undefined ? [] : [scope.boxId]),
  ])
    if (id(value) === null) throw Object.assign(new Error("Vínculo do login inválido."), { statusCode: 400 });
  return {
    name: "login-optical-signal",
    sql: `SELECT f.id,f.id_login,f.id_contrato,f.onu_tipo,f.mac,f.serial_number,f.ponid,
      f.sinal_rx,f.sinal_tx,f.data_sinal,f.temperatura,f.voltagem,f.status_potencia,f.status_autorizado,
      onc.id_cliente onu_customer_id,r.onu_mac login_onu_mac
      FROM radpop_radio_cliente_fibra f JOIN radusuarios r ON r.id=f.id_login
      LEFT JOIN cliente_contrato onc ON onc.id=f.id_contrato
      WHERE r.id=? AND r.id_cliente=? AND COALESCE(r.id_contrato,0)=?
      AND ${compatibleOnuSql}
      ${scope.boxId === undefined ? "" : "AND r.id_caixa_ftth=?"}
      ORDER BY f.id DESC LIMIT 11`,
    params: [scope.loginId, scope.customerId, scope.contractId ?? 0, ...(scope.boxId === undefined ? [] : [scope.boxId])],
    timeoutSeconds: 5,
  };
}
export function opticalSignalDto(row: Row) {
  const measuredAt = readingDate(row.data_sinal);
  const rx = decimal(row.sinal_rx),
    tx = decimal(row.sinal_tx);
  // IXC stores zero/zero when there is no power reading. Keep a genuine single zero.
  const hasReading = measuredAt !== null && (rx !== null || tx !== null) && !(rx === 0 && tx === 0);
  const status = text(row.status_potencia);
  return {
    onuId: id(row.id),
    model: text(row.onu_tipo) || null,
    serial: text(row.serial_number) || text(row.mac) || null,
    pon: text(row.ponid) || null,
    rxDbm: hasReading ? rx : null,
    txDbm: hasReading ? tx : null,
    measuredAt,
    temperatureC: hasReading ? decimal(row.temperatura) : null,
    voltageV: hasReading ? decimal(row.voltagem) : null,
    powerStatus: ["regular", "irregular", "indefinido"].includes(status) ? status : null,
    authorization: text(row.status_autorizado) === "A" ? "authorized" : text(row.status_autorizado) === "NA" ? "unauthorized" : null,
  };
}
/** Last recorded ONU readings only. Never trigger IXC power polling, SNMP or writes. */
export class LoginSignalService {
  constructor(
    private readonly db: IxcReadSession & { close?(): Promise<void> } = new IxcReadDatabase(),
    private readonly api: Pick<IxcApiService, "listPage"> = new IxcApiService({ timeout: 8000, attempts: 1 }),
    private readonly now = () => new Date()
  ) {}
  async close() {
    await this.db.close?.();
  }
  async read(scope: LoginSignalScope) {
    const query = loginSignalQuery(scope);
    let rows: Row[],
      source: "ixc-database" | "ixc-api" = "ixc-database",
      truncated = false;
    try {
      rows = await this.db.select<Row>(query);
    } catch {
      source = "ixc-api";
      try {
        // Revalidate ownership when the database is unavailable, including the box link.
        const current = await this.api.listPage<Row>(
          "radusuarios",
          {
            qtype: "radusuarios.id",
            query: String(scope.loginId),
            oper: "=",
            sortname: "radusuarios.id",
            rp: 1,
          },
          1
        );
        const owned = current.rows.find(
          (r) =>
            id(r.id) === scope.loginId &&
            id(r.id_cliente) === scope.customerId &&
            id(r.id_contrato) === scope.contractId &&
            (scope.boxId === undefined || id(r.id_caixa_ftth) === scope.boxId)
        );
        if (!owned) throw fail();
        const result = await this.api.listPage<Row>(
          "radpop_radio_cliente_fibra",
          {
            qtype: "radpop_radio_cliente_fibra.id_login",
            query: String(scope.loginId),
            oper: "=",
            sortname: "radpop_radio_cliente_fibra.id",
            sortorder: "desc",
            rp: 11,
          },
          1
        );
        if (!Array.isArray(result.rows) || !Number.isSafeInteger(result.total) || result.total < result.rows.length) throw fail();
        // API fallback proves the old contract's ownership before considering its ONU.
        const contracts = [
          ...new Set(
            result.rows
              .filter((r) => id(r.id_login) === scope.loginId)
              .map((r) => id(r.id_contrato))
              .filter((n): n is number => n !== null && n !== scope.contractId)
          ),
        ];
        const owners = new Map<number, number>();
        if (contracts.length) {
          const linked = await this.api.listPage<Row>(
            "cliente_contrato",
            {
              qtype: "cliente_contrato.id",
              query: contracts.join(","),
              oper: "IN",
              sortname: "cliente_contrato.id",
              rp: 11,
            },
            1
          );
          for (const c of linked.rows)
            if (contracts.includes(id(c.id)!) && id(c.id_cliente) === scope.customerId) owners.set(id(c.id)!, scope.customerId);
        }
        rows = result.rows.map((r) => ({ ...r, login_onu_mac: owned.onu_mac, onu_customer_id: owners.get(id(r.id_contrato)!) }));
        truncated = result.total > 10;
      } catch {
        throw fail();
      }
    }
    const matched = rows.filter(
      (row) => id(row.id) !== null && id(row.id_login) === scope.loginId && compatibleOnu(row, scope.contractId, scope.customerId)
    );
    return {
      readings: matched.slice(0, 10).map((row) => ({
        ...opticalSignalDto(row),
        linkedContractId: id(row.id_contrato),
        contractMismatch: id(row.id_contrato) !== null && id(row.id_contrato) !== scope.contractId,
      })),
      truncated: truncated || matched.length > 10,
      source,
      queriedAt: this.now().toISOString(),
    };
  }
}
