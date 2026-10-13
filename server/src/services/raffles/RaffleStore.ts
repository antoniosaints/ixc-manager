import { db } from "../../repositories/database.js";
import type { RowDataPacket } from "mysql2/promise";
import { raffleError, type RaffleState } from "./raffleModel.js";

export interface RaffleStorage {
  create(state: RaffleState): Promise<void>;
  list(): Promise<{ id: string; name: string; createdAt: string; total: number; drawn: number }[]>;
  read(id: string): Promise<RaffleState>;
  revision(id: string): Promise<number>;
  publicId(hash: string): Promise<string>;
  mutate(id: string, fn: (state: RaffleState) => void): Promise<RaffleState>;
}
const decode = (raw: unknown): RaffleState => (typeof raw === "string" ? JSON.parse(raw) : (raw as RaffleState));
export class RaffleStore implements RaffleStorage {
  async create(s: RaffleState) {
    await db.execute("INSERT INTO retention_raffles(id,name,state,public_hash,created_by) VALUES(?,?,?,NULL,?)", [
      s.id,
      s.config.name,
      JSON.stringify(s),
      s.createdBy,
    ]);
  }
  async list() {
    const [rows] = await db.query<RowDataPacket[]>(
      "SELECT id,name,JSON_UNQUOTE(JSON_EXTRACT(state,'$.createdAt')) createdAt,JSON_LENGTH(JSON_EXTRACT(state,'$.participants')) total,JSON_LENGTH(JSON_EXTRACT(state,'$.results')) drawn FROM retention_raffles ORDER BY created_at DESC,id DESC LIMIT 100"
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      createdAt: String(r.createdAt),
      total: Number(r.total),
      drawn: Number(r.drawn),
    }));
  }
  async read(id: string) {
    const [rows] = await db.query<RowDataPacket[]>("SELECT state FROM retention_raffles WHERE id=?", [id]);
    if (!rows[0]) throw raffleError("Sorteio não encontrado.", 404);
    return decode(rows[0].state);
  }
  async publicId(hash: string) {
    const [rows] = await db.query<RowDataPacket[]>("SELECT id FROM retention_raffles WHERE public_hash=?", [hash]);
    if (!rows[0]) throw raffleError("Link indisponível ou revogado.", 404);
    return String(rows[0].id);
  }
  async revision(id: string) {
    const [rows] = await db.query<RowDataPacket[]>("SELECT JSON_EXTRACT(state,'$.revision') revision FROM retention_raffles WHERE id=?", [
      id,
    ]);
    if (!rows[0]) throw raffleError("Sorteio não encontrado.", 404);
    return Number(rows[0].revision);
  }
  /** Row lock serializes different administrators, workers and duplicate requests. */
  async mutate(id: string, fn: (s: RaffleState) => void) {
    const c = await db.getConnection();
    try {
      await c.beginTransaction();
      const [rows] = await c.query<RowDataPacket[]>("SELECT state FROM retention_raffles WHERE id=? FOR UPDATE", [id]);
      if (!rows[0]) throw raffleError("Sorteio não encontrado.", 404);
      const state = decode(rows[0].state),
        revision = state.revision;
      fn(state);
      if (state.revision !== revision)
        await c.execute("UPDATE retention_raffles SET name=?,state=?,public_hash=? WHERE id=?", [
          state.config.name,
          JSON.stringify(state),
          state.publicHash,
          id,
        ]);
      await c.commit();
      return state;
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
  }
}
