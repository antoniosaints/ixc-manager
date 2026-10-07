import { beforeEach, describe, expect, it, vi } from "vitest";
import mysql from "mysql2/promise";
import { IxcReadDatabase, assertReadQuery } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { movementQuery, titleQuery } from "../src/integrations/ixc/database/financeQueries.js";
import { IxcFinanceReadRepository } from "../src/integrations/ixc/database/IxcFinanceReadRepository.js";
import {
  decimalToUnits,
  mapDate,
  mapIdentifier,
  mapLoginConnection,
  mapMoney,
  mapAccountingRegime,
} from "../src/integrations/ixc/database/maps/valueMappers.js";
import { ixcTables } from "../src/integrations/ixc/database/maps/tables.generated.js";
import { loadIxcTableMap } from "../src/integrations/ixc/database/maps/schemaCatalog.js";
import { ixcRelations } from "../src/integrations/ixc/database/maps/relations.js";
vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn() } }));
const input = { from: "2026-10-01", to: "2026-10-06" };

describe("IXC database read boundary", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([
    "DELETE FROM cliente",
    "UPDATE cliente SET ativo='N'",
    "SELECT 1; DELETE FROM cliente",
    "SELECT 1 INTO OUTFILE '/tmp/a'",
    "SELECT * FROM cliente FOR UPDATE",
    "SELECT SLEEP(10)",
    "SELECT 1 /* ignored */",
  ])("rejects %s", (sql) => {
    expect(() => assertReadQuery({ name: "unsafe", sql, params: [] })).toThrow("não permitida");
  });
  it("uses a read-only snapshot, server timeout, exact driver types and releases on failure", async () => {
    const connection = {
      query: vi.fn().mockResolvedValue([[{ amount: "90071992547409.91" }], []]),
      rollback: vi.fn(),
      release: vi.fn(),
      destroy: vi.fn(),
    };
    const pool = { getConnection: vi.fn().mockResolvedValue(connection), end: vi.fn() };
    vi.mocked(mysql.createPool).mockReturnValue(pool as never);
    const db = new IxcReadDatabase();
    const result = await db.select<{ amount: string }>({ name: "amount", sql: "SELECT ? amount", params: ["90071992547409.91"] });
    expect(result[0]?.amount).toBe("90071992547409.91");
    expect(mysql.createPool).toHaveBeenCalledWith(
      expect.objectContaining({
        multipleStatements: false,
        decimalNumbers: false,
        bigNumberStrings: true,
        dateStrings: true,
        connectionLimit: 3,
      })
    );
    expect(connection.query.mock.calls[1]?.[0]).toBe("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
    expect(connection.query.mock.calls[2]?.[0]).toBe("SET STATEMENT max_statement_time=15 FOR SELECT ? amount");
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
    await expect(
      db.withSnapshot(async () => {
        throw new Error("invalid financial source");
      })
    ).rejects.toThrow("invalid financial source");
    expect(connection.rollback).toHaveBeenCalledTimes(2);
    expect(connection.release).toHaveBeenCalledTimes(2);
    await db.close();
    expect(pool.end).toHaveBeenCalledOnce();
  });
  it("cancels a running SQL read, destroys its connection and never starts the next query", async () => {
    let rejectQuery: (error: Error) => void = () => {};
    const controller = new AbortController();
    const connection = {
      query: vi.fn().mockResolvedValue([[], []]),
      rollback: vi.fn(),
      release: vi.fn(),
      destroy: vi.fn(() => rejectQuery(new Error("connection closed"))),
    };
    connection.query.mockImplementation(async (sql: string) => {
      if (!sql.startsWith("SET STATEMENT")) return [[], []];
      return new Promise((_resolve, reject) => {
        rejectQuery = reject;
        queueMicrotask(() => controller.abort());
      });
    });
    vi.mocked(mysql.createPool).mockReturnValue({ getConnection: async () => connection, end: vi.fn() } as never);
    const db = new IxcReadDatabase();
    await expect(
      db.withSnapshot(async (session) => {
        await session.select({ name: "first", sql: "SELECT 1", params: [] });
        await session.select({ name: "second", sql: "SELECT 2", params: [] });
      }, controller.signal)
    ).rejects.toMatchObject({ statusCode: 499 });
    expect(connection.destroy).toHaveBeenCalledOnce();
    expect(connection.query.mock.calls.filter(([sql]) => String(sql).startsWith("SET STATEMENT"))).toHaveLength(1);
    expect(connection.release).toHaveBeenCalledOnce();
    await db.close();
  });
  it("cannot open a connection for rejected SQL", async () => {
    await expect(new IxcReadDatabase().select({ name: "unsafe", sql: "DELETE FROM cliente", params: [] })).rejects.toThrow();
    expect(mysql.createPool).not.toHaveBeenCalled();
  });
});

