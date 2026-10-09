import { createHash } from "node:crypto";
import { z } from "zod";
import { IxcReadDatabase, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { IxcOnuApi, OnuCommandError, type OnuRow } from "../../integrations/ixc/IxcOnuApi.js";
import { loginEditableFields } from "../../integrations/ixc/LoginEditableFields.js";
import { fiberEditableFields } from "./OnuService.js";
import { compatibleOnu } from "../upgrades/LoginOnuLink.js";
import { OnuOperationStore, type OperationStore, type OnuOperation } from "./OnuOperationStore.js";

const id = z.coerce.number().int().positive().safe();
export const portManeuverInput = z
  .object({ loginId: id, targetPort: id.max(512), swapLoginId: id.optional(), loginOnly: z.boolean().optional() })
  .strict()
  .refine((value) => !value.loginOnly || !value.swapLoginId, "A edição individual não troca dois logins.");
type Input = z.infer<typeof portManeuverInput>;
type Row = Record<string, unknown>;
type PortRecord = { kind: "login" | "onu"; id: number; loginId: number; boxId: number; port: number; identity: string };
type ReviewLogin = {
  id: number;
  login: string;
  customerId: number;
  contractId: number;
  fromPort: number;
  toPort: number;
  onuId: number | null;
};
type Plan = {
  kind: "port-maneuver";
  mode: "move" | "swap" | "restore";
  boxId: number;
  boxName: string;
  capacity: number;
  oltId: number;
  before: PortRecord[];
  target: PortRecord[];
  original: PortRecord[];
  logins: ReviewLogin[];
  temporaryPort?: number | null;
  loginOnly?: boolean;
};
const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => Number(value ?? 0);
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const table = (record: PortRecord) => (record.kind === "login" ? "radusuarios" : "radpop_radio_cliente_fibra");
const portKey = (kind: PortRecord["kind"]) => (kind === "login" ? "ftth_porta" : "porta_ftth");
const fiberFields = fiberEditableFields.filter(
  (key) => !["sinal_rx", "sinal_tx", "temperatura", "voltagem", "data_sinal", "causa_ultima_queda"].includes(key)
);
function fields(kind: PortRecord["kind"], row: OnuRow) {
  return Object.fromEntries(
    (kind === "login" ? loginEditableFields : fiberFields).filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])
  );
}
function identity(kind: PortRecord["kind"], row: OnuRow) {
  const keys =
    kind === "login"
      ? [
          "id",
          "login",
          "id_cliente",
          "id_contrato",
          "ativo",
          "senha",
          "autenticacao",
          "id_grupo",
          "mac",
          "onu_mac",
          "id_transmissor",
          "tipo_conexao_mapa",
          "id_reserva_rede_neutra",
        ]
      : [
          "id",
          "id_login",
          "id_contrato",
          "id_transmissor",
          "mac",
          "serial_number",
          "ponid",
          "status_autorizado",
          "onu_compartilhada",
          "onu_rede_neutra",
          "id_projeto",
          "id_perfil",
          "id_hardware",
          "vlan",
          "comandos",
        ];
  return createHash("sha256")
    .update(JSON.stringify(keys.map((key) => [key, text(row[key])])))
    .digest("hex");
}
function record(kind: PortRecord["kind"], row: OnuRow): PortRecord {
  return {
    kind,
    id: num(row.id),
    loginId: kind === "login" ? num(row.id) : num(row.id_login),
    boxId: num(row.id_caixa_ftth),
    port: num(row[portKey(kind)]),
    identity: identity(kind, row),
  };
}
const recordKey = (r: PortRecord) => `${r.kind}:${r.id}`;

