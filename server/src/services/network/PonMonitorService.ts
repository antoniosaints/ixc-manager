import { z } from "zod";
import type { IxcReadDatabase, IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { compatibleOnu } from "../upgrades/LoginOnuLink.js";
import { connectionIp, connectionStatus } from "./LoginConnection.js";

export const ponScope = z
  .object({ scope: z.literal("pon"), oltId: z.number().int().positive().safe(), pon: z.string().trim().min(1).max(30) })
  .strict();
export const ponBoxScope = z.object({ scope: z.literal("pon-box"), boxId: z.number().int().positive().safe() }).strict();
export const ponQuery = z.object({
  oltId: z.coerce.number().int().positive().safe().optional(),
  boxId: z.coerce.number().int().positive().safe().optional(),
});
type Row = Record<string, unknown>;
const text = (v: unknown) => String(v ?? "").trim() || null;
const positive = (v: unknown) => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const date = (v: unknown) => {
  const s = text(v);
  return s && !s.startsWith("0000-") ? s : null;
};
export type PonStatus = "online" | "offline" | "unknown";
export interface PonPosition {
  entryId: string;
  onuId: number | null;
  oltId: number | null;
  pon: string | null;
  position: number | null;
  loginId: number | null;
  login: string | null;
  boxId: number | null;
  boxName: string | null;
  port: number | null;
  active: boolean | null;
  status: PonStatus;
  source: "IXC" | "RADIUS" | null;
  ip: string | null;
  sessionStartedAt: string | null;
  sessionStoppedAt: string | null;
  sessionUpdatedAt: string | null;
  disconnectReason: string | null;
  warning: string | null;
}
export interface PonSnapshot {
  oltId: number | null;
  pon: string | null;
  boxId?: number;
  boxName?: string;
  capacity?: number | null;
  positions: PonPosition[];
}
/** Compare SQL datetime strings in the same IXC time zone; never guess an optical state from a session. */
export function ponConnection(row: Row): Pick<PonPosition, "status" | "source"> {
  const state = text(row.online)?.toUpperCase();
  if (state === "N" || state === "SS") return { status: "offline", source: "IXC" };
  if (row.sessionId != null) {
    const stopped = date(row.sessionStoppedAt);
    if (!stopped) return { status: "online", source: "RADIUS" };
    const connected = date(row.lastConnectedAt);
    if (!connected || stopped >= connected) return { status: "offline", source: "RADIUS" };
  }
  if (state === "S" || connectionIp(row.ip)) return { status: connectionStatus(row.ip, row.online), source: "IXC" };
  return { status: "unknown", source: null };
}
export function ponPosition(row: Row): PonPosition {
  const onuId = positive(row.onuId);
  const loginId = positive(row.loginId);
  const duplicateLogin = Number(row.loginMatches ?? 1) > 1;
  const duplicateOnu = Number(row.onuMatches ?? 1) > 1;
  const compatible = !!loginId && !duplicateLogin && (!onuId || compatibleOnu(row, positive(row.contractId), Number(row.customerId)));
  const position = positive(row.onuNumber);
  const mappingChanged =
    (positive(row.loginBoxId) !== null && positive(row.boxId) !== null && positive(row.loginBoxId) !== positive(row.boxId)) ||
    (positive(row.loginPort) !== null && positive(row.port) !== null && positive(row.loginPort) !== positive(row.port));
  const warning = !onuId
    ? "Login sem ONU vinculada nesta CTO. A conexão é acompanhada pelo IXC/RADIUS."
    : !position || position > 128
      ? "Número da ONU fora de 1 a 128."
      : duplicateLogin
        ? "Nome de login duplicado: não é possível atribuir a sessão RADIUS com segurança."
        : duplicateOnu
          ? "Mais de uma ONU vinculada ao mesmo login. Não é possível confirmar uma posição individual."
          : mappingChanged
            ? "CTO ou porta divergente entre login e ONU. Revise o vínculo antes de testar."
            : row.shared === "S"
              ? "ONU compartilhada: o estado representa somente o login vinculado."
              : loginId && !compatible
                ? "Vínculo entre login e ONU incompatível. Revise no IXC."
                : !loginId
                  ? "ONU sem login vinculado."
                  : null;
  return {
    entryId: onuId ? `onu:${onuId}` : `login:${loginId}`,
    onuId,
    oltId: positive(row.oltId),
    pon: text(row.pon),
    position: position && position <= 128 ? position : null,
    loginId: compatible ? loginId : null,
    login: compatible ? text(row.login) : null,
    boxId: positive(row.boxId),
    boxName: text(row.boxName),
    port: positive(row.port),
    active: compatible ? (row.active === "S" ? true : row.active === "N" ? false : null) : null,
    ...(compatible && !duplicateOnu ? ponConnection(row) : { status: "unknown" as const, source: null }),
    ip: compatible ? connectionIp(row.ip) : null,
    sessionStartedAt: compatible ? date(row.sessionStartedAt) : null,
    sessionStoppedAt: compatible ? date(row.sessionStoppedAt) : null,
    sessionUpdatedAt: compatible ? date(row.sessionUpdatedAt) : null,
    disconnectReason: compatible ? text(row.disconnectReason) : null,
    warning,
  };
}
export function ponChanges(previous: PonSnapshot | undefined, current: PonSnapshot) {
  const old = new Map(previous?.positions.map((p) => [p.entryId, p]));
  // A mapping change is not a disconnect. Unknown states do not become fictitious events.
  return current.positions.flatMap((p) => {
    const before = old.get(p.entryId);
    if (
      !before ||
      before.position !== p.position ||
      before.oltId !== p.oltId ||
      before.pon !== p.pon ||
      before.loginId !== p.loginId ||
      before.boxId !== p.boxId ||
      before.port !== p.port ||
      before.status === p.status ||
      before.status === "unknown" ||
      p.status === "unknown"
    )
      return [];
    return [
      {
        entryId: p.entryId,
        onuId: p.onuId,
        oltId: p.oltId,
        pon: p.pon,
        position: p.position,
        loginId: p.loginId,
        login: p.login,
        boxId: p.boxId,
        boxName: p.boxName,
        port: p.port,
        status: p.status,
      },
    ];
  });
}
export class PonMonitorService {
  constructor(private db: Pick<IxcReadDatabase, "withSnapshot">) {}
  async options(oltId?: number, signal?: AbortSignal, boxId?: number) {
    return this.db.withSnapshot(async (s) => {
      const olts = await s.select<{ id: number; name: string }>({
        name: "pon-olts",
        sql: "SELECT o.id,o.descricao name FROM radpop_radio o WHERE EXISTS (SELECT 1 FROM radpop_radio_cliente_fibra f WHERE f.id_transmissor=o.id) ORDER BY o.descricao,o.id LIMIT 501",
        params: [],
        timeoutSeconds: 5,
      });
      if (olts.length > 500) throw Object.assign(new Error("Limite de OLTs excedido."), { statusCode: 422 });
      if (oltId && !olts.some((o) => Number(o.id) === oltId)) throw Object.assign(new Error("OLT não encontrada."), { statusCode: 404 });
      const pons = oltId
        ? await s.select<{ pon: string; total: number; containsBox: number }>({
            name: "pon-options",
            sql: "SELECT f.ponid pon,COUNT(*) total,MAX(CASE WHEN f.id_caixa_ftth=? THEN 1 ELSE 0 END) containsBox FROM radpop_radio_cliente_fibra f WHERE f.id_transmissor=? AND TRIM(COALESCE(f.ponid,''))<>'' GROUP BY f.ponid ORDER BY f.ponid LIMIT 501",
            params: [boxId ?? 0, oltId],
            timeoutSeconds: 5,
          })
        : [];
      if (pons.length > 500) throw Object.assign(new Error("Limite de PONs excedido."), { statusCode: 422 });
      const boxes = oltId
        ? await s.select<{ id: number; name: string; capacity: number }>({
            name: "pon-box-options",
            sql: "SELECT b.id,b.descricao name,b.capacidade capacity FROM rad_caixa_ftth b WHERE b.id_transmissor=? OR EXISTS (SELECT 1 FROM radpop_radio_cliente_fibra f WHERE f.id_caixa_ftth=b.id AND f.id_transmissor=?) ORDER BY b.descricao,b.id LIMIT 5001",
            params: [oltId, oltId],
            timeoutSeconds: 5,
          })
        : [];
      if (boxes.length > 5000) throw Object.assign(new Error("Limite de CTOs excedido."), { statusCode: 422 });
      return {
        boxes: boxes.map((b) => ({ id: Number(b.id), name: b.name, capacity: positive(b.capacity) })),
        olts: olts.map((o) => ({ ...o, id: Number(o.id) })),
        pons: pons.map((p) => ({ ...p, total: Number(p.total), containsBox: !!Number(p.containsBox) })),
      };
    }, signal);
  }
  async read(scope: z.infer<typeof ponScope> | z.infer<typeof ponBoxScope>, session: IxcReadSession): Promise<PonSnapshot> {
    const boxMode = scope.scope === "pon-box";
    const [box] = boxMode
      ? await session.select<Row>({
          name: "pon-box-detail",
          sql: "SELECT id,descricao name,capacidade capacity FROM rad_caixa_ftth WHERE id=?",
          params: [scope.boxId],
          timeoutSeconds: 5,
        })
      : [];
    if (boxMode && !box) throw new Error("CTO não encontrada");
    const rows = await session.select<Row>({
      name: "pon-live-positions",
      sql: `SELECT f.id onuId,f.id_transmissor oltId,f.ponid pon,f.onu_numero onuNumber,f.onu_compartilhada shared,
        ${boxMode ? "(SELECT COUNT(*) FROM radpop_radio_cliente_fibra fx WHERE fx.id_transmissor=f.id_transmissor AND fx.ponid=f.ponid AND fx.onu_numero=f.onu_numero)" : "1"} positionMatches,
        f.id_contrato,f.mac,f.serial_number,r.onu_mac login_onu_mac,onc.id_cliente onu_customer_id,
        (SELECT COUNT(*) FROM radusuarios r2 WHERE r2.login=r.login) loginMatches,
        (SELECT COUNT(*) FROM radpop_radio_cliente_fibra f2 WHERE f2.id_login=r.id) onuMatches,
        r.id_caixa_ftth loginBoxId,r.ftth_porta loginPort,
        r.id loginId,r.login,r.id_contrato contractId,r.id_cliente customerId,r.ativo active,r.online,r.ip,r.ultima_conexao_inicial lastConnectedAt,
        f.id_caixa_ftth boxId,b.descricao boxName,f.porta_ftth port,
        a.radacctid sessionId,a.acctstarttime sessionStartedAt,a.acctstoptime sessionStoppedAt,a.acctupdatetime sessionUpdatedAt,a.acctterminatecause disconnectReason
        FROM radpop_radio_cliente_fibra f
        LEFT JOIN radusuarios r ON r.id=f.id_login
        LEFT JOIN cliente_contrato onc ON onc.id=f.id_contrato
        LEFT JOIN rad_caixa_ftth b ON b.id=f.id_caixa_ftth
        LEFT JOIN radacct a ON a.radacctid=(SELECT a2.radacctid FROM radacct a2 WHERE a2.username=r.login ORDER BY a2.acctstarttime DESC,a2.radacctid DESC LIMIT 1)
        WHERE ${boxMode ? "f.id_caixa_ftth=?" : "f.id_transmissor=? AND f.ponid=?"} ORDER BY f.onu_numero,f.id LIMIT 513`,
      params: boxMode ? [scope.boxId] : [scope.oltId, scope.pon],
      timeoutSeconds: 5,
    });
    if (rows.length > 512) throw new Error("PON com vínculos excessivos");
    const counts = new Map<number, number>();
    if (!boxMode)
      for (const r of rows) {
        const n = positive(r.onuNumber);
        if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    const positions = rows.map((r) => {
      const p = ponPosition(r);
      if (p.position !== null && (Number(r.positionMatches) > 1 || (!boxMode && (counts.get(p.position) ?? 0) > 1))) {
        p.status = "unknown";
        p.source = null;
        p.warning = "Mais de uma ONU cadastrada na mesma posição. Revise no IXC.";
      }
      return p;
    });
    // A CTO monitor also follows logins without a compatible ONU in that CTO.
    // No fabricated PON position is assigned to those records.
    if (boxMode) {
      const logins = await session.select<Row>({
        name: "pon-box-unmapped-logins",
        sql: `SELECT r.id loginId,r.login,r.ativo active,r.online,r.ip,r.ultima_conexao_inicial lastConnectedAt,
          r.id_caixa_ftth boxId,b.descricao boxName,r.ftth_porta port,
          (SELECT COUNT(*) FROM radusuarios r2 WHERE r2.login=r.login) loginMatches,
          a.radacctid sessionId,a.acctstarttime sessionStartedAt,a.acctstoptime sessionStoppedAt,
          a.acctupdatetime sessionUpdatedAt,a.acctterminatecause disconnectReason
          FROM radusuarios r LEFT JOIN rad_caixa_ftth b ON b.id=r.id_caixa_ftth
          LEFT JOIN radacct a ON a.radacctid=(SELECT a2.radacctid FROM radacct a2 WHERE a2.username=r.login ORDER BY a2.acctstarttime DESC,a2.radacctid DESC LIMIT 1)
          WHERE r.id_caixa_ftth=? ORDER BY r.id LIMIT 513`,
        params: [scope.boxId],
        timeoutSeconds: 5,
      });
      if (logins.length > 512) throw new Error("CTO com vínculos excessivos");
      const mapped = new Set(positions.map((p) => p.loginId).filter(Boolean));
      positions.push(...logins.filter((r) => !mapped.has(Number(r.loginId))).map(ponPosition));
    }
    return boxMode
      ? { oltId: null, pon: null, boxId: scope.boxId, boxName: String(box!.name), capacity: positive(box!.capacity), positions }
      : { oltId: scope.oltId, pon: scope.pon, positions };
  }
}
