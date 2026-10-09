import { db } from "../../repositories/database.js";
import { currentRiskLevelSql } from "../../repositories/riskLevelSql.js";

/** The exact score snapshot shown in customer details, scoped to the selected active contract. */
export async function getCustomerRiskSnapshot(customerId: number, contractId?: number) {
  const contractFilter = contractId ? "AND ct.id=?" : "";
  const [customer] = await db.query<any[]>(
    `SELECT c.id,c.name,COALESCE(city.label,c.city) city,c.neighborhood,c.satisfaction,c.phone,c.mobile_phone,c.commercial_phone,c.whatsapp,ct.id contract_id,ct.plan_name,ct.activated_at,ct.internet_status,rs.id risk_score_id,rs.score,${currentRiskLevelSql} risk_level,rs.financial_score,rs.support_score,rs.network_score,rs.contract_score,rs.satisfaction_score,rs.calculated_at FROM retention_customers c LEFT JOIN retention_cities city ON city.id=c.city JOIN retention_contracts ct ON ct.customer_id=c.id AND ct.status <> 'I' LEFT JOIN retention_risk_scores rs ON rs.id=(SELECT id FROM retention_risk_scores x WHERE x.contract_id=ct.id ORDER BY calculated_at DESC,id DESC LIMIT 1) WHERE c.id=? AND c.active='S' ${contractFilter} ORDER BY rs.score DESC LIMIT 1`,
    contractId ? [customerId, contractId] : [customerId]
  );
  if (!customer[0]) return null;
  const data = customer[0];
  const [reasons] = await db.query<any[]>(
    "SELECT category,code,description,points,metadata_json metadata FROM retention_risk_factors WHERE risk_score_id=? ORDER BY points DESC,id",
    [data.risk_score_id]
  );
  return { customer: data, reasons };
}