describe("IXC financial scope and mappers", () => {
  beforeEach(() => vi.clearAllMocks());
  it("binds periods and filters without wrapping indexed date columns", () => {
    const query = movementQuery({ ...input, branchId: 8, accountId: 12 });
    expect(query.params).toEqual(["2026-09-25", "2026-10-07", 8, 12]);
    expect(query.sql).toContain("t.data >= ? AND t.data < ? AND t.filial_id = ? AND t.id_conta = ?");
    expect(query.sql).not.toMatch(/DATE\(t\.data\)|SELECT\s+\*/);
    const title = titleQuery("receivable", input, "2026-10-06");
    expect(title.params).toEqual(["2026-10-06", "2026-10-01", "2026-10-07"]);
    expect(title.sql).toContain("titulo_renegociado");
    expect(() => movementQuery({ from: "2026-02-30", to: "2026-10-06" })).toThrow();
    expect(() => movementQuery({ ...input, accountId: "1 OR 1=1" as unknown as number })).toThrow();
  });
  it("preserves huge amounts, negative reversals, nulls, zero dates and big IDs", () => {
    expect(decimalToUnits("9007199254740993.91")).toBe(900719925474099391n);
    expect(decimalToUnits("-0.05")).toBe(-5n);
    expect(decimalToUnits("12.123456789", 9)).toBe(12123456789n);
    expect(mapMoney(null)).toBeNull();
    expect(() => decimalToUnits("1.009")).toThrow();
    expect(mapDate("0000-00-00")).toBeNull();
    expect(mapDate("2026-02-30")).toBeNull();
    expect(mapDate("2026-10-06 23:59:59")).toBe("2026-10-06");
    expect(mapIdentifier("9007199254740993")).toBe("9007199254740993");
    expect(() => mapIdentifier(Number.MAX_SAFE_INTEGER + 2)).toThrow();
    expect(mapAccountingRegime("S")).toBe("cash");
    expect(mapAccountingRegime("N")).toBe("competence");
    expect(mapAccountingRegime("")).toBe("unknown");
    expect(mapLoginConnection("SS")).toBe("never-authenticated");
    expect(mapLoginConnection("I")).toBe("unknown");
  });
  it("keeps nullable balances and canceled/renegotiated buckets visible for review", async () => {
    const select = vi
      .fn()
      .mockResolvedValueOnce([
        {
          day: "2026-10-01",
          branchId: 1,
          accountId: 3,
          accountName: "Receita",
          analyticType: "R",
          syntheticType: "D",
          regimeCode: "S",
          cancellationCode: "S",
          credit: "1.00",
          debit: "0.00",
          movementCount: "1",
          transferLinkedCount: "1",
        },
      ])
      .mockResolvedValueOnce([
        {
          statusCode: "C",
          regimeCode: "S",
          reversedCode: "N",
          renegotiatedCode: "S",
          titleCount: "1",
          nullBalanceCount: "1",
          negativeBalanceCount: "0",
          openTitleCount: "0",
          openBalance: null,
          overdueBalance: "0",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ movementCount: "0", credit: null, debit: null }]);
    const repository = new IxcFinanceReadRepository(
      { withSnapshot: (callback) => callback({ select }) },
      () => new Date("2026-10-06T12:00:00Z")
    );
    const result = await repository.analyze(input);
    expect(result.movements[0]).toMatchObject({ classificationConsistent: false, requiresCancellationReview: true, regime: "cash" });
    expect(result.receivables[0]).toMatchObject({ excludedByExistingRule: true, requiresRenegotiationReview: true, openBalance: null });
    expect(result.ledger[0]?.credit).toBeNull();
    expect(select).toHaveBeenCalledTimes(4);
    for (const [query] of select.mock.calls) assertReadQuery(query);
    expect(JSON.stringify(result)).not.toMatch(/password|historico|senha|cnpj/);
  });
  it("loads any table from the full local catalog without a database connection", async () => {
    const table = await loadIxcTableMap("fn_movim_finan");
    expect(table.columns).toContainEqual(expect.objectContaining({ name: "credito", type: "decimal(15,2)" }));
    table.columns.length = 0;
    expect((await loadIxcTableMap("fn_movim_finan")).columns.length).toBeGreaterThan(0);
    await expect(loadIxcTableMap("nonexistent-table")).rejects.toThrow("catálogo IXC local");
    expect(mysql.createPool).not.toHaveBeenCalled();
  });
  it("preserves the real misleading account link and distinguishes inferred relationships", () => {
    expect(ixcTables.contas.foreignKeys).toContainEqual(
      expect.objectContaining({ columnName: "id_planejamento", referencedTable: "planejamento_analitico" })
    );
    for (const link of ixcRelations.filter((relation) => relation.evidence === "foreign-key")) {
      const keys = ixcTables[link.fromTable].foreignKeys;
      expect(keys).toContainEqual(
        expect.objectContaining({ columnName: link.fromColumn, referencedTable: link.toTable, referencedColumn: link.toColumn })
      );
    }
  });
});
