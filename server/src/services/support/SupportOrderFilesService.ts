import { IxcApiService, type IxcListRequest } from "../../integrations/ixc/IxcApiService.js";
import { IxcOsFileApi, osFileContentType } from "../../integrations/ixc/IxcOsFileApi.js";
import { mapDate } from "../../integrations/ixc/database/maps/valueMappers.js";
import { casePageQuery } from "./SupportCaseService.js";
import type { z } from "zod";
type Row = Record<string, unknown>;
const id = (v: unknown) => (/^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });
export function osFileName(value: unknown, fileId: number) {
  const name = text(value)
    .split(/[\\/]/)
    .at(-1)
    ?.split("")
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join("")
    .trim()
    .slice(0, 180);
  return name && name !== "." && name !== ".." ? name : `arquivo-os-${fileId}`;
}
function fileDto(row: Row) {
  const fileId = id(row.id)!;
  const name = osFileName(row.nome_arquivo, fileId);
  return {
    id: fileId,
    name,
    description: text(row.descricao).slice(0, 500) || null,
    uploadedAt: mapDate(text(row.data_envio)) ? text(row.data_envio) : null,
    messageId: id(row.id_oss_chamado_mensagem),
    extension: /\.([a-z0-9]{1,12})$/i.exec(name)?.[1]?.toLowerCase() ?? null,
  };
}
export class SupportOrderFilesService {
  constructor(
    private readonly api: Pick<IxcApiService, "listPage"> = new IxcApiService({ attempts: 1, timeout: 15000 }),
    private readonly files: Pick<IxcOsFileApi, "content"> = new IxcOsFileApi(),
    private readonly now = () => new Date()
  ) {}
  private async read(endpoint: "su_oss_chamado" | "su_oss_chamado_arquivos", query: IxcListRequest, page: number, signal?: AbortSignal) {
    try {
      const result = await this.api.listPage<Row>(endpoint, query, page, signal);
      if (
        !Array.isArray(result.rows) ||
        !Number.isSafeInteger(result.total) ||
        result.total < 0 ||
        result.total < result.rows.length ||
        result.rows.length > (query.rp ?? 10) ||
        result.rows.some((row) => !row || typeof row !== "object" || !id(row.id)) ||
        new Set(result.rows.map((row) => id(row.id))).size !== result.rows.length
      )
        throw new Error("Invalid IXC list");
      return result;
    } catch {
      throw fail("Não foi possível consultar os arquivos da OS no IXC. Tente atualizar a consulta.", 502);
    }
  }
  private async parent(customerId: number, caseId: number, signal?: AbortSignal) {
    const result = await this.read(
      "su_oss_chamado",
      {
        qtype: "su_oss_chamado.id",
        query: String(caseId),
        oper: "=",
        sortname: "su_oss_chamado.id",
        rp: 1,
      },
      1,
      signal
    );
    if (!result.rows.some((row) => id(row.id) === caseId && id(row.id_cliente) === customerId))
      throw fail("Ordem de serviço não encontrada para este cliente.", 404);
  }
  async list(customerId: number, caseId: number, input: z.input<typeof casePageQuery>, signal?: AbortSignal) {
    const q = casePageQuery.parse(input);
    await this.parent(customerId, caseId, signal);
    const result = await this.read(
      "su_oss_chamado_arquivos",
      {
        qtype: "su_oss_chamado_arquivos.id_oss_chamado",
        query: String(caseId),
        oper: "=",
        sortname: "su_oss_chamado_arquivos.id",
        sortorder: q.order === "oldest" ? "asc" : "desc",
        rp: q.limit,
      },
      q.page,
      signal
    );
    if (result.rows.some((row) => id(row.id_oss_chamado) !== caseId))
      throw fail("Os arquivos retornados não correspondem à OS selecionada. Atualize a consulta.", 502);
    return {
      items: result.rows.map(fileDto),
      total: result.total,
      page: q.page,
      limit: q.limit,
      queriedAt: this.now().toISOString(),
      source: "ixc-api" as const,
    };
  }
  async content(customerId: number, caseId: number, fileId: number, signal?: AbortSignal) {
    await this.parent(customerId, caseId, signal);
    const result = await this.read(
      "su_oss_chamado_arquivos",
      {
        qtype: "su_oss_chamado_arquivos.id",
        query: String(fileId),
        oper: "=",
        sortname: "su_oss_chamado_arquivos.id",
        rp: 1,
      },
      1,
      signal
    );
    const row = result.rows.find((row) => id(row.id) === fileId && id(row.id_oss_chamado) === caseId);
    if (!row) throw fail("Arquivo não encontrado nesta ordem de serviço.", 404);
    const buffer = await this.files.content(fileId, signal);
    return { buffer, contentType: osFileContentType(buffer), name: osFileName(row.nome_arquivo, fileId) };
  }
}
