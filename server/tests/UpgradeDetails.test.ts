import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { contactNumbers, equipmentTarget, loginDetails } from "../src/services/upgrades/UpgradeDetails.js";
import { UpgradeService } from "../src/services/upgrades/UpgradeService.js";
import { upgradeRoutes } from "../src/controllers/upgradeController.js";
import { AuthService } from "../src/services/AuthService.js";
import { IxcApiService } from "../src/integrations/ixc/IxcApiService.js";
import { rolePermissions, effectivePermissions, type Permission } from "../src/config/permissions.js";

const contract = { id: "10", id_cliente: "3", status: "A", contrato: "Plano teste", endereco_padrao_cliente: "S" };
const login = {
  id: "20",
  id_contrato: "10",
  id_cliente: "3",
  login: "exemplo",
  ativo: "N",
  online: "SS",
  autenticacao: "L",
  ip: "192.0.2.10",
  ip_aux: "2001:db8::10",
  tipo_acesso: "http",
  porta_http: "80",
  porta_router2: "8080",
  porta_aux: "443",
  senha: "  SENHA_FICTICIA  ",
  senha_router1: "ROTEADOR_FICTICIO",
  senha_md5: "HASH_NUNCA_EXPOSTO",
  senha_rede_sem_fio: "",
  usuario_router1: "admin",
  ssid_router_wifi: "Wi-Fi teste",
  campo_privado: "NUNCA_EXPOSTO",
};
afterEach(() => vi.restoreAllMocks());
function serviceFixture(rows = [login]) {
  const listPage = vi.fn(async (endpoint: string) => ({
    rows:
      endpoint === "cliente_contrato"
        ? [contract]
        : endpoint === "radusuarios"
          ? rows
          : endpoint === "cliente"
            ? [{ id: "3", fone: "(99) 99999-0000", email: "teste@example.test", senha: "CENTRAL_NUNCA_EXPOSTA" }]
            : [],
    total: endpoint === "radusuarios" ? 42 : 1,
  }));
  return { service: new UpgradeService({ listPage } as unknown as Pick<IxcApiService, "listPage">), listPage };
}

