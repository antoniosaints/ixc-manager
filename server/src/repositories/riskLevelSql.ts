import { riskThresholds } from "../config/risk.js";

/** Current classification of the selected score; historical stored labels may use an older threshold. */
export const currentRiskLevelSql = `(CASE
  WHEN rs.score IS NULL THEN NULL
  WHEN rs.score >= ${riskThresholds.critical} THEN 'CRITICAL'
  WHEN rs.score >= ${riskThresholds.high} THEN 'HIGH'
  WHEN rs.score >= ${riskThresholds.medium} THEN 'MEDIUM'
  WHEN rs.score >= ${riskThresholds.attention} THEN 'ATTENTION'
  ELSE 'LOW' END)`;
