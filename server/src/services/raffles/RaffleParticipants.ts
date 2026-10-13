import { IxcReadDatabase, type IxcReadQuery, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { raffleFilters, raffleError, type Participant } from "./raffleModel.js";
import type { z } from "zod";

type Reader = { withSnapshot<T>(read: (s: IxcReadSession) => Promise<T>, signal?: AbortSignal): Promise<T>; close?(): Promise<void> };
type Row = Record<string, unknown>;
const nullable = (v: unknown) => (v == null ? null : String(v).trim() || null);
const MAX_PARTICIPANTS = 50000;
export function participantsSql(input: z.input<typeof raffleFilters>, limit = 25) {
  const filters = raffleFilters.parse(input),
    params: IxcReadQuery["params"] = [];
  const conditions = ["cc.id>0", "c.id>0", "NULLIF(TRIM(c.razao),'') IS NOT NULL"];
  const criteria: string[] = [];
  if (filters.status !== "all") {
    conditions.push("cc.status=?");
    params.push(filters.status);
  }
  if (filters.startFrom || filters.startTo) conditions.push("cc.data_ativacao>='1000-01-01'");
  if (filters.startFrom) {
    conditions.push("cc.data_ativacao>=?");
    params.push(filters.startFrom);
  }
  if (filters.startTo) {
    conditions.push("cc.data_ativacao<=?");
    params.push(filters.startTo);
  }
  if (filters.planIds.length) {
    criteria.push(`cc.id_vd_contrato IN (${filters.planIds.map(() => "?").join(",")})`);
    params.push(...filters.planIds);
  }
  const productMembership = (ids: number[]) => {
    const placeholders = ids.map(() => "?").join(",");
    params.push(...ids, ...ids);
    // Independent sets let MariaDB materialize the product links once. A correlated
    // OR over contract/plan links scans popular products again for every contract.
    return `(cc.id IN (SELECT item.id_contrato FROM vd_contratos_produtos item
      WHERE item.id_produto IN (${placeholders}) AND item.id_contrato>0)
      OR cc.id_vd_contrato IN (SELECT item.id_vd_contrato FROM vd_contratos_produtos item
      WHERE item.id_produto IN (${placeholders}) AND COALESCE(item.id_contrato,0)=0 AND item.id_vd_contrato>0))`;
  };
  if (filters.productIds.length)
    criteria.push(
      `(${
        filters.productMatch === "all"
          ? filters.productIds.map((id) => productMembership([id])).join(" AND ")
          : productMembership(filters.productIds)
      })`
    );
  if (criteria.length) conditions.push(`(${criteria.join(" OR ")})`);
  const from = `FROM cliente_contrato cc JOIN cliente c ON c.id=cc.id_cliente
    LEFT JOIN vd_contratos p ON p.id=cc.id_vd_contrato
    LEFT JOIN cidade city ON city.id=CASE WHEN cc.endereco_padrao_cliente='S' THEN c.cidade ELSE cc.cidade END
    WHERE ${conditions.join(" AND ")}`;
  return {
    count: { name: "raffle-participants-count", sql: `SELECT COUNT(*) total ${from}`, params, timeoutSeconds: 15 },
    list: {
      name: "raffle-participants-list",
      sql: `SELECT cc.id contractId,c.id customerId,c.razao customerName,city.nome city,p.nome plan,cc.data_ativacao activatedAt ${from} ORDER BY cc.id LIMIT ?`,
      params: [...params, limit],
      timeoutSeconds: 15,
    },
  } satisfies Record<string, IxcReadQuery>;
}
export class RaffleParticipants {
  constructor(private readonly db: Reader = new IxcReadDatabase()) {}
  close() {
    return this.db.close?.();
  }
  async list(input: z.input<typeof raffleFilters>, freeze = false, signal?: AbortSignal) {
    const queries = participantsSql(input, freeze ? MAX_PARTICIPANTS + 1 : 25);
    return this.db.withSnapshot(async (session) => {
      const total = Number((await session.select<Row>(queries.count))[0]?.total);
      if (!Number.isSafeInteger(total) || total < 0) throw new Error("Contagem inválida");
      if (freeze && total > MAX_PARTICIPANTS)
        throw raffleError(`Restrinja os filtros a até ${MAX_PARTICIPANTS.toLocaleString("pt-BR")} contratos.`, 422);
      const items: Participant[] = (await session.select<Row>(queries.list)).map((r) => ({
        contractId: Number(r.contractId),
        customerId: Number(r.customerId),
        customerName: nullable(r.customerName) ?? "",
        city: nullable(r.city),
        plan: nullable(r.plan),
        activatedAt: nullable(r.activatedAt)?.slice(0, 10) ?? null,
      }));
      if (
        items.some(
          (p) =>
            !Number.isSafeInteger(p.contractId) ||
            p.contractId <= 0 ||
            !Number.isSafeInteger(p.customerId) ||
            p.customerId <= 0 ||
            !p.customerName
        ) ||
        new Set(items.map((p) => p.contractId)).size !== items.length ||
        (freeze && items.length !== total)
      )
        throw new Error("Lista de contratos inconsistente");
      return { total, items };
    }, signal);
  }
  options(signal?: AbortSignal) {
    return this.db.withSnapshot(async (s) => {
      const read = async (name: string, sql: string) =>
        (await s.select<Row>({ name, sql, params: [], timeoutSeconds: 15 })).map((r) => ({
          id: Number(r.id),
          name: nullable(r.name) ?? `#${r.id}`,
        }));
      return {
        plans: await read(
          "raffle-plans",
          "SELECT p.id,p.nome name FROM vd_contratos p WHERE EXISTS (SELECT 1 FROM cliente_contrato cc WHERE cc.id_vd_contrato=p.id) ORDER BY p.nome,p.id"
        ),
        products: await read(
          "raffle-products",
          "SELECT p.id,p.descricao name FROM produtos p WHERE EXISTS (SELECT 1 FROM vd_contratos_produtos i WHERE i.id_produto=p.id) ORDER BY p.descricao,p.id"
        ),
      };
    }, signal);
  }
}
