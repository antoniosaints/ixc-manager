import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportService, type CustomerQuery } from "../src/services/support/SupportService.js";
import {
  IxcReadDatabase,
  assertReadQuery,
  type IxcReadQuery,
  type IxcReadSession,
} from "../src/integrations/ixc/database/IxcReadDatabase.js";
import type { IxcListRequest } from "../src/integrations/ixc/IxcApiService.js";
import { supportRoutes } from "../src/controllers/supportController.js";
import { AuthService } from "../src/services/AuthService.js";

const defaults: CustomerQuery = {
  status: "active",
  search: "",
  searchBy: "name",
  page: 1,
  limit: 10,
  sortColumn: "city",
  sortDirection: "asc",
};
afterEach(() => vi.restoreAllMocks());

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(`CREATE TABLE cidade(id INTEGER PRIMARY KEY,nome TEXT);
    CREATE TABLE cliente(id INTEGER PRIMARY KEY,razao TEXT,ativo TEXT,cnpj_cpf TEXT,telefone_celular TEXT,fone TEXT,cidade INTEGER,bairro TEXT,endereco TEXT,numero TEXT,complemento TEXT);
    INSERT INTO cidade VALUES (99,'Alto Alegre'),(5,'Bacabal'),(77,''),(78,'   ');`);
  const insert = sql.prepare("INSERT INTO cliente VALUES(?,?,'S',?,'','9999',?,'Centro',?,'10','Casa')");
  for (let id = 1; id <= 24; id++)
    insert.run(
      id,
      `Cliente ${String(id).padStart(3, "0")}`,
      "123.456.789-00",
      id % 2 ? 99 : 5,
      id === 1 ? "Rua 50% Central" : "Rua Central"
    );
  sql.exec(`INSERT INTO cliente(id,razao,ativo,cidade) VALUES
    (50,'Cliente inativo','N',99),(51,'Sem cidade','S',NULL),(52,'Cidade inexistente','S',404),
    (53,'Cidade vazia','S',77),(54,'Cidade em branco','S',78);`);
  const select = vi.fn(async <T extends object>(query: IxcReadQuery): Promise<T[]> => {
    assertReadQuery(query);
    return sql.prepare(query.sql).all(...query.params) as T[];
  });
  const database = {
    withSnapshot: async <T>(read: (session: IxcReadSession) => Promise<T>) => read({ select }),
    close: async () => {},
  };
  const listPage = vi.fn(async (endpoint: string, request: IxcListRequest) => {
    if (endpoint === "radusuarios") return { rows: [{ id: "100", id_cliente: "2", login: "suporte.teste" }], total: 1 };
    if (request.qtype === "cliente.cnpj_cpf")
      return request.query === "123.456.789-00" ? { rows: [{ id: "1", cnpj_cpf: request.query }], total: 1 } : { rows: [], total: 0 };
    // Reproduce the IXC grid limitation instead of accepting unknown sort fields.
    throw new Error(`Unsupported REST request: ${request.sortname}`);
  });
  const service = new SupportService({ listPage } as never, () => new Date("2026-10-13T19:00:00Z"), undefined, database);
  return { sql, select, database, listPage, service };
}

describe("Localidade na lista de clientes", () => {
  it("ordena pelo nome da cidade em ambas as direções antes de paginar, sem pedir cidade.nome à API de clientes", async () => {
    const { sql, service, listPage } = fixture();
    try {
      const first = await service.customers(defaults);
      const second = await service.customers({ ...defaults, page: 2 });
      const third = await service.customers({ ...defaults, page: 3 });
      expect(first.total).toBe(28);
      expect(first.items.map((row) => row.id)).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
      expect(second.items.map((row) => row.id)).toEqual([21, 23, 2, 4, 6, 8, 10, 12, 14, 16]);
      expect(first.items.every((row) => row.city === "Alto Alegre")).toBe(true);
      expect(third.items.slice(-4).every((row) => row.city === null)).toBe(true);
      expect(first.items[0]).toMatchObject({ phone: "9999", address: "Rua 50% Central, 10, Casa" });
      const descending = await service.customers({ ...defaults, sortDirection: "desc" });
      expect(descending.items.map((row) => row.id)).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
      const lastDescending = await service.customers({ ...defaults, sortDirection: "desc", page: 3 });
      expect(lastDescending.items.slice(-4).every((row) => row.city === null)).toBe(true);
      expect(listPage).not.toHaveBeenCalled();
      expect(first).toMatchObject({ page: 1, limit: 10, queriedAt: "2026-10-13T19:00:00.000Z" });
    } finally {
      await service.close();
      sql.close();
    }
  });

  it("preserva cadastro e todas as modalidades de busca, escapando os curingas de endereço", async () => {
    const { sql, service, listPage } = fixture();
    try {
      expect((await service.customers({ ...defaults, status: "all" })).total).toBe(29);
      expect((await service.customers({ ...defaults, status: "inactive" })).items.map((row) => row.id)).toEqual([50]);
      expect((await service.customers({ ...defaults, searchBy: "id", search: "50" })).total).toBe(0);
      expect((await service.customers({ ...defaults, search: "Cliente 001" })).items.map((row) => row.id)).toEqual([1]);
      expect((await service.customers({ ...defaults, searchBy: "address", search: "50%" })).items.map((row) => row.id)).toEqual([1]);
      expect((await service.customers({ ...defaults, searchBy: "login", search: "suporte" })).items.map((row) => row.id)).toEqual([2]);
      expect((await service.customers({ ...defaults, searchBy: "document", search: "12345678900" })).items.map((row) => row.id)).toEqual([
        1,
      ]);
      expect(listPage.mock.calls.every(([, request]) => request.sortname !== "cidade.nome")).toBe(true);
      listPage.mockClear();
      await expect(service.customers({ ...defaults, search: "ab" })).rejects.toMatchObject({ statusCode: 400 });
      await expect(service.customers({ ...defaults, searchBy: "id", search: "invalid" })).rejects.toMatchObject({ statusCode: 400 });
      expect(listPage).not.toHaveBeenCalled();
    } finally {
      await service.close();
      sql.close();
    }
  });

  it("a rota retorna a página ordenada com no-store e mantém autenticação e validação", async () => {
    const { sql, database, listPage } = fixture();
    vi.spyOn(IxcReadDatabase.prototype, "withSnapshot").mockImplementation(database.withSnapshot);
    vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async (request) =>
      request.headers.authorization
        ? { id: 1, name: "Operador", email: "operador@example.test", role: "OPERATOR", permissions: ["support.customers.view"] }
        : null
    );
    const app = Fastify();
    await app.register(supportRoutes, { prefix: "/api/support" });
    const url = "/api/support/customers?sortColumn=city&sortDirection=desc&page=2";
    try {
      expect((await app.inject({ url })).statusCode).toBe(401);
      const response = await app.inject({ url, headers: { authorization: "test" } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.json().items.map((row: { id: number }) => row.id)).toEqual([22, 24, 1, 3, 5, 7, 9, 11, 13, 15]);
      expect(response.json().total).toBe(28);
      expect(listPage).not.toHaveBeenCalled();
      expect(
        (await app.inject({ url: "/api/support/customers?sortColumn=city&sortDirection=invalid", headers: { authorization: "test" } }))
          .statusCode
      ).toBe(400);
    } finally {
      await app.close();
      sql.close();
    }
  });
});
