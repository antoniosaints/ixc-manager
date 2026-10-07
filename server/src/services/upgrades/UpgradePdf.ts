import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import type { UpgradeService } from "./UpgradeService.js";

type Distribution = Awaited<ReturnType<UpgradeService["distribution"]>>;
const date = (value: string | null) => (value ? value.split("-").reverse().join("/") : "Sem data");
const statuses = {
  eligible: "Vencidos e próximos do fim",
  expired: "Permanência vencida",
  expiring: "Permanência a vencer",
  missing: "Sem data de permanência",
};

const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const mix = (first: string, second: string, weight: number) =>
  `#${rgb(first)
    .map((value, index) =>
      Math.round(value * (1 - weight) + rgb(second)[index]! * weight)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
const whiteContrast = (hex: string) => {
  const luminance = rgb(hex)
    .map((value) => value / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
  return 1.05 / (luminance + 0.05);
};

/** Buffer only: no PDF or customer data is written to the server filesystem. */
export function createUpgradePdf(distribution: Distribution, options: { accentColor?: string } = {}): Promise<Buffer> {
  const accent = /^#[0-9a-fA-F]{6}$/.test(options.accentColor ?? "") ? options.accentColor! : "#7c3aed";
  // Keep the configured accent in decorations; darken pale accents only for readable text on paper.
  let accentText = accent;
  for (let step = 1; step <= 10 && whiteContrast(accentText) < 4.5; step++) accentText = mix(accent, "#0f172a", step / 10);
  const rowTint = mix("#ffffff", accent, 0.04);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, size: "A4", margin: 28, info: { Title: "Lista de upgrades", Author: "CAS" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      doc.registerFont("Regular", fileURLToPath(new URL("../../../assets/fonts/DejaVuSans.ttf", import.meta.url)));
      doc.registerFont("Bold", fileURLToPath(new URL("../../../assets/fonts/DejaVuSans-Bold.ttf", import.meta.url)));
      const text = (value: string, x: number, y: number, width: number, size = 8, bold = false, color = "#334155", height = 12) => {
        doc
          .font(bold ? "Bold" : "Regular")
          .fontSize(size)
          .fillColor(color)
          .text(value.replace(/\s+/g, " ").trim(), x, y, { width, height, ellipsis: true, lineGap: 0 });
      };
      const queriedAt = new Date(distribution.queriedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const q = distribution.query;
      const criteria = [
        statuses[q.status],
        ...(["eligible", "expiring"].includes(q.status) ? [`até ${q.days} dias`] : []),
        q.plan ? `Plano: ${q.plan}` : q.planId ? `Plano #${q.planId}` : "Todos os planos",
        q.branchId ? `Filial #${q.branchId}` : "Todas as filiais",
      ].join(" · ");
      distribution.groups.forEach((group, pageIndex) => {
        doc.addPage();
        const width = doc.page.width - 56;
        doc.rect(28, 28, 4, 22).fill(accent);
        text("CAS / UPGRADES", 41, 30, width - 13, 11, true, accentText, 18);
        text(group.name, 28, 57, width, 17, true, "#0f172a", 34);
        text(`${group.items.length} clientes para contato · Consulta: ${queriedAt} (Brasília)`, 28, 96, width, 8);
        text(criteria, 28, 112, width, 7.5, false, "#64748b", 22);
        const top = 140;
        const columns = [28, 51, 242, 423, 507];
        const widths = [23, 191, 181, 84, width - 479];
        doc.rect(28, top, width, 24).fill("#f1f5f9");
        ["Nº", "CLIENTE / CONTATO", "PLANO / LOCALIDADE", "PERMANÊNCIA", "RETORNO"].forEach((title, i) =>
          text(title, columns[i]! + 5, top + 7, widths[i]! - 10, 7, true, "#475569")
        );
        const notes = distribution.includeNotes ?? true;
        const rowHeight = Math.min(notes ? 46 : 34, 598 / group.items.length);
        const size = group.items.length > 15 ? 7.5 : 8;
        const lineHeight = size * 1.2;
        group.items.forEach((item, index) => {
          const y = top + 24 + index * rowHeight;
          if (index % 2 === 1) doc.rect(28, y, width, rowHeight).fill(rowTint);
          const measure = (value: string, width: number, bold = false) =>
            doc
              .font(bold ? "Bold" : "Regular")
              .fontSize(size)
              .heightOfString(value, { width, lineGap: 0 });
          const twoLines =
            (rowHeight >= 42 || (!notes && rowHeight >= 33)) &&
            (measure(item.customerName, 181, true) > lineHeight + 1 || measure(item.planName, 171) > lineHeight + 1);
          const detailY = y + 4 + (twoLines ? lineHeight * 2 : lineHeight);
          text(String(index + 1).padStart(2, "0"), 32, y + 4, 18, 7.5, true, accentText);
          text(item.customerName, 56, y + 3, 181, size, true, "#0f172a", twoLines ? lineHeight * 2 + 1 : lineHeight + 1);
          text(
            `${item.phone ?? item.whatsapp ?? "Sem telefone"} · C${item.customerId} / #${item.contractId}`,
            56,
            detailY,
            181,
            6.6,
            false,
            "#64748b",
            10
          );
          text(item.planName, 247, y + 3, 171, size, false, "#334155", twoLines ? lineHeight * 2 + 1 : lineHeight + 1);
          text(
            [item.city, item.neighborhood].filter(Boolean).join(" · ") || "Localidade não informada",
            247,
            detailY,
            171,
            6.6,
            false,
            "#64748b",
            10
          );
          text(date(item.expiresAt), 428, y + 4, 74, size, true);
          const days = item.daysRemaining;
          const label =
            days === null ? "Sem data" : days < 0 ? `Vencida · ${Math.abs(days)}d` : days === 0 ? "Vence hoje" : `Em ${days} dias`;
          text(label, 428, y + 15, 74, 6.6, false, days !== null && days < 0 ? "#b45309" : accentText, 10);
          doc
            .rect(513, y + 5, 8, 8)
            .lineWidth(0.6)
            .strokeColor("#94a3b8")
            .stroke();
          if (notes) {
            // Full-width writing line with a clear label; compact lists keep all clients on their responsible person's page.
            const noteY = y + rowHeight - (rowHeight < 40 ? 3 : 7);
            if (rowHeight >= 40) text("Obs.", 56, noteY - 7, 22, 6, false, "#94a3b8", 9);
            doc
              .moveTo(rowHeight < 40 ? 56 : 80, noteY)
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
          `C = cliente · # = contrato · Marque o retorno${notes ? " e anote o resultado do contato." : "."}`,
          28,
          775,
          width,
          7,
          false,
          "#64748b"
        );
        text(
          `${distribution.selected ? "Seleção de contratos" : "Lista filtrada"} · Clientes sem repetição neste PDF`,
          28,
          798,
          width - 85,
          7,
          false,
          "#64748b"
        );
        text(`${pageIndex + 1} / ${distribution.groups.length}`, doc.page.width - 90, 798, 62, 8, true);
      });
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