describe("Detalhes de Upgrades", () => {
  it("agrupa números nacionais repetidos entre contrato e cadastro, preservando tipos, pessoas e ramal", () => {
    const contacts = contactNumbers(
      { fone: "(99) 99999-0000" },
      {
        telefone_celular: "+55 99 99999-0000",
        whatsapp: "99999990000",
        telefone_comercial: "(99) 3333-0000",
        ramal: "22",
        ref_pes_fone1: "(99) 3333-0000",
        ref_pes_nome1: "Contato exemplo",
        fone_conjuge: "(99) 98888-0000; (99) 97777-0000",
        nome_conjuge: "Pessoa exemplo",
        id_operadora_celular: "99",
        senha: "NUNCA",
      }
    );
    expect(contacts).toHaveLength(4);
    expect(contacts[0]).toMatchObject({
      number: "(99) 99999-0000",
      labels: ["Telefone", "Celular", "WhatsApp"],
      sources: ["Contrato", "Cadastro do cliente"],
      whatsappUrl: "https://wa.me/5599999990000",
    });
    expect(contacts[1]).toMatchObject({ extension: "22", labels: ["Comercial", "Referência pessoal 1 · Contato exemplo"] });
    expect(contacts[2]?.labels).toEqual(["Cônjuge · Pessoa exemplo"]);
    expect(JSON.stringify(contacts)).not.toContain("NUNCA");
  });
  it("mantém números internacionais e telefones sem DDD sem inventar país ou WhatsApp", () => {
    const contacts = contactNumbers(
      {},
      {
        fone: "+1 (212) 555-0100",
        whatsapp: "+44 20 7946 0000",
        telefone_comercial: "3333-0000",
        telefone_celular: "Não informado",
        fone_conjuge: "0000000000",
        telefone_contador: "12345",
        ref_com_fone1: "javascript:99999990000",
      }
    );
    expect(contacts).toHaveLength(3);
    expect(contacts[0]).toMatchObject({ telUrl: "tel:+12125550100", whatsappUrl: "https://wa.me/12125550100" });
    expect(contacts.find((contact) => contact.telUrl === "tel:+442079460000")?.whatsappUrl).toBe("https://wa.me/442079460000");
    expect(contacts.find((contact) => contact.telUrl === "tel:33330000")).toMatchObject({ whatsappUrl: null });
  });
  it("gera apenas atalhos web válidos, com IPv6 entre colchetes, sem credenciais ou destinos presumidos", () => {
    expect(equipmentTarget("Roteador", "192.0.2.10", "8080", "https").url).toBe("https://192.0.2.10:8080/");
    expect(equipmentTarget("Auxiliar", "2001:db8::10", "443", "https").url).toBe("https://[2001:db8::10]:443/");
    for (const ip of [
      "",
      "0.0.0.0",
      "::",
      "0:0:0:0:0:0:0:0",
      "255.255.255.255",
      "192.0.2.1@evil.test",
      "evil.test",
      "[::1]",
      "fe80::1%eth0",
      "http://192.0.2.1",
    ])
      expect(equipmentTarget("Roteador", ip, 80, "http").url).toBeNull();
    for (const port of ["", 0, -1, 65536, "80/path", "80.5"]) expect(equipmentTarget("Roteador", "192.0.2.1", port, "http").url).toBeNull();
    for (const protocol of ["", "javascript", "ftp", "http://user:pass@"])
      expect(equipmentTarget("Roteador", "192.0.2.1", 80, protocol).url).toBeNull();
  });
  it("retorna uma seleção explícita de metadados, reconhece sem status e não mistura as senhas", () => {
    const details = loginDetails(login, false);
    expect(details).toMatchObject({
      active: false,
      status: "unknown",
      authentication: "PPPoE",
      routerUsername: "admin",
      wifi24Ssid: "Wi-Fi teste",
      accessTargets: [],
      secretAvailability: { authentication: true, router1: true, router2: false, wifi24: false, wifi5: false, wpa: false },
    });
    for (const forbidden of ["SENHA_FICTICIA", "ROTEADOR_FICTICIO", "HASH_NUNCA_EXPOSTO", "NUNCA_EXPOSTO", "senha_md5", "campo_privado"])
      expect(JSON.stringify(details)).not.toContain(forbidden);
    expect(loginDetails({ ...login, online: "S" }, true).status).toBe("online");
    expect(loginDetails({ ...login, online: "N" }, true).status).toBe("offline");
    expect(loginDetails(login, true).accessTargets).toHaveLength(3);
  });
  it("pagina ativos e inativos somente dentro do contrato e cliente, e relê o IXC a cada chamada", async () => {
    const { service, listPage } = serviceFixture();
    expect(await service.logins(10, { page: 2, limit: 25 })).toMatchObject({
      total: 42,
      page: 2,
      limit: 25,
      items: [{ id: 20, active: false, accessTargets: [] }],
    });
    await service.logins(10, { page: 1, limit: 10 }, true);
    expect(listPage).toHaveBeenCalledTimes(4);
    expect(listPage).toHaveBeenCalledWith(
      "radusuarios",
      expect.objectContaining({
        qtype: "radusuarios.id_contrato",
        query: "10",
        oper: "=",
        rp: 25,
        gridParam: [{ TB: "radusuarios.id_cliente", OP: "=", P: "3" }],
      }),
      2
    );
    expect(JSON.stringify(listPage.mock.calls)).not.toContain("radusuarios.ativo");
  });
  it("recusa retornos de outros contratos ou clientes mesmo que o IXC ignore um filtro", async () => {
    for (const row of [
      { ...login, id_contrato: "11" },
      { ...login, id_cliente: "4" },
      { ...login, id: "0" },
    ]) {
      const { service } = serviceFixture([row]);
      await expect(service.logins(10, { page: 1, limit: 10 })).rejects.toMatchObject({ statusCode: 502 });
      await expect(service.loginSecret(10, 20, "authentication")).rejects.toMatchObject({ statusCode: 404 });
    }
  });
  it("consulta exclusivamente a senha solicitada, preserva espaços e não retorna hashes", async () => {
    const { service, listPage } = serviceFixture();
    expect(await service.loginSecret(10, 20, "authentication")).toMatchObject({ value: "  SENHA_FICTICIA  " });
    expect(await service.loginSecret(10, 20, "router1")).toMatchObject({ value: "ROTEADOR_FICTICIO" });
    expect(await service.loginSecret(10, 20, "wifi24")).toMatchObject({ value: null });
    expect(listPage).toHaveBeenCalledWith(
      "radusuarios",
      expect.objectContaining({
        qtype: "radusuarios.id",
        query: "20",
        rp: 1,
        gridParam: [
          { TB: "radusuarios.id_contrato", OP: "=", P: "10" },
          { TB: "radusuarios.id_cliente", OP: "=", P: "3" },
        ],
      }),
      1
    );
    expect(listPage).toHaveBeenCalledTimes(6);
  });
  it("prepara as seis combinações com IP e senha atuais, recusando login alheio, IP inválido e senha ausente", async () => {
    const { service } = serviceFixture();
    for (const protocol of ["http", "https"] as const) {
      for (const port of [80, 7000, 7001] as const) {
        expect(await service.loginAccess(10, 20, protocol, port)).toMatchObject({
          url: `${protocol}://192.0.2.10:${port}/`,
          password: "ROTEADOR_FICTICIO",
        });
      }
    }
    for (const row of [
      { ...login, id_contrato: "11" },
      { ...login, id_cliente: "4" },
    ]) {
      await expect(serviceFixture([row]).service.loginAccess(10, 20, "http", 7000)).rejects.toMatchObject({ statusCode: 404 });
    }
    for (const ip of ["", "0.0.0.0", "https://192.0.2.10", "192.0.2.10@attacker.example"]) {
      await expect(serviceFixture([{ ...login, ip }]).service.loginAccess(10, 20, "http", 7000)).rejects.toMatchObject({ statusCode: 422 });
    }
    await expect(serviceFixture([{ ...login, senha_router1: " " }]).service.loginAccess(10, 20, "https", 80)).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(
      await serviceFixture([{ ...login, ip: "2001:db8::10", senha_router1: "  TESTE  " }]).service.loginAccess(10, 20, "https", 7001)
    ).toMatchObject({ url: "https://[2001:db8::10]:7001/", password: "  TESTE  " });
  });
  it("enriquece os contatos sem duplicar leitura do cadastro e mantém credenciais fora dos detalhes gerais", async () => {
    const { service, listPage } = serviceFixture();
    const result = await service.contract(10);
    expect(result.contract).toMatchObject({ contacts: [{ number: "(99) 99999-0000" }], email: "teste@example.test" });
    expect(listPage.mock.calls.filter(([endpoint]) => endpoint === "cliente")).toHaveLength(1);
    expect(listPage.mock.calls.some(([endpoint]) => endpoint === "radusuarios")).toBe(false);
    expect(JSON.stringify(result)).not.toContain("CENTRAL_NUNCA_EXPOSTA");
  });
  it("exige contrato ativo antes de buscar logins e não aproveita um contrato diferente", async () => {
    const { service, listPage } = serviceFixture();
    listPage.mockResolvedValueOnce({ rows: [{ ...contract, status: "I" }], total: 1 });
    await expect(service.logins(10, { page: 1, limit: 10 })).rejects.toMatchObject({ statusCode: 404 });
    expect(listPage).toHaveBeenCalledTimes(1);
    listPage.mockResolvedValueOnce({ rows: [{ ...contract, id: "11" }], total: 1 });
    await expect(service.loginSecret(10, 20, "authentication")).rejects.toMatchObject({ statusCode: 404 });
    expect(listPage).toHaveBeenCalledTimes(2);
  });
  it("não concede senhas e equipamentos nos papéis operacionais; perfis podem conceder cada ação separadamente", () => {
    for (const role of ["OPERATOR", "MANAGER"]) {
      expect(rolePermissions[role]).toContain("upgrades.logins.view");
      expect(rolePermissions[role]).not.toContain("upgrades.credentials.view");
      expect(rolePermissions[role]).not.toContain("upgrades.equipment.access");
    }
    expect(effectivePermissions("OPERATOR", ["upgrades.logins.view"], { "upgrades.credentials.view": true })).toEqual([
      "upgrades.logins.view",
      "upgrades.credentials.view",
    ]);
    expect(rolePermissions.ADMIN).toEqual(expect.arrayContaining(["upgrades.credentials.view", "upgrades.equipment.access"]));
  });
});

