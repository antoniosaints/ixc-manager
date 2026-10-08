import { createHash } from "node:crypto";
import { z } from "zod";
import { IxcReadDatabase, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { IxcOnuApi, OnuCommandError, pendingOnuDto, type OnuRow } from "../../integrations/ixc/IxcOnuApi.js";
import { OnuOperationStore, type OperationStore, type OnuOperation } from "./OnuOperationStore.js";
const id = z.coerce.number().int().positive().safe();
export const onuListQuery = z.object({
  oltId: id.optional(),
  page: id.max(100000).default(1),
  limit: z.coerce
    .number()
    .refine((n) => n === 10 || n === 25)
    .default(10),
  search: z.string().trim().max(100).default(""),
  status: z.enum(["A", "NA", "all"]).default("all"),
});
export const onuConfiguration = z
  .object({
    profileId: id,
    hardwareId: z.coerce.number().int().nonnegative().safe().default(0),
    projectId: id,
    boxId: id,
    port: id,
    loginId: id,
    contractId: id,
    vlan: z.coerce.number().int().min(1).max(4094),
    name: z.string().trim().min(1).max(100),
  })
  .strict();
export const onuPlanRequest = z
  .discriminatedUnion("action", [
    z
      .object({
        action: z.literal("authorize"),
        oltId: id,
        pendingId: z.string().min(1).max(2048).optional(),
        onuId: id.optional(),
        configuration: onuConfiguration,
      })
      .strict(),
    z.object({ action: z.literal("deauthorize"), onuId: id }).strict(),
  ])
  .superRefine((p, ctx) => {
    if (p.action === "authorize" && Number(!!p.pendingId) + Number(!!p.onuId) !== 1)
      ctx.addIssue({ code: "custom", message: "Selecione uma ONU." });
  });
export type Configuration = z.infer<typeof onuConfiguration>;
export type PlanRequest = z.infer<typeof onuPlanRequest>;
const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const text = (v: unknown) => String(v ?? "").trim();
const positive = (v: unknown) => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const normal = (v: unknown) =>
  text(v)
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
const like = (v: string) => `%${v.replace(/[!%_]/g, (c) => `!${c}`)}%`;
const identityKeys = [
  "id",
  "id_transmissor",
  "mac",
  "ponid",
  "slotno",
  "ponno",
  "onu_numero",
  "id_login",
  "id_contrato",
  "status_autorizado",
  "onu_compartilhada",
  "id_hardware",
  "id_projeto",
  "nome",
  "id_perfil",
  "id_caixa_ftth",
  "porta_ftth",
  "vlan",
];
function identity(r: OnuRow) {
  return createHash("sha256")
    .update(JSON.stringify(identityKeys.map((k) => [k, text(r[k])])))
    .digest("hex");
}
// The API PUT example is a complete form. Preserve existing editable values, never send database-only fields.
export const fiberEditableFields = [
  "id_projeto",
  "id_contrato",
  "gemport",
  "ip_gerencia",
  "login_onu_cliente",
  "senha_onu_cliente",
  "porta_telnet_onu_cliente",
  "perfil_onu_cliente",
  "script_onu_cliente",
  "senorid",
  "latitude",
  "longitude",
  "endereco_padrao_cliente",
  "id_condominio",
  "bloco",
  "apartamento",
  "cep",
  "endereco",
  "numero",
  "bairro",
  "cidade",
  "referencia",
  "complemento",
  "distancia_onu",
  "vlan_dhcp",
  "vlan_tr69",
  "vlan_iptv",
  "vlan_voip",
  "vlan_pppoe",
  "vlan_outros",
  "id_ramal",
  "id_onu_unms",
  "id_activity",
  "radpop_estrutura",
  "porta_web_onu_cliente",
  "tipo_operacao",
  "id_transmissor",
  "nome",
  "id_caixa_ftth",
  "porta_ftth",
  "id_login",
  "onu_numero",
  "service_port",
  "onu_tipo",
  "ponid",
  "mac",
  "comandos",
  "sinal_rx",
  "sinal_tx",
  "temperatura",
  "voltagem",
  "data_sinal",
  "id_perfil",
  "slotno",
  "ponno",
  "tipo_autenticacao",
  "versao",
  "vlan",
  "causa_ultima_queda",
  "id_hardware",
  "id_radpop_radio_porta",
  "onu_rede_neutra",
];
function fiberDto(r: OnuRow) {
  return {
    id: positive(r.id),
    oltId: positive(r.id_transmissor),
    name: text(r.nome),
    serial: text(r.mac),
    pon: text(r.ponid),
    model: text(r.onu_tipo),
    authorization: text(r.status_autorizado),
    loginId: positive(r.id_login),
    contractId: positive(r.id_contrato),
    profileId: positive(r.id_perfil),
    hardwareId: positive(r.id_hardware),
    projectId: positive(r.id_projeto),
    boxId: positive(r.id_caixa_ftth),
    port: positive(r.porta_ftth),
    vlan: positive(r.vlan),
  };
}
export class OnuService {
  constructor(
    private readonly db: Pick<IxcReadDatabase, "withSnapshot"> = new IxcReadDatabase(),
    private readonly api: Pick<IxcOnuApi, "pending" | "record" | "create" | "update" | "provision" | "deauthorize"> = new IxcOnuApi(),
    private readonly store: OperationStore = new OnuOperationStore()
  ) {}
  async close() {
    await this.store.close();
  }
  private select(session: IxcReadSession, name: string, sql: string, params: (string | number | null)[] = []) {
    return session.select<OnuRow>({ name, sql, params, timeoutSeconds: 5 });
  }
  async options(oltId?: number, projectId?: number) {
    return this.db.withSnapshot(async (s) => {
      const olts = await this.select(
        s,
        "onu-olts",
        "SELECT id,descricao name,fabricante_modelo manufacturer,perfil_fibra_padrao defaultProfileId FROM radpop_radio o WHERE ativo='S' AND (EXISTS (SELECT 1 FROM radpop_radio_cliente_fibra f WHERE f.id_transmissor=o.id) OR EXISTS (SELECT 1 FROM radpop_radio_cliente_fibra_perfil p WHERE p.fabricante_modelo=o.fabricante_modelo) OR EXISTS (SELECT 1 FROM rad_caixa_ftth b WHERE b.id_transmissor=o.id)) ORDER BY descricao,id LIMIT 500"
      );
      const olt = oltId ? olts.find((r) => Number(r.id) === oltId) : undefined;
      if (oltId && !olt) throw fail("OLT inativa ou não encontrada.", 404);
      const profiles = await this.select(
        s,
        "onu-profiles",
        `SELECT id,nome name,fabricante_modelo manufacturer FROM radpop_radio_cliente_fibra_perfil ${olt ? "WHERE fabricante_modelo=?" : ""} ORDER BY nome,id LIMIT 500`,
        olt ? [text(olt.manufacturer)] : []
      );
      const hardware = await this.select(
        s,
        "onu-hardware",
        "SELECT id,hardware name FROM rad_hardware WHERE ativo='S' AND tipo='F' ORDER BY hardware,id LIMIT 500"
      );
      const projects = await this.select(
        s,
        "onu-projects",
        "SELECT id,nome name FROM df_projeto WHERE status='A' ORDER BY nome,id LIMIT 500"
      );
      const boxes = oltId
        ? await this.select(
            s,
            "onu-boxes",
            `SELECT id,descricao name,id_projeto projectId,capacidade capacity FROM rad_caixa_ftth WHERE status='A' AND id_transmissor=? ${projectId ? "AND id_projeto=?" : ""} ORDER BY descricao,id LIMIT 2001`,
            [oltId, ...(projectId ? [projectId] : [])]
          )
        : [];
      if (boxes.length > 2000) throw fail("Selecione um projeto para restringir as caixas.", 422);
      return { olts, profiles, hardware, projects, boxes, queriedAt: new Date().toISOString() };
    });
  }
  async pending(q: z.infer<typeof onuListQuery>) {
    const rows = (await this.api.pending(q.oltId)).map(pendingOnuDto);
    const filtered = rows.filter(
      (r) =>
        (!q.oltId || r.oltId === q.oltId) &&
        (!q.search || [r.serial, r.model, r.pon].some((v) => v.toLowerCase().includes(q.search.toLowerCase())))
    );
    const options = await this.options();
    const names = new Map(options.olts.map((r) => [Number(r.id), text(r.name)]));
    return {
      items: filtered
        .slice((q.page - 1) * q.limit, q.page * q.limit)
        .map((r) => ({ ...r, oltName: names.get(r.oltId) ?? `OLT #${r.oltId}`, canAuthorize: names.has(r.oltId) })),
      total: filtered.length,
      page: q.page,
      limit: q.limit,
      queriedAt: new Date().toISOString(),
    };
  }
  async registered(q: z.infer<typeof onuListQuery>) {
    return this.db.withSnapshot(async (s) => {
      const where = `WHERE 1=1 ${q.oltId ? "AND f.id_transmissor=?" : ""} ${q.status !== "all" ? "AND f.status_autorizado=?" : ""} ${q.search ? "AND (f.nome LIKE ? ESCAPE '!' OR f.mac LIKE ? ESCAPE '!' OR r.login LIKE ? ESCAPE '!')" : ""}`;
      const params = [
        ...(q.oltId ? [q.oltId] : []),
        ...(q.status !== "all" ? [q.status] : []),
        ...(q.search ? [like(q.search), like(q.search), like(q.search)] : []),
      ];
      const base =
        "FROM radpop_radio_cliente_fibra f LEFT JOIN radpop_radio o ON o.id=f.id_transmissor LEFT JOIN radusuarios r ON r.id=f.id_login";
      const [count] = await this.select(s, "onu-count", `SELECT COUNT(*) total ${base} ${where}`, params);
      const rows = await this.select(
        s,
        "onu-list",
        `SELECT f.id,f.id_transmissor,f.nome,f.mac,f.ponid,f.onu_tipo,f.status_autorizado,f.id_login,f.id_contrato,f.id_perfil,f.id_hardware,f.id_projeto,f.id_caixa_ftth,f.porta_ftth,f.vlan,o.descricao oltName,r.login login ${base} ${where} ORDER BY f.id DESC LIMIT ? OFFSET ?`,
        [...params, q.limit, (q.page - 1) * q.limit]
      );
      return {
        items: rows.map((r) => ({ ...fiberDto(r), oltName: text(r.oltName), login: text(r.login) })),
        total: Number(count?.total ?? 0),
        page: q.page,
        limit: q.limit,
        queriedAt: new Date().toISOString(),
      };
    });
  }
  async detail(onuId: number) {
    const r = await this.fiberRecord(onuId);
    const [names] = await this.db.withSnapshot((s) =>
      this.select(
        s,
        "onu-detail-names",
        `SELECT o.descricao oltName,p.nome profileName,h.hardware hardwareName,z.nome projectName,b.descricao boxName,l.login login,ct.contrato contractName
      FROM radpop_radio_cliente_fibra f LEFT JOIN radpop_radio o ON o.id=f.id_transmissor
      LEFT JOIN radpop_radio_cliente_fibra_perfil p ON p.id=f.id_perfil LEFT JOIN rad_hardware h ON h.id=f.id_hardware
      LEFT JOIN df_projeto z ON z.id=f.id_projeto LEFT JOIN rad_caixa_ftth b ON b.id=f.id_caixa_ftth
      LEFT JOIN radusuarios l ON l.id=f.id_login LEFT JOIN cliente_contrato ct ON ct.id=f.id_contrato WHERE f.id=?`,
        [onuId]
      )
    );
    return {
      onu: {
        ...fiberDto(r),
        ...Object.fromEntries(
          ["oltName", "profileName", "hardwareName", "projectName", "boxName", "login", "contractName"].map((k) => [k, text(names?.[k])])
        ),
      },
      queriedAt: new Date().toISOString(),
    };
  }
  async contracts(search: string) {
    const numeric = /^\d+$/.test(search);
    if (!numeric && search.length < 3) throw fail("Busque pelo ID do contrato ou digite pelo menos 3 caracteres.", 400);
    const document = search.replace(/\D/g, "");
    return this.db.withSnapshot(async (s) => ({
      items: await this.select(
        s,
        "onu-contract-search",
        `SELECT ct.id,ct.contrato name,c.id customerId,c.razao customerName FROM cliente_contrato ct JOIN cliente c ON c.id=ct.id_cliente WHERE ct.status='A' AND (ct.id=? OR ct.contrato LIKE ? ESCAPE '!' OR c.razao LIKE ? ESCAPE '!' OR (?<>'' AND REPLACE(REPLACE(REPLACE(c.cnpj_cpf,'.',''),'-',''),'/','')=?)) ORDER BY ct.id DESC LIMIT 31`,
        [
          numeric && id.safeParse(search).success ? Number(search) : 0,
          like(search),
          like(search),
          [11, 14].includes(document.length) ? document : "",
          [11, 14].includes(document.length) ? document : "",
        ]
      ),
    }));
  }
  async contractLogins(contractId: number, search: string) {
    return this.db.withSnapshot(async (s) => ({
      items: await this.select(
        s,
        "onu-contract-logins",
        `SELECT r.id,r.login,r.id_cliente customerId,c.razao customerName,ct.id contractId,ct.contrato contractName,r.id_caixa_ftth boxId,r.ftth_porta port FROM radusuarios r JOIN cliente c ON c.id=r.id_cliente JOIN cliente_contrato ct ON ct.id=r.id_contrato AND ct.id_cliente=r.id_cliente WHERE ct.id=? AND ct.status='A' AND r.ativo='S' AND (r.login LIKE ? ESCAPE '!' OR r.id=?) ORDER BY r.id DESC LIMIT 101`,
        [contractId, like(search), /^\d+$/.test(search) && id.safeParse(search).success ? Number(search) : 0]
      ),
    }));
  }
  async profile(profileId: number, oltId: number) {
    const olt = await this.api.record("radpop_radio", oltId);
    const profile = await this.api.record("radpop_radio_cliente_fibra_perfil", profileId);
    if (text(olt.ativo) !== "S" || text(profile.fabricante_modelo) !== text(olt.fabricante_modelo) || !text(profile.comando))
      throw fail("Perfil incompatível com a OLT ou sem script.");
    return { id: profileId, name: text(profile.nome), script: String(profile.comando) };
  }
  async logins(search: string, kind: "login" | "customer" | "document" | "contractId" | "loginId") {
    if (search.length < 3 && !["contractId", "loginId"].includes(kind)) throw fail("Digite pelo menos 3 caracteres.", 400);
    if (["contractId", "loginId"].includes(kind) && !id.safeParse(search).success) throw fail("Informe um ID positivo.", 400);
    if (kind === "document" && (!/^[\d.\-/\s]+$/.test(search) || ![11, 14].includes(search.replace(/\D/g, "").length)))
      throw fail("Informe o CPF ou CNPJ completo.", 400);
    const field = {
      login: "r.login",
      customer: "c.razao",
      document: "REPLACE(REPLACE(REPLACE(c.cnpj_cpf,'.',''),'-',''),'/','')",
      contractId: "ct.id",
      loginId: "r.id",
    }[kind];
    const exact = ["document", "contractId", "loginId"].includes(kind);
    return this.db.withSnapshot(async (s) => ({
      items: await this.select(
        s,
        "onu-login-search",
        `SELECT r.id,r.login,r.id_cliente customerId,c.razao customerName,ct.id contractId,ct.contrato contractName,r.id_caixa_ftth boxId,r.ftth_porta port FROM radusuarios r JOIN cliente c ON c.id=r.id_cliente JOIN cliente_contrato ct ON ct.id=r.id_contrato AND ct.id_cliente=r.id_cliente WHERE r.ativo='S' AND ct.status='A' AND ${field} ${exact ? "=" : "LIKE"} ? ${exact ? "" : "ESCAPE '!'"} ORDER BY r.id DESC LIMIT 31`,
        [kind === "document" ? search.replace(/\D/g, "") : exact ? Number(search) : like(search)]
      ),
    }));
  }
  async ports(boxId: number, loginId?: number, onuId?: number) {
    return this.db.withSnapshot(async (s) => {
      const [box] = await this.select(s, "onu-port-box", "SELECT capacidade FROM rad_caixa_ftth WHERE id=? AND status='A'", [boxId]);
      if (!box) throw fail("Caixa indisponível.", 404);
      const capacity = Number(box.capacidade);
      if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 512) throw fail("Capacidade da caixa inválida.", 422);
      const occupied = await this.select(
        s,
        "onu-port-occupancy",
        `SELECT DISTINCT ftth_porta port FROM radusuarios WHERE id_caixa_ftth=? AND ativo='S' AND id<>? UNION SELECT DISTINCT porta_ftth port FROM radpop_radio_cliente_fibra WHERE id_caixa_ftth=? AND id<>? AND (status_autorizado='A' OR id_login>0)`,
        [boxId, loginId ?? 0, boxId, onuId ?? 0]
      );
      const used = new Set(occupied.map((r) => Number(r.port)));
      return { ports: Array.from({ length: capacity }, (_, i) => ({ port: i + 1, occupied: used.has(i + 1) })) };
    });
  }
  private async fiberRecord(onuId: number): Promise<OnuRow> {
    const record = await this.api.record("radpop_radio_cliente_fibra", onuId);
    const [state] = await this.db.withSnapshot((s) =>
      this.select(
        s,
        "onu-authorization-state",
        "SELECT id,id_transmissor,mac,ponid,id_login,id_contrato,status_autorizado,onu_compartilhada FROM radpop_radio_cliente_fibra WHERE id=?",
        [onuId]
      )
    );
    if (!state) throw fail("Cadastro da ONU não encontrado.", 404);
    if (
      ["id", "id_transmissor", "id_login", "id_contrato"].some((k) => Number(record[k] ?? 0) !== Number(state[k] ?? 0)) ||
      normal(record.mac) !== normal(state.mac) ||
      text(record.ponid) !== text(state.ponid)
    )
      throw fail("API e banco retornaram vínculos diferentes para a ONU. Atualize e confira o IXC.");
    return { ...record, status_autorizado: state.status_autorizado, onu_compartilhada: state.onu_compartilhada };
  }
  private async validate(input: PlanRequest, freshlyCreated = false) {
    if (input.action === "deauthorize") {
      const record = await this.fiberRecord(input.onuId);
      if (text(record.onu_compartilhada) === "S") throw fail("ONU compartilhada: desautorize pelo IXC após conferir todos os vínculos.");
      if (text(record.status_autorizado) !== "A")
        throw fail("A ONU não está marcada como autorizada. Confira no IXC antes de desautorizar.");
      if (!positive(record.id_transmissor) || !text(record.mac) || !text(record.ponid))
        throw fail("Identificação da ONU incompleta. Confira no IXC.");
      const olt = await this.api.record("radpop_radio", Number(record.id_transmissor));
      if (text(olt.ativo) !== "S") throw fail("OLT inativa ou incompatível.");
      return {
        oltId: Number(record.id_transmissor),
        record,
        identity: identity(record),
        review: { action: input.action, onu: fiberDto(record), oltName: text(olt.descricao) },
      };
    }
    const config = input.configuration,
      olt = await this.api.record("radpop_radio", input.oltId),
      profile = await this.api.record("radpop_radio_cliente_fibra_perfil", config.profileId);
    if (text(olt.ativo) !== "S") throw fail("OLT inativa ou incompatível.");
    if (text(profile.fabricante_modelo) !== text(olt.fabricante_modelo) || !text(profile.comando))
      throw fail("Perfil incompatível com a OLT ou sem script.");
    const login = await this.api.record("radusuarios", config.loginId),
      contract = await this.api.record("cliente_contrato", config.contractId);
    if (
      text(login.ativo) !== "S" ||
      text(contract.status) !== "A" ||
      Number(login.id_contrato) !== config.contractId ||
      Number(login.id_cliente) !== Number(contract.id_cliente)
    )
      throw fail("Login e contrato devem estar ativos e pertencer ao mesmo cliente.");
    let record: OnuRow | undefined, sourceIdentity: string, serial: string, pon: string, model: string;
    if (input.pendingId) {
      const pending = (await this.api.pending(input.oltId))
        .map(pendingOnuDto)
        .find((r) => r.pendingId === input.pendingId && r.oltId === input.oltId);
      if (!pending) throw fail("A ONU saiu da lista de pendências. Atualize antes de autorizar.");
      serial = pending.serial;
      pon = pending.pon;
      model = pending.model;
      sourceIdentity = createHash("sha256").update(pending.pendingId).digest("hex");
    } else {
      record = await this.fiberRecord(input.onuId!);
      if (text(record.onu_compartilhada) === "S") throw fail("ONU compartilhada: autorize pelo IXC após conferir todos os vínculos.");
      if (
        (text(record.status_autorizado) !== "NA" && !(freshlyCreated && !text(record.status_autorizado))) ||
        Number(record.id_transmissor) !== input.oltId
      )
        throw fail("A ONU não está disponível para autorização nesta OLT.");
      serial = text(record.mac);
      pon = text(record.ponid);
      model = text(record.onu_tipo);
      sourceIdentity = identity(record);
    }
    if (!serial || !pon) throw fail("ONU sem serial ou PON válida. Confira no IXC.");
    const details = await this.db.withSnapshot(async (s) => {
      const [box] = await this.select(
        s,
        "onu-validate-box",
        "SELECT descricao name,id_transmissor oltId,id_projeto projectId,capacidade FROM rad_caixa_ftth WHERE id=? AND status='A'",
        [config.boxId]
      );
      const [project] = await this.select(s, "onu-validate-project", "SELECT nome name FROM df_projeto WHERE id=? AND status='A'", [
        config.projectId,
      ]);
      const [hardware] = config.hardwareId
        ? await this.select(s, "onu-validate-hardware", "SELECT hardware name FROM rad_hardware WHERE id=? AND tipo='F' AND ativo='S'", [
            config.hardwareId,
          ])
        : [];
      if (
        !box ||
        Number(box.oltId) !== input.oltId ||
        Number(box.projectId) !== config.projectId ||
        !project ||
        (config.hardwareId > 0 && !hardware)
      )
        throw fail("Confira OLT, projeto, caixa e hardware selecionados.");
      if (config.port > Number(box.capacidade) || Number(box.capacidade) < 1) throw fail("Porta fora da capacidade da caixa.");
      const collisions = await this.select(
        s,
        "onu-validate-port",
        `SELECT id FROM radusuarios WHERE ativo='S' AND id_caixa_ftth=? AND ftth_porta=? AND id<>? UNION ALL SELECT id FROM radpop_radio_cliente_fibra WHERE id_caixa_ftth=? AND porta_ftth=? AND id<>? AND (status_autorizado='A' OR id_login>0) LIMIT 1`,
        [config.boxId, config.port, config.loginId, config.boxId, config.port, input.onuId ?? 0]
      );
      if (collisions.length) throw fail("A porta selecionada está ocupada por outro login ou ONU.");
      const linked = await this.select(
        s,
        "onu-validate-login",
        "SELECT id FROM radpop_radio_cliente_fibra WHERE id_login=? AND id<>? AND status_autorizado='A' LIMIT 1",
        [config.loginId, input.onuId ?? 0]
      );
      if (linked.length) throw fail("Este login já possui outra ONU autorizada.");
      const serialRows = await this.select(
        s,
        "onu-validate-serial",
        "SELECT id,mac FROM radpop_radio_cliente_fibra WHERE id_transmissor=? AND id<>? AND status_autorizado='A'",
        [input.oltId, input.onuId ?? 0]
      );
      if (serialRows.some((r) => normal(r.mac) === normal(serial))) throw fail("Este serial já está autorizado nesta OLT.");
      return { box, project, hardware };
    });
    return {
      oltId: input.oltId,
      record,
      identity: sourceIdentity,
      profile,
      review: {
        action: input.action,
        onuId: input.onuId ?? null,
        serial,
        pon,
        model,
        oltName: text(olt.descricao),
        profileId: config.profileId,
        hardwareId: config.hardwareId || null,
        projectId: config.projectId,
        boxId: config.boxId,
        loginId: config.loginId,
        oltId: input.oltId,
        profileName: text(profile.nome),
        hardwareName: details.hardware ? text(details.hardware.name) : "Não selecionado",
        projectName: text(details.project.name),
        boxName: text(details.box.name),
        port: config.port,
        vlan: config.vlan,
        login: text(login.login),
        contractId: config.contractId,
        contractName: text(contract.contrato),
        name: config.name,
      },
    };
  }
  private signature(checked: Awaited<ReturnType<OnuService["validate"]>>) {
    return createHash("sha256")
      .update(JSON.stringify({ review: checked.review, script: checked.profile?.comando ?? null }))
      .digest("hex");
  }
  async prepare(userId: number, input: PlanRequest) {
    const checked = await this.validate(input);
    const plan = { input, oltId: checked.oltId, identity: checked.identity, signature: this.signature(checked), review: checked.review };
    const token = await this.store.prepare({ userId, state: "prepared", plan });
    return {
      token,
      review: checked.review,
      expiresInSeconds: 300,
      ...(checked.profile ? { profileScript: String(checked.profile.comando) } : {}),
    };
  }
  async status(userId: number, token: string) {
    const op = await this.store.get(token, userId);
    const input = onuPlanRequest.parse(op.plan.input);
    const blockage = op.state === "prepared" ? await this.store.blockage(this.operationKeys(op.plan, input), userId) : null;
    return { state: op.state, result: op.result ?? null, ...(blockage ? { blockage } : {}) };
  }
  private operationKeys(plan: Record<string, unknown>, input: PlanRequest) {
    return [`olt:${plan.oltId}`, ...(input.action === "authorize" ? [`login:${input.configuration.loginId}`] : [])];
  }
  async execute(userId: number, token: string, checkAccess: () => Promise<void>) {
    const saved = await this.store.get(token, userId),
      input = onuPlanRequest.parse(saved.plan.input);
    const keys = this.operationKeys(saved.plan, input);
    const claim = await this.store.claim(token, userId, keys);
    if (!claim.claimed) return { state: claim.operation.state, result: claim.operation.result ?? null };
    let step = "validation",
      onuId = input.action === "deauthorize" ? input.onuId : (input.onuId ?? null),
      mutated = false,
      lockHealthy = true;
    const renewal = setInterval(() => {
      void this.store.renew(token, keys).catch(() => {
        lockHealthy = false;
      });
    }, 30000);
    renewal.unref();
    const beforeCommand = async () => {
      await checkAccess();
      if (!lockHealthy) throw fail("Coordenação de operação perdida. Confira o IXC.");
      await this.store.renew(token, keys);
    };
    let result: NonNullable<OnuOperation["result"]>;
    try {
      const checked = await this.validate(input);
      if (checked.identity !== saved.plan.identity || this.signature(checked) !== saved.plan.signature)
        throw fail("Os dados da ONU mudaram desde a revisão. Prepare novamente.");
      if (input.action === "deauthorize") {
        step = "deauthorization";
        await beforeCommand();
        mutated = true;
        await this.api.deauthorize(input.onuId);
      } else {
        let record = checked.record;
        if (input.pendingId) {
          step = "creation";
          await beforeCommand();
          mutated = true;
          onuId = await this.api.create(input.pendingId);
          record = await this.api.record("radpop_radio_cliente_fibra", onuId);
          if (
            Number(record.id_transmissor) !== input.oltId ||
            normal(record.mac) !== normal(checked.review.serial) ||
            text(record.ponid) !== text(checked.review.pon)
          )
            throw fail("O cadastro criado não corresponde à ONU revisada. Confira no IXC.");
        }
        if (!record || !onuId) throw fail("Cadastro de ONU indisponível.");
        const unchanged = await this.fiberRecord(onuId);
        if (
          (text(unchanged.status_autorizado) !== "NA" && !(input.pendingId && !text(unchanged.status_autorizado))) ||
          text(unchanged.onu_compartilhada) === "S" ||
          identity(unchanged) !==
            identity({ ...record, status_autorizado: unchanged.status_autorizado, onu_compartilhada: unchanged.onu_compartilhada })
        )
          throw fail("O cadastro da ONU mudou durante a operação. Confira no IXC.");
        record = unchanged;
        const cfg = input.configuration,
          fields: OnuRow = Object.fromEntries(fiberEditableFields.map((k) => [k, record![k] ?? ""]));
        Object.assign(fields, {
          id_perfil: String(cfg.profileId),
          id_hardware: String(cfg.hardwareId),
          id_projeto: String(cfg.projectId),
          id_caixa_ftth: String(cfg.boxId),
          porta_ftth: String(cfg.port),
          id_login: String(cfg.loginId),
          id_contrato: String(cfg.contractId),
          vlan: String(cfg.vlan),
          nome: cfg.name,
          comandos: checked.profile!.comando,
        });
        step = "configuration";
        await beforeCommand();
        mutated = true;
        await this.api.update(onuId, fields);
        // Read back configuration before provisioning. A successful PUT alone does not authorize the ONU.
        const current = await this.api.record("radpop_radio_cliente_fibra", onuId);
        for (const key of [
          "id_perfil",
          "id_hardware",
          "id_projeto",
          "id_caixa_ftth",
          "porta_ftth",
          "id_login",
          "id_contrato",
          "vlan",
          "nome",
          "id_transmissor",
          "mac",
          "ponid",
        ])
          if (text(current[key]) !== text(fields[key]))
            throw fail("O IXC não confirmou a configuração salva. Confira o cadastro antes de gravar na OLT.");
        step = "provisioning";
        const ready = await this.validate({ ...input, pendingId: undefined, onuId }, !!input.pendingId);
        if (
          normal(ready.review.serial) !== normal(checked.review.serial) ||
          text(ready.review.pon) !== text(checked.review.pon) ||
          text(ready.profile?.comando) !== text(checked.profile?.comando)
        )
          throw fail("Identificação ou perfil mudou durante a configuração. Confira o IXC antes de gravar.");
        for (const key of [
          "id_perfil",
          "id_hardware",
          "id_projeto",
          "id_caixa_ftth",
          "porta_ftth",
          "id_login",
          "id_contrato",
          "vlan",
          "nome",
        ])
          if (text(ready.record?.[key]) !== text(fields[key])) throw fail("Os vínculos da ONU mudaram antes de gravar. Confira o IXC.");
        await beforeCommand();
        await this.api.provision(onuId);
      }
      result = {
        state: "success",
        message:
          input.action === "deauthorize"
            ? "IXC confirmou a desautorização. O cadastro da ONU foi preservado."
            : "IXC confirmou a gravação no dispositivo. Atualize a conexão e confira a autenticação do login.",
        onuId,
        step,
      };
    } catch (error) {
      result = {
        state: error instanceof OnuCommandError && error.uncertain ? "unknown" : mutated ? "partial" : "rejected",
        message:
          error instanceof OnuCommandError
            ? error.message
            : error instanceof Error && (error as { statusCode?: number }).statusCode
              ? `${error.message}${mutated ? " Confira o cadastro no IXC antes de continuar." : " Nenhum comando foi enviado."}`
              : mutated
                ? "A operação ficou incompleta. Confira o cadastro e o equipamento no IXC antes de continuar."
                : "Não foi possível validar a operação. Nenhum comando foi enviado.",
        onuId,
        step,
      };
    } finally {
      clearInterval(renewal);
    }
    try {
      await this.store.finish(token, { ...claim.operation, state: result.state as OnuOperation["state"], result });
    } catch {
      result = {
        ...result,
        state: "unknown",
        message: "Não foi possível registrar a confirmação da operação. Confira o IXC; não repita o comando.",
      };
    }
    // Keep an uncertain operation locked until the safety lease expires; never auto-rollback or retry.
    if (result.state !== "unknown") await this.store.release(token, keys).catch(() => {});
    return { state: result.state, result };
  }
}
