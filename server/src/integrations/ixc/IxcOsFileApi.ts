import axios from "axios";
import { env } from "../../config/env.js";

export const MAX_OS_FILE_BYTES = 20 * 1024 * 1024;
/** Documented read action only. No paths or URLs are accepted from the browser. */
export class IxcOsFileApi {
  private readonly http = axios.create({
    baseURL: env.IXC_BASE_URL.replace(/\/$/, ""),
    timeout: 20000,
    maxRedirects: 0,
    maxContentLength: MAX_OS_FILE_BYTES,
    headers: { Authorization: env.IXC_AUTH_TOKEN, ixcsoft: "listar", "Content-Type": "application/json" },
  });
  async content(fileId: number, signal?: AbortSignal): Promise<Buffer> {
    try {
      const response = await this.http.get("/visualizar_arquivo_os", {
        data: { id: String(fileId) },
        responseType: "arraybuffer",
        signal,
      });
      const type = String(response.headers["content-type"] ?? "").toLowerCase();
      // IXC returns binary attachments; an HTML/JSON error is never an attachment.
      if (type.includes("json") || type.includes("text/html")) throw new Error("Invalid IXC file response");
      const buffer = Buffer.from(response.data);
      if (!buffer.length || buffer.length > MAX_OS_FILE_BYTES) throw new Error("Invalid attachment size");
      return buffer;
    } catch (error) {
      const tooLarge = axios.isAxiosError(error) && /maxContentLength/i.test(error.message);
      throw Object.assign(
        new Error(
          tooLarge ? "O arquivo excede 20 MB. Consulte-o diretamente no IXC." : "Não foi possível abrir o arquivo no IXC. Tente novamente."
        ),
        { statusCode: tooLarge ? 413 : 502 }
      );
    }
  }
}

/** Only inert image formats and PDF can be previewed. HTML/SVG remain downloads. */
export function osFileContentType(buffer: Buffer): string {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return "application/octet-stream";
}
