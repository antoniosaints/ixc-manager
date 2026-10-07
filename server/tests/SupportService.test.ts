import { describe, expect, it, vi } from "vitest";
import { SupportService, type CustomerQuery } from "../src/services/support/SupportService.js";
import { UpgradeService } from "../src/services/upgrades/UpgradeService.js";
import type { IxcListRequest } from "../src/integrations/ixc/IxcApiService.js";
const customer = {
  id: "1",
  razao: "Cliente Exemplo",
  ativo: "S",
  cidade: "10",
  cnpj_cpf: "000.000.000-00",
  telefone_celular: "(99) 99999-0000",
  senha: "PRIVATE_PASSWORD",
  token: "PRIVATE_TOKEN",
};
const contract = {
  id: "100",
  id_cliente: "1",
  status: "A",
  contrato: "Fibra",
  status_internet: "A",
  data_expiracao: "2026-10-30",
  endereco_padrao_cliente: "S",
};
const login = {
  id: "200",
  id_cliente: "1",
  id_contrato: "100",
  login: "exemplo",
  ativo: "S",
  online: "S",
  ip: "192.0.2.1",
  senha_router1: "PRIVATE_PASSWORD",
  senha: "AUTH_PASSWORD",
  senha_md5: "PRIVATE_HASH",
};
const defaults: CustomerQuery = { status: "active", search: "", searchBy: "name", page: 1, limit: 10 };
function setup(overrides: Record<string, Record<string, unknown>[]> = {}) {
  const rows: Record<string, Record<string, unknown>[]> = {
    cliente: [customer],
    cliente_contrato: [contract],
    cidade: [{ id: "10", nome: "Cidade Exemplo" }],
    radusuarios: [login],
    ...overrides,
  };
  const listPage = vi.fn(async (endpoint: string, request: IxcListRequest, page: number) => {
    const match = (row: Record<string, unknown>, field: string, op: string, term: string) => {
      const value = String(row[field.split(".").at(-1)!] ?? "");
      return op === "="
        ? value === term
        : op === "IN"
          ? term.split(",").includes(value)
          : op === "L"
            ? value.includes(term)
            : op === ">"
              ? Number(value) > Number(term)
              : true;
    };
    const found = (rows[endpoint] ?? []).filter(
      (row) => match(row, request.qtype, request.oper, request.query) && (request.gridParam ?? []).every((g) => match(row, g.TB, g.OP, g.P))
    );
    return { total: found.length, rows: found.slice((page - 1) * (request.rp ?? 10), page * (request.rp ?? 10)) };
  });
  const reader = { listPage } as unknown as ConstructorParameters<typeof SupportService>[0];
  return { service: new SupportService(reader), reader, listPage };
}
describe("Suporte realtime", () => {
  it("consulta ativos por padrão, permite todos/inativos e só enriquece a página atual", async () => {
    const { service, listPage } = setup({ cliente: [customer, { ...customer, id: "2", ativo: "N" }] });
    expect((await service.customers(defaults)).items.map((row) => row.id)).toEqual([1]);
    expect(listPage.mock.calls[0]![1]).toMatchObject({
      qtype: "cliente.id",
      oper: ">",
      query: "0",
      rp: 10,
      gridParam: [{ TB: "cliente.ativo", OP: "=", P: "S" }],
    });
    expect((await service.customers({ ...defaults, status: "inactive" })).items.map((row) => row.id)).toEqual([2]);
    expect((await service.customers({ ...defaults, status: "all" })).total).toBe(2);
    expect((await service.customers({ ...defaults, page: 2 })).items).toEqual([]);
  });
  it("valida busca antes de consultar e retorna apenas campos explícitos do cadastro", async () => {
    const { service, listPage } = setup();
    await expect(service.customers({ ...defaults, search: "ab" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.customers({ ...defaults, searchBy: "id", search: "NaN" })).rejects.toMatchObject({ statusCode: 400 });
    expect(listPage).not.toHaveBeenCalled();
    expect((await service.customers({ ...defaults, searchBy: "id", search: "1" })).total).toBe(1);
    const result = await service.customer(1);
    expect(result.customer).toMatchObject({ id: 1, name: "Cliente Exemplo", city: "Cidade Exemplo" });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|senha|token/);
  });
  it("busca parte do login em todas as páginas, deduplica clientes e aplica cadastro e paginação", async () => {
    const { service, listPage } = setup({
      cliente: [customer, { ...customer, id: "2", ativo: "N" }, { ...customer, id: "3" }],
      radusuarios: Array.from({ length: 502 }, (_, i) => ({
        ...login,
        id: String(i + 1),
        login: `suporte.${i}`,
        id_cliente: i < 500 ? "1" : String(i - 498),
      })),
    });
    const query = { ...defaults, searchBy: "login" as const, search: "suporte" };
    const result = await service.customers(query);
    expect(result.total).toBe(2);
    expect(result.items.map((row) => row.id)).toEqual([1, 3]);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|senha/);
    expect(listPage.mock.calls.filter(([endpoint]) => endpoint === "radusuarios").map((call) => call[2])).toEqual([1, 2]);
    expect(listPage.mock.calls.find(([endpoint]) => endpoint === "cliente")?.[1]).toMatchObject({
      qtype: "cliente.id",
      query: "1,2,3",
      oper: "IN",
      rp: 10,
    });
    expect((await service.customers({ ...query, status: "inactive" })).items.map((row) => row.id)).toEqual([2]);
    expect((await service.customers({ ...query, status: "all" })).total).toBe(3);
    expect((await service.customers({ ...query, page: 2 })).items).toEqual([]);
    listPage.mockClear();
    expect((await service.customers({ ...query, search: "ausente" })).total).toBe(0);
    expect(listPage).toHaveBeenCalledTimes(1);
  });
  it("busca CPF/CNPJ com ou sem máscara e inclui ambos os formatos de cadastro", async () => {
    for (const [formatted, digits] of [
      ["123.456.789-00", "12345678900"],
      ["12.345.678/0001-90", "12345678000190"],
    ]) {
      const { service } = setup({
        cliente: [
          { ...customer, cnpj_cpf: formatted },
          { ...customer, id: "2", cnpj_cpf: digits },
          { ...customer, id: "3", cnpj_cpf: digits, ativo: "N" },
        ],
      });
      for (const search of [formatted!, digits!]) {
        const result = await service.customers({ ...defaults, searchBy: "document", search });
        expect(result.items.map((row) => row.id)).toEqual([1, 2]);
        expect(result.total).toBe(2);
      }
      expect(
        (await service.customers({ ...defaults, searchBy: "document", search: digits!, status: "inactive" })).items.map((row) => row.id)
      ).toEqual([3]);
    }
  });
  it("busca endereço do cadastro no IXC e mantém o filtro de ativos", async () => {
    const { service, listPage } = setup({
      cliente: [
        { ...customer, endereco: "Rua Central", numero: "10" },
        { ...customer, id: "2", endereco: "Rua Central", ativo: "N" },
        { ...customer, id: "3", endereco: "Outra rua" },
      ],
    });
    const result = await service.customers({ ...defaults, searchBy: "address", search: "Central" });
    expect(result.items.map((row) => row.id)).toEqual([1]);
    expect(result.items[0]?.address).toBe("Rua Central, 10");
    expect(listPage.mock.calls[0]?.[1]).toMatchObject({ qtype: "cliente.endereco", query: "Central", oper: "L" });
  });
  it("valida novas buscas antes de consultar e rejeita logins excessivos ou respostas fora do filtro", async () => {
    const { service, listPage } = setup();
    for (const [searchBy, search] of [
      ["login", "ab"],
      ["address", "ab"],
      ["document", "123"],
      ["document", "abc12345678900"],
    ] as const)
      await expect(service.customers({ ...defaults, searchBy, search })).rejects.toMatchObject({ statusCode: 400 });
    expect(listPage).not.toHaveBeenCalled();
    listPage.mockResolvedValueOnce({ rows: [login], total: 5001 });
    await expect(service.customers({ ...defaults, searchBy: "login", search: "exemplo" })).rejects.toMatchObject({ statusCode: 400 });
    listPage.mockResolvedValueOnce({ rows: [{ ...login, login: "outro" }], total: 1 });
    await expect(service.customers({ ...defaults, searchBy: "login", search: "exemplo" })).rejects.toMatchObject({ statusCode: 502 });
    listPage.mockResolvedValueOnce({ rows: [login], total: 1 });
    listPage.mockResolvedValueOnce({ rows: [{ ...customer, id: "999" }], total: 1 });
    await expect(service.customers({ ...defaults, searchBy: "login", search: "exemplo" })).rejects.toMatchObject({ statusCode: 502 });
    listPage.mockResolvedValueOnce({ rows: [customer], total: 1 });
    await expect(service.customers({ ...defaults, searchBy: "document", search: "12345678900" })).rejects.toMatchObject({
      statusCode: 502,
    });
  });
  it("retorna contratos inativos no Suporte sem alterar a regra de Upgrades", async () => {
    const { service, reader } = setup({ cliente_contrato: [{ ...contract, status: "I" }] });
    expect((await service.contracts(1, defaults)).items[0]?.status).toBe("I");
    expect((await service.technical.contract(100)).contract?.contractStatus).toBe("I");
    expect((await service.technical.login(100, 200)).login.id).toBe(200);
    await expect(new UpgradeService(reader).contract(100)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("usa os vínculos distintos de OS e atendimento e preserva descrição, resposta e datas", async () => {
    const { service } = setup({
      su_oss_chamado: [
        {
          id: "5",
          id_cliente: "1",
          id_contrato_kit: "100",
          id_login: "200",
          status: "F",
          mensagem: "Validar sinal",
          mensagem_resposta: "Fibra validada",
          data_abertura: "2026-10-01 09:00:00",
          token: "PRIVATE_TOKEN",
        },
      ],
      su_ticket: [
        {
          id: "6",
          id_cliente: "1",
          id_contrato: "100",
          su_status: "S",
          menssagem: "Cliente sem conexão",
          titulo: "Suporte",
          token: "PRIVATE_TOKEN",
        },
      ],
    });
    expect((await service.cases(1, "orders", defaults)).items[0]).toMatchObject({
      contractId: 100,
      loginId: 200,
      message: "Validar sinal",
      response: "Fibra validada",
      status: "F",
    });
    const result = await service.cases(1, "tickets", defaults);
    expect(result.items[0]).toMatchObject({ contractId: 100, message: "Cliente sem conexão", status: "S" });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_TOKEN");
  });
  it("resolve nomes dos assuntos das OS em lote, somente para os IDs da página", async () => {
    const { service, listPage } = setup({
      su_oss_chamado: Array.from({ length: 12 }, (_, i) => ({
        id: String(300 + i),
        id_cliente: "1",
        id_assunto: i < 10 ? (i % 2 ? "7" : "103") : "999",
        titulo: "Título de OS",
        status: "A",
      })),
      su_oss_assunto: [
        { id: "103", assunto: "Sem conexão", token: "PRIVATE_TOKEN" },
        { id: "7", assunto: "Instabilidade" },
        { id: "999", assunto: "Assunto de outra página" },
      ],
    });
    const result = await service.cases(1, "orders", defaults);
    expect(result.items[0]).toMatchObject({ subjectId: 103, subjectName: "Sem conexão", title: "Título de OS" });
    expect(result.items[1]).toMatchObject({ subjectId: 7, subjectName: "Instabilidade" });
    expect(result.total).toBe(12);
    expect(listPage.mock.calls.filter(([endpoint]) => endpoint === "su_oss_assunto")).toHaveLength(1);
    expect(listPage.mock.calls.find(([endpoint]) => endpoint === "su_oss_assunto")?.[1]).toMatchObject({
      qtype: "su_oss_assunto.id",
      query: "103,7",
      oper: "IN",
      rp: 2,
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_TOKEN|Assunto de outra página/);
    expect((await service.cases(1, "orders", { ...defaults, page: 2 })).items[0]?.subjectName).toBe("Assunto de outra página");
  });
  it("preserva títulos dos atendimentos e o ID de assuntos ausentes sem inventar nomes", async () => {
    const { service, listPage } = setup({
      su_ticket: [{ id: "6", id_cliente: "1", id_assunto: "7", titulo: "Pedido do cliente" }],
      su_oss_chamado: [{ id: "5", id_cliente: "1", id_assunto: "103" }],
      su_oss_assunto: [{ id: "7", assunto: "Suporte técnico" }],
    });
    expect((await service.cases(1, "tickets", defaults)).items[0]).toMatchObject({
      title: "Pedido do cliente",
      subjectName: "Suporte técnico",
    });
    expect((await service.cases(1, "orders", defaults)).items[0]).toMatchObject({ subjectId: 103, subjectName: null, title: null });
    listPage.mockClear();
    expect((await service.cases(1, "orders", { ...defaults, page: 2 })).items).toEqual([]);
    expect(listPage.mock.calls.some(([endpoint]) => endpoint === "su_oss_assunto")).toBe(false);
  });
  it("consulta comodato pela tabela movimento_produtos sem perder vínculo, devolução e patrimônio", async () => {
    const { service, listPage } = setup({
      cliente_contrato_comodato: [
        {
          id: "7",
          id_contrato: "100",
          id_login: "200",
          status_comodato: "E",
          tipo: "S",
          id_produto: "8",
          id_patrimonio: "9",
          numero_patrimonial: "P-9",
          numero_serie: "SERIE-EXEMPLO",
          mac: "00:00:5E:00:53:01",
          data: "2026-10-01",
          quantidade: "1",
          id_devolucao: "0",
        },
      ],
    });
    const result = await service.comodato(100, defaults);
    expect(result.items[0]).toMatchObject({
      contractId: 100,
      loginId: 200,
      assetId: 9,
      assetNumber: "P-9",
      serial: "SERIE-EXEMPLO",
      status: "E",
      quantity: 1,
      returnId: null,
    });
    expect(listPage.mock.calls.find((call) => call[0] === "cliente_contrato_comodato")?.[1]).toMatchObject({
      qtype: "movimento_produtos.id_contrato",
      query: "100",
      sortname: "movimento_produtos.id",
    });
  });
  it("complementa série e MAC usando apenas os patrimônios dos comodatos da página", async () => {
    const { service, listPage } = setup({
      cliente_contrato_comodato: [{ id: "7", id_contrato: "100", id_patrimonio: "9" }],
      patrimonio: [
        { id: "9", descricao: "ONU Exemplo", serial: "SERIE-9", id_mac: "00:00:5E:00:53:09" },
        { id: "10", serial: "OTHER_PRIVATE_ASSET" },
      ],
    });
    const result = await service.comodato(100, defaults);
    expect(result.items[0]).toMatchObject({ assetId: 9, description: "ONU Exemplo", serial: "SERIE-9", mac: "00:00:5E:00:53:09" });
    expect(listPage.mock.calls.find((call) => call[0] === "patrimonio")?.[1]).toMatchObject({
      qtype: "patrimonio.id",
      query: "9",
      oper: "IN",
      rp: 1,
    });
    expect(JSON.stringify(result)).not.toContain("OTHER_PRIVATE_ASSET");
  });
  it("rejeita respostas fora do cliente ou contrato mesmo quando o IXC ignora filtros", async () => {
    const { service, listPage } = setup();
    for (const kind of ["contracts", "logins", "orders", "tickets"] as const) {
      listPage.mockImplementationOnce(async () => ({ rows: [customer], total: 1 }));
      listPage.mockImplementationOnce(async () => ({ rows: [{ id: "999", id_cliente: "2", senha: "PRIVATE_PASSWORD" }], total: 1 }));
      const request =
        kind === "contracts"
          ? service.contracts(1, defaults)
          : kind === "logins"
            ? service.logins(1, defaults, false)
            : service.cases(1, kind, defaults);
      await expect(request).rejects.toMatchObject({ statusCode: 502 });
    }
    listPage.mockImplementation(async (endpoint) => ({
      rows:
        endpoint === "cliente_contrato_comodato"
          ? [{ id: "8", id_contrato: "999" }]
          : endpoint === "cliente_contrato"
            ? [contract]
            : endpoint === "cliente"
              ? [customer]
              : [{ id: "10", nome: "Exemplo" }],
      total: 1,
    }));
    await expect(service.comodato(100, defaults)).rejects.toMatchObject({ statusCode: 502 });
  });
  it("separa metadados de senhas e valida novamente cliente e contrato antes do acesso", async () => {
    const { service } = setup();
    const result = await service.logins(1, defaults, false);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_PASSWORD|AUTH_PASSWORD|PRIVATE_HASH/);
    expect(result.items[0]?.accessTargets.every((target) => target.url === null)).toBe(true);
    expect(await service.technical.loginAccess(100, 200, "https", 7001)).toMatchObject({
      url: "https://192.0.2.1:7001/",
      password: "PRIVATE_PASSWORD",
    });
    await expect(service.technical.loginAccess(100, 999, "http", 80)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("distingue cadastro ausente, lista vazia e falha sanitizada da API", async () => {
    const { service, listPage } = setup();
    await expect(service.customer(999)).rejects.toMatchObject({ statusCode: 404 });
    expect((await service.cases(1, "orders", defaults)).items).toEqual([]);
    listPage.mockRejectedValueOnce(new Error("PRIVATE_TOKEN"));
    await expect(service.customers(defaults)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.not.stringContaining("PRIVATE_TOKEN"),
    });
  });
});
