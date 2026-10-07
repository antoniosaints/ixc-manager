export type ReceivableScope = "active" | "all";

/** One eligibility rule for receivable cards, aging and title details. */
export function receivableEligibility(scope: ReceivableScope = "active", alias = "t"): string {
  if (scope === "all") return "";
  return ` AND EXISTS (
    SELECT 1 FROM cliente eligible_customer
    JOIN cliente_contrato eligible_contract ON eligible_contract.id=${alias}.id_contrato
      AND eligible_contract.id_cliente=${alias}.id_cliente
    WHERE eligible_customer.id=${alias}.id_cliente AND eligible_customer.ativo='S'
      AND eligible_contract.status='A'
  )`;
}