async function routeFixture(permissions: Permission[], role = "OPERATOR") {
  vi.spyOn(AuthService.prototype, "authenticate").mockResolvedValue({
    id: 1,
    name: "Teste",
    email: "teste@example.test",
    role,
    permissions,
  });
  const listPage = vi
    .spyOn(IxcApiService.prototype, "listPage")
    .mockImplementation(async (endpoint) => ({ rows: endpoint === "cliente_contrato" ? [contract] : [login], total: 1 }));
  const logs: string[] = [];
  const app = Fastify({
    logger: {
      stream: {
        write: (message: string) => {
          logs.push(message);
        },
      },
    },
  });
  await app.register(upgradeRoutes, { prefix: "/api/upgrades", logLevel: "silent" });
  return { app, listPage, logs };
}
const base = "/api/upgrades/contracts/10/logins";
describe("Permissões e privacidade dos logins", () => {
  it("bloqueia chamadas sem cada permissão necessária antes de acessar o IXC", async () => {
    for (const permissions of [[], ["upgrades.contract.view"], ["upgrades.logins.view"]] as Permission[][]) {
      const { app, listPage } = await routeFixture(permissions);
      try {
        expect((await app.inject({ url: base })).statusCode).toBe(403);
        expect(listPage).not.toHaveBeenCalled();
      } finally {
        await app.close();
        vi.restoreAllMocks();
      }
    }
    const { app, listPage } = await routeFixture(["upgrades.contract.view", "upgrades.logins.view"]);
    try {
      const response = await app.inject({ url: base });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json().items[0].accessTargets).toEqual([]);
      listPage.mockClear();
      const blocked = await app.inject({ url: `${base}/20/secrets/authentication` });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.headers["cache-control"]).toBe("no-store");
      expect(listPage).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("exige as quatro permissões, valida presets e não registra a resposta de acesso", async () => {
    const permissions: Permission[] = [
      "upgrades.contract.view",
      "upgrades.logins.view",
      "upgrades.credentials.view",
      "upgrades.equipment.access",
    ];
    for (const missing of permissions) {
      const { app, listPage } = await routeFixture(permissions.filter((key) => key !== missing));
      try {
        expect(
          (await app.inject({ method: "POST", url: `${base}/20/access`, payload: { protocol: "https", port: 7000 } })).statusCode
        ).toBe(403);
        expect(listPage).not.toHaveBeenCalled();
      } finally {
        await app.close();
        vi.restoreAllMocks();
      }
    }
    const { app, listPage, logs } = await routeFixture(permissions);
    try {
      for (const payload of [
        { protocol: "ssh", port: 7000 },
        { protocol: "https", port: 443 },
        { protocol: "http", port: "7000" },
      ]) {
        expect((await app.inject({ method: "POST", url: `${base}/20/access`, payload })).statusCode).toBe(400);
      }
      expect(listPage).not.toHaveBeenCalled();
      const response = await app.inject({ method: "POST", url: `${base}/20/access`, payload: { protocol: "https", port: 7001 } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json()).toMatchObject({ url: "https://192.0.2.10:7001/", password: "ROTEADOR_FICTICIO" });
      expect(response.json().url).not.toContain("ROTEADOR_FICTICIO");
      expect(response.body).not.toContain("SENHA_FICTICIA");
      expect(logs).toEqual([]);
    } finally {
      await app.close();
    }
  });
  it("permite apenas campos conhecidos, mantém no-store e não registra senhas, login ou payloads", async () => {
    const { app, listPage, logs } = await routeFixture([], "ADMIN");
    try {
      for (const suffix of ["/20/secrets/senha_md5", "/0/secrets/authentication", "/20/secrets/unknown"])
        expect((await app.inject({ url: base + suffix })).statusCode).toBe(400);
      expect((await app.inject({ url: `${base}?limit=100` })).statusCode).toBe(400);
      expect(listPage).not.toHaveBeenCalled();
      const metadata = await app.inject({ url: base });
      expect(metadata.json().items[0].accessTargets[0].url).toBe("http://192.0.2.10:80/");
      expect(metadata.body).not.toContain("SENHA_FICTICIA");
      const secret = await app.inject({ url: `${base}/20/secrets/authentication` });
      expect(secret.statusCode).toBe(200);
      expect(secret.headers["cache-control"]).toBe("no-store");
      expect(secret.json().value).toBe("  SENHA_FICTICIA  ");
      expect(secret.body).not.toContain("ROTEADOR_FICTICIO");
      expect(secret.body).not.toContain("HASH_NUNCA_EXPOSTO");
      expect(logs).toEqual([]);
      listPage.mockRejectedValueOnce(new Error("PRIVATE_PASSWORD_OR_PAYLOAD"));
      const failed = await app.inject({ url: `${base}/20/secrets/authentication` });
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain("PRIVATE_PASSWORD_OR_PAYLOAD");
    } finally {
      await app.close();
    }
  });
});
