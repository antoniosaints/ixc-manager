import { z } from "zod";
import { AiSettingsService } from "../settings/AiSettingsService.js";
import type { AiProvider } from "../ai/AiProviderClient.js";
import { IxcReadDatabase, type IxcReadSession } from "../../integrations/ixc/database/IxcReadDatabase.js";
import { mapDate } from "../../integrations/ixc/database/maps/valueMappers.js";
import { compatibleOnuSql } from "../upgrades/LoginOnuLink.js";
import { OrderAiService, createOrderTextRedactor } from "../ai/OrderAiService.js";

const day = z.string().refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && mapDate(s) === s, "Data inválida");
export const orderAnalysisQuery = z
  .object({
    subjectId: z.number().int().positive().safe(),
    from: day,
    to: day,
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.from > q.to || Date.parse(q.to) - Date.parse(q.from) > 365 * 86400000)
      ctx.addIssue({ code: "custom", path: ["to"], message: "Selecione até 366 dias, em ordem cronológica." });
  });
type Reader = { withSnapshot<T>(read: (session: IxcReadSession) => Promise<T>, signal?: AbortSignal): Promise<T>; close?(): Promise<void> };
type Row = Record<string, unknown>;
const text = (v: unknown) => String(v ?? "").trim() || null;
const id = (v: unknown) => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const fail = (message: string, statusCode = 422) => Object.assign(new Error(message), { statusCode });
const networkFrom = `FROM radpop_radio_cliente_fibra f LEFT JOIN cliente_contrato onc ON onc.id=f.id_contrato
 WHERE f.id_login=r.id AND (COALESCE(f.id_contrato,0)=0 OR onc.id_cliente=r.id_cliente) AND ${compatibleOnuSql}`;
// A missing or ambiguous ONU association cannot establish a shared network branch.
const networkBranch = `(SELECT CASE WHEN COUNT(*)>0 AND COUNT(DISTINCT f.id_ramal)=1 AND MIN(COALESCE(f.id_ramal,0))>0
 AND COUNT(DISTINCT f.id_transmissor)=1 AND MIN(COALESCE(f.id_transmissor,0))>0
 THEN CONCAT(MAX(f.id_transmissor),':',MAX(f.id_ramal)) END ${networkFrom})`;
const city = `COALESCE(NULLIF(t.id_cidade,0),CASE WHEN r.endereco_padrao_cliente IN ('S','C') THEN NULLIF(c.cidade,0)
 ELSE COALESCE(NULLIF(r.cidade,0),NULLIF(ct.cidade,0),NULLIF(c.cidade,0)) END)`;
export const orderAnalysisRowsSql = `SELECT t.id,c.id customerId,c.razao customerName,ct.id contractId,r.id loginId,
 r.online online,t.status status,t.data_abertura openedAt,t.data_fechamento closedAt,
 city.id cityId,city.nome city,${networkBranch} networkBranch,
 LEFT(t.mensagem,6000) message,LEFT(t.mensagem_resposta,6000) response,
 CASE WHEN CHAR_LENGTH(t.mensagem)>6000 OR CHAR_LENGTH(t.mensagem_resposta)>6000 THEN 1 ELSE 0 END truncated
 FROM su_oss_chamado t LEFT JOIN cliente c ON c.id=t.id_cliente
 LEFT JOIN cliente_contrato ct ON ct.id=t.id_contrato_kit AND ct.id_cliente=t.id_cliente
 LEFT JOIN radusuarios r ON r.id=t.id_login AND r.id_cliente=t.id_cliente
 AND (COALESCE(t.id_contrato_kit,0)=0 OR r.id_contrato=ct.id)
 LEFT JOIN cidade city ON city.id=${city}
 WHERE t.id_assunto=? AND t.data_abertura>=? AND t.data_abertura<? AND t.id>?
 ORDER BY t.id LIMIT 500`;

