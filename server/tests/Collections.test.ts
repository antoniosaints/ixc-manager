import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { DatabaseSync } from "node:sqlite";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { CollectionsService, collectionsQuery, collectionsSql } from "../src/services/collections/CollectionsService.js";
import { createCollectionsPdf } from "../src/services/collections/CollectionsPdf.js";
import { collectionsRoutes } from "../src/controllers/collectionsController.js";
import {
  IxcReadDatabase,
  assertReadQuery,
  type IxcReadQuery,
  type IxcReadSession,
} from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { AuthService } from "../src/services/AuthService.js";
import { SettingsService, defaultAppearance, appearanceSchema } from "../src/services/settings/SettingsService.js";
import { effectivePermissions, rolePermissions } from "../src/config/permissions.js";

const now = () => new Date("2026-10-07T02:30:00Z"),
  today = "2026-10-06";
const row = (id = 1) => ({
  customerId: id,
  name: `Cliente de demonstração ${id}`,
  active: "S",
  fone: "(99) 99999-0000",
  whatsapp: "99999990000",
  city: "Cidade Exemplo",
  neighborhood: "Centro",
  titles: "3",
  balance: "300.30",
  overdueBalance: "200.20",
  overdueTitles: "2",
  oldestDue: "2026-09-01",
  daysLate: "35",
  senha: "NUNCA_EXPOSTA",
});
const title = {
  id: "9007199254740993",
  customerId: 1,
  contractId: 10,
  contractName: "Fibra",
  dueDate: "2026-09-01",
  issuedDate: "2026-08-01",
  amount: "120.20",
  paid: "20.10",
  balance: "100.10",
  daysLate: 35,
  awaitingConfirmation: "S",
  senha: "NUNCA_EXPOSTA",
};
function fixture(customers = [row()], titleRows = [title]) {
  const select = vi.fn(async (q: IxcReadQuery) => {
    assertReadQuery(q);
    if (q.name === "collections-customers") return customers;
    if (q.name === "collections-summary")
      return [{ customers: "1", titles: "3", balance: "300.30", customers0: "1", balance0: "100.10", customers1: "1", balance1: "200.20" }];
    if (q.name === "collections-customer-count") return [{ total: customers.length }];
    if (q.name === "collections-title-count") return [{ total: 3, balance: "300.30" }];
    if (q.name === "collections-titles") return titleRows;
    if (q.name === "collections-quality") return [{ excluded: 0 }];
    return [];
  });
  const withSnapshot = vi.fn(async <T>(read: (s: IxcReadSession) => Promise<T>) => read({ select } as unknown as IxcReadSession));
  const close = vi.fn(async () => {}),
    service = new CollectionsService({ withSnapshot, close }, now);
  return { service, select, withSnapshot, close };
}
afterEach(() => vi.restoreAllMocks());

