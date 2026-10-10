import { z } from "zod";
import { IxcReadDatabase, type IxcReadQuery, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { mapDate } from "../../integrations/ixc/database/maps/valueMappers.js";

const optionalId = z.coerce.number().int().nonnegative().safe().default(0);
export const supportContractsQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce
      .number()
      .refine((n) => n === 10 || n === 25)
      .default(10),
    status: z.enum(["all", "A", "I", "P", "N", "D"]).default("A"),
    access: z.enum(["all", "A", "CA", "CM", "FA", "AA", "D", "suspended"]).default("all"),
    branchId: optionalId,
    planId: optionalId,
    searchBy: z.enum(["customer", "id", "customerId", "document", "login", "contract"]).default("customer"),
    search: z.string().trim().max(120).default(""),
  })
  .superRefine((q, ctx) => {
    if (!q.search) return;
    if (["id", "customerId"].includes(q.searchBy) && (!/^[1-9]\d*$/.test(q.search) || !Number.isSafeInteger(Number(q.search))))
      ctx.addIssue({ code: "custom", message: "Informe um ID válido", path: ["search"] });
    if (["customer", "contract", "login"].includes(q.searchBy) && q.search.length < 3)
      ctx.addIssue({ code: "custom", message: "Digite pelo menos 3 caracteres", path: ["search"] });
    if (q.searchBy === "document" && (!/^[\d.\-/\s]+$/.test(q.search) || ![11, 14].includes(q.search.replace(/\D/g, "").length)))
      ctx.addIssue({ code: "custom", message: "Informe o CPF ou CNPJ completo", path: ["search"] });
  });
type Reader = { withSnapshot<T>(read: (session: IxcReadSession) => Promise<T>, signal?: AbortSignal): Promise<T>; close?(): Promise<void> };
type Row = Record<string, unknown>;
const text = (v: unknown) => (v == null ? null : String(v).trim() || null);
const positive = (v: unknown) => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const flag = (v: unknown) => (v === "S" ? true : v === "N" ? false : null);
export function supportContractsSql(input: z.input<typeof supportContractsQuery>) {
  const q = supportContractsQuery.parse(input);
  const conditions: string[] = [],
    params: IxcReadQuery["params"] = [];
  const join = `FROM cliente_contrato cc LEFT JOIN cliente c ON c.id=cc.id_cliente
    LEFT JOIN vd_contratos p ON p.id=cc.id_vd_contrato
    LEFT JOIN cidade city ON city.id=CASE WHEN cc.endereco_padrao_cliente='S' THEN c.cidade ELSE cc.cidade END
    LEFT JOIN filial b ON b.id=cc.id_filial`;
  if (q.status !== "all") {
    conditions.push("cc.status=?");
    params.push(q.status);
  }
  if (q.access === "suspended") conditions.push("cc.contrato_suspenso='S'");
  else if (q.access !== "all") {
    conditions.push("cc.status_internet=? AND COALESCE(cc.contrato_suspenso,'N')<>'S'");
    params.push(q.access);
  }
  for (const [value, column] of [
    [q.branchId, "cc.id_filial"],
    [q.planId, "cc.id_vd_contrato"],
  ] as const)
    if (value) {
      conditions.push(`${column}=?`);
      params.push(value);
    }
  if (q.search) {
    if (q.searchBy === "id" || q.searchBy === "customerId") {
      conditions.push(`${q.searchBy === "id" ? "cc.id" : "cc.id_cliente"}=?`);
      params.push(Number(q.search));
    } else if (q.searchBy === "document") {
      conditions.push("REPLACE(REPLACE(REPLACE(REPLACE(c.cnpj_cpf,'.',''),'-',''),'/',''),' ','')=?");
      params.push(q.search.replace(/\D/g, ""));
    } else {
      const pattern = `%${q.search.replace(/[!%_]/g, (s) => `!${s}`)}%`;
      if (q.searchBy === "login")
        conditions.push(
          "EXISTS (SELECT 1 FROM radusuarios l WHERE l.id_contrato=cc.id AND l.id_cliente=cc.id_cliente AND l.login LIKE ? ESCAPE '!')"
        );
      else conditions.push(`${q.searchBy === "customer" ? "c.razao" : "cc.contrato"} LIKE ? ESCAPE '!'`);
      params.push(pattern);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const total: IxcReadQuery = { name: "support-contracts-count", timeoutSeconds: 8, params, sql: `SELECT COUNT(*) total ${join} ${where}` };
  const list: IxcReadQuery = {
    name: "support-contracts-list",
    timeoutSeconds: 8,
    params: [...params, q.limit, (q.page - 1) * q.limit],
    sql: `SELECT cc.id,cc.id_cliente customerId,c.razao customerName,c.ativo customerActive,c.cnpj_cpf document,
      COALESCE(NULLIF(c.telefone_celular,''),NULLIF(c.fone,'')) phone,cc.contrato name,cc.status status,
      cc.status_internet internetStatus,cc.contrato_suspenso suspended,cc.id_vd_contrato planId,p.nome planName,
      cc.id_filial branchId,COALESCE(NULLIF(b.fantasia,''),b.razao) branch,city.nome city,
      CASE WHEN cc.endereco_padrao_cliente='S' THEN c.bairro ELSE cc.bairro END neighborhood,
      cc.data_ativacao activatedAt ${join} ${where} ORDER BY c.razao,cc.id LIMIT ? OFFSET ?`,
  };
  return { q, total, list };
}
export class SupportContractsService {
  constructor(
    private readonly db: Reader = new IxcReadDatabase(),
    private readonly now = () => new Date()
  ) {}
  async close() {
    await this.db.close?.();
  }
  async list(input: z.input<typeof supportContractsQuery>, signal?: AbortSignal) {
    const { q, total, list } = supportContractsSql(input);
    return this.db.withSnapshot(async (session) => {
      const count = Number((await session.select<Row>(total))[0]?.total ?? 0);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Contagem de contratos inválida.");
      const rows = await session.select<Row>(list);
      return {
        items: rows.map((r) => ({
          id: positive(r.id)!,
          customerId: positive(r.customerId),
          customerName: text(r.customerName),
          customerActive: flag(r.customerActive),
          document: text(r.document),
          phone: text(r.phone),
          name: text(r.name),
          status: text(r.status) ?? "",
          internetStatus: text(r.internetStatus) ?? "",
          suspended: flag(r.suspended),
          planId: positive(r.planId),
          planName: text(r.planName),
          branchId: positive(r.branchId),
          branch: text(r.branch),
          city: text(r.city),
          neighborhood: text(r.neighborhood),
          activatedAt: mapDate(text(r.activatedAt)),
        })),
        total: count,
        page: q.page,
        limit: q.limit,
        queriedAt: this.now().toISOString(),
      };
    }, signal);
  }
  async filters(signal?: AbortSignal) {
    return this.db.withSnapshot(async (session) => {
      const read = async (name: string, sql: string) =>
        (await session.select<Row>({ name, sql, params: [], timeoutSeconds: 8 })).map((r) => ({
          id: positive(r.id)!,
          name: text(r.name) ?? `#${r.id}`,
        }));
      return {
        branches: await read(
          "support-contracts-branches",
          "SELECT id,COALESCE(NULLIF(fantasia,''),razao) name FROM filial ORDER BY name,id"
        ),
        plans: await read(
          "support-contracts-plans",
          "SELECT p.id,p.nome name FROM vd_contratos p WHERE EXISTS (SELECT 1 FROM cliente_contrato cc WHERE cc.id_vd_contrato=p.id) ORDER BY p.nome,p.id"
        ),
      };
    }, signal);
  }
}
