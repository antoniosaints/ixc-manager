import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportCustomerService, customerProfileQuery, customerContactsQuery } from "../src/services/support/SupportCustomerService.js";
import { assertReadQuery, type IxcReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { supportRoutes } from "../src/controllers/supportController.js";
import { AuthService } from "../src/services/AuthService.js";
const example = {
  id: 1,
  razao: "Cliente de demonstração",
  ativo: "S",
  tipo_pessoa: "J",
  fantasia: "Empresa de teste",
  cityName: "Cidade Exemplo",
  state: "MA",
  filial_id: 2,
  branchName: "Filial Exemplo",
  id_tipo_cliente: 3,
  categoryName: "Empresarial",
  id_vendedor: 4,
  salespersonName: "Vendedor de teste",
  data_cadastro: "2024-01-02",
  ultima_atualizacao: "2026-10-07 10:30:00",
  endereco_cob: "Rua de demonstração",
  numero_cob: "100",
  dia_vencimento: "10",
  bloqueio_automatico: "N",
  cob_envia_email: "S",
  telefone_celular: "(99) 99999-0000",
  whatsapp: "(99) 99999-0000",
  alerta: "Atenção ao contato preferencial",
  obs: "<script>Texto cadastrado</script>",
  senha: "PRIVATE_PASSWORD",
  token: "PRIVATE_TOKEN",
  cpf_pai: "PRIVATE_DOCUMENT",
};
const related = {
  id: 10,
  id_cliente: 1,
  nome: "Contato Exemplo",
  principal: "S",
  ativo: "N",
  fone_celular: "(99) 99999-0001",
  senha: "CONTACT_PASSWORD",
};
function fixture(row: Record<string, unknown> | null = example, contacts: Record<string, unknown>[] = [related]) {
  const select = vi.fn(async (query: IxcReadQuery) => {
    assertReadQuery(query);
    return query.name === "support-customer-profile" ? (row ? [row] : []) : contacts;
  });
  const withSnapshot = vi.fn(async (read: (session: never) => Promise<unknown>) => read({ select } as never));
  return {
    select,
    withSnapshot,
    service: new SupportCustomerService({ withSnapshot: withSnapshot as never }, () => new Date("2026-10-07T12:00:00Z")),
  };
}
afterEach(() => vi.restoreAllMocks());
describe("Cadastro completo de suporte via SQL", () => {
  it("lê somente campos explícitos, parametrizados, por cliente e com limites", () => {
    const profile = customerProfileQuery(1),
      contacts = customerContactsQuery(1);
    for (const query of [profile, contacts]) {
      assertReadQuery(query);
      expect(query.params).toEqual([1]);
      expect(query.timeoutSeconds).toBe(5);
      expect(query.sql).not.toMatch(/SELECT \*|senha|token|cpf_pai|deb_conta|data_nascimento/);
    }
    expect(profile.sql).toContain("WHERE c.id=? LIMIT 1");
    expect(contacts.sql).toContain("WHERE id_cliente=?");
    expect(contacts.sql).toContain("LIMIT 21");
  });
  it("mapeia cadastro, cobrança e contatos sem expor credenciais nem inventar valores", async () => {
    const { service, select } = fixture();
    const result = await service.customer(1);
    expect(result).toMatchObject({
      source: "database",
      queriedAt: "2026-10-07T12:00:00.000Z",
      customer: {
        tradeName: "Empresa de teste",
        state: "MA",
        branchId: 2,
        branch: "Filial Exemplo",
        category: "Empresarial",
        registeredAt: "2024-01-02",
        billing: { dueDay: 10, automaticBlock: false, email: true, sms: null },
        contactsTruncated: false,
      },
    });
    expect(result.customer.contacts).toHaveLength(1);
    expect(result.customer.contacts[0]?.labels).toEqual(["Celular", "WhatsApp"]);
    expect(result.customer.relatedContacts[0]).toMatchObject({ id: 10, primary: true, active: false });
    expect(result.customer.notes[1]?.content).toBe("<script>Texto cadastrado</script>");
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|CONTACT_PASSWORD/);
    expect(select).toHaveBeenCalledTimes(2);
  });
  it("trata datas zeradas, vencimentos inválidos e contagens limitadas explicitamente", async () => {
    const { service } = fixture(
      {
        ...example,
        data_cadastro: "0000-00-00",
        ultima_atualizacao: "0000-00-00 00:00:00",
        dia_vencimento: 0,
        nao_bloquear_ate: "2026-02-30",
        alertTruncated: 1,
      },
      Array.from({ length: 21 }, (_, i) => ({ ...related, id: i + 1 }))
    );
    const { customer } = await service.customer(1);
    expect(customer).toMatchObject({
      registeredAt: null,
      updatedAt: null,
      contactsTruncated: true,
      billing: { dueDay: null, doNotBlockUntil: null },
    });
    expect(customer.relatedContacts).toHaveLength(20);
    expect(customer.notes[0]?.truncated).toBe(true);
  });
  it("não consulta contatos de um cliente ausente e rejeita contatos de outro cadastro", async () => {
    for (const row of [null, { ...example, id: 2 }]) {
      const { service, select } = fixture(row);
      await expect(service.customer(1)).rejects.toMatchObject({ statusCode: 404 });
      expect(select).toHaveBeenCalledOnce();
    }
    const { service } = fixture(example, [{ ...related, id_cliente: 2 }]);
    await expect(service.customer(1)).rejects.toMatchObject({ statusCode: 502 });
  });
  it("repete consultas em cada acesso, encaminha cancelamento e valida IDs antes de ler", async () => {
    const { service, select, withSnapshot } = fixture();
    const signal = new AbortController().signal;
    await service.customer(1, signal);
    await service.customer(1, signal);
    expect(select).toHaveBeenCalledTimes(4);
    expect(withSnapshot.mock.calls[0]?.[1]).toBe(signal);
    for (const value of [0, -1, 1.5, 9007199254740992]) await expect(service.customer(value)).rejects.toMatchObject({ statusCode: 400 });
    expect(select).toHaveBeenCalledTimes(4);
  });
  it("protege a rota por permissão, sanitiza falhas e retorna a leitura sem cache", async () => {
    let permissions: string[] = [];
    vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async (request) =>
      request.headers.authorization ? { id: 1, name: "Teste", email: "teste@example.test", role: "OPERATOR", permissions } : null
    );
    const result = await fixture().service.customer(1);
    const read = vi.spyOn(SupportCustomerService.prototype, "customer").mockResolvedValue(result);
    const app = Fastify();
    await app.register(supportRoutes, { prefix: "/api/support" });
    try {
      expect((await app.inject({ url: "/api/support/customers/1" })).statusCode).toBe(401);
      expect((await app.inject({ url: "/api/support/customers/1", headers: { authorization: "test" } })).statusCode).toBe(403);
      expect(read).not.toHaveBeenCalled();
      permissions = ["support.customer.view"];
      const response = await app.inject({ url: "/api/support/customers/1", headers: { authorization: "test" } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json().source).toBe("database");
      read.mockRejectedValueOnce(new Error("PRIVATE_CONNECTION_DETAIL"));
      const failed = await app.inject({ url: "/api/support/customers/1", headers: { authorization: "test" } });
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain("PRIVATE_CONNECTION_DETAIL");
    } finally {
      await app.close();
    }
  });
});
