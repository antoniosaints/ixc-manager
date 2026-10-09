import type { IxcReadQuery } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { addDays, referenceDate } from "../upgrades/UpgradeService.js";
import { connectedLoginSql } from "../network/LoginConnection.js";

export function riskWindow(now: Date) {
  const today = referenceDate(now);
  const civilTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const timestamp = `${today} ${civilTime}`;
  const recentStart = new Date(Date.parse(`${timestamp.replace(" ", "T")}Z`) - 30 * 86400000).toISOString().slice(0, 19).replace("T", " ");
  const month = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  month.setUTCMonth(month.getUTCMonth() - 3);
  return {
    today,
    timestamp,
    recentStart,
    weekStart: addDays(today, -7),
    historyStart: addDays(today, -35),
    monthStart: `${today.slice(0, 7)}-01`,
    usageStart: month.toISOString().slice(0, 10),
  };
}
/** Only bounded aggregates and explicit columns. Never copies raw IXC records or credentials. */
export function directRiskQueries(now: Date, customerId?: number) {
  const w = riskWindow(now);
  const eligible = `c.ativo='S' AND EXISTS (SELECT 1 FROM cliente_contrato eligible_ct WHERE eligible_ct.id_cliente=c.id AND eligible_ct.status<>'I')${customerId ? " AND c.id=?" : ""}`;
  const scope = customerId ? [customerId] : [];
  const query = (name: string, sql: string, params: IxcReadQuery["params"] = []): IxcReadQuery => ({
    name: `churn-direct-${name}`,
    sql,
    params,
    timeoutSeconds: 15,
  });
  return {
    contracts: query(
      "contracts",
      `SELECT c.id customer_id,c.razao name,c.cidade city_id,COALESCE(city.nome,CAST(c.cidade AS CHAR)) city,c.bairro neighborhood,c.grau_satisfacao satisfaction,
      c.fone phone,c.telefone_celular mobile_phone,c.telefone_comercial commercial_phone,c.whatsapp,
      ct.id contract_id,ct.status contract_status,ct.contrato plan_name,ct.id_filial branch_id,ct.status_internet internet_status,ct.data_ativacao activated_at,
      ct.data_expiracao expires_at,ct.dt_ult_bloq_auto last_auto_block_at,ct.dt_ult_bloq_manual last_manual_block_at,
      ct.dt_ult_des_bloq_conf last_trust_unlock_at,ct.contrato_suspenso suspended,ct.data_inicial_suspensao suspension_started_at
      FROM cliente c JOIN cliente_contrato ct ON ct.id_cliente=c.id AND ct.status<>'I'
      LEFT JOIN cidade city ON city.id=c.cidade WHERE c.ativo='S'${customerId ? " AND c.id=?" : ""} ORDER BY ct.id`,
      scope
    ),
    financial: query(
      "financial",
      `SELECT pending.contract_id,pending.overdue,pending.max_days FROM (
      SELECT t.id_cliente customer_id,t.id_contrato contract_id,COUNT(*) overdue,MAX(DATEDIFF(?,t.data_vencimento)) max_days
      FROM fn_areceber t WHERE t.status IN ('A','P') AND t.valor_aberto>0
      AND COALESCE(t.estornado,'') IN ('','N') AND COALESCE(t.titulo_renegociado,'') IN ('','N')
      AND t.data_vencimento>='1000-01-01' AND t.data_vencimento<?${customerId ? " AND t.id_cliente=?" : ""}
      GROUP BY t.id_cliente,t.id_contrato) pending
      JOIN cliente c ON c.id=pending.customer_id AND c.ativo='S'
      JOIN cliente_contrato ct ON ct.id=pending.contract_id AND ct.id_cliente=c.id AND ct.status<>'I'`,
      [w.today, w.today, ...scope]
    ),
    tickets: query(
      "tickets",
      `SELECT subjects.customer_id,SUM(subjects.records) records,SUM(subjects.tickets30) tickets30,
      SUM(subjects.critical) critical,SUM(subjects.pending) pending,SUM(subjects.open_tickets) open_tickets,
      SUM(subjects.sla) sla,SUM(subjects.tickets30>=2) recurring
      FROM (SELECT t.id_cliente customer_id,t.id_assunto,COUNT(*) records,
      SUM(t.data_criacao>=? AND t.data_criacao<=?) tickets30,
      SUM(t.prioridade IN ('C','CRITICO','CRÍTICO')) critical,
      SUM(t.su_status IN ('N','P')) pending,SUM(t.su_status IN ('N','P','EP')) open_tickets,
      SUM(COALESCE(t.status_sla,'') NOT IN ('','OK','S')) sla
      FROM su_ticket t ${customerId ? "WHERE t.id_cliente=?" : ""} GROUP BY t.id_cliente,t.id_assunto
      ) subjects JOIN cliente c ON c.id=subjects.customer_id WHERE ${eligible} GROUP BY subjects.customer_id`,
      [w.recentStart, w.timestamp, ...scope, ...scope]
    ),
    orders: query(
      "orders",
      `SELECT t.id_cliente customer_id,SUM(t.data_abertura>=? AND t.data_abertura<=?) total,
      SUM(t.status IN ('A','AN','EN','AS','AG','EX','RAG','DS')) open_orders
      FROM su_oss_chamado t JOIN cliente c ON c.id=t.id_cliente
      WHERE ${eligible} AND ((t.data_abertura>=? AND t.data_abertura<=?) OR t.status IN ('A','AN','EN','AS','AG','EX','RAG','DS')) GROUP BY t.id_cliente`,
      [w.recentStart, w.timestamp, ...scope, w.recentStart, w.timestamp]
    ),
    logins: query(
      "logins",
      `SELECT r.id_cliente customer_id,COUNT(*) total,MAX(${connectedLoginSql}) online_now,
      MIN(CASE WHEN ${connectedLoginSql} THEN 0
        WHEN r.ultima_conexao_final>='2000-01-01' THEN LEAST(GREATEST(DATEDIFF(?,r.ultima_conexao_final),0),7)
        WHEN r.ultima_conexao_inicial>='2000-01-01' THEN LEAST(GREATEST(DATEDIFF(?,r.ultima_conexao_inicial),0),7) ELSE NULL END) offline_days,
      GROUP_CONCAT(DISTINCT NULLIF(r.concentrador,'') SEPARATOR '\n') concentrators
      FROM radusuarios r JOIN cliente c ON c.id=r.id_cliente WHERE ${eligible} AND r.ativo='S' GROUP BY r.id_cliente`,
      [w.today, w.today, ...scope]
    ),
    sessions: query(
      "sessions",
      `SELECT r.id_cliente customer_id,COUNT(*) records,
      SUM(a.acctstarttime>=?) disconnects7,SUM(a.acctstarttime<?)/4 baseline,
      SUM(a.acctstarttime>=? AND COALESCE(a.acctsessiontime,0)<300) shorts7,
      MAX(COALESCE(a.acctterminatecause,'')<>'') cause
      FROM radacct a JOIN (SELECT DISTINCT r.login,r.id_cliente FROM radusuarios r JOIN cliente c ON c.id=r.id_cliente
        WHERE ${eligible} AND r.ativo='S' AND TRIM(r.login)<>'') r ON r.login=a.username
      WHERE a.acctstarttime>=? AND a.acctstarttime<=? GROUP BY r.id_cliente`,
      [w.weekStart, w.weekStart, w.weekStart, ...scope, w.historyStart, w.timestamp]
    ),
    usage: query(
      "usage",
      `SELECT usage_rows.customer_id,COUNT(*) records,
      MAX(CASE WHEN usage_rows.date>=? THEN usage_rows.download ELSE 0 END) current_use,
      AVG(CASE WHEN usage_rows.date<? THEN usage_rows.download END) baseline_use,
      SUM(usage_rows.date>=?) current_records
      FROM (SELECT r.id_cliente customer_id,u.id_login,u.data date,u.consumo download,
        ROW_NUMBER() OVER (PARTITION BY u.id_login,u.data ORDER BY u.id DESC) latest
        FROM radusuarios_consumo_m u JOIN radusuarios r ON r.id=u.id_login AND r.ativo='S' JOIN cliente c ON c.id=r.id_cliente
        WHERE ${eligible} AND u.data>=? AND u.data<=?
      ) usage_rows WHERE usage_rows.latest=1 GROUP BY usage_rows.customer_id`,
      [w.monthStart, w.monthStart, w.monthStart, ...scope, w.usageStart, w.today]
    ),
  };
}
