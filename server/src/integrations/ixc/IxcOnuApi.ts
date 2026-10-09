import axios, { type AxiosInstance } from "axios";
import { env } from "../../config/env.js";
import { IxcApiService } from "./IxcApiService.js";
export type OnuRow = Record<string, unknown>;
export class OnuCommandError extends Error {
  constructor(public readonly uncertain: boolean) {
    super(
      uncertain
        ? "O IXC não confirmou o resultado. Confira o equipamento antes de repetir."
        : "O IXC recusou a operação. Confira os dados e as permissões da integração."
    );
  }
}
/** Separate write boundary: fixed operations only, no retries, redirects or arbitrary paths. */
export class IxcOnuApi {
  private readonly http: AxiosInstance;
  private readonly reader = new IxcApiService({ attempts: 1, timeout: 15000 });
  constructor() {
    this.http = axios.create({
      baseURL: env.IXC_BASE_URL.replace(/\/$/, ""),
      timeout: 30000,
      maxRedirects: 0,
      headers: { Authorization: env.IXC_AUTH_TOKEN, "Content-Type": "application/json" },
    });
  }
  async pending(oltId?: number) {
    const { data } = await this.http.get<OnuRow>("/fh_onu_nao_autorizadas", {
      timeout: 20000,
      headers: { ixcsoft: "listar" },
      data: oltId ? { grid_param: JSON.stringify([{ TB: "id_olt", OP: "=", P: String(oltId) }]) } : {},
    });
    // This IXC version labels an empty discovery as an error. Only accept its exact observed empty envelope.
    const emptyMessage = String(data?.message ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
    const empty =
      data &&
      Number(data.page) === 1 &&
      ["number", "string"].includes(typeof data.total) &&
      String(data.total).trim() !== "" &&
      Number(data.total) === 0;
    if (empty && !data.rows && ((data.type === "error" && emptyMessage === "nenhuma onu disponivel") || !data.type)) return [];
    if (
      !data ||
      data.type === "error" ||
      !Array.isArray(data.rows) ||
      !Number.isSafeInteger(Number(data.total)) ||
      Number(data.total) < data.rows.length
    )
      throw new Error("Não foi possível consultar ONUs pendentes no IXC.");
    if (Number(data.total) > 1000 || data.rows.length > 1000 || Number(data.total) !== data.rows.length)
      throw Object.assign(new Error("Consulta de ONUs muito ampla ou incompleta. Selecione uma OLT."), { statusCode: 422 });
    return data.rows as OnuRow[];
  }
  async record(
    table:
      | "radpop_radio_cliente_fibra"
      | "radusuarios"
      | "cliente_contrato"
      | "radpop_radio"
      | "radpop_radio_cliente_fibra_perfil"
      | "rad_caixa_ftth",
    id: number
  ) {
    const result = await this.reader.listPage<OnuRow>(
      table,
      { qtype: `${table}.id`, query: String(id), oper: "=", sortname: `${table}.id`, rp: 1 },
      1
    );
    const row = result.rows.find((r) => Number(r.id) === id);
    if (!row) throw Object.assign(new Error("Registro não encontrado no IXC. Atualize a consulta."), { statusCode: 404 });
    return row;
  }
  private async command(method: "post" | "put", path: string, body: OnuRow) {
    let data: OnuRow;
    try {
      data = (await this.http.request<OnuRow>({ method, url: path, data: body })).data;
    } catch {
      throw new OnuCommandError(true);
    }
    if (!data || data.type !== "success") throw new OnuCommandError(data?.type !== "error");
    return data;
  }
  async create(pendingId: string) {
    const result = await this.command("post", "/fh_onu_nao_autorizadas_22396", { get_id: pendingId });
    const id = Number(result.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new OnuCommandError(true);
    return id;
  }
  update(id: number, fields: OnuRow) {
    return this.command("put", `/radpop_radio_cliente_fibra/${id}`, fields);
  }
  updateLogin(id: number, fields: OnuRow) {
    return this.command("put", `/radusuarios/${id}`, fields);
  }
  provision(id: number) {
    return this.command("post", "/botao_gravar_dispositivo_22408", { id: String(id) });
  }
  deauthorize(id: number) {
    return this.command("post", "/botao_excluir_dispositivo_22434", { id: String(id) });
  }
  disconnectLogin(id: number) {
    return this.command("post", "/desconectar_clientes", { id: String(id) });
  }
  clearLoginMac(id: number) {
    return this.command("post", "/radusuarios_25452", { get_id: String(id) });
  }
  rebootOnu(id: number) {
    return this.command("post", "/radpop_radio_cliente_fibra_26379", { id: String(id) });
  }
}
/** IXC's list uses a base64 PHP scalar array. Never evaluate/unserialize PHP or accept objects. */
export function pendingOnuDto(row: OnuRow) {
  const opaque = String(row.id ?? "");
  if (!/^[A-Za-z0-9+/=]+$/.test(opaque) || opaque.length > 2048) throw new Error("Identificador de ONU não reconhecido.");
  const value = Buffer.from(opaque, "base64").toString("utf8");
  const header = /^a:(\d+):\{/.exec(value);
  if (!header || Number(header[1]) !== 7) throw new Error("Formato de ONU pendente incompatível.");
  let offset = header[0].length;
  const fields: OnuRow = {};
  for (let i = 0; i < 7; i++) {
    const scalar = () => {
      const rest = value.slice(offset),
        n = /^i:(-?\d+);/.exec(rest);
      if (n) {
        offset += n[0].length;
        return Number(n[1]);
      }
      const s = /^s:(\d+):"([^"]*)";/.exec(rest);
      if (!s || Buffer.byteLength(s[2]!, "utf8") !== Number(s[1])) throw new Error("Formato de ONU pendente incompatível.");
      offset += s[0].length;
      return s[2]!;
    };
    const key = scalar();
    if (typeof key !== "string" || !["ID", "CHASSI", "SLOT", "PON", "MAC", "MODELO", "PONID"].includes(key) || Object.hasOwn(fields, key))
      throw new Error("Formato de ONU pendente incompatível.");
    fields[key] = scalar();
  }
  if (value.slice(offset) !== "}") throw new Error("Formato de ONU pendente incompatível.");
  const oltId = Number(fields.ID),
    serial = String(fields.MAC ?? "").trim(),
    pon = String(fields.PONID ?? "").trim();
  if (
    !Number.isSafeInteger(oltId) ||
    oltId <= 0 ||
    !/^[A-Za-z0-9:-]{4,100}$/.test(serial) ||
    !/^[\d/.-]{1,30}$/.test(pon) ||
    !["CHASSI", "SLOT", "PON"].every((k) => Number.isSafeInteger(Number(fields[k])) && Number(fields[k]) >= 0 && Number(fields[k]) < 10000)
  )
    throw new Error("Identificação de ONU pendente inválida.");
  return {
    pendingId: opaque,
    oltId,
    serial,
    pon,
    model: String(fields.MODELO ?? ""),
    chassis: Number(fields.CHASSI),
    slot: Number(fields.SLOT),
    ponNumber: Number(fields.PON),
  };
}