/** Only cadastro ports are changed. No deletion, SQL writes, OLT provisioning, or automatic command retries. */
export class PortManeuverService {
  constructor(
    private readonly db: Pick<IxcReadDatabase, "withSnapshot" | "close"> = new IxcReadDatabase(),
    private readonly api: Pick<IxcOnuApi, "record" | "updateLogin" | "update"> = new IxcOnuApi(),
    private readonly store: OperationStore = new OnuOperationStore()
  ) {}
  async close() {
    await this.store.close();
    await this.db.close();
  }
  private async read(s: IxcReadSession, boxId: number) {
    const [box] = await s.select<Row>({
      name: "port-maneuver-box",
      sql: "SELECT id,descricao,status,capacidade,id_transmissor FROM rad_caixa_ftth WHERE id=?",
      params: [boxId],
      timeoutSeconds: 5,
    });
    if (!box) throw fail("Caixa não encontrada no IXC.", 404);
    if (text(box.status) !== "A") throw fail("A caixa está inativa. A manobra só está disponível em CTOs ativas.");
    const capacity = num(box.capacidade);
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 512 || !id.safeParse(box.id_transmissor).success)
      throw fail("Confira a capacidade e o transmissor cadastrados na CTO.", 422);
    const logins = await s.select<Row>({
      name: "port-maneuver-logins",
      sql: "SELECT r.id,r.login,r.id_cliente,r.id_contrato,r.id_caixa_ftth,r.ftth_porta,r.ativo,r.tipo_conexao_mapa,r.onu_mac,r.id_reserva_rede_neutra,c.razao customerName,ct.id validContractId FROM radusuarios r LEFT JOIN cliente c ON c.id=r.id_cliente LEFT JOIN cliente_contrato ct ON ct.id=r.id_contrato AND ct.id_cliente=r.id_cliente WHERE r.id_caixa_ftth=? ORDER BY r.ftth_porta,r.id LIMIT 2001",
      params: [boxId],
      timeoutSeconds: 5,
    });
    const onus = await s.select<Row>({
      name: "port-maneuver-onus",
      sql: "SELECT f.id,f.id_login,f.id_contrato,f.id_caixa_ftth,f.porta_ftth,f.id_transmissor,f.mac,f.serial_number,f.onu_compartilhada,f.onu_rede_neutra,f.status_autorizado,ct.id_cliente onu_customer_id FROM radpop_radio_cliente_fibra f LEFT JOIN cliente_contrato ct ON ct.id=f.id_contrato WHERE f.id_caixa_ftth=? OR f.id_login IN (SELECT id FROM radusuarios WHERE id_caixa_ftth=?) ORDER BY f.id LIMIT 2001",
      params: [boxId, boxId],
      timeoutSeconds: 5,
    });
    const reservations = await s.select<Row>({
      name: "port-maneuver-reservations",
      sql: "SELECT id,porta_ftth FROM reserva_rede_neutra WHERE (caixa_ftth=? OR caixa_ftth=?) AND (data_cancelamento IS NULL OR data_cancelamento='0000-00-00' OR data_cancelamento='0000-00-00 00:00:00') LIMIT 2001",
      params: [String(boxId), text(box.descricao)],
      timeoutSeconds: 5,
    });
    if ([logins, onus, reservations].some((rows) => rows.length > 2000))
      throw fail("A CTO possui vínculos demais para uma manobra segura. Revise o cadastro no IXC.", 422);
    return { box, capacity, logins, onus, reservations };
  }
  private reason(topology: Awaited<ReturnType<PortManeuverService["read"]>>, login: Row, loginOnly = false) {
    const linked = topology.onus.filter((onu) => num(onu.id_login) === num(login.id));
    if (
      !id.safeParse(login.id_cliente).success ||
      !id.safeParse(login.id_contrato).success ||
      num(login.validContractId) !== num(login.id_contrato)
    )
      return "Cliente ou contrato sem vínculo válido.";
    if (["58", "24"].includes(text(login.tipo_conexao_mapa))) return "Login de rádio; confira o vínculo com a CTO.";
    if (num(login.id_reserva_rede_neutra) > 0) return "Login de rede neutra; manobra deve ser feita pela integração responsável.";
    if (linked.length > 1) return "Mais de uma ONU vinculada ao login.";
    const onu = linked[0];
    if (onu && (text(onu.onu_compartilhada) === "S" || text(onu.onu_rede_neutra) === "S")) return "ONU compartilhada ou de rede neutra.";
    if (
      onu &&
      (!compatibleOnu({ ...onu, login_onu_mac: login.onu_mac }, num(login.id_contrato), num(login.id_cliente)) ||
        num(onu.id_caixa_ftth) !== num(topology.box.id) ||
        (!loginOnly && num(onu.porta_ftth) !== num(login.ftth_porta)) ||
        num(onu.id_transmissor) !== num(topology.box.id_transmissor))
    )
      return "Login e ONU têm vínculos ou portas divergentes. Corrija no IXC antes da manobra.";
    if (
      !(loginOnly ? z.coerce.number().int().min(0).safe() : id).safeParse(login.ftth_porta).success ||
      num(login.ftth_porta) > topology.capacity
    )
      return "Porta atual fora da capacidade da CTO.";
    return null;
  }
  private dto(t: Awaited<ReturnType<PortManeuverService["read"]>>, onlyLoginId?: number) {
    const logins = t.logins.map((r) => ({
      id: num(r.id),
      login: text(r.login),
      customerName: text(r.customerName),
      port: num(r.ftth_porta),
      active: text(r.ativo) === "S",
      blockedReason: this.reason(t, r, onlyLoginId === num(r.id)),
      onuId: num(t.onus.find((f) => num(f.id_login) === num(r.id))?.id) || null,
      onuPort: num(t.onus.find((f) => num(f.id_login) === num(r.id))?.porta_ftth) || null,
    }));
    const ports = Array.from({ length: t.capacity }, (_, i) => {
      const port = i + 1,
        assigned = t.logins.filter((r) => num(r.ftth_porta) === port),
        fiber = t.onus.filter((f) => num(f.id_caixa_ftth) === num(t.box.id) && num(f.porta_ftth) === port);
      const login = assigned.length === 1 ? logins.find((r) => r.id === num(assigned[0]!.id)) : undefined;
      const reserved = t.reservations.some((r) => num(r.porta_ftth) === port);
      const reason = reserved
        ? "Reserva de rede neutra."
        : assigned.length > 1
          ? "Mais de um login na porta."
          : fiber.some((f) => num(f.id_login) !== onlyLoginId && (!login || num(f.id_login) !== login.id))
            ? "ONU sem vínculo único com o login desta porta."
            : login?.blockedReason;
      return {
        port,
        status: reason ? "blocked" : login ? "occupied" : "free",
        loginId: login?.id ?? null,
        login: login?.login ?? null,
        reason: reason ?? null,
      };
    });
    for (const login of logins) login.blockedReason ||= ports.find((p) => p.port === login.port)?.reason ?? null;
    return {
      boxId: num(t.box.id),
      boxName: text(t.box.descricao),
      capacity: t.capacity,
      logins,
      ports,
      queriedAt: new Date().toISOString(),
    };
  }
  async options(boxId: number, onlyLoginId?: number) {
    return this.db.withSnapshot(async (s) => {
      const topology = await this.read(s, id.parse(boxId));
      if (onlyLoginId && !topology.logins.some((row) => num(row.id) === onlyLoginId)) throw fail("Login não encontrado nesta CTO.", 404);
      return this.dto(topology, onlyLoginId);
    });
  }
  async loginContext(loginId: number) {
    const [login] = await this.db.withSnapshot((s) =>
      s.select<Row>({
        name: "port-login-context",
        sql: "SELECT id,id_caixa_ftth FROM radusuarios WHERE id=?",
        params: [id.parse(loginId)],
        timeoutSeconds: 5,
      })
    );
    if (!login || !id.safeParse(login.id_caixa_ftth).success)
      throw fail("O login não possui uma CTO cadastrada. Confira o vínculo no IXC.", 422);
    const options = await this.options(num(login.id_caixa_ftth), loginId);
    return { boxId: options.boxId, boxName: options.boxName };
  }
  private keys(plan: Plan) {
    return [`box:${plan.boxId}`, `olt:${plan.oltId}`, ...plan.logins.map((r) => `login:${r.id}`)];
  }
  private async box(plan: Plan) {
    const row = await this.api.record("rad_caixa_ftth", plan.boxId);
    if (text(row.status) !== "A" || num(row.capacidade) !== plan.capacity || num(row.id_transmissor) !== plan.oltId)
      throw fail("Os dados da CTO mudaram. Atualize e revise novamente.");
  }
  private async apiRecord(r: PortRecord) {
    const row = await this.api.record(table(r), r.id);
    const critical =
      r.kind === "login"
        ? ["login", "id_cliente", "id_contrato", "ativo", "senha", "autenticacao", "id_caixa_ftth", "ftth_porta"]
        : ["id_login", "id_contrato", "id_transmissor", "id_caixa_ftth", "porta_ftth", "mac", "ponid"];
    if (critical.some((key) => !Object.hasOwn(row, key)))
      throw fail("O IXC retornou um cadastro incompleto. Nenhum formulário incompleto será salvo.");
    if (record(r.kind, row).identity !== r.identity)
      throw fail("O cadastro ou vínculo mudou desde a revisão. Atualize antes de continuar.");
    return row;
  }
  private async collision(plan: Plan) {
    const t = await this.db.withSnapshot((s) => this.read(s, plan.boxId));
    if (t.capacity !== plan.capacity || num(t.box.id_transmissor) !== plan.oltId) throw fail("A CTO mudou desde a revisão.");
    const wanted = new Set([...plan.target, ...plan.original].filter((r) => r.boxId === plan.boxId && r.port > 0).map((r) => r.port));
    if (plan.temporaryPort) wanted.add(plan.temporaryPort);
    const loginIds = new Set(plan.logins.map((r) => r.id)),
      onuIds = new Set(plan.logins.flatMap((r) => (r.onuId ? [r.onuId] : [])));
    if (
      t.logins.some((r) => !loginIds.has(num(r.id)) && wanted.has(num(r.ftth_porta))) ||
      t.onus.some((r) => num(r.id_caixa_ftth) === plan.boxId && !onuIds.has(num(r.id)) && wanted.has(num(r.porta_ftth))) ||
      t.reservations.some((r) => wanted.has(num(r.porta_ftth)))
    )
      throw fail("Uma porta da manobra foi ocupada ou reservada. Atualize a CTO antes de continuar.");
    const linked = t.onus.filter((r) => loginIds.has(num(r.id_login)));
    if (t.logins.filter((r) => loginIds.has(num(r.id))).some((r) => num(r.validContractId) !== num(r.id_contrato)))
      throw fail("O vínculo do contrato mudou durante a manobra.");
    if (linked.length !== onuIds.size || linked.some((r) => !onuIds.has(num(r.id))))
      throw fail("Os vínculos de ONU mudaram durante a operação.");
    // IXC omits some database-only ONU flags from its API form. Revalidate those
    // flags through the database instead of treating an omitted field as a change.
    for (const reviewed of plan.logins) {
      const login = t.logins.find((r) => num(r.id) === reviewed.id);
      if (!login || num(login.id_cliente) !== reviewed.customerId || num(login.id_contrato) !== reviewed.contractId)
        throw fail("O vínculo do cliente ou contrato mudou durante a manobra.");
      if (num(login.id_reserva_rede_neutra) > 0 || ["58", "24"].includes(text(login.tipo_conexao_mapa)))
        throw fail("O login passou a ser de rádio ou rede neutra. Confira o cadastro no IXC.");
      const onu = linked.find((r) => num(r.id_login) === reviewed.id);
      if (onu && (text(onu.onu_compartilhada) === "S" || text(onu.onu_rede_neutra) === "S"))
        throw fail("A ONU passou a ser compartilhada ou de rede neutra. Confira os vínculos no IXC.");
      if (
        onu &&
        (num(onu.id_transmissor) !== plan.oltId ||
          !compatibleOnu({ ...onu, login_onu_mac: login.onu_mac }, reviewed.contractId, reviewed.customerId))
      )
        throw fail("O vínculo da ONU mudou durante a manobra. Confira o cadastro no IXC.");
    }
  }
  private response(token: string, plan: Plan) {
    return {
      token,
      review: {
        mode: plan.mode,
        boxId: plan.boxId,
        boxName: plan.boxName,
        logins: plan.logins,
        loginOnly: !!plan.loginOnly,
        temporaryPort: plan.temporaryPort ?? null,
      },
      expiresInSeconds: 300,
    };
  }
  async prepare(userId: number, boxId: number, input: Input) {
    portManeuverInput.parse(input);
    const t = await this.db.withSnapshot((s) => this.read(s, id.parse(boxId))),
      options = this.dto(t, input.loginOnly ? input.loginId : undefined);
    const source = options.logins.find((r) => r.id === input.loginId),
      target = options.ports.find((p) => p.port === input.targetPort);
    if (!source || source.blockedReason) throw fail(source?.blockedReason ?? "Login não encontrado nesta CTO.");
    if (!target || target.port === source.port) throw fail("Selecione outra porta dentro da capacidade da CTO.");
    if (target.status === "blocked") throw fail(target.reason ?? "A porta está bloqueada para manobra.");
    if (input.loginOnly && target.status !== "free") throw fail("Escolha uma porta livre para editar somente este login.");
    if ((target.status === "occupied" && input.swapLoginId !== target.loginId) || (target.status === "free" && input.swapLoginId))
      throw fail("A ocupação da porta mudou. Atualize e confirme a troca novamente.");
    const selected = [source, ...(input.swapLoginId ? [options.logins.find((r) => r.id === input.swapLoginId)!] : [])];
    const logins: ReviewLogin[] = selected.map((r) => {
      const row = t.logins.find((l) => num(l.id) === r.id)!;
      return {
        id: r.id,
        login: r.login,
        customerId: num(row.id_cliente),
        contractId: num(row.id_contrato),
        fromPort: r.port,
        toPort: r.id === source.id ? target.port : source.port,
        onuId: r.onuId,
      };
    });
    const before: PortRecord[] = [];
    for (const r of logins) {
      const row = await this.api.record("radusuarios", r.id);
      if (
        num(row.id_caixa_ftth) !== boxId ||
        num(row.ftth_porta) !== r.fromPort ||
        num(row.id_cliente) !== r.customerId ||
        num(row.id_contrato) !== r.contractId ||
        text(row.login) !== r.login ||
        num(row.id_reserva_rede_neutra) > 0
      )
        throw fail("O login mudou no IXC. Atualize a CTO.");
      const loginRecord = record("login", row);
      await this.apiRecord(loginRecord);
      before.push(loginRecord);
      if (r.onuId && !input.loginOnly) {
        const onu = await this.api.record("radpop_radio_cliente_fibra", r.onuId);
        const baseline = t.onus.find((f) => num(f.id) === r.onuId)!;
        if (
          num(onu.id_login) !== r.id ||
          num(onu.id_caixa_ftth) !== boxId ||
          num(onu.porta_ftth) !== r.fromPort ||
          ["id_contrato", "id_transmissor", "mac"].some((key) => text(onu[key]) !== text(baseline[key])) ||
          ["serial_number", "onu_compartilhada", "onu_rede_neutra"].some(
            (key) => Object.hasOwn(onu, key) && text(onu[key]) !== text(baseline[key])
          )
        )
          throw fail("O vínculo da ONU mudou. Atualize a CTO.");
        const onuRecord = record("onu", onu);
        await this.apiRecord(onuRecord);
        before.push(onuRecord);
      }
    }
    const plan: Plan = {
      kind: "port-maneuver",
      mode: logins.length === 2 ? "swap" : "move",
      boxId,
      boxName: options.boxName,
      capacity: t.capacity,
      oltId: num(t.box.id_transmissor),
      before,
      target: before.map((r) => ({ ...r, port: logins.find((l) => l.id === r.loginId)!.toPort })),
      original: before,
      logins,
      loginOnly: !!input.loginOnly,
      temporaryPort: logins.length === 2 ? (options.ports.find((p) => p.status === "free")?.port ?? null) : null,
    };
    if (plan.mode === "swap" && !plan.temporaryPort)
      throw fail("A troca exige uma porta livre temporária na mesma CTO. Nenhuma gravação foi enviada.");
    await this.box(plan);
    await this.collision(plan);
    return this.response(await this.store.prepare({ userId, state: "prepared", plan }), plan);
  }
  private async saved(userId: number, token: string, boxId: number) {
    const operation = await this.store.get(token, userId);
    if (operation.plan.kind !== "port-maneuver" || operation.plan.boxId !== boxId) throw fail("Operação não pertence a esta CTO.");
    return { operation, plan: operation.plan as unknown as Plan };
  }
  async status(userId: number, token: string, boxId: number) {
    const { operation, plan } = await this.saved(userId, token, boxId);
    if (["partial", "unknown"].includes(operation.state)) {
      // Resolve a lost response by reading all final bindings; never replay an uncertain PUT.
      const current: PortRecord[] = [];
      for (const r of plan.target) current.push(record(r.kind, await this.apiRecord(r)));
      if (plan.target.every((r, i) => current[i]?.boxId === r.boxId && current[i]?.port === r.port)) {
        await this.box(plan);
        await this.collision(plan);
        operation.state = "success";
        operation.result = {
          state: "success",
          message: "As portas revisadas dos logins e ONUs foram confirmadas em uma nova consulta ao IXC.",
          onuId: null,
          step: "verified-after-reconnect",
        };
        await this.store.finish(token, operation);
        await this.store.release(token, this.keys(plan)).catch(() => {});
      }
    }
    return { ...this.response(token, plan), state: operation.state, result: operation.result ?? null };
  }
  async prepareRecovery(userId: number, token: string, boxId: number) {
    const { operation, plan } = await this.saved(userId, token, boxId);
    if (!["partial", "unknown", "processing"].includes(operation.state) && !(plan.mode === "restore" && operation.state === "rejected"))
      throw fail("Esta operação não precisa de recuperação.");
    const busy = await this.store.blockage(this.keys(plan), userId);
    if (busy) throw fail(`A operação ainda está reservada. Aguarde ${busy.retryAfterSeconds ?? 180} segundos e consulte novamente.`);
    await this.box(plan);
    const before: PortRecord[] = [];
    const allowed = new Set([
      0,
      ...(plan.temporaryPort ? [plan.temporaryPort] : []),
      ...plan.original.map((r) => r.port),
      ...plan.target.map((r) => r.port),
    ]);
    for (const r of plan.original) {
      const current = record(r.kind, await this.apiRecord(r));
      if (current.boxId !== plan.boxId || !allowed.has(current.port))
        throw fail("O cadastro foi movido para fora da manobra. A recuperação precisa ser conferida no IXC.");
      before.push(current);
    }
    const recovery: Plan = {
      ...plan,
      mode: "restore",
      before,
      target: plan.original,
      temporaryPort: null,
      logins: plan.logins.map((r) => ({
        ...r,
        fromPort: before.find((b) => b.kind === "login" && b.id === r.id)!.port,
        toPort: plan.original.find((b) => b.kind === "login" && b.id === r.id)!.port,
      })),
    };
    const options = await this.options(boxId);
    recovery.temporaryPort = options.ports.find((p) => p.status === "free" && !plan.original.some((r) => r.port === p.port))?.port ?? null;
    if (!this.schedule(recovery).some((movement) => movement.label === "move-to-temporary-port")) recovery.temporaryPort = null;
    await this.collision(recovery);
    return this.response(await this.store.prepare({ userId, state: "prepared", plan: recovery }), recovery);
  }
  private schedule(plan: Plan) {
    const current = plan.before.map((r) => ({ ...r }));
    const moves: { loginId: number; targets: PortRecord[]; label: string }[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const pending = plan.logins.filter((l) =>
        plan.target.some((t) => t.loginId === l.id && current.find((r) => recordKey(r) === recordKey(t))?.port !== t.port)
      );
      if (!pending.length) return moves;
      const next = pending.find((l) =>
        plan.target
          .filter((r) => r.loginId === l.id)
          .every((target) => !current.some((r) => r.loginId !== l.id && r.port > 0 && r.port === target.port))
      );
      const login = next ?? pending[0]!;
      if (!next && (!plan.temporaryPort || current.some((r) => r.port === plan.temporaryPort)))
        throw fail("A troca ou restauração precisa de uma porta livre temporária. Nenhuma próxima gravação será enviada.");
      const targets = plan.target.filter((r) => r.loginId === login.id).map((r) => ({ ...r, port: next ? r.port : plan.temporaryPort! }));
      if (targets.some((r) => r.kind === "onu" && r.port <= 0))
        throw fail("A ONU precisa de uma porta válida; a operação não usará porta 0.");
      moves.push({
        loginId: login.id,
        targets,
        label: next ? (plan.mode === "restore" ? "restore-original-port" : "move-to-destination") : "move-to-temporary-port",
      });
      for (const target of targets) current.find((r) => recordKey(r) === recordKey(target))!.port = target.port;
    }
    throw fail("Não foi possível ordenar a manobra com segurança.");
  }
  async execute(userId: number, token: string, boxId: number, checkAccess: () => Promise<void>) {
    await checkAccess();
    const { operation, plan } = await this.saved(userId, token, boxId),
      keys = this.keys(plan);
    const claim = await this.store.claim(token, userId, keys);
    if (!claim.claimed) return { state: claim.operation.state, result: claim.operation.result ?? null };
    let changed = false,
      uncertain = false,
      step = "validation";
    const expected = plan.before.map((r) => ({ ...r }));
    const checkpoint = async () =>
      this.store.finish(token, {
        ...operation,
        state: "processing",
        result: { state: "processing", message: "Manobra em andamento. Consulte o resultado antes de repetir.", onuId: null, step },
      });
    let result: NonNullable<OnuOperation["result"]>;
    try {
      await this.box(plan);
      await this.collision(plan);
      const validateAll = async () => {
        for (const r of expected) {
          const current = record(r.kind, await this.apiRecord(r));
          if (current.boxId !== r.boxId || current.port !== r.port)
            throw fail("Uma porta mudou desde a revisão. Nenhum próximo passo será enviado.");
        }
      };
      await validateAll();
      const move = async (loginId: number, targets: PortRecord[], label: string) => {
        step = label;
        await checkAccess();
        await this.store.renew(token, keys);
        await this.box(plan);
        await this.collision(plan);
        await validateAll();
        for (const wanted of targets.filter((r) => r.loginId === loginId)) {
          const r = expected.find((e) => recordKey(e) === recordKey(wanted))!,
            current = await this.apiRecord(r);
          const currentPort = num(current[portKey(r.kind)]);
          // IXC may mirror the login's port onto its ONU. Accept only this exact planned side effect.
          if (num(current.id_caixa_ftth) !== r.boxId || (currentPort !== r.port && currentPort !== wanted.port))
            throw fail("O vínculo mudou durante a gravação. Confira a operação antes de continuar.");
          if (currentPort !== wanted.port) {
            await checkAccess();
            await this.store.renew(token, keys);
            await this.collision(plan);
            const payload = { ...fields(r.kind, current), id_caixa_ftth: String(wanted.boxId), [portKey(r.kind)]: String(wanted.port) };
            uncertain = true;
            if (r.kind === "login") await this.api.updateLogin(r.id, payload);
            else await this.api.update(r.id, payload);
            changed = true;
            const verified = record(r.kind, await this.apiRecord(r));
            if (verified.boxId !== wanted.boxId || verified.port !== wanted.port)
              throw fail("O IXC não confirmou a porta gravada. Consulte antes de repetir.");
            uncertain = false;
          }
          r.port = wanted.port;
          r.boxId = wanted.boxId;
          await checkpoint();
        }
      };
      for (const movement of this.schedule(plan)) await move(movement.loginId, movement.targets, movement.label);
      await validateAll();
      await this.collision(plan);
      result = {
        state: "success",
        message:
          plan.mode === "restore"
            ? "Portas originais restauradas e conferidas no IXC."
            : plan.loginOnly
              ? "Porta do login atualizada e conferida no IXC. O cadastro da ONU não foi alterado."
              : "Manobra concluída. As portas dos logins e ONUs vinculadas foram conferidas no IXC.",
        onuId: null,
        step: "complete",
      };
    } catch (error) {
      if (error instanceof OnuCommandError && !error.uncertain) uncertain = false;
      result = {
        state: uncertain ? "unknown" : changed ? "partial" : "rejected",
        message: uncertain
          ? "O IXC não confirmou a última gravação. A manobra foi interrompida; consulte o resultado e revise a restauração antes de repetir."
          : changed
            ? `A manobra foi interrompida na etapa ${step === "move-to-temporary-port" ? "de porta temporária" : "de gravação do destino"}. Consulte as portas atuais e use Restaurar portas originais para revisar a recuperação.`
            : (error as { statusCode?: number }).statusCode
              ? (error as Error).message
              : error instanceof OnuCommandError
                ? "O IXC recusou a gravação. Confira as permissões da integração. Nenhuma porta foi alterada nesta tentativa."
                : "Não foi possível validar ou coordenar a manobra. Nenhuma gravação foi enviada.",
        onuId: null,
        step,
      };
    }
    try {
      await this.store.finish(token, { ...claim.operation, state: result.state as OnuOperation["state"], result });
    } catch {
      result = {
        ...result,
        state: "unknown",
        message: "Não foi possível registrar o resultado. Consulte as portas no IXC antes de repetir a operação.",
      };
    }
    if (result.state !== "unknown") await this.store.release(token, keys).catch(() => {});
    return { state: result.state, result };
  }
}
