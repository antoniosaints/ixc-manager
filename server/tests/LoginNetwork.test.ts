import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { assertReadQuery, type IxcReadSession } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { ftthBoxesQuery, LoginNetworkService } from "../src/services/upgrades/LoginNetworkService.js";
import { UpgradeService } from "../src/services/upgrades/UpgradeService.js";
import { SupportService } from "../src/services/support/SupportService.js";
import type { IxcApiService } from "../src/integrations/ixc/IxcApiService.js";

const login = { id: "20", id_cliente: "3", id_contrato: "10", id_caixa_ftth: "25", login: "exemplo" };
function fixture(rows = [login]) {
  const select = vi.fn(async () => [
    { id: "25", descricao: " Caixa Exemplo " },
    { id: "99", descricao: "Outra caixa" },
  ]);
  const close = vi.fn(async () => {});
  const network = new LoginNetworkService({ select, close } as unknown as IxcReadSession & { close(): Promise<void> });
  const listPage = vi.fn(async (endpoint: string) => ({
    rows:
      endpoint === "cliente_contrato"
        ? [{ id: "10", id_cliente: "3", status: "A" }]
        : endpoint === "cliente"
          ? [{ id: "3", ativo: "S" }]
          : rows,
    total: endpoint === "radusuarios" ? rows.length : 1,
  }));
  const api = { listPage } as unknown as Pick<IxcApiService, "listPage">;
  return {
    network,
    select,
    close,
    upgrades: new UpgradeService(api, undefined, {}, network),
    support: new SupportService(api, undefined, network),
  };
}

