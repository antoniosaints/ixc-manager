import type { RowDataPacket } from "mysql2";
import { createHash } from "node:crypto";
import { env } from "../../config/env.js";
import { db } from "../../repositories/database.js";
import { IxcApiService, type IxcListRequest } from "../../integrations/ixc/IxcApiService.js";

type IxcRow = Record<string, string | number | null | undefined>;
type DbValue = string | number | null;
const value = (row: IxcRow, key: string) => (row[key] === "" ? null : (row[key] ?? null));
const asDate = (v: unknown) => (v ? String(v).replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1") : null);
const ixcDateTime = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
// List endpoints backed by IXC's operational tables expect ISO timestamps.
// The locale form is silently ignored by this installation, which turns an
// incremental query into a full-table scan (for example, 33M Radius rows).
const ixcIsoDateTime = (date: Date) => date.toISOString().slice(0, 19).replace("T", " ");
export interface ResourceProgress {
  processed: number;
  total: number;
}
export interface SyncResult {
  synchronized: number;
  affectedCustomerIds: number[];
}
type ProgressReporter = (progress: ResourceProgress) => void | Promise<void>;

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
async function upsertRows(table: string, columns: string[], rows: DbValue[][], update: string, options: { syncedAt?: boolean } = {}) {
  const syncedAt = options.syncedAt ?? true;
  for (const batch of chunks(rows, env.RETENTION_SYNC_BATCH_SIZE)) {
    if (!batch.length) continue;
    const values = batch.flat();
    const placeholders = batch.map(() => `(${columns.map(() => "?").join(",")}${syncedAt ? ",NOW()" : ""})`).join(",");
    const insertColumns = syncedAt ? [...columns, "synced_at"] : columns;
    const updateSql = syncedAt ? `${update},synced_at=NOW()` : update;
    await db.query(`INSERT INTO ${table} (${insertColumns.join(",")}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updateSql}`, values);
  }
}

/** Maps only fields catalogued in the supplied IXC collection/prompt. */
export class SyncService {
  private affectedCustomerIds = new Set<number>();
  constructor(private readonly ixc = new IxcApiService()) {}
  async sync(
    resource:
      | "customers"
      | "customer-contacts"
      | "cities"
      | "contracts"
      | "contract-history"
      | "financial"
      | "tickets"
      | "service-orders"
      | "subjects"
      | "cancellation-reasons"
      | "radius-users"
      | "radius-history"
      | "usage",
    onProgress?: ProgressReporter
  ): Promise<SyncResult> {
    this.affectedCustomerIds.clear();
    let synchronized: number;
    switch (resource) {
      case "customers":
        synchronized = await this.customers(onProgress);
        break;
      case "customer-contacts":
        synchronized = await this.customerContacts(onProgress);
        break;
      case "cities":
        synchronized = await this.cities(onProgress);
        break;
      case "contracts":
        synchronized = await this.contracts(onProgress);
        break;
      case "contract-history":
        synchronized = await this.contractHistory(onProgress);
        break;
      case "financial":
        synchronized = await this.financial(onProgress);
        break;
      case "tickets":
        synchronized = await this.tickets(onProgress);
        break;
      case "service-orders":
        synchronized = await this.orders(onProgress);
        break;
      case "subjects":
        synchronized = await this.subjects(onProgress);
        break;
      case "cancellation-reasons":
        synchronized = await this.cancellationReasons(onProgress);
        break;
      case "radius-users":
        synchronized = await this.radiusUsers(onProgress);
        break;
      case "radius-history":
        synchronized = await this.radiusHistory(onProgress);
        break;
      case "usage":
        synchronized = await this.usage(onProgress);
        break;
    }
    return { synchronized: synchronized!, affectedCustomerIds: [...this.affectedCustomerIds] };
  }
  /** IXC exposes contract and financial cancellation reasons in one small lookup table. */
  private async cancellationReasons(onProgress?: ProgressReporter) {
    let saved = 0;
    for await (const batch of this.ixc.listBatches<IxcRow>("fn_areceber_mot_cancelamento", {
      qtype: "fn_areceber_mot_cancelamento.id",
      query: "1",
      oper: ">=",
      sortname: "fn_areceber_mot_cancelamento.id",
      sortorder: "asc",
    })) {
      const rows = batch.rows.filter((row) => value(row, "id") !== null && value(row, "motivo") !== null);
      await upsertRows(
        "retention_cancellation_reasons",
        ["id", "label", "active"],
        rows.map((row) => [value(row, "id"), value(row, "motivo"), value(row, "ativo")]) as DbValue[][],
        "label=VALUES(label),active=VALUES(active)"
      );
      saved += rows.length;
      await onProgress?.({ processed: saved, total: batch.total });
    }
    return this.mark("cancellation-reasons", saved);
  }
  /** Customer records contain a city ID; resolve it locally for human-readable dashboards. */
  private async cities(onProgress?: ProgressReporter) {
    let saved = 0;
    for await (const batch of this.ixc.listBatches<IxcRow>("cidade", {
      qtype: "cidade.id",
      query: "1",
      oper: ">=",
      sortname: "cidade.id",
      sortorder: "asc",
    })) {
      const rows = batch.rows.filter((row) => value(row, "id") !== null && value(row, "nome") !== null);
      await upsertRows(
        "retention_cities",
        ["id", "label", "state_id"],
        rows.map((row) => [value(row, "id"), value(row, "nome"), value(row, "uf")]) as DbValue[][],
        "label=VALUES(label),state_id=VALUES(state_id)"
      );
      saved += rows.length;
      await onProgress?.({ processed: saved, total: batch.total });
    }
    return this.mark("cities", saved);
  }
  private async customers(onProgress?: ProgressReporter) {
    const lastSync = await this.lastSync("customers");
    const start = this.overlappedStart(lastSync, 3650);
    let saved = 0;
    for await (const batch of this.ixc.listBatches<IxcRow>("cliente", {
      qtype: lastSync ? "cliente.ultima_atualizacao" : "cliente.id",
      query: lastSync ? ixcIsoDateTime(start) : "",
      oper: lastSync ? ">=" : "=",
      sortname: lastSync ? "cliente.ultima_atualizacao" : "cliente.id",
      sortorder: "asc",
      ...(lastSync ? {} : { gridParam: [{ TB: "cliente.ativo", OP: "=", P: "S" }] }),
    })) {
      const rows = batch.rows.filter((row) => value(row, "id") !== null && value(row, "ativo") !== null && value(row, "razao") !== null);
      rows.forEach((row) => this.trackCustomer(value(row, "id")));
      await upsertRows(
        "retention_customers",
        [
          "id",
          "active",
          "name",
          "city",
          "neighborhood",
          "registered_at",
          "satisfaction",
          "seller_id",
          "branch_id",
          "phone",
          "mobile_phone",
          "commercial_phone",
          "whatsapp",
        ],
        rows.map((row) => [
          value(row, "id"),
          value(row, "ativo"),
          value(row, "razao"),
          value(row, "cidade"),
          value(row, "bairro"),
          asDate(value(row, "data_cadastro")),
          value(row, "grau_satisfacao"),
          value(row, "id_vendedor"),
          value(row, "filial_id"),
          value(row, "fone"),
          value(row, "telefone_celular"),
          value(row, "telefone_comercial"),
          value(row, "whatsapp"),
        ]) as DbValue[][],
        "active=VALUES(active),name=VALUES(name),city=VALUES(city),neighborhood=VALUES(neighborhood),registered_at=VALUES(registered_at),satisfaction=VALUES(satisfaction),seller_id=VALUES(seller_id),branch_id=VALUES(branch_id),phone=VALUES(phone),mobile_phone=VALUES(mobile_phone),commercial_phone=VALUES(commercial_phone),whatsapp=VALUES(whatsapp)"
      );
      saved += rows.length;
      await onProgress?.({ processed: saved, total: batch.total });
    }
    return this.mark("customers", saved);
  }
  /** One-time bounded source pass to populate contact fields for existing customers. */
  private async customerContacts(onProgress?: ProgressReporter) {
    let saved = 0;
    for await (const batch of this.ixc.listBatches<IxcRow>("cliente", {
      qtype: "cliente.id",
      query: "1",
      oper: ">=",
      sortname: "cliente.id",
      sortorder: "asc",
      gridParam: [{ TB: "cliente.ativo", OP: "=", P: "S" }],
    })) {
      const rows = batch.rows.filter((row) => value(row, "id") !== null && value(row, "ativo") !== null && value(row, "razao") !== null);
      await upsertRows(
        "retention_customers",
        [
          "id",
          "active",
          "name",
          "city",
          "neighborhood",
          "registered_at",
          "satisfaction",
          "seller_id",
          "branch_id",
          "phone",
          "mobile_phone",
          "commercial_phone",
          "whatsapp",
        ],
        rows.map((row) => [
          value(row, "id"),
          value(row, "ativo"),
          value(row, "razao"),
          value(row, "cidade"),
          value(row, "bairro"),
          asDate(value(row, "data_cadastro")),
          value(row, "grau_satisfacao"),
          value(row, "id_vendedor"),
          value(row, "filial_id"),
          value(row, "fone"),
          value(row, "telefone_celular"),
          value(row, "telefone_comercial"),
          value(row, "whatsapp"),
        ]) as DbValue[][],
        "phone=VALUES(phone),mobile_phone=VALUES(mobile_phone),commercial_phone=VALUES(commercial_phone),whatsapp=VALUES(whatsapp)"
      );
      saved += rows.length;
      await onProgress?.({ processed: saved, total: batch.total });
    }
    return this.mark("customer-contacts", saved);
  }
  private async contracts(onProgress?: ProgressReporter) {
    const lastSync = await this.lastSync("contracts");
    const start = this.overlappedStart(lastSync, 3650);
    let active = 0;
    let processed = 0;
    for await (const batch of this.ixc.listBatches<IxcRow>("cliente_contrato", {
      qtype: lastSync ? "cliente_contrato.ultima_atualizacao" : "cliente_contrato.id",
      query: lastSync ? ixcIsoDateTime(start) : "1",
      oper: ">=",
      sortname: lastSync ? "cliente_contrato.ultima_atualizacao" : "cliente_contrato.id",
      sortorder: "asc",
    })) {
      const activeRows: IxcRow[] = [];
      const cancelledRows: IxcRow[] = [];
      for (const r of batch.rows) {
        if (value(r, "id") === null || value(r, "id_cliente") === null) continue;
        this.trackCustomer(value(r, "id_cliente"));
        const cancelled = value(r, "status") === "I";
        if (cancelled) {
          cancelledRows.push(r);
          continue;
        }
        activeRows.push(r);
      }
      // Batch cancellation writes locally, preserving ownership and existing history.
      // Previously this also left formerly active contracts eligible for risk analysis.
      for (const cancelledBatch of chunks(cancelledRows, env.RETENTION_SYNC_BATCH_SIZE)) {
        await db.execute(
          `UPDATE retention_contracts SET status='I',synced_at=NOW() WHERE (id,customer_id) IN (${cancelledBatch.map(() => "(?,?)").join(",")})`,
          cancelledBatch.flatMap((r) => [value(r, "id"), value(r, "id_cliente")])
        );
      }
      await upsertRows(
        "retention_cancellations",
        ["customer_id", "contract_id", "cancellation_date", "cancellation_reason_id", "cancellation_observation"],
        cancelledRows.map((r) => [
          value(r, "id_cliente"),
          value(r, "id"),
          asDate(value(r, "data_cancelamento")),
          value(r, "motivo_cancelamento"),
          value(r, "obs_cancelamento"),
        ]) as DbValue[][],
        "cancellation_date=VALUES(cancellation_date),cancellation_reason_id=VALUES(cancellation_reason_id),cancellation_observation=VALUES(cancellation_observation)",
        { syncedAt: false }
      );
      await upsertRows(
        "retention_contracts",
        [
          "id",
          "customer_id",
          "plan_id",
          "plan_name",
          "signed_at",
          "activated_at",
          "renewal_at",
          "status",
          "internet_status",
          "speed_status",
          "overdue_installments",
          "fidelity",
          "expires_at",
          "auto_block",
          "suspended",
          "suspension_started_at",
          "suspension_ended_at",
          "access_disabled_at",
          "last_auto_block_at",
          "last_manual_block_at",
          "last_financial_late_at",
          "last_trust_unlock_at",
          "last_suspension_release_at",
          "branch_id",
          "seller_id",
        ],
        activeRows
          .filter((row) => value(row, "id") !== null && value(row, "id_cliente") !== null)
          .map((row) => [
            value(row, "id"),
            value(row, "id_cliente"),
            value(row, "id_vd_contrato"),
            value(row, "contrato"),
            asDate(value(row, "data_assinatura")),
            asDate(value(row, "data_ativacao")),
            asDate(value(row, "data_renovacao")),
            value(row, "status"),
            value(row, "status_internet"),
            value(row, "status_velocidade"),
            value(row, "num_parcelas_atraso"),
            value(row, "fidelidade"),
            asDate(value(row, "data_expiracao")),
            value(row, "bloqueio_automatico"),
            value(row, "contrato_suspenso"),
            asDate(value(row, "data_inicial_suspensao")),
            asDate(value(row, "data_final_suspensao")),
            asDate(value(row, "data_acesso_desativado")),
            asDate(value(row, "dt_ult_bloq_auto")),
            asDate(value(row, "dt_ult_bloq_manual")),
            asDate(value(row, "dt_ult_finan_atraso")),
            asDate(value(row, "dt_ult_des_bloq_conf")),
            asDate(value(row, "dt_ult_liberacao_susp_parc")),
            value(row, "id_filial"),
            value(row, "id_vendedor"),
          ]) as DbValue[][],
        "customer_id=VALUES(customer_id),plan_id=VALUES(plan_id),plan_name=VALUES(plan_name),signed_at=VALUES(signed_at),activated_at=VALUES(activated_at),renewal_at=VALUES(renewal_at),status=VALUES(status),internet_status=VALUES(internet_status),speed_status=VALUES(speed_status),overdue_installments=VALUES(overdue_installments),fidelity=VALUES(fidelity),expires_at=VALUES(expires_at),auto_block=VALUES(auto_block),suspended=VALUES(suspended),suspension_started_at=VALUES(suspension_started_at),suspension_ended_at=VALUES(suspension_ended_at),access_disabled_at=VALUES(access_disabled_at),last_auto_block_at=VALUES(last_auto_block_at),last_manual_block_at=VALUES(last_manual_block_at),last_financial_late_at=VALUES(last_financial_late_at),last_trust_unlock_at=VALUES(last_trust_unlock_at),last_suspension_release_at=VALUES(last_suspension_release_at),branch_id=VALUES(branch_id),seller_id=VALUES(seller_id)"
      );
      active += activeRows.length;
      processed += batch.rows.length;
      await onProgress?.({ processed, total: batch.total });
    }
    return this.mark("contracts", active);
  }
  /** Historical contract events are stored separately and never read by the risk engine. */
  private async contractHistory(onProgress?: ProgressReporter) {
    const lastSync = await this.lastSync("contract-history");
    const start = this.overlappedStart(lastSync, env.RETENTION_HISTORY_INITIAL_DAYS);
    let saved = 0;
    for await (const batch of this.ixc.listBatches<IxcRow>("cliente_contrato_historico", {
      qtype: "cliente_contrato_historico.id",
      query: "1",
      oper: ">=",
      sortname: "cliente_contrato_historico.data",
      sortorder: "asc",
      gridParam: [{ TB: "cliente_contrato_historico.data", OP: ">=", P: ixcIsoDateTime(start) }],
    })) {
      const rows = batch.rows.filter((row) => {
        const customerId = value(row, "id_cliente");
        // IXC allows generic customer history without a linked contract. Such
        // events remain useful in the timeline; only rows without a customer
        // cannot be associated with anything in this panel.
        return customerId !== null;
      });
      rows.forEach((row) => this.trackCustomer(value(row, "id_cliente")));
      await upsertRows(
        "retention_contract_history",
        ["contract_id", "customer_id", "event_type", "event_at", "description", "external_key"],
        rows.map((row) => [
          value(row, "id_contrato"),
          value(row, "id_cliente"),
          value(row, "tipo"),
          asDate(value(row, "data")),
          value(row, "historico"),
          createHash("sha256").update(JSON.stringify(row)).digest("hex"),
        ]) as DbValue[][],
        "event_type=VALUES(event_type),event_at=VALUES(event_at),description=VALUES(description)"
      );
      saved += rows.length;
      await onProgress?.({ processed: saved, total: batch.total });
    }
    return this.mark("contract-history", saved);
  }
  private async financial(onProgress?: ProgressReporter) {
    const lastSync = await this.lastSync("financial");
    const start = this.overlappedStart(lastSync, 90);
    const seen = new Set<string>();
    let saved = 0;
    let expected = 0;
    const process = async (request: IxcListRequest) => {
      let requestTotal = 0;
      for await (const batch of this.ixc.listBatches<IxcRow>("fn_areceber", request)) {
        if (!requestTotal) {
          requestTotal = batch.total;
          expected += batch.total;
        }
        const rows = batch.rows.filter((row) => {
          const id = value(row, "id");
          if (id === null || seen.has(String(id))) return false;
          seen.add(String(id));
          return value(row, "id_cliente") !== null;
        });
        rows.forEach((row) => this.trackCustomer(value(row, "id_cliente")));
        await upsertRows(
          "retention_financial_events",
          [
            "id",
            "customer_id",
            "contract_id",
            "issued_at",
            "due_at",
            "amount",
            "status",
            "open_amount",
            "received_amount",
            "paid_at",
            "settled_at",
            "released",
          ],
          rows.map((row) => [
            value(row, "id"),
            value(row, "id_cliente"),
            value(row, "id_contrato"),
            asDate(value(row, "data_emissao")),
            asDate(value(row, "data_vencimento")),
            value(row, "valor"),
            value(row, "status"),
            value(row, "valor_aberto"),
            value(row, "valor_recebido"),
            asDate(value(row, "pagamento_data")),
            asDate(value(row, "baixa_data")),
            value(row, "liberado"),
          ]) as DbValue[][],
          "status=VALUES(status),open_amount=VALUES(open_amount),received_amount=VALUES(received_amount),paid_at=VALUES(paid_at),settled_at=VALUES(settled_at),released=VALUES(released)"
        );
        saved += rows.length;
        await onProgress?.({ processed: saved, total: Math.max(expected, saved) });
      }
    };

    // All open titles matter to the risk score, regardless of their due date.
    for (const status of ["A", "P"]) {
      await process({ qtype: "fn_areceber.status", query: status, oper: "=", sortname: "fn_areceber.id", sortorder: "asc" });
    }
    // `ultima_atualizacao` is not reliably filtered by this IXC installation.
    // These date fields were individually verified against the live API and
    // cover new titles plus payment and cancellation status transitions.
    for (const field of ["data_emissao", "pagamento_data", "data_cancelamento"]) {
      await process({
        qtype: `fn_areceber.${field}`,
        query: ixcDateTime(start),
        oper: ">=",
        sortname: `fn_areceber.${field}`,
        sortorder: "asc",
      });
    }
    // On an empty local base, retain recent titles for the customer timeline.
    if (!lastSync)
      await process({
        qtype: "fn_areceber.data_vencimento",
        query: ixcDateTime(start),
        oper: ">=",
        sortname: "fn_areceber.data_vencimento",
        sortorder: "asc",
      });
    return this.mark("financial", saved);
  }
  private async tickets(onProgress?: ProgressReporter) {
    const lastSync = await this.lastSync("tickets");
    const start = this.overlappedStart(lastSync, 90);
    let saved = 0;
    for await (const batch of this.ixc.listBatches<IxcRow>("su_ticket", {
      qtype: lastSync ? "su_ticket.ultima_atualizacao" : "su_ticket.id",
      query: lastSync ? ixcIsoDateTime(start) : "1",
      oper: ">=",
      sortname: lastSync ? "su_ticket.ultima_atualizacao" : "su_ticket.id",
      sortorder: "asc",
    })) {
      const rows = batch.rows.filter((row) => value(row, "id") !== null && value(row, "id_cliente") !== null);
      rows.forEach((row) => this.trackCustomer(value(row, "id_cliente")));
      await upsertRows(
        "retention_tickets",
        [
          "id",
          "customer_id",
          "contract_id",
          "subject_id",
          "title",
          "priority",
          "ticket_status",
          "sla_status",
          "created_at_ixc",
          "updated_at_ixc",
        ],
        rows.map((row) => [
          value(row, "id"),
          value(row, "id_cliente"),
          value(row, "id_contrato"),
          value(row, "id_assunto"),
          value(row, "titulo"),
          value(row, "prioridade"),
          value(row, "su_status") ?? value(row, "status"),
          value(row, "status_sla"),
          asDate(value(row, "data_criacao")),
          asDate(value(row, "data_ultima_alteracao") ?? value(row, "ultima_atualizacao")),
        ]) as DbValue[][],
        "ticket_status=VALUES(ticket_status),sla_status=VALUES(sla_status),updated_at_ixc=VALUES(updated_at_ixc)"
      );
      saved += rows.length;
      await onProgress?.({ processed: saved, total: batch.total });
    }
    return this.mark("tickets", saved);
  }
  private async orders(onProgress?: ProgressReporter) {
    const lastSync = await this.lastSync("service-orders");
    const start = this.overlappedStart(lastSync, 90);
    let saved = 0;
    for await (const batch of this.ixc.listBatches<IxcRow>("su_oss_chamado", {
      qtype: lastSync ? "su_oss_chamado.ultima_atualizacao" : "su_oss_chamado.id",
      query: lastSync ? ixcIsoDateTime(start) : "1",
      oper: ">=",
      sortname: lastSync ? "su_oss_chamado.ultima_atualizacao" : "su_oss_chamado.id",
      sortorder: "asc",
    })) {
      const rows = batch.rows.filter((row) => value(row, "id") !== null && value(row, "id_cliente") !== null);
      rows.forEach((row) => this.trackCustomer(value(row, "id_cliente")));
      await upsertRows(
        "retention_service_orders",
        ["id", "customer_id", "contract_id", "subject_id", "priority", "status", "sla_status", "opened_at", "closed_at", "rescheduled_at"],
        rows.map((row) => [
          value(row, "id"),
          value(row, "id_cliente"),
          value(row, "id_contrato_kit"),
          value(row, "id_assunto"),
          value(row, "prioridade"),
          value(row, "status"),
          value(row, "status_sla"),
          asDate(value(row, "data_abertura")),
          asDate(value(row, "data_fechamento") ?? value(row, "data_final")),
          asDate(value(row, "data_reagendar")),
        ]) as DbValue[][],
        "status=VALUES(status),sla_status=VALUES(sla_status),closed_at=VALUES(closed_at),rescheduled_at=VALUES(rescheduled_at)"
      );
      saved += rows.length;
      await onProgress?.({ processed: saved, total: batch.total });
    }
    return this.mark("service-orders", saved);
  }
  /** Subject labels are stored locally; business categories remain editable configuration. */
  private async subjects(onProgress?: ProgressReporter) {
    const rows = await this.ixc.listAll<IxcRow>(
      "su_oss_assunto",
      {
        qtype: "su_oss_assunto.id",
        query: "1",
        oper: ">=",
        sortname: "su_oss_assunto.id",
        sortorder: "asc",
      },
      onProgress
    );
    for (const row of rows)
      await db.execute(
        "INSERT INTO retention_subject_mappings (subject_id,label) VALUES (?,?) ON DUPLICATE KEY UPDATE label=VALUES(label)",
        [value(row, "id"), value(row, "assunto")]
      );
    return this.mark("subjects", rows.length);
  }
  private async radiusUsers(onProgress?: ProgressReporter) {
    let saved = 0;
    for await (const batch of this.ixc.listBatches<IxcRow>("radusuarios", {
      qtype: "radusuarios.ativo",
      query: "S",
      oper: "=",
      sortname: "radusuarios.id",
      sortorder: "asc",
    })) {
      const rows = batch.rows.filter(
        (row) => value(row, "id") !== null && value(row, "id_cliente") !== null && value(row, "login") !== null
      );
      rows.forEach((row) => this.trackCustomer(value(row, "id_cliente")));
      await upsertRows(
        "retention_logins",
        [
          "id",
          "customer_id",
          "contract_id",
          "login",
          "active",
          "online",
          "concentrator_id",
          "concentrator",
          "ftth_box_id",
          "last_connection_started_at",
          "last_connection_ended_at",
          "disconnect_count",
          "last_disconnect_reason",
        ],
        rows.map((row) => [
          value(row, "id"),
          value(row, "id_cliente"),
          value(row, "id_contrato"),
          value(row, "login"),
          value(row, "ativo"),
          value(row, "online"),
          value(row, "id_concentrador"),
          value(row, "concentrador"),
          value(row, "id_caixa_ftth"),
          asDate(value(row, "ultima_conexao_inicial")),
          asDate(value(row, "ultima_conexao_final")),
          value(row, "count_desconexao"),
          value(row, "motivo_desconexao"),
        ]) as DbValue[][],
        "customer_id=VALUES(customer_id),contract_id=VALUES(contract_id),active=VALUES(active),online=VALUES(online),concentrator_id=VALUES(concentrator_id),concentrator=VALUES(concentrator),ftth_box_id=VALUES(ftth_box_id),last_connection_started_at=VALUES(last_connection_started_at),last_connection_ended_at=VALUES(last_connection_ended_at),disconnect_count=VALUES(disconnect_count),last_disconnect_reason=VALUES(last_disconnect_reason)"
      );
      saved += rows.length;
      await onProgress?.({ processed: saved, total: batch.total });
    }
    return this.mark("radius-users", saved);
  }
  private async radiusHistory(onProgress?: ProgressReporter) {
    const lastSync = await this.lastSync("radius-history");
    const start = this.overlappedStart(lastSync, env.RETENTION_RADIUS_INITIAL_DAYS);
    const dates = new Set<string>();
    const logins = new Set<string>();
    let saved = 0;
    for await (const batch of this.ixc.listBatches<IxcRow>("radacct", {
      qtype: "radacct.radacctid",
      query: "1",
      oper: ">=",
      sortname: "radacct.acctstarttime",
      sortorder: "asc",
      gridParam: [{ TB: "radacct.acctstarttime", OP: ">=", P: ixcIsoDateTime(start) }],
    })) {
      const rows = batch.rows.filter((r) => {
        const started = asDate(value(r, "acctstarttime"));
        return started !== null && value(r, "radacctid") !== null && value(r, "username") !== null;
      });
      for (const r of rows) {
        const started = asDate(value(r, "acctstarttime"))!;
        dates.add(String(started).slice(0, 10));
        logins.add(String(value(r, "username")));
      }
      await upsertRows(
        "retention_radius_sessions",
        ["radacct_id", "username", "started_at", "stopped_at", "session_seconds", "terminate_cause"],
        rows.map((row) => [
          value(row, "radacctid"),
          value(row, "username"),
          asDate(value(row, "acctstarttime")),
          asDate(value(row, "acctstoptime")),
          value(row, "acctsessiontime") ?? 0,
          value(row, "acctterminatecause"),
        ]) as DbValue[][],
        "stopped_at=VALUES(stopped_at),session_seconds=VALUES(session_seconds),terminate_cause=VALUES(terminate_cause)"
      );
      saved += rows.length;
      await onProgress?.({ processed: saved, total: batch.total });
    }
    for (const loginBatch of chunks([...logins], env.RETENTION_SYNC_BATCH_SIZE)) {
      if (!loginBatch.length) continue;
      const placeholders = loginBatch.map(() => "?").join(",");
      const [customers] = await db.query<RowDataPacket[]>(
        `SELECT DISTINCT customer_id FROM retention_logins WHERE login IN (${placeholders})`,
        loginBatch
      );
      customers.forEach((customer) => this.trackCustomer(customer.customer_id));
    }
    for (const date of dates) {
      await db.execute("DELETE FROM retention_connections_daily WHERE date=?", [date]);
      await db.execute(
        `INSERT INTO retention_connections_daily (date,login_id,contract_id,customer_id,concentrator_id,concentrator,ftth_box_id,sessions,disconnects,avg_session_seconds,short_sessions,total_session_seconds,main_terminate_cause) SELECT DATE(s.started_at),l.id,l.contract_id,l.customer_id,l.concentrator_id,l.concentrator,l.ftth_box_id,COUNT(*),COUNT(*),ROUND(AVG(s.session_seconds)),SUM(s.session_seconds<300),SUM(s.session_seconds),MAX(s.terminate_cause) FROM retention_radius_sessions s JOIN retention_logins l ON l.login=s.username WHERE DATE(s.started_at)=? GROUP BY DATE(s.started_at),l.id,l.contract_id,l.customer_id,l.concentrator_id,l.concentrator,l.ftth_box_id`,
        [date]
      );
    }
    return this.mark("radius-history", saved);
  }
  private async usage(onProgress?: ProgressReporter) {
    const start = new Date(Date.now() - 183 * 86_400_000);
    let saved = 0;
    for await (const batch of this.ixc.listBatches<IxcRow>("radusuarios_consumo_m", {
      qtype: "radusuarios_consumo_m.id",
      query: "1",
      oper: ">=",
      sortname: "radusuarios_consumo_m.id",
      sortorder: "asc",
      gridParam: [{ TB: "radusuarios_consumo_m.data", OP: ">=", P: ixcIsoDateTime(start) }],
    })) {
      const loginIds = [...new Set(batch.rows.map((row) => value(row, "id_login")).filter((id): id is string | number => id !== null))];
      if (!loginIds.length) continue;
      const placeholders = loginIds.map(() => "?").join(",");
      const [logins] = await db.query<RowDataPacket[]>(
        `SELECT id,customer_id,contract_id FROM retention_logins WHERE id IN (${placeholders})`,
        loginIds
      );
      const loginById = new Map(logins.map((login) => [String(login.id), login]));
      const rows = batch.rows.filter(
        (row) => value(row, "id_login") !== null && asDate(value(row, "data")) !== null && loginById.has(String(value(row, "id_login")))
      );
      rows.forEach((row) => this.trackCustomer(loginById.get(String(value(row, "id_login")))?.customer_id));
      await upsertRows(
        "retention_usage_monthly",
        ["login_id", "date", "customer_id", "contract_id", "download_consumption", "upload_consumption"],
        rows.map((row) => {
          const login = loginById.get(String(value(row, "id_login")))!;
          return [
            value(row, "id_login"),
            asDate(value(row, "data")),
            login.customer_id,
            login.contract_id,
            value(row, "consumo") ?? 0,
            value(row, "consumo_upload") ?? 0,
          ];
        }) as DbValue[][],
        "customer_id=VALUES(customer_id),contract_id=VALUES(contract_id),download_consumption=VALUES(download_consumption),upload_consumption=VALUES(upload_consumption)",
        { syncedAt: false }
      );
      saved += rows.length;
      await onProgress?.({ processed: saved, total: batch.total });
    }
    return this.mark("usage", saved);
  }
  private async mark(resource: string, count: number) {
    await db.execute(
      "INSERT INTO retention_sync_state (resource_name,last_sync_at,last_record_count,last_success_at,last_error) VALUES (?,NOW(),?,NOW(),NULL) ON DUPLICATE KEY UPDATE last_sync_at=NOW(),last_record_count=VALUES(last_record_count),last_success_at=NOW(),last_error=NULL",
      [resource, count]
    );
    return count;
  }
  private async lastSync(resource: string): Promise<string | null> {
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT DATE_FORMAT(last_sync_at, '%Y-%m-%d %H:%i:%s') value FROM retention_sync_state WHERE resource_name=?",
      [resource]
    );
    return rows[0]?.value ? String(rows[0].value) : null;
  }
  private overlappedStart(lastSync: string | null, initialDays: number): Date {
    const initial = new Date(Date.now() - initialDays * 86_400_000);
    if (!lastSync) return initial;
    const last = new Date(`${lastSync}Z`);
    return new Date(Math.max(initial.getTime(), last.getTime() - env.RETENTION_SYNC_OVERLAP_DAYS * 86_400_000));
  }
  private trackCustomer(value: unknown) {
    const customerId = Number(value);
    if (Number.isSafeInteger(customerId) && customerId > 0) this.affectedCustomerIds.add(customerId);
  }
}
