import type { IxcReadDatabase } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { decimalToUnits, mapDate } from "../../integrations/ixc/database/maps/valueMappers.js";
const id = (v: unknown) => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const text = (v: unknown) => String(v ?? "").trim() || null;
function money(v: unknown) {
  if (v == null) return null;
  const units = decimalToUnits(String(v));
  if (units > BigInt(Number.MAX_SAFE_INTEGER) || units < BigInt(Number.MIN_SAFE_INTEGER))
    throw new Error("Valor excede precisão disponível");
  return Number(units) / 100;
}
/** Reads the exact title, including received/cancelled titles, without pending/period filters. */
export class FinanceTitleService {
  constructor(private db: Pick<IxcReadDatabase, "withSnapshot">) {}
  async read(titleId: number, customerId: number, signal?: AbortSignal) {
    return this.db.withSnapshot(async (s) => {
      const [r] = await s.select<Record<string, unknown>>({
        name: "finance-receivable-detail",
        timeoutSeconds: 5,
        params: [titleId, customerId],
        sql: `SELECT t.id,t.id_cliente customerId,c.razao customerName,t.id_contrato contractId,cc.contrato contractName,
          t.status,t.documento document,t.data_emissao issuedDate,t.data_vencimento dueDate,t.pagamento_data paymentDate,
          t.data_cancelamento cancelledDate,t.valor amount,t.valor_recebido received,t.valor_aberto balance,
          t.estornado reversed,t.titulo_renegociado renegotiated,t.id_conta accountId,a.planejamento_analitico accountName,
          t.filial_id branchId,COALESCE(NULLIF(f.fantasia,''),f.razao) branchName
          FROM fn_areceber t LEFT JOIN cliente c ON c.id=t.id_cliente
          LEFT JOIN cliente_contrato cc ON cc.id=t.id_contrato AND cc.id_cliente=t.id_cliente
          LEFT JOIN planejamento_analitico a ON a.id=t.id_conta LEFT JOIN filial f ON f.id=t.filial_id
          WHERE t.id=? AND t.id_cliente=? LIMIT 1`,
      });
      if (!r) throw Object.assign(new Error("Título não encontrado para este cliente."), { statusCode: 404 });
      return {
        id: Number(r.id),
        customerId: Number(r.customerId),
        customerName: text(r.customerName),
        contractId: id(r.contractId),
        contractName: text(r.contractName),
        status: text(r.status),
        document: text(r.document),
        issuedDate: mapDate(text(r.issuedDate)),
        dueDate: mapDate(text(r.dueDate)),
        paymentDate: mapDate(text(r.paymentDate)),
        cancelledDate: mapDate(text(r.cancelledDate)),
        amount: money(r.amount),
        received: money(r.received),
        balance: money(r.balance),
        reversed: r.reversed === "S",
        renegotiated: r.renegotiated === "S",
        accountId: id(r.accountId),
        accountName: text(r.accountName),
        branchId: id(r.branchId),
        branchName: text(r.branchName),
        queriedAt: new Date().toISOString(),
      };
    }, signal);
  }
}
