import { z } from "zod";
import type { Permission } from "../../config/permissions.js";
import { IxcReadDatabase, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { IxcOnuApi, OnuCommandError } from "../../integrations/ixc/IxcOnuApi.js";
import { compatibleOnu, compatibleOnuSql } from "../upgrades/LoginOnuLink.js";
import { connectionStatus } from "./LoginConnection.js";
import { OnuOperationStore, type OperationStore, type OnuOperation } from "./OnuOperationStore.js";

const id = z.coerce.number().int().positive().safe();
export const loginToolScope = z
  .object({ module: z.enum(["support", "upgrades", "network"]), contractId: id.optional(), boxId: id.optional() })
  .strict()
  .superRefine((s, ctx) => {
    if (s.module === "upgrades" && !s.contractId) ctx.addIssue({ code: "custom", message: "Contrato obrigatório." });
    if (s.module !== "network" && s.boxId) ctx.addIssue({ code: "custom", message: "Escopo inválido." });
    if (s.module === "network" && s.contractId) ctx.addIssue({ code: "custom", message: "Escopo inválido." });
  });
export type LoginToolScope = z.infer<typeof loginToolScope>;
export const loginAction = z.enum(["disconnect", "clearMac", "reboot"]);
export type LoginAction = z.infer<typeof loginAction>;
export const loginActionPermissions: Record<LoginAction, Permission> = {
  disconnect: "network.logins.disconnect",
  clearMac: "network.logins.clearMac",
  reboot: "network.equipment.reboot",
};
export function loginReadPermissions(scope: LoginToolScope): Permission[] {
  if (scope.module === "network") return [scope.boxId ? "network.boxes.view" : "network.logins.list", "network.logins.view"];
  if (scope.module === "upgrades") return ["upgrades.contract.view", "upgrades.logins.view"];
  return ["support.logins.view", scope.contractId ? "support.contract.view" : "support.customer.view"];
}
type Row = Record<string, unknown>;
const text = (v: unknown) => String(v ?? "").trim();
const positive = (v: unknown) => (id.safeParse(v).success ? Number(v) : null);
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
export const consumptionRange = z
  .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  .strict()
  .superRefine((r, ctx) => {
    const from = new Date(r.from + "T00:00:00Z"),
      to = new Date(r.to + "T00:00:00Z");
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      from.toISOString().slice(0, 10) !== r.from ||
      to.toISOString().slice(0, 10) !== r.to ||
      to < from ||
      (to.getTime() - from.getTime()) / 86400000 > 89
    )
      ctx.addIssue({ code: "custom", message: "Selecione até 90 dias válidos." });
  });
const bytes = (v: unknown) => (/^\d+$/.test(text(v)) ? BigInt(text(v)) : null);

