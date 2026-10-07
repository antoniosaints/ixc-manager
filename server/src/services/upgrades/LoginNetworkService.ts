import { IxcReadDatabase, type IxcReadQuery, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { compatibleOnu, compatibleOnuSql } from "./LoginOnuLink.js";

type Reader = IxcReadSession & { close?(): Promise<void> };
const positiveId = (value: unknown): number | null => (Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null);

export function ftthBoxesQuery(values: unknown[]): IxcReadQuery | null {
  const ids = [...new Set(values.map(positiveId).filter((id): id is number => id !== null))];
  if (!ids.length) return null;
  return {
    name: "login-ftth-boxes",
    sql: `SELECT id,descricao FROM rad_caixa_ftth WHERE id IN (${ids.map(() => "?").join(",")})`,
    params: ids,
    timeoutSeconds: 5,
  };
}

export function onuBoxesQuery(ids: number[]): IxcReadQuery {
  return {
    name: "login-onu-ftth-boxes",
    sql: `SELECT r.id login_id,r.id_cliente customer_id,r.id_contrato current_contract_id,r.onu_mac login_onu_mac,
      f.id,f.id_login,f.id_contrato,f.mac,f.serial_number,f.id_caixa_ftth,f.porta_ftth,onc.id_cliente onu_customer_id
      FROM radusuarios r JOIN radpop_radio_cliente_fibra f ON f.id_login=r.id
      LEFT JOIN cliente_contrato onc ON onc.id=f.id_contrato
      WHERE r.id IN (${ids.map(() => "?").join(",")}) AND COALESCE(r.id_caixa_ftth,0)=0
      AND f.id_caixa_ftth>0 AND ${compatibleOnuSql}`,
    params: ids,
    timeoutSeconds: 5,
  };
}

/** Enrich authorized login DTOs with batched reads per page, without caching or writes. */
export class LoginNetworkService {
  constructor(private readonly db: Reader = new IxcReadDatabase()) {}

  async close() {
    await this.db.close?.();
  }

  async enrich<T extends { ftthBoxId: number | null }>(logins: T[]) {
    type LinkedLogin = T & { id?: number | null; customerId?: number | null; contractId?: number | null };
    const missing = (logins as LinkedLogin[]).filter((l) => !l.ftthBoxId && positiveId(l.id) && positiveId(l.customerId));
    const resolved = new Map<LinkedLogin, { ftthBoxId: number; ftthPort: string | null; ftthBoxSource: "onu" }>();
    const ambiguous = new Set<LinkedLogin>();
    if (missing.length) {
      try {
        const rows = await this.db.select<Record<string, unknown>>(onuBoxesQuery([...new Set(missing.map((l) => l.id!))]));
        for (const login of missing) {
          const candidates = rows.filter(
            (r) =>
              positiveId(r.login_id) === login.id &&
              positiveId(r.id_login) === login.id &&
              positiveId(r.customer_id) === login.customerId &&
              positiveId(r.current_contract_id) === login.contractId &&
              positiveId(r.id_caixa_ftth) &&
              compatibleOnu(r, login.contractId ?? null, login.customerId!)
          );
          const boxes = new Set(candidates.map((r) => positiveId(r.id_caixa_ftth)!));
          if (boxes.size > 1) ambiguous.add(login);
          else if (boxes.size === 1) {
            const ports = new Set(candidates.map((r) => positiveId(r.porta_ftth)));
            resolved.set(login, {
              ftthBoxId: [...boxes][0]!,
              ftthPort: ports.size === 1 && !ports.has(null) ? String([...ports][0]) : null,
              ftthBoxSource: "onu",
            });
          }
        }
      } catch {
        // An optional ONU association must never block the authorized login view.
      }
    }
    const enriched = (logins as LinkedLogin[]).map((l) => ({
      ...l,
      ...resolved.get(l),
      ...(ambiguous.has(l) ? { ftthBoxAmbiguous: true } : {}),
    }));
    const names = new Map<number, string>();
    const query = ftthBoxesQuery(enriched.map((login) => login.ftthBoxId));
    if (query) {
      try {
        const boxes = await this.db.select<{ id: unknown; descricao: unknown }>(query);
        for (const box of boxes) {
          const id = positiveId(box.id);
          const name = typeof box.descricao === "string" ? box.descricao.trim() : "";
          if (id !== null && query.params.includes(id) && name) names.set(id, name);
        }
      } catch {
        // Optional network metadata must not prevent viewing the login or its access actions.
        // Never log upstream errors or credentials; the existing box ID remains available.
      }
    }
    return enriched.map((login) => ({ ...login, ftthBoxName: names.get(login.ftthBoxId!) ?? null }));
  }
}
