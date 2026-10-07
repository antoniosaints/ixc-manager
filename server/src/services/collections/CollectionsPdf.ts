import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import type { CollectionsService } from "./CollectionsService.js";
type Distribution = Awaited<ReturnType<CollectionsService["distribution"]>>;
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (s: string | null) => (s ? s.split("-").reverse().join("/") : "Sem data");
const rgb = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const mix = (a: string, b: string, w: number) =>
  "#" +
  rgb(a)
    .map((n, i) =>
      Math.round(n * (1 - w) + rgb(b)[i]! * w)
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
const contrast = (s: string) =>
  1.05 /
  (rgb(s)
    .map((n) => n / 255)
    .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
    .reduce((a, n, i) => a + n * [0.2126, 0.7152, 0.0722][i]!, 0) +
    0.05);

/** Generated in memory only, with one A4 page per responsible person. */
export function createCollectionsPdf(distribution: Distribution, options: { accentColor?: string } = {}): Promise<Buffer> {
  const accent = /^#[\da-f]{6}$/i.test(options.accentColor ?? "") ? options.accentColor! : "#c2410c";
  let readable = accent;
  for (let i = 1; i <= 10 && contrast(readable) < 4.5; i++) readable = mix(accent, "#0f172a", i / 10);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, size: "A4", margin: 28, info: { Title: "Lista de cobranças", Author: "CAS" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      doc.registerFont("Regular", fileURLToPath(new URL("../../../assets/fonts/DejaVuSans.ttf", import.meta.url)));
      doc.registerFont("Bold", fileURLToPath(new URL("../../../assets/fonts/DejaVuSans-Bold.ttf", import.meta.url)));
      const text = (s: string, x: number, y: number, w: number, size = 8, bold = false, color = "#334155", height = 12) =>
        doc
          .font(bold ? "Bold" : "Regular")
          .fontSize(size)
          .fillColor(color)
          .text(s.replace(/\s+/g, " ").trim(), x, y, { width: w, height, ellipsis: true, lineGap: 0 });
      const q = distribution.query;
      const criteria = [
        q.scope === "overdue" ? "Títulos vencidos" : "Títulos em aberto",
        "Contratos ativos",
        q.bucket !== "all" ? `Faixa: ${q.bucket === "upcoming" ? "vence hoje / a vencer" : q.bucket + " dias"}` : "Todos os atrasos",
        q.status === "all" ? "Clientes ativos e inativos" : q.status === "active" ? "Clientes ativos" : "Clientes inativos",
        q.branchId ? `Filial #${q.branchId}` : "Todas as filiais",
        q.accountId ? `Conta #${q.accountId}` : "",
        q.from ? `${date(q.from)} a ${date(q.to ?? null)}` : "",
        q.search ? `Busca: ${q.search}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      distribution.groups.forEach((group, page) => {
        doc.addPage();
        const width = doc.page.width - 56;
        doc.rect(28, 28, 4, 22).fill(accent);
        text("CAS / COBRANÇAS", 41, 30, width - 13, 11, true, readable, 18);
        text(group.name, 28, 56, width, 17, true, "#0f172a", 28);
        text(
          `${group.items.length} clientes · Saldo da lista: ${money(group.items.reduce((sum, i) => sum + i.balance, 0))}`,
          28,
          91,
          width,
          8
        );
        text(
          `Consulta: ${new Date(distribution.queriedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)`,
          28,
          105,
          width,
          7,
          false,
          "#64748b"
        );
        text(criteria, 28, 121, width, 7, false, "#64748b", 22);
        const top = 151,
          columns = [28, 50, 264, 382, 493],
          widths = [22, 214, 118, 111, width - 465];
        doc.rect(28, top, width, 23).fill("#f1f5f9");
        ["Nº", "CLIENTE / CONTATO", "LOCALIDADE", "PENDÊNCIAS", "RETORNO"].forEach((s, i) =>
          text(s, columns[i]! + 4, top + 7, widths[i]! - 8, 6.5, true, "#475569")
        );
        const notes = distribution.includeNotes,
          rowHeight = Math.min(notes ? 48 : 36, 584 / group.items.length),
          size = group.items.length > 15 ? 7 : 8;
        group.items.forEach((item, i) => {
          const y = top + 23 + i * rowHeight;
          if (i % 2) doc.rect(28, y, width, rowHeight).fill(mix("#ffffff", accent, 0.04));
          text(String(i + 1).padStart(2, "0"), 32, y + 4, 16, 7, true, readable);
          const phone = item.contacts.find((c) => c.whatsappUrl)?.number ?? item.contacts[0]?.number ?? "Sem telefone";
          const nameHeight = rowHeight >= 43 ? 21 : 10;
          text(item.name, 54, y + 3, 204, size, true, "#0f172a", nameHeight);
          text(`${phone} · Cliente #${item.id}`, 54, y + 4 + nameHeight, 204, 6.3, false, "#64748b", 10);
          text(item.city ?? "Cidade não informada", 268, y + 4, 108, size, false, "#334155", nameHeight);
          text(item.neighborhood ?? "Bairro não informado", 268, y + 4 + nameHeight, 108, 6.3, false, "#64748b", 10);
          text(money(item.balance), 386, y + 4, 101, size, true);
          text(
            `${item.titles} título(s) · ${item.daysLate ? item.daysLate + "d atraso" : "Vence hoje / a vencer"}`,
            386,
            y + 15,
            101,
            6.2,
            false,
            readable,
            10
          );
          if (rowHeight >= 42) text(`Mais antigo: ${date(item.oldestDue)}`, 386, y + 25, 101, 6.2, false, "#64748b", 10);
          doc
            .rect(502, y + 5, 8, 8)
            .lineWidth(0.6)
            .strokeColor("#94a3b8")
            .stroke();
          if (notes) {
            const noteY = y + rowHeight - 5;
            if (rowHeight >= 43) text("Obs.", 54, noteY - 7, 22, 6, false, "#94a3b8", 9);
            doc
              .moveTo(rowHeight >= 43 ? 79 : 54, noteY)
              .lineTo(28 + width - 6, noteY)
              .lineWidth(0.5)
              .strokeColor("#b6c2d2")
              .stroke();
          }
          doc
            .moveTo(28, y + rowHeight)
            .lineTo(28 + width, y + rowHeight)
            .lineWidth(0.5)
            .strokeColor("#e2e8f0")
            .stroke();
        });
        text(
          "Saldos atuais dos títulos filtrados, sem acréscimos calculados. Confira o saldo no IXC antes de cobrar.",
          28,
          778,
          width,
          7,
          false,
          "#64748b"
        );
        text(
          `${distribution.selected ? "Clientes selecionados" : "Lista filtrada"} · Sem repetição de clientes · Uso interno`,
          28,
          798,
          width - 65,
          7,
          false,
          "#64748b"
        );
        text(`${page + 1} / ${distribution.groups.length}`, doc.page.width - 84, 798, 56, 8, true);
      });
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