/** Bounded reads, separately authorized fixed commands and owner-bound idempotent reviews. */
export class LoginToolsService {
  constructor(
    private readonly db: IxcReadSession & { close?(): Promise<void> } = new IxcReadDatabase(),
    private readonly api: Pick<IxcOnuApi, "record" | "disconnectLogin" | "clearLoginMac" | "rebootOnu"> = new IxcOnuApi(),
    private readonly store: OperationStore = new OnuOperationStore(),
    private readonly now = () => new Date()
  ) {}
  async close() {
    await this.store.close();
    await this.db.close?.();
  }
  private async login(loginId: number, scope: LoginToolScope) {
    id.parse(loginId);
    loginToolScope.parse(scope);
    const [r] = await this.db.select<Row>({
      name: "login-tools-ownership",
      sql: "SELECT r.id,r.login,r.id_cliente,r.id_contrato,r.id_caixa_ftth,r.online,r.ip,r.mac,r.onu_mac FROM radusuarios r WHERE r.id=? LIMIT 1",
      params: [loginId],
      timeoutSeconds: 5,
    });
    if (
      !r ||
      !positive(r.id_cliente) ||
      (scope.contractId && positive(r.id_contrato) !== scope.contractId) ||
      (scope.boxId && positive(r.id_caixa_ftth) !== scope.boxId)
    )
      throw fail("Login não encontrado neste contexto.", 404);
    if (scope.contractId) {
      const [contract] = await this.db.select<Row>({
        name: "login-tools-contract",
        sql: "SELECT id FROM cliente_contrato WHERE id=? AND id_cliente=? LIMIT 1",
        params: [scope.contractId, Number(r.id_cliente)],
        timeoutSeconds: 5,
      });
      if (!contract) throw fail("Vínculo do contrato não encontrado.", 404);
    }
    return r;
  }
  async consumption(loginId: number, scope: LoginToolScope, range: z.infer<typeof consumptionRange>) {
    consumptionRange.parse(range);
    await this.login(loginId, scope);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(this.now());
    if (range.to > today) throw fail("O período não pode terminar no futuro.", 400);
    const end = new Date(range.to + "T00:00:00Z");
    end.setUTCDate(end.getUTCDate() + 1);
    const monthlyStart = new Date(range.to.slice(0, 7) + "-01T00:00:00Z");
    monthlyStart.setUTCMonth(monthlyStart.getUTCMonth() - 5);
    const monthlyEnd = new Date(range.to.slice(0, 7) + "-01T00:00:00Z");
    monthlyEnd.setUTCMonth(monthlyEnd.getUTCMonth() + 1);
    const daily = await this.db.select<Row>({
      name: "login-daily-consumption",
      sql: "SELECT id,data,consumo,consumo_upload FROM radusuarios_consumo_d WHERE id_login=? AND data>=? AND data<? ORDER BY data,id LIMIT 1001",
      params: [loginId, range.from + " 00:00:00", end.toISOString().slice(0, 10) + " 00:00:00"],
      timeoutSeconds: 5,
    });
    const monthly = await this.db.select<Row>({
      name: "login-monthly-consumption",
      sql: "SELECT id,data,consumo,consumo_upload FROM radusuarios_consumo_m WHERE id_login=? AND data>=? AND data<? ORDER BY data,id LIMIT 101",
      params: [loginId, monthlyStart.toISOString().slice(0, 10) + " 00:00:00", monthlyEnd.toISOString().slice(0, 10) + " 00:00:00"],
      timeoutSeconds: 5,
    });
    if (daily.length > 1000 || monthly.length > 100) throw fail("Histórico maior que o esperado. Reduza o período.", 422);
    const normalize = (rows: Row[], length: number) => {
      const groups = new Map<string, { date: string; downloadBytes: string | null; uploadBytes: string | null; records: number }>();
      for (const row of rows) {
        const date = text(row.data).slice(0, length);
        if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(date) || date.startsWith("0000")) continue;
        const download = bytes(row.consumo),
          upload = bytes(row.consumo_upload);
        const old = groups.get(date);
        // Consolidated histories should have one row per period. Never invent a sum for conflicting snapshots.
        groups.set(date, {
          date,
          downloadBytes: old ? null : (download?.toString() ?? null),
          uploadBytes: old ? null : (upload?.toString() ?? null),
          records: (old?.records ?? 0) + 1,
        });
      }
      return [...groups.values()];
    };
    const days = normalize(daily, 10),
      months = normalize(monthly, 7);
    const sum = (field: "downloadBytes" | "uploadBytes") =>
      days.some((d) => d[field] === null) ? null : days.reduce((total, d) => total + BigInt(d[field]!), 0n).toString();
    return {
      loginId,
      ...range,
      daily: days,
      monthly: months,
      totals: { downloadBytes: sum("downloadBytes"), uploadBytes: sum("uploadBytes") },
      duplicatePeriods: [...days, ...months].filter((d) => d.records > 1).length,
      queriedAt: this.now().toISOString(),
      source: "ixc-database" as const,
    };
  }
  private async validate(loginId: number, scope: LoginToolScope, action: LoginAction) {
    const r = await this.login(loginId, scope);
    let onu: Row | null = null;
    if (action === "disconnect" && connectionStatus(r.ip, r.online) !== "online")
      throw fail("Este login está offline no IXC. Atualize a conexão antes de desconectar.");
    if (action === "clearMac" && !text(r.mac)) throw fail("O login já está sem MAC cadastrado.");
    if (action === "reboot") {
      const rows = await this.db.select<Row>({
        name: "login-reboot-onu",
        sql: `SELECT f.id,f.id_login,f.id_contrato,f.id_transmissor,f.mac,f.serial_number,f.ponid,f.status_autorizado,f.onu_compartilhada,onc.id_cliente onu_customer_id,r.onu_mac login_onu_mac FROM radpop_radio_cliente_fibra f JOIN radusuarios r ON r.id=f.id_login LEFT JOIN cliente_contrato onc ON onc.id=f.id_contrato WHERE r.id=? AND ${compatibleOnuSql} ORDER BY f.id DESC LIMIT 3`,
        params: [loginId],
        timeoutSeconds: 5,
      });
      if (rows.length !== 1 || !positive(rows[0]?.id) || !positive(rows[0]?.id_transmissor))
        throw fail("Não há uma ONU única e compatível para reiniciar. Confira os vínculos no IXC.");
      onu = rows[0]!;
      if (text(onu.onu_compartilhada) === "S") throw fail("A ONU é compartilhada. Reinicialização indisponível por login.");
      if (text(onu.status_autorizado) !== "A") throw fail("A ONU vinculada não está autorizada no IXC.");
    }
    return {
      loginId,
      scope,
      action,
      login: text(r.login),
      customerId: Number(r.id_cliente),
      contractId: positive(r.id_contrato),
      mac: text(r.mac) || null,
      onuId: positive(onu?.id),
      oltId: positive(onu?.id_transmissor),
      serial: onu ? text(onu.serial_number) || text(onu.mac) || null : null,
      pon: onu ? text(onu.ponid) : null,
      onuContractId: positive(onu?.id_contrato),
      loginOnuMac: text(r.onu_mac),
    };
  }
  async prepare(userId: number, loginId: number, scope: LoginToolScope, action: LoginAction) {
    loginAction.parse(action);
    const plan = { kind: "login-action", ...(await this.validate(loginId, scope, action)) };
    const token = await this.store.prepare({ userId, state: "prepared", plan });
    return { token, review: plan, expiresInSeconds: 300 };
  }
  async operation(userId: number, token: string) {
    const op = await this.store.get(token, userId);
    if (op.plan.kind !== "login-action") throw fail("Revisão inválida.");
    return op;
  }
  async execute(userId: number, token: string, checkAccess: (scope: LoginToolScope, action: LoginAction) => Promise<void>) {
    const saved = await this.operation(userId, token);
    const action = loginAction.parse(saved.plan.action),
      scope = loginToolScope.parse(saved.plan.scope),
      loginId = id.parse(saved.plan.loginId);
    await checkAccess(scope, action);
    const keys = [`login:${loginId}`, ...(action === "reboot" ? [`olt:${saved.plan.oltId}`] : [])];
    const claim = await this.store.claim(token, userId, keys);
    if (!claim.claimed) return { state: claim.operation.state, result: claim.operation.result ?? null };
    let result: NonNullable<OnuOperation["result"]>,
      sent = false;
    try {
      const current = { kind: "login-action", ...(await this.validate(loginId, scope, action)) };
      if (JSON.stringify(current) !== JSON.stringify(saved.plan))
        throw fail("Os vínculos ou dados mudaram desde a revisão. Prepare novamente.");
      const apiLogin = await this.api.record("radusuarios", loginId);
      if (
        Number(apiLogin.id_cliente) !== current.customerId ||
        positive(apiLogin.id_contrato) !== current.contractId ||
        text(apiLogin.login) !== current.login ||
        text(apiLogin.mac) !== text(current.mac) ||
        text(apiLogin.onu_mac) !== current.loginOnuMac ||
        (scope.boxId && Number(apiLogin.id_caixa_ftth) !== scope.boxId)
      )
        throw fail("O login mudou no IXC. Prepare novamente.");
      if (scope.contractId) {
        const contract = await this.api.record("cliente_contrato", scope.contractId);
        if (Number(contract.id_cliente) !== current.customerId) throw fail("O contrato mudou no IXC. Prepare novamente.");
      }
      if (action === "disconnect" && connectionStatus(apiLogin.ip, apiLogin.online) !== "online")
        throw fail("O login já está offline no IXC.");
      if (action === "reboot") {
        const onu = await this.api.record("radpop_radio_cliente_fibra", current.onuId!);
        if (
          Number(onu.id_login) !== loginId ||
          positive(onu.id_contrato) !== current.onuContractId ||
          Number(onu.id_transmissor) !== current.oltId ||
          text(onu.status_autorizado) !== "A" ||
          text(onu.onu_compartilhada) === "S" ||
          (text(onu.serial_number) || text(onu.mac) || null) !== current.serial ||
          text(onu.ponid) !== current.pon
        )
          throw fail("A ONU mudou no IXC. Prepare novamente.");
        if (current.onuContractId !== null && current.onuContractId !== current.contractId) {
          const owner = await this.api.record("cliente_contrato", current.onuContractId);
          if (
            !compatibleOnu(
              { ...onu, login_onu_mac: apiLogin.onu_mac, onu_customer_id: owner.id_cliente },
              current.contractId,
              current.customerId
            )
          )
            throw fail("Vínculo da ONU não é compatível.");
        }
      }
      await checkAccess(scope, action);
      await this.store.renew(token, keys);
      sent = true;
      if (action === "disconnect") await this.api.disconnectLogin(loginId);
      else if (action === "clearMac") await this.api.clearLoginMac(loginId);
      else await this.api.rebootOnu(current.onuId!);
      result = {
        state: "success",
        message:
          action === "clearMac"
            ? "IXC confirmou a limpeza do MAC do login."
            : action === "disconnect"
              ? "IXC confirmou o comando de desconexão. O cliente pode reconectar automaticamente."
              : "IXC confirmou o comando de reinicialização da ONU. Aguarde o retorno da conexão.",
        onuId: current.onuId,
        step: action,
      };
    } catch (error) {
      const uncertain = sent && (!(error instanceof OnuCommandError) || error.uncertain);
      result = {
        state: uncertain ? "unknown" : "rejected",
        message: uncertain
          ? "O resultado não foi confirmado. Confira o IXC e a conexão antes de repetir; nenhum comando será reenviado automaticamente."
          : error instanceof OnuCommandError
            ? error.message
            : (error as { statusCode?: number }).statusCode
              ? (error as Error).message
              : "Não foi possível validar a operação. Nenhum comando foi enviado.",
        onuId: positive(saved.plan.onuId),
        step: action,
      };
    }
    try {
      await this.store.finish(token, { ...claim.operation, state: result.state as OnuOperation["state"], result });
    } catch {
      result = { ...result, state: "unknown", message: "Não foi possível registrar o resultado. Confira o IXC antes de repetir." };
    }
    if (result.state !== "unknown") await this.store.release(token, keys).catch(() => {});
    return { state: result.state, result };
  }
}
