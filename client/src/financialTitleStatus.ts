/** IXC fn_areceber: A=Aberto, P=Parcial, R=Recebido, C=Cancelado. */
export function financialTitleStatus(raw: string | null | undefined, kind: "receivable" | "payable" = "receivable") {
  const code = raw?.trim().toUpperCase() ?? "";
  const known = {
    A: { label: "Aberto", tone: "bg-amber-50 text-amber-700" },
    P: { label: "Parcial", tone: "bg-blue-50 text-blue-700" },
    R: { label: kind === "payable" ? "Pago" : "Recebido", tone: "bg-emerald-50 text-emerald-700" },
    C: { label: "Cancelado", tone: "bg-slate-100 text-slate-600" },
  };
  return {
    code,
    ...(known[code as keyof typeof known] ?? {
      label: code ? `Status não identificado (${code})` : "Não informado",
      tone: "bg-slate-100 text-slate-600",
    }),
  };
}
