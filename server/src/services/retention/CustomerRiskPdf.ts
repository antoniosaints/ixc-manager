import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";

export interface CustomerRiskReport {
  customer: {
    id: number;
    contract_id: number;
    name: string;
    city?: string | null;
    neighborhood?: string | null;
    plan_name?: string | null;
    score: number | null;
    risk_level: string | null;
    calculated_at?: string | Date | null;
    financial_score: number | null;
    support_score: number | null;
    network_score: number | null;
    contract_score: number | null;
    satisfaction_score: number | null;
    satisfaction?: number | null;
  };
  reasons: { category: string; description: string; points: number }[];
  warnings?: string[];
}
const labels: Record<string, string> = {
  LOW: "Baixo",
  ATTENTION: "Atenção",
  MEDIUM: "Médio",
  HIGH: "Alto",
  CRITICAL: "Crítico",
  FINANCIAL: "Financeiro",
  SUPPORT: "Suporte",
  NETWORK: "Conexão",
  CONTRACT: "Contrato",
  SATISFACTION: "Satisfação",
};
const timestamp = (value: string | Date | null | undefined) => {
  if (!value) return "Não disponível";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Não disponível" : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

/** Generated in memory; the report contains only identification and the selected risk analysis. */
export function createCustomerRiskPdf(report: CustomerRiskReport, generatedAt = new Date()): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      bufferPages: true,
      size: "A4",
      margins: { top: 38, left: 38, right: 38, bottom: 48 },
      info: { Title: `Churn · Cliente #${report.customer.id}`, Author: "CAS" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      doc.registerFont("Regular", fileURLToPath(new URL("../../../assets/fonts/DejaVuSans.ttf", import.meta.url)));
      doc.registerFont("Bold", fileURLToPath(new URL("../../../assets/fonts/DejaVuSans-Bold.ttf", import.meta.url)));
      const customer = report.customer;
      const width = 519;
      const accent = "#0e7490";
      let page = 0;
      doc.on("pageAdded", () => {
        page++;
        doc.rect(38, 36, 3, 18).fill(accent);
        doc.font("Bold").fontSize(10).fillColor(accent).text("CAS / CHURN", 49, 38, { width, lineBreak: false });
        doc
          .font("Regular")
          .fontSize(8)
          .fillColor("#64748b")
          .text(`Cliente #${customer.id} · Contrato #${customer.contract_id}${page > 1 ? " · Continuação" : ""}`, 38, 64, { width });
        doc.y = 88;
      });
      const write = (text: string, size = 9, bold = false, color = "#334155", options: PDFKit.Mixins.TextOptions = {}) => {
        doc
          .font(bold ? "Bold" : "Regular")
          .fontSize(size)
          .fillColor(color)
          .text(text, 38, doc.y, { width, lineGap: 2, ...options });
      };
      const ensure = (height: number) => {
        if (doc.y + height > doc.page.height - 48) doc.addPage();
      };
      const section = (text: string) => {
        ensure(45);
        doc.y += 14;
        write(text, 10, true, "#0f172a");
        doc.y += 8;
      };
      doc.addPage();
      write(customer.name, 16, true, "#0f172a");
      doc.y += 6;
      write([customer.city, customer.neighborhood].filter(Boolean).join(" · ") || "Localidade não informada", 8, false, "#64748b");
      doc.y += 4;
      write(`Plano: ${customer.plan_name || "Não informado"}`, 9);
      if ("satisfaction" in customer)
        write(customer.satisfaction == null ? "Satisfação não informada no IXC." : `Satisfação no IXC: ${customer.satisfaction}/5`, 8);
      section("Análise de risco");
      write(
        customer.score == null
          ? "Score ainda não calculado"
          : `${customer.score} / 100 · Risco ${labels[customer.risk_level ?? ""] ?? "não informado"}`,
        17,
        true,
        "#0f172a"
      );
      doc.y += 6;
      write(`Score calculado em ${timestamp(customer.calculated_at)} (Brasília)`, 8, false, "#64748b");
      doc.y += 14;
      const categories = [
        ["Financeiro", customer.financial_score, 30],
        ["Suporte", customer.support_score, 25],
        ["Conexão", customer.network_score, 25],
        ["Contrato", customer.contract_score, 10],
        ["Satisfação", customer.satisfaction_score, 10],
      ] as const;
      ensure(48);
      const top = doc.y;
      categories.forEach(([label, value, max], i) => {
        const x = 38 + i * (width / 5);
        doc.roundedRect(x, top, width / 5 - 6, 44, 4).fill("#f1f5f9");
        doc
          .font("Regular")
          .fontSize(8)
          .fillColor("#64748b")
          .text(label, x + 8, top + 7, { width: width / 5 - 22, lineBreak: false });
        doc
          .font("Bold")
          .fontSize(11)
          .fillColor("#0f172a")
          .text(value == null ? "—" : `${value} / ${max}`, x + 8, top + 23, { width: width / 5 - 22, lineBreak: false });
      });
      doc.y = top + 48;
      section(`Motivos do score (${report.reasons.length})`);
      if (!report.reasons.length)
        write(
          customer.score == null ? "Nenhuma análise disponível para este contrato." : "Nenhum fator de risco registrado para este score.",
          9
        );
      report.reasons.forEach((reason, i) => {
        const points = Number(reason.points);
        const heading = `${String(i + 1).padStart(2, "0")} · ${labels[reason.category.toUpperCase()] ?? reason.category} · ${points >= 0 ? "+" : ""}${points} pontos`;
        const headingHeight = doc.font("Bold").fontSize(8).heightOfString(heading, { width, lineGap: 2 });
        const bodyHeight = doc.font("Regular").fontSize(9).heightOfString(reason.description, { width, lineGap: 2 });
        const height = headingHeight + bodyHeight + 10;
        ensure(height <= doc.page.height - 136 ? height : 46);
        write(heading, 8, true, accent);
        write(reason.description, 9);
        doc.y += 10;
      });
      ensure(40);
      doc.y += 8;
      write(
        "O score reflete os dados disponíveis no momento da análise. Cada categoria tem um limite de pontos; a soma dos motivos pode superar o score. A atenção crítica manual não altera a pontuação.",
        7.5,
        false,
        "#64748b"
      );
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;
        const y = doc.page.height - 30;
        doc
          .moveTo(38, y - 10)
          .lineTo(557, y - 10)
          .strokeColor("#e2e8f0")
          .lineWidth(0.5)
          .stroke();
        doc
          .font("Regular")
          .fontSize(7)
          .fillColor("#64748b")
          .text(`Exportado em ${timestamp(generatedAt)} (Brasília)`, 38, y, { width: 430, lineBreak: false });
        doc.text(`${i + 1} / ${pages.count}`, 507, y, { width: 50, align: "right", lineBreak: false });
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