describe("Cobranças via SQL de leitura", () => {
  it("valida datas, documentos, IDs, limites e interpreta a data em Brasília", async () => {
    expect(collectionsQuery.parse({})).toMatchObject({ scope: "overdue", bucket: "all", status: "all", page: 1, limit: 10 });
    for (const q of [
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "2026-10-01" },
      { from: "2026-10-02", to: "2026-10-01" },
      { scope: "overdue", bucket: "upcoming" },
      { searchBy: "document", search: "123" },
      { searchBy: "titleId", search: "1 OR 1=1" },
      { page: 0 },
      { limit: 200 },
    ])
      expect(collectionsQuery.safeParse(q).success).toBe(false);
    expect((await fixture().service.list({})).referenceDate).toBe(today);
  });
  it("exclui cancelados, estornos, antigos renegociados, saldos inválidos e datas zero em todas as consultas", () => {
    const sql = collectionsSql({}, today);
    for (const q of [sql.summary, sql.customers, sql.count, sql.titles, sql.titleCount]) {
      expect(() => assertReadQuery(q)).not.toThrow();
      expect(q.sql).toContain("t.status IN ('A','P')");
      expect(q.sql).toContain("COALESCE(t.estornado,'') IN ('','N')");
      expect(q.sql).toContain("COALESCE(t.titulo_renegociado,'') IN ('','N')");
      expect(q.sql).toContain("t.valor_aberto>0");
      expect(q.sql).toContain("t.data_vencimento>='1000-01-01'");
      expect(q.sql).toContain("eligible_contract.id=t.id_contrato");
      expect(q.sql).toContain("eligible_contract.id_cliente=t.id_cliente");
      expect(q.sql).toContain("eligible_contract.status='A'");
    }
    expect(sql.quality.sql).toContain("t.valor_aberto IS NULL");
    expect(sql.quality.sql).toContain("c.id IS NULL");
    expect(sql.customers.sql).toContain("GROUP BY t.id_cliente");
  });
  it("parametriza período, filial, conta, cadastro e buscas sem interpretar curingas de nome", () => {
    const sql = collectionsSql(
      {
        bucket: "31-60",
        status: "active",
        branchId: 2,
        accountId: 4,
        from: "2026-08-01",
        to: "2026-10-06",
        search: "A_%' OR 1=1",
        page: 3,
        limit: 25,
      },
      today
    );
    expect(sql.customers.params).toEqual([
      today,
      today,
      today,
      "S",
      2,
      4,
      "%A=_=%' OR 1==1%",
      today,
      "2026-08-01",
      "2026-10-07",
      "2026-09-06",
      "2026-08-07",
      25,
      50,
    ]);
    expect(sql.customers.sql).not.toContain("A_%");
    expect(sql.summary.params.slice(-7)).toEqual(["S", 2, 4, "%A=_=%' OR 1==1%", today, "2026-08-01", "2026-10-07"]); // cards ignore only the selected bucket
    expect(collectionsSql({ scope: "open", bucket: "upcoming" }, today).count.params).toEqual([today]);
    expect(collectionsSql({ searchBy: "document", search: "000.000.000-00" }, today).count.params).toEqual(["00000000000", today]);
  });
  it("usa snapshot, relê dados em cada chamada e retorna DTO explícito com valores exatos e avisos de qualidade", async () => {
    const f = fixture(),
      controller = new AbortController();
    f.select.mockImplementationOnce(async () => [{ customers: 1, titles: 3, balance: "300.30" }]);
    const result = await f.service.list({}, controller.signal);
    expect(result.items[0]).toMatchObject({ id: 1, balance: 300.3, overdueBalance: 200.2, titles: 3 });
    expect(JSON.stringify(result)).not.toContain("NUNCA_EXPOSTA");
    expect(f.withSnapshot.mock.calls[0]?.[1]).toBe(controller.signal);
    await f.service.list({});
    expect(f.select).toHaveBeenCalledTimes(8);
    await f.service.close();
    expect(f.close).toHaveBeenCalledOnce();
  });
  it("restringe detalhes e títulos ao cliente e preserva IDs de títulos grandes", async () => {
    const f = fixture(),
      result = await f.service.customer(1, { page: 2, limit: 25 });
    expect(result.items[0]).toMatchObject({
      id: "9007199254740993",
      customerId: 1,
      paid: 20.1,
      balance: 100.1,
      awaitingConfirmation: true,
    });
    expect(JSON.stringify(result)).not.toContain("NUNCA_EXPOSTA");
    const q = f.select.mock.calls.find(([q]) => q.name === "collections-titles")![0];
    expect(q.sql).toContain("t.id_cliente=?");
    expect(q.params).toEqual([today, 1, today, 25, 25]);
    await expect(fixture([], []).service.customer(1, {})).rejects.toMatchObject({ statusCode: 404 });
    await expect(fixture([row()], [{ ...title, customerId: 2 }]).service.customer(1, {})).rejects.toMatchObject({ statusCode: 502 });
  });
  it("distribui 5 × 10 clientes únicos, mantém filtros/ordem e ignora a página visível", async () => {
    const f = fixture(Array.from({ length: 50 }, (_, i) => row(i + 1)));
    const result = await f.service.distribution({
      filters: { page: 9, sort: "balance", branchId: 2 },
      peopleCount: 5,
      clientsPerPerson: 10,
      names: ["Ana", "", "João"],
    });
    expect(result.groups.map((g) => g.name)).toEqual(["Ana", "Responsável 2", "João", "Responsável 4", "Responsável 5"]);
    expect(result.groups.map((g) => g.items.length)).toEqual([10, 10, 10, 10, 10]);
    expect(new Set(result.groups.flatMap((g) => g.items.map((i) => i.id))).size).toBe(50);
    expect(f.select.mock.calls[0]?.[0].params.slice(-2)).toEqual([50, 0]);
    expect(f.select.mock.calls[0]?.[0].sql).toContain("ORDER BY g.balance DESC,g.oldestDue,c.id");
  });
  it("valida seleção, clientes que já pagaram, duplicação e quantidade antes de gerar PDF", async () => {
    const f = fixture();
    const options = { filters: { branchId: 2 }, peopleCount: 1, clientsPerPerson: 1, customerIds: [1, 1], names: [] };
    expect((await f.service.distribution(options)).selected).toBe(true);
    expect(f.select.mock.calls[0]?.[0].params).toContain(1);
    await expect(fixture([], []).service.distribution(options)).rejects.toMatchObject({ statusCode: 400 });
    await expect(fixture([row(2)]).service.distribution(options)).rejects.toMatchObject({ statusCode: 502 });
    await expect(
      fixture([row(), row()]).service.distribution({ ...options, customerIds: undefined, clientsPerPerson: 2 })
    ).rejects.toMatchObject({ statusCode: 502 });
    await expect(f.service.distribution({ ...options, peopleCount: 20, clientsPerPerson: 20 })).rejects.toThrow();
    await expect(f.service.distribution({ ...options, clientsPerPerson: 2 })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("Elegibilidade financeira executando as consultas de Cobranças", () => {
  it("aplica o contrato de cada título nos cards, detalhes, filtros, contas e distribuição, preservando pagamentos parciais", async () => {
    // Execute the production queries against fictional records, rather than mock query results.
    const db = new DatabaseSync(":memory:");
    db.function("DATEDIFF", (a, b) => Math.round((Date.parse(String(a)) - Date.parse(String(b))) / 86400000));
    db.exec(`
      CREATE TABLE cliente (id INTEGER PRIMARY KEY,razao TEXT,ativo TEXT,cnpj_cpf TEXT,fone TEXT,telefone_celular TEXT,
        telefone_comercial TEXT,whatsapp TEXT,cidade INTEGER,bairro TEXT,email TEXT);
      CREATE TABLE cidade (id INTEGER PRIMARY KEY,nome TEXT);
      CREATE TABLE cliente_contrato (id INTEGER PRIMARY KEY,id_cliente INTEGER,status TEXT,status_internet TEXT,contrato TEXT);
      CREATE TABLE planejamento_analitico (id INTEGER PRIMARY KEY,planejamento_analitico TEXT);
      CREATE TABLE filial (id INTEGER PRIMARY KEY,fantasia TEXT,razao TEXT);
      CREATE TABLE fn_areceber (id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,status TEXT DEFAULT 'A',
        valor NUMERIC DEFAULT 120,valor_recebido NUMERIC DEFAULT 0,valor_aberto NUMERIC DEFAULT 100,
        estornado TEXT DEFAULT 'N',titulo_renegociado TEXT DEFAULT 'N',data_vencimento TEXT DEFAULT '2026-09-01',
        data_emissao TEXT DEFAULT '2026-08-01',documento TEXT,id_conta INTEGER DEFAULT 1,filial_id INTEGER DEFAULT 1,
        aguardando_confirmacao_pagamento TEXT DEFAULT 'N',em_processamento TEXT DEFAULT 'N',em_cobranca TEXT DEFAULT 'N');
      INSERT INTO cliente (id,razao,ativo) VALUES (1,'Cliente misto','S'),(2,'Cadastro inativo','N'),
        (3,'Contrato cancelado','S'),(4,'Vínculo incorreto','S'),(515,'Sem contrato','N');
      INSERT INTO cliente_contrato VALUES (10,1,'A','CA','Ativo bloqueado'),(11,1,'D','D','Cancelado'),
        (20,2,'A','A','Ativo'),(30,3,'D','D','Cancelado');
      INSERT INTO planejamento_analitico VALUES (1,'Mensalidades'),(2,'Somente contrato cancelado');
      INSERT INTO filial VALUES (1,'Filial de demonstração','Filial de demonstração');
      INSERT INTO fn_areceber (id,id_cliente,id_contrato,valor,valor_recebido,valor_aberto) VALUES (1,1,10,120.20,20.10,100.10);
      INSERT INTO fn_areceber (id,id_cliente,id_contrato,status,valor_aberto) VALUES (2,1,11,'A',900),(3,1,10,'R',100),
        (4,1,10,'C',100),(5,1,10,'P',40),(6,1,10,'A',0);
      INSERT INTO fn_areceber (id,id_cliente,id_contrato,estornado) VALUES (7,1,10,'S');
      INSERT INTO fn_areceber (id,id_cliente,id_contrato,titulo_renegociado) VALUES (8,1,10,'S');
      INSERT INTO fn_areceber (id,id_cliente,id_contrato,data_vencimento) VALUES (9,1,10,'0000-00-00'),(10,1,NULL,'2026-09-01');
      INSERT INTO fn_areceber (id,id_cliente,id_contrato,valor_aberto) VALUES (11,4,20,400),(12,2,20,75),(14,515,0,1788.43);
      INSERT INTO fn_areceber (id,id_cliente,id_contrato,valor_aberto,id_conta) VALUES (13,3,30,555,2);
      INSERT INTO fn_areceber (id,id_cliente,id_contrato,valor_aberto,data_vencimento) VALUES (15,1,10,60,'2026-10-20');
    `);
    const session: IxcReadSession = {
      select: async <T extends object>(q: IxcReadQuery) => {
        assertReadQuery(q);
        return db.prepare(q.sql).all(...q.params) as T[];
      },
    };
    const service = new CollectionsService({ withSnapshot: async (read) => read(session) }, now);
    try {
      const list = await service.list({});
      expect(list.summary).toMatchObject({ customers: 2, titles: 3, balance: 215.1 });
      expect(list.items.map((c) => c.id)).toEqual([1, 2]);
      expect(list.summary.buckets[0]).toMatchObject({ customers: 0, balance: 0 });
      expect(list.summary.buckets[1]).toMatchObject({ customers: 2, balance: 215.1 });
      expect((await service.list({ status: "active" })).summary.balance).toBe(140.1);
      expect((await service.list({ scope: "open" })).summary.balance).toBe(275.1);
      for (const search of ["3", "4", "515"])
        expect((await service.list({ searchBy: "customerId", search })).summary).toMatchObject({ customers: 0, titles: 0, balance: 0 });
      expect((await service.list({ searchBy: "contractId", search: "11" })).total).toBe(0);
      const detail = await service.customer(1, {});
      expect(detail.total).toBe(2);
      expect(detail.balance).toBe(140.1);
      expect(detail.items.map((t) => t.id)).toEqual(["1", "5"]);
      expect(detail.items[0]).toMatchObject({
        contractId: 10,
        contractStatus: "A",
        internetStatus: "CA",
        amount: 120.2,
        paid: 20.1,
        balance: 100.1,
      });
      await expect(service.customer(515, {})).rejects.toMatchObject({ statusCode: 404 });
      const distribution = await service.distribution({ filters: {}, peopleCount: 1, clientsPerPerson: 2 });
      expect(distribution.groups[0]?.items.map((c) => c.id)).toEqual([1, 2]);
      await expect(service.distribution({ filters: {}, peopleCount: 1, clientsPerPerson: 1, customerIds: [515] })).rejects.toMatchObject({
        statusCode: 400,
      });
      expect((await service.options()).accounts).toEqual([{ id: 1, name: "Mensalidades" }]);
    } finally {
      db.close();
    }
  });
});

describe("Permissões de Cobranças", () => {
  const headers = { authorization: "test" };
  async function appWith(permissions: string[]) {
    vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async (req) =>
      req.headers.authorization
        ? { id: 1, name: "Usuário", email: "test@example.test", role: "USER", permissions: permissions as never }
        : null
    );
    const select = vi.spyOn(IxcReadDatabase.prototype, "withSnapshot").mockRejectedValue(new Error("PRIVATE_CONNECTION"));
    const app = Fastify();
    await app.register(collectionsRoutes, { prefix: "/api/collections" });
    return { app, select };
  }
  it("permite admin e perfis explícitos sem conceder acesso financeiro a outros papéis automaticamente", () => {
    expect(rolePermissions.ADMIN).toContain("collections.export");
    expect(rolePermissions.OPERATOR).not.toContain("collections.customers.view");
    expect(effectivePermissions("USER", ["collections.customers.view"], { "collections.export": true })).toEqual(
      expect.arrayContaining(["collections.customers.view", "collections.export"])
    );
  });
  it("exige autenticação e permissões próprias antes de consultar qualquer dado", async () => {
    const { app, select } = await appWith([]);
    try {
      for (const url of ["/customers", "/options", "/customers/1"]) {
        expect((await app.inject({ url: "/api/collections" + url })).statusCode).toBe(401);
        expect((await app.inject({ url: "/api/collections" + url, headers })).statusCode).toBe(403);
      }
      expect((await app.inject({ method: "POST", url: "/api/collections/export", headers, payload: {} })).statusCode).toBe(403);
      expect(select).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("isola detalhes e PDF, sanitiza falhas, valida filtros e não registra rotas de escrita IXC", async () => {
    const { app, select } = await appWith(["collections.customers.view"]);
    try {
      expect((await app.inject({ url: "/api/collections/customers/1", headers })).statusCode).toBe(403);
      expect((await app.inject({ method: "POST", url: "/api/collections/export", headers, payload: {} })).statusCode).toBe(403);
      expect((await app.inject({ url: "/api/collections/customers?limit=500", headers })).statusCode).toBe(400);
      expect(select).not.toHaveBeenCalled();
      const failure = await app.inject({ url: "/api/collections/customers", headers });
      expect(failure.statusCode).toBe(502);
      expect(failure.body).not.toContain("PRIVATE_CONNECTION");
      expect(failure.headers["cache-control"]).toBe("no-store");
      for (const method of ["POST", "PUT", "DELETE"] as const)
        expect((await app.inject({ method, url: "/api/collections/customers/1", headers, payload: {} })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
  it("exporta PDF protegido sem gravar dados e respeita a cor do módulo", async () => {
    const { app } = await appWith(["collections.customers.view", "collections.export"]);
    const distribution = await fixture().service.distribution({ filters: {}, peopleCount: 1, clientsPerPerson: 1 });
    const exportSpy = vi.spyOn(CollectionsService.prototype, "distribution").mockResolvedValue(distribution);
    vi.spyOn(SettingsService.prototype, "appearance").mockResolvedValue({
      ...defaultAppearance,
      dark: { ...defaultAppearance.dark, collections: "#009988" },
    });
    try {
      const result = await app.inject({
        method: "POST",
        url: "/api/collections/export",
        headers,
        payload: { filters: {}, peopleCount: 1, clientsPerPerson: 1, themeMode: "dark" },
      });
      expect(result.statusCode).toBe(200);
      expect(result.headers["content-type"]).toBe("application/pdf");
      expect(result.headers["cache-control"]).toBe("no-store");
      expect((await PDFDocument.load(result.rawPayload)).getPageCount()).toBe(1);
      expect(exportSpy).toHaveBeenCalledOnce();
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/collections/export",
            headers,
            payload: { filters: {}, peopleCount: 20, clientsPerPerson: 20 },
          })
        ).statusCode
      ).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe("PDF de cobranças e aparência", () => {
  it("gera uma A4 por pessoa com 20 clientes, anotações e a cor configurada", async () => {
    const distribution = await fixture(
      Array.from({ length: 100 }, (_, i) => ({
        ...row(i + 1),
        name: "Cliente de demonstração com nome extenso para validar a disposição compacta das informações " + i,
      }))
    ).service.distribution({ filters: {}, peopleCount: 5, clientsPerPerson: 20, names: ["Ana"], includeNotes: true });
    for (const notes of [true, false]) {
      const pdf = await PDFDocument.load(await createCollectionsPdf({ ...distribution, includeNotes: notes }, { accentColor: "#009988" }));
      expect(pdf.getPageCount()).toBe(5);
      expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
      const contents = pdf.context.lookup(pdf.getPage(0).node.Contents()!);
      const streams =
        contents instanceof PDFArray
          ? Array.from({ length: contents.size() }, (_, i) => contents.lookup(i, PDFRawStream))
          : [contents as PDFRawStream];
      const decoded = streams.map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1")).join("\n");
      expect(decoded).toContain("0 0.6 0.5333333333333333 scn");
    }
  });
  it("interpreta configurações antigas sem gravá-las, acrescentando as cores claro/escuro de cobranças", () => {
    const legacy = structuredClone(defaultAppearance);
    Reflect.deleteProperty(legacy.light, "collections");
    Reflect.deleteProperty(legacy.dark, "collections");
    const original = JSON.stringify(legacy),
      parsed = appearanceSchema.parse(legacy);
    expect(parsed.light.collections).toBe("#c2410c");
    expect(parsed.dark.collections).toBe("#fb923c");
    expect(JSON.stringify(legacy)).toBe(original);
    expect(appearanceSchema.safeParse({ ...defaultAppearance, dark: { ...defaultAppearance.dark, collections: "red" } }).success).toBe(
      false
    );
  });
});
