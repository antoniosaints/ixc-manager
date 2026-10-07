import { afterEach, expect, it, vi } from "vitest";
import { SyncService } from "../src/services/retention/SyncService.js";
import { IxcApiService } from "../src/integrations/ixc/IxcApiService.js";
import { db } from "../src/repositories/database.js";
import { DatabaseSync } from "node:sqlite";

afterEach(() => vi.restoreAllMocks());
function fixture(rows: Record<string, string>[]) {
  const query = vi.spyOn(db, "query").mockResolvedValue([[], []] as any);
  const execute = vi.spyOn(db, "execute").mockResolvedValue([{}, []] as any);
  const listBatches = vi.fn(async function* () {
    yield { rows, total: rows.length };
  });
  const service = new SyncService({ listBatches } as unknown as IxcApiService);
  return { service, query, execute, listBatches };
}
it("um lote só de cancelamentos desativa contratos locais e sinaliza os clientes afetados", async () => {
  const { service, execute, query } = fixture([
    { id: "12", id_cliente: "7", status: "I", status_internet: "D", data_cancelamento: "2026-10-07" },
  ]);
  const result = await service.sync("contracts");
  expect(result).toEqual({ synchronized: 0, affectedCustomerIds: [7] });
  expect(execute.mock.calls[0]).toEqual([
    "UPDATE retention_contracts SET status='I',synced_at=NOW() WHERE (id,customer_id) IN ((?,?))",
    ["12", "7"],
  ]);
  const cancellation = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO retention_cancellations"));
  expect(cancellation?.[1]).toEqual(["7", "12", "2026-10-07", null, null]);
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.function("NOW", () => "2026-10-07T12:00:00Z");
    sqlite.exec(`CREATE TABLE retention_contracts (id INTEGER PRIMARY KEY,customer_id INTEGER,status TEXT,synced_at TEXT);
      INSERT INTO retention_contracts VALUES (12,7,'A',NULL),(13,7,'A',NULL),(14,8,'A',NULL)`);
    const [sql, params] = execute.mock.calls[0] as unknown as [string, string[]];
    sqlite.prepare(sql).run(...params);
    expect(sqlite.prepare("SELECT status FROM retention_contracts WHERE id=12").get()).toMatchObject({ status: "I" });
    expect(sqlite.prepare("SELECT COUNT(*) n FROM retention_contracts WHERE status='A'").get()).toMatchObject({ n: 2 });
    sqlite.prepare(sql).run("14", "7");
    expect(sqlite.prepare("SELECT status FROM retention_contracts WHERE id=14").get()).toMatchObject({ status: "A" });
  } finally {
    sqlite.close();
  }
});
it("grava cancelamentos em lote em vez de uma ida ao banco por cancelamento", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({
    id: String(i + 1),
    id_cliente: "7",
    status: "I",
    data_cancelamento: "2026-10-07",
  }));
  const { service, query, execute } = fixture(rows);
  expect((await service.sync("contracts")).affectedCustomerIds).toEqual([7]);
  expect(execute.mock.calls.filter(([sql]) => String(sql).includes("UPDATE retention_contracts")).length).toBeLessThan(100);
  expect(query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO retention_cancellations")).length).toBeLessThan(100);
});
it("processa cada contrato uma vez e não revarre todo o lote a cada registro", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1), id_cliente: String((i % 5) + 1), status: "A" }));
  const { service, listBatches } = fixture(rows),
    track = vi.spyOn(service as any, "trackCustomer");
  expect(await service.sync("contracts")).toEqual({ synchronized: 100, affectedCustomerIds: [1, 2, 3, 4, 5] });
  expect(track).toHaveBeenCalledTimes(100);
  expect(listBatches).toHaveBeenCalledOnce();
});
it("registros sem contrato ou cliente válido não alteram nem sinalizam contratos locais", async () => {
  const { service, execute } = fixture([
    { id_cliente: "7", status: "I" },
    { id: "12", status: "I" },
  ]);
  expect(await service.sync("contracts")).toEqual({ synchronized: 0, affectedCustomerIds: [] });
  expect(execute).toHaveBeenCalledOnce(); // Only the local synchronization checkpoint.
  expect(execute.mock.calls[0]![0]).toContain("retention_sync_state");
});