export function summarizeOrders(orders: AnalysisOrder[]) {
  const clients = new Map<
    number,
    {
      id: number;
      name: string | null;
      orderIds: number[];
      lastOpenedAt: string | null;
      loginIds: Set<number>;
      online: Set<number>;
      offline: Set<number>;
    }
  >();
  const locations = new Map<string, { city: string; networkBranch: string | null; orderIds: number[]; customers: Set<number> }>();
  const days = new Map<string, number>();
  for (const order of orders) {
    if (order.openedAt) {
      const day = order.openedAt.slice(0, 10);
      days.set(day, (days.get(day) ?? 0) + 1);
    }
    if (order.customerId) {
      const customer = clients.get(order.customerId) ?? {
        id: order.customerId,
        name: order.customerName,
        orderIds: [],
        lastOpenedAt: null,
        loginIds: new Set<number>(),
        online: new Set<number>(),
        offline: new Set<number>(),
      };
      customer.orderIds.push(order.id);
      if (order.openedAt && (!customer.lastOpenedAt || order.openedAt > customer.lastOpenedAt)) customer.lastOpenedAt = order.openedAt;
      if (order.loginId) {
        customer.loginIds.add(order.loginId);
        if (order.online === "S") customer.online.add(order.loginId);
        else if (order.online === "N" || order.online === "SS") customer.offline.add(order.loginId);
      }
      clients.set(customer.id, customer);
    }
    if (order.cityId) {
      for (const branch of [null, ...(order.networkBranch ? [order.networkBranch] : [])]) {
        const key = `${order.cityId}/${branch ?? "city"}`;
        const group = locations.get(key) ?? {
          city: order.city ?? `Cidade #${order.cityId}`,
          networkBranch: branch,
          orderIds: [],
          customers: new Set<number>(),
        };
        group.orderIds.push(order.id);
        if (order.customerId) group.customers.add(order.customerId);
        locations.set(key, group);
      }
    }
  }
  const customers = [...clients.values()]
    .map((c) => ({
      id: c.id,
      name: c.name,
      orderIds: c.orderIds,
      total: c.orderIds.length,
      recurring: c.orderIds.length >= 2,
      lastOpenedAt: c.lastOpenedAt,
      linkedLogins: c.loginIds.size,
      online: c.online.size,
      offline: c.offline.size,
      unknownConnection: c.loginIds.size - c.online.size - c.offline.size,
    }))
    .sort((a, b) => b.total - a.total || a.id - b.id);
  return {
    totals: {
      orders: orders.length,
      customers: clients.size,
      recurringCustomers: customers.filter((c) => c.recurring).length,
      closed: orders.filter((o) => o.status === "F").length,
      missingCustomer: orders.filter((o) => !o.customerId).length,
      missingCity: orders.filter((o) => !o.cityId).length,
      missingNetworkBranch: orders.filter((o) => !o.networkBranch).length,
      withoutText: orders.filter((o) => !o.message && !o.response && !o.messages.some((m) => m.body)).length,
    },
    customers,
    clusters: [...locations.values()]
      .map((g) => ({
        city: g.city,
        networkBranch: g.networkBranch,
        orderIds: g.orderIds,
        orders: g.orderIds.length,
        customers: g.customers.size,
      }))
      .sort((a, b) => b.customers - a.customers || b.orders - a.orders),
    daily: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, total })),
  };
}
export interface AnalysisOrder {
  id: number;
  customerId: number | null;
  customerName: string | null;
  contractId: number | null;
  loginId: number | null;
  online: string | null;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
  cityId: number | null;
  city: string | null;
  networkBranch: string | null;
  message: string | null;
  response: string | null;
  truncated: boolean;
  messages: { date: string | null; body: string | null }[];
}
export class OrderAnalysisService {
  private running = false;
  constructor(
    private readonly db: Reader = new IxcReadDatabase(),
    private readonly ai: OrderAiService | undefined = undefined,
    private readonly now = () => new Date(),
    private readonly settings = new AiSettingsService()
  ) {}
  async close() {
    await this.db.close?.();
  }
  async status() {
    return this.ai ? { configured: this.ai.configured, model: this.ai.model, provider: this.ai.provider } : this.settings.status();
  }
  async subjects(signal?: AbortSignal) {
    return this.db.withSnapshot(
      async (s) => ({
        subjects: (
          await s.select<Row>({
            name: "analysis-subjects",
            sql: "SELECT id,assunto name FROM su_oss_assunto ORDER BY assunto,id",
            params: [],
            timeoutSeconds: 8,
          })
        ).map((r) => ({ id: id(r.id)!, name: text(r.name) ?? `#${r.id}` })),
        ...(await this.status()),
      }),
      signal
    );
  }
  async analyze(input: z.input<typeof orderAnalysisQuery>, signal?: AbortSignal) {
    const q = orderAnalysisQuery.parse(input);
    if (this.running) throw fail("Já existe uma análise em andamento. Aguarde a conclusão.", 429);
    this.running = true;
    try {
      return await this.run(q, signal);
    } finally {
      this.running = false;
    }
  }
  private async run(q: z.infer<typeof orderAnalysisQuery>, signal?: AbortSignal) {
    const queriedAt = this.now().toISOString();
    const end = new Date(`${q.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const data = await this.db.withSnapshot(async (session) => {
      const subject = (
        await session.select<Row>({
          name: "analysis-subject",
          sql: "SELECT id,assunto name FROM su_oss_assunto WHERE id=?",
          params: [q.subjectId],
          timeoutSeconds: 8,
        })
      )[0];
      if (!subject) throw fail("Assunto não encontrado.", 404);
      const orders: AnalysisOrder[] = [];
      let lastId = 0,
        messageCount = 0,
        textCharacters = 0;
      const checkTextBudget = (...values: unknown[]) => {
        textCharacters += values.reduce<number>((total, value) => total + (text(value)?.length ?? 0), 0);
        if (textCharacters > 12_000_000) throw fail("O volume de textos excede o limite da consulta. Reduza o período.");
      };
      while (true) {
        const rows = await session.select<Row>({
          name: "analysis-orders",
          sql: orderAnalysisRowsSql,
          params: [q.subjectId, `${q.from} 00:00:00`, `${end.toISOString().slice(0, 10)} 00:00:00`, lastId],
          timeoutSeconds: 15,
        });
        if (!rows.length) break;
        for (const r of rows) {
          const orderId = id(r.id);
          if (!orderId || orderId <= lastId) throw new Error("Página de OS inválida.");
          checkTextBudget(r.message, r.response);
          orders.push({
            id: orderId,
            customerId: id(r.customerId),
            customerName: text(r.customerName),
            contractId: id(r.contractId),
            loginId: id(r.loginId),
            online: text(r.online),
            status: text(r.status) ?? "",
            openedAt: text(r.openedAt),
            closedAt: text(r.closedAt),
            cityId: id(r.cityId),
            city: text(r.city),
            networkBranch: text(r.networkBranch),
            message: text(r.message),
            response: text(r.response),
            truncated: Number(r.truncated) === 1,
            messages: [],
          });
          lastId = orderId;
        }
        if (orders.length > 5000) throw fail("Mais de 5.000 OS encontradas. Reduza o período; nenhuma análise parcial foi gerada.");
        const byId = new Map(orders.slice(-rows.length).map((o) => [o.id, o]));
        let lastMessageId = 0;
        while (true) {
          const messages = await session.select<Row>({
            name: "analysis-messages",
            sql: `SELECT m.id,m.id_chamado orderId,m.data date,LEFT(m.mensagem,6000) body,CASE WHEN CHAR_LENGTH(m.mensagem)>6000 THEN 1 ELSE 0 END truncated FROM su_oss_chamado_mensagem m WHERE m.id_chamado IN (${rows.map(() => "?").join(",")}) AND m.id>? ORDER BY m.id LIMIT 1000`,
            params: [...byId.keys(), lastMessageId],
            timeoutSeconds: 15,
          });
          if (!messages.length) break;
          for (const m of messages) {
            const messageId = id(m.id),
              order = byId.get(Number(m.orderId));
            if (!messageId || messageId <= lastMessageId || !order) throw new Error("Histórico de OS inválido.");
            checkTextBudget(m.body);
            order.messages.push({ date: text(m.date), body: text(m.body) });
            if (Number(m.truncated) === 1) order.truncated = true;
            lastMessageId = messageId;
          }
          messageCount += messages.length;
          if (messageCount > 50000) throw fail("Mais de 50.000 mensagens encontradas. Reduza o período.");
          if (messages.length < 1000) break;
        }
        if (rows.length < 500) break;
      }
      for (const order of orders) order.messages.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
      return { subject: { id: q.subjectId, name: text(subject.name) ?? `#${q.subjectId}` }, orders, messageCount };
    }, signal);
    const summary = summarizeOrders(data.orders);
    const engine = this.ai ?? OrderAiService.fromConfiguration(await this.settings.runtime());
    const warnings: string[] = [];
    if (data.orders.some((o) => o.truncated))
      warnings.push("Textos com mais de 6.000 caracteres foram abreviados; a análise textual tem cobertura parcial nesses registros.");
    if (summary.totals.missingNetworkBranch)
      warnings.push(`${summary.totals.missingNetworkBranch} OS sem ramal de rede confirmado. Não foram agrupadas por ramal.`);
    if (summary.totals.missingCity) warnings.push(`${summary.totals.missingCity} OS sem cidade confirmada.`);
    let ai: {
      status: "completed" | "unconfigured" | "failed" | "empty";
      report: Awaited<ReturnType<OrderAiService["analyze"]>>["report"] | null;
      model: string;
      provider: AiProvider;
      batches: number;
      message: string | null;
    } = { status: "empty", report: null, model: engine.model, provider: engine.provider, batches: 0, message: null };
    if (data.orders.length && !engine.configured)
      ai = {
        ...ai,
        status: "unconfigured",
        message:
          "Cadastre a chave em Configurações → Inteligência artificial para gerar o resumo por IA. Os indicadores abaixo foram calculados diretamente no IXC.",
      };
    else if (data.orders.length) {
      const names = [...new Set(data.orders.map((o) => o.customerName).filter((n): n is string => !!n))];
      const redact = createOrderTextRedactor(names);
      const customers = new Map(summary.customers.map((c, i) => [c.id, `C${i + 1}`]));
      try {
        const aiSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(240000)]) : AbortSignal.timeout(240000);
        const result = await engine.analyze(
          data.orders.map((o) => ({
            id: o.id,
            customer: o.customerId ? customers.get(o.customerId)! : null,
            city: o.city,
            networkBranch: o.networkBranch,
            status: o.status,
            openedAt: o.openedAt,
            message: redact(o.message),
            response: redact(o.response),
            messages: o.messages.map((m) => ({ ...m, body: redact(m.body) })),
          })),
          {
            subject: data.subject.name,
            from: q.from,
            to: q.to,
            totals: summary.totals,
            warnings,
            scope:
              "Todas as OS do assunto e período de abertura selecionados. Sem comparação com período anterior. Agrupamento por ramal usa transmissor:ramal da ONU vinculada ao login da OS.",
          },
          aiSignal
        );
        ai = { status: "completed", ...result, message: null };
      } catch {
        signal?.throwIfAborted();
        ai = {
          ...ai,
          status: "failed",
          message:
            "Não foi possível concluir o resumo por IA. Os dados foram preservados; tente analisar novamente ou reduza o período. Verifique a chave, o modelo e a disponibilidade do provedor.",
        };
      }
    }
    return { filters: q, subject: data.subject, queriedAt, ...summary, messageCount: data.messageCount, warnings, ai, orders: data.orders };
  }
}
