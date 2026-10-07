import mysql, { type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { env } from "../../../config/env.js";

export interface IxcReadQuery {
  name: string;
  sql: string;
  params: (string | number | null)[];
  timeoutSeconds?: number;
}
export interface IxcReadSession {
  select<T extends object>(query: IxcReadQuery): Promise<T[]>;
}
/** Internal trusted queries only. No HTTP endpoint accepts SQL, table names or column names. */
export function assertReadQuery(query: IxcReadQuery): void {
  if (
    query.timeoutSeconds !== undefined &&
    (!Number.isInteger(query.timeoutSeconds) || query.timeoutSeconds < 1 || query.timeoutSeconds > 15)
  )
    throw new Error("Limite SQL inválido");
  if (
    !/^SELECT\s/i.test(query.sql.trim()) ||
    /;|\/\*|--|#|\b(INTO|OUTFILE|DUMPFILE|FOR\s+UPDATE|LOCK\s+IN\s+SHARE|SLEEP|BENCHMARK|GET_LOCK|RELEASE_LOCK)\b/i.test(query.sql)
  )
    throw new Error(`Consulta IXC não permitida: ${query.name}`);
}

export class IxcReadDatabase implements IxcReadSession {
  private pool: Pool | undefined;
  private getPool(): Pool {
    if (!this.pool) {
      if (!env.DATABASE_IXC_HOST || !env.DATABASE_IXC_USER || !env.DATABASE_IXC_PASSWORD || !env.DATABASE_IXC_NAME) {
        throw new Error("Preencha as variáveis DATABASE_IXC_* para usar a conexão IXC de leitura.");
      }
      this.pool = mysql.createPool({
        host: env.DATABASE_IXC_HOST,
        port: env.DATABASE_IXC_PORT,
        user: env.DATABASE_IXC_USER,
        password: env.DATABASE_IXC_PASSWORD,
        database: env.DATABASE_IXC_NAME,
        connectionLimit: 3,
        maxIdle: 3,
        idleTimeout: 30000,
        connectTimeout: 10000,
        queueLimit: 12,
        waitForConnections: true,
        multipleStatements: false,
        supportBigNumbers: true,
        bigNumberStrings: true,
        decimalNumbers: false,
        dateStrings: true,
        charset: "utf8mb4",
      });
    }
    return this.pool;
  }
  private async run<T extends object>(connection: PoolConnection, query: IxcReadQuery, explain = false): Promise<T[]> {
    assertReadQuery(query);
    // MariaDB 11.4: server aborts a slow SELECT; setting applies to this statement only.
    const [rows] = await connection.query<RowDataPacket[]>(
      `SET STATEMENT max_statement_time=${query.timeoutSeconds ?? 15} FOR ${explain ? "EXPLAIN " : ""}${query.sql}`,
      query.params
    );
    return rows as T[];
  }
  async select<T extends object>(query: IxcReadQuery): Promise<T[]> {
    assertReadQuery(query);
    return this.withSnapshot((session) => session.select<T>(query));
  }
  async explain(query: IxcReadQuery): Promise<Record<string, unknown>[]> {
    assertReadQuery(query);
    const connection = await this.getPool().getConnection();
    try {
      return await this.run<Record<string, unknown>>(connection, query, true);
    } finally {
      connection.release();
    }
  }
  /** A short InnoDB snapshot avoids totals and series observing different updates. */
  async withSnapshot<T>(read: (session: IxcReadSession) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw Object.assign(new Error("Consulta interrompida."), { statusCode: 499 });
    const connection = await this.getPool().getConnection();
    const aborted = () => connection.destroy();
    const check = () => {
      if (signal?.aborted) throw Object.assign(new Error("Consulta interrompida."), { statusCode: 499 });
    };
    signal?.addEventListener("abort", aborted, { once: true });
    try {
      check();
      await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
      const result = await read({
        select: async <R extends object>(query: IxcReadQuery) => {
          check();
          return this.run<R>(connection, query);
        },
      });
      check();
      return result;
    } catch (error) {
      check();
      if ((error as { errno?: number }).errno === 1969) {
        throw Object.assign(new Error("A consulta excedeu o tempo disponível. Reduza o período ou filtre uma conta."), { statusCode: 422 });
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", aborted);
      // Rollback ends the read view. It never writes a business record.
      try {
        await connection.rollback();
      } catch {
        connection.destroy();
      }
      connection.release();
    }
  }
  async close(): Promise<void> {
    await this.pool?.end();
    this.pool = undefined;
  }
}
