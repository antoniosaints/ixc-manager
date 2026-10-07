import axios, { type AxiosInstance } from "axios";
import { env } from "../../config/env.js";

export interface IxcListRequest {
  qtype: string;
  query: string;
  oper: string;
  gridParam?: Array<{ TB: string; OP: string; P: string; P2?: string }>;
  sortname: string;
  sortorder?: "asc" | "desc";
  rp?: number;
}
export interface IxcListResponse<T> {
  total?: number | string;
  registros?: T[];
  rows?: T[];
  [key: string]: unknown;
}
export interface IxcPage<T> {
  page: number;
  rows: T[];
  total: number;
}
type BatchProgressReporter = (progress: { processed: number; total: number }) => void | Promise<void>;

/** Single IXC boundary. It exposes the documented list format and hides auth from all callers. */
export class IxcApiService {
  private readonly http: AxiosInstance;
  private readonly attempts: number;
  constructor(options: { timeout?: number; attempts?: number } = {}) {
    this.attempts = options.attempts ?? 3;
    this.http = axios.create({
      baseURL: env.IXC_BASE_URL.replace(/\/$/, ""),
      timeout: options.timeout ?? 20_000,
      headers: { Authorization: env.IXC_AUTH_TOKEN, ixcsoft: "listar", "Content-Type": "application/json" },
    });
  }

  async listPage<T>(endpoint: string, request: IxcListRequest, page: number, signal?: AbortSignal): Promise<{ rows: T[]; total: number }> {
    const { data } = await this.withRetry(() =>
      this.http.get<IxcListResponse<T>>(`/${endpoint}`, {
        ...(signal ? { signal } : {}),
        data: {
          qtype: request.qtype,
          query: request.query,
          oper: request.oper,
          page: String(page),
          rp: String(request.rp ?? 500),
          sortname: request.sortname,
          sortorder: request.sortorder ?? "asc",
          ...(request.gridParam?.length ? { grid_param: JSON.stringify(request.gridParam) } : {}),
        },
      })
    );
    // IXC omits registros entirely for an empty result ({ page: "1", total: "0" }).
    // Accept that empty list envelope, never an error or incomplete nonempty response.
    const emptyPage =
      data &&
      ["string", "number"].includes(typeof data.total) &&
      String(data.total).trim() !== "" &&
      Number(data.total) === 0 &&
      Number.isSafeInteger(Number(data.page)) &&
      Number(data.page) > 0 &&
      String(data.type).toLowerCase() !== "error";
    if (!data || (!Array.isArray(data.registros) && !Array.isArray(data.rows) && !emptyPage)) {
      throw new Error("IXC não retornou uma listagem válida");
    }
    const rows = Array.isArray(data.registros) ? data.registros : Array.isArray(data.rows) ? data.rows : [];
    return { rows, total: Number(data.total ?? rows.length) };
  }

  async listAll<T>(endpoint: string, request: IxcListRequest, onProgress?: BatchProgressReporter): Promise<T[]> {
    const all: T[] = [];
    for await (const batch of this.listBatches<T>(endpoint, request)) {
      all.push(...batch.rows);
      await onProgress?.({ processed: all.length, total: batch.total });
    }
    return all;
  }

  async *listBatches<T>(endpoint: string, request: IxcListRequest): AsyncGenerator<IxcPage<T>> {
    const perPage = request.rp ?? 500;
    let processed = 0;
    for (let page = 1; ; page++) {
      const result = await this.listPage<T>(endpoint, request, page);
      processed += result.rows.length;
      yield { page, ...result };
      if (result.rows.length < perPage || processed >= result.total) return;
    }
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.attempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt + 1 < this.attempts) await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
      }
    }
    throw lastError;
  }
}