describe("Nomes de caixas FTTH consultados no banco", () => {
  it("consulta IDs válidos e únicos com parâmetros e SELECT somente de ID e descrição", () => {
    const query = ftthBoxesQuery([25, "25", 26, null, 0, -1, "25 OR 1=1", Infinity])!;
    expect(() => assertReadQuery(query)).not.toThrow();
    expect(query.params).toEqual([25, 26]);
    expect(query.sql).toBe("SELECT id,descricao FROM rad_caixa_ftth WHERE id IN (?,?)");
    expect(ftthBoxesQuery([null, 0, "inválido"])).toBeNull();
  });

  it("resolve caixas da página em uma consulta, sem cache, e mantém IDs ausentes", async () => {
    const { network, select } = fixture();
    const items = [{ ftthBoxId: 25 }, { ftthBoxId: 25 }, { ftthBoxId: 26 }, { ftthBoxId: 99 }, { ftthBoxId: null }];
    select.mockResolvedValueOnce([
      { id: "25", descricao: " Caixa Exemplo " },
      { id: "88", descricao: "Fora da página" },
    ]);
    expect(await network.enrich(items)).toEqual([
      { ftthBoxId: 25, ftthBoxName: "Caixa Exemplo" },
      { ftthBoxId: 25, ftthBoxName: "Caixa Exemplo" },
      { ftthBoxId: 26, ftthBoxName: null },
      { ftthBoxId: 99, ftthBoxName: null },
      { ftthBoxId: null, ftthBoxName: null },
    ]);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select.mock.calls[0]).toEqual([expect.objectContaining({ params: [25, 26, 99] })]);
    await network.enrich(items);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("não consulta quando não há caixas e preserva logins se o banco falhar", async () => {
    const { network, select } = fixture();
    await network.enrich([]);
    await network.enrich([{ ftthBoxId: null }]);
    expect(select).not.toHaveBeenCalled();
    select.mockRejectedValueOnce(new Error("Dados privados da conexão"));
    expect(await network.enrich([{ ftthBoxId: 25 }])).toEqual([{ ftthBoxId: 25, ftthBoxName: null }]);
    select.mockResolvedValueOnce([{ id: "25", descricao: "  " }]);
    expect((await network.enrich([{ ftthBoxId: 25 }]))[0]?.ftthBoxName).toBeNull();
  });

  it("enriquece lista e detalhe de Upgrades, lista de Suporte e contratos do Suporte", async () => {
    const { upgrades, support, select, close } = fixture();
    const page = { page: 1, limit: 10 };
    expect((await upgrades.logins(10, page)).items[0]).toMatchObject({ ftthBoxId: 25, ftthBoxName: "Caixa Exemplo" });
    expect((await upgrades.login(10, 20)).login).toMatchObject({ ftthBoxName: "Caixa Exemplo" });
    expect((await support.logins(3, page, false)).items[0]).toMatchObject({ ftthBoxName: "Caixa Exemplo" });
    expect((await support.technical.logins(10, page)).items[0]).toMatchObject({ ftthBoxName: "Caixa Exemplo" });
    expect(select).toHaveBeenCalledTimes(4);
    await support.close();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("valida vínculo do login antes de consultar os nomes no banco", async () => {
    for (const row of [
      { ...login, id_contrato: "11" },
      { ...login, id_cliente: "4" },
    ]) {
      const { upgrades, select } = fixture([row]);
      await expect(upgrades.logins(10, { page: 1, limit: 10 })).rejects.toMatchObject({ statusCode: 502 });
      await expect(upgrades.login(10, 20)).rejects.toMatchObject({ statusCode: 404 });
      expect(select).not.toHaveBeenCalled();
    }
    const { support, select } = fixture([{ ...login, id_cliente: "4" }]);
    await expect(support.logins(3, { page: 1, limit: 10 }, false)).rejects.toMatchObject({ statusCode: 502 });
    expect(select).not.toHaveBeenCalled();
  });
  it("recupera caixa/porta da ONU com contrato antigo e serial do mesmo cliente, sem misturar outros vínculos", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,id_caixa_ftth INTEGER,onu_mac TEXT);
      CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER);
      CREATE TABLE radpop_radio_cliente_fibra(id INTEGER PRIMARY KEY,id_login INTEGER,id_contrato INTEGER,mac TEXT,serial_number TEXT,id_caixa_ftth INTEGER,porta_ftth INTEGER);
      CREATE TABLE rad_caixa_ftth(id INTEGER PRIMARY KEY,descricao TEXT);
      INSERT INTO cliente_contrato VALUES(10,3),(11,4),(12,3);
      INSERT INTO radusuarios VALUES(20,3,10,0,'SERIAL-DEMO'),(21,3,10,0,'SERIAL-TWO'),(22,3,10,25,'SERIAL-THREE');
      INSERT INTO rad_caixa_ftth VALUES(25,'Caixa ONU'),(26,'Outra caixa');
      INSERT INTO radpop_radio_cliente_fibra VALUES(1,20,12,'serial-demo',NULL,25,13),
        (2,20,11,'SERIAL-DEMO',NULL,26,2),(3,20,12,'WRONG',NULL,26,3),
        (4,21,10,'SERIAL-TWO',NULL,25,1),(5,21,10,'SERIAL-TWO',NULL,26,2),
        (6,22,10,'SERIAL-THREE',NULL,26,2);`);
    const select = vi.fn(async <T extends object>(q: Parameters<IxcReadSession["select"]>[0]) => {
      assertReadQuery(q);
      return db.prepare(q.sql).all(...q.params) as T[];
    });
    try {
      const network = new LoginNetworkService({ select });
      const result = await network.enrich([
        { id: 20, customerId: 3, contractId: 10, ftthBoxId: null, ftthPort: null },
        { id: 21, customerId: 3, contractId: 10, ftthBoxId: null, ftthPort: null },
        { id: 22, customerId: 3, contractId: 10, ftthBoxId: 25, ftthPort: "4" },
        { id: 20, customerId: 4, contractId: 10, ftthBoxId: null, ftthPort: null },
      ]);
      expect(result[0]).toMatchObject({ ftthBoxId: 25, ftthPort: "13", ftthBoxName: "Caixa ONU", ftthBoxSource: "onu" });
      expect(result[1]).toMatchObject({ ftthBoxId: null, ftthBoxAmbiguous: true });
      expect(result[2]).toMatchObject({ ftthBoxId: 25, ftthPort: "4" });
      expect(result[3]).toMatchObject({ ftthBoxId: null, ftthPort: null, ftthBoxName: null });
      expect(select).toHaveBeenCalledTimes(2);
      expect(select.mock.calls[0]?.[0].params).toEqual([20, 21]);
    } finally {
      db.close();
    }
  });
});
