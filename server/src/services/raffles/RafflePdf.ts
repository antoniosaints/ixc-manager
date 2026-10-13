import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import type { RaffleState } from "./raffleModel.js";

export function createRafflePdf(state: RaffleState): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true, info: { Title: state.config.name, Author: "CAS" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      doc.registerFont("Regular", fileURLToPath(new URL("../../../assets/fonts/DejaVuSans.ttf", import.meta.url)));
      doc.registerFont("Bold", fileURLToPath(new URL("../../../assets/fonts/DejaVuSans-Bold.ttf", import.meta.url)));
      const date = (v: string) => new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const text = (v: string, x: number, y: number, width: number, size = 10, bold = false) =>
        doc
          .font(bold ? "Bold" : "Regular")
          .fontSize(size)
          .fillColor("#172033")
          .text(v.replace(/\s+/g, " "), x, y, { width, height: 36, ellipsis: true });
      doc.rect(40, 40, 5, 45).fill(state.config.background);
      const logo = state.config.logo;
      let titleX = 58;
      if (/^data:image\/(png|jpeg);base64,/.test(logo)) {
        doc.image(Buffer.from(logo.split(",")[1]!, "base64"), 56, 40, { fit: [42, 42] });
        titleX = 110;
      } else if (logo === "/cas-logo.png") {
        doc.image(fileURLToPath(new URL("../../../../client/public/cas-logo.png", import.meta.url)), 56, 40, { fit: [42, 42] });
        titleX = 110;
      }
      text(state.config.name, titleX, 40, 535 - titleX, 19, true);
      text("RELATÓRIO DE SORTEIO", titleX, 69, 400, 9);
      text(`Preparado em ${date(state.createdAt)} · Horário de Brasília`, 40, 102, 515, 9);
      text(
        `${state.participants.length} contratos · ${state.results.length}/${state.config.prizes.length} prêmios sorteados`,
        40,
        127,
        515,
        10,
        true
      );
      const f = state.config.filters;
      const criteria = [
        f.status === "all" ? "Todos os status" : `Status: ${f.status}`,
        `Ativação: ${f.startFrom || "sem início"} até ${f.startTo || "sem fim"}`,
        f.planIds.length ? `Planos: ${f.planIds.join(", ")}` : "Todos os planos",
        f.productIds.length
          ? `Produtos (${f.productMatch === "all" ? "todos" : "qualquer"}): ${f.productIds.join(", ")}`
          : "Todos os produtos",
        state.config.oncePerCustomer ? "Um prêmio por cliente" : "Um prêmio por contrato",
      ];
      let y = 157;
      doc.font("Regular").fontSize(9).fillColor("#475569").text(criteria.join("\n"), 40, y, { width: 515 });
      y = doc.y + 25;
      if (!state.results.length) {
        text("Nenhuma rodada concluída até a emissão deste relatório.", 40, y, 515);
        y += 45;
      }
      for (const r of state.results) {
        if (y > 710) {
          doc.addPage();
          y = 45;
        }
        doc.roundedRect(40, y, 515, 85, 8).fill("#f1f5f9");
        text(`${r.order}º prêmio · ${r.prize}`, 54, y + 10, 485, 11, true);
        text(`#${r.contractId} · ${r.customerName}`, 54, y + 31, 485, 11, true);
        text(`${r.city || "Localidade não informada"} · ${date(r.drawnAt)}`, 54, y + 56, 485, 9);
        y += 98;
      }
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        text(`CAS · ${state.id} · ${i + 1}/${pages.count}`, 40, 786, 515, 7);
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(error);
    }
  });
}
