import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { OrderAnalysisService, orderAnalysisQuery } from "../src/services/support/OrderAnalysisService.js";
import { OrderAiService, redactOrderText, type OrderAiInput } from "../src/services/ai/OrderAiService.js";
import { AiProviderClient } from "../src/services/ai/AiProviderClient.js";
import { AiSettingsService } from "../src/services/settings/AiSettingsService.js";
import { assertReadQuery, type IxcReadQuery, type IxcReadSession } from "../src/integrations/ixc/database/IxcReadDatabase.js";
import { supportRoutes } from "../src/controllers/supportController.js";
import { AuthService } from "../src/services/AuthService.js";
import { effectivePermissions } from "../src/config/permissions.js";

afterEach(() => vi.restoreAllMocks());
const filters = { subjectId: 1, from: "2026-10-01", to: "2026-10-31" };
const report = (ids = [1]) => ({
  summary: "Há relatos que precisam de validação técnica.",
  findings: [{ title: "Sintoma recorrente", assessment: "Verificar os registros associados.", severity: "medium", orderIds: ids }],
  actions: ["Conferir a rede antes de concluir a causa."],
  limitations: ["Conexão representa o cadastro atual."],
});
const response = (data = report()) => ({
  data: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(data) }] }] },
});
function fixture(ai = new OrderAiService(""), extra = 0) {
  const db = new DatabaseSync(":memory:");
  db.function("CONCAT", { varargs: true }, (...values) => values.join(""));
  db.exec(`CREATE TABLE su_oss_assunto(id INTEGER PRIMARY KEY,assunto TEXT);
    CREATE TABLE cliente(id INTEGER PRIMARY KEY,razao TEXT,cidade INTEGER);
    CREATE TABLE cliente_contrato(id INTEGER PRIMARY KEY,id_cliente INTEGER,cidade INTEGER);
    CREATE TABLE cidade(id INTEGER PRIMARY KEY,nome TEXT);
    CREATE TABLE radusuarios(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato INTEGER,online TEXT,endereco_padrao_cliente TEXT,cidade INTEGER,onu_mac TEXT);
    CREATE TABLE radpop_radio_cliente_fibra(id INTEGER PRIMARY KEY,id_login INTEGER,id_contrato INTEGER,id_ramal INTEGER,id_transmissor INTEGER,mac TEXT,serial_number TEXT);
    CREATE TABLE su_oss_chamado(id INTEGER PRIMARY KEY,id_cliente INTEGER,id_contrato_kit INTEGER,id_login INTEGER,id_assunto INTEGER,id_cidade INTEGER,status TEXT,data_abertura TEXT,data_fechamento TEXT,mensagem TEXT,mensagem_resposta TEXT);
    CREATE TABLE su_oss_chamado_mensagem(id INTEGER PRIMARY KEY,id_chamado INTEGER,data TEXT,mensagem TEXT);
    INSERT INTO su_oss_assunto VALUES(1,'Sem conexão'),(2,'Instalação');
    INSERT INTO cidade VALUES(1,'Cidade A'),(2,'Cidade B');
    INSERT INTO cliente VALUES(1,'Maria Exemplo',1),(2,'José Exemplo',1),(3,'Cliente sem rede',2);
    INSERT INTO cliente_contrato VALUES(10,1,1),(20,2,1),(30,3,2);
    INSERT INTO radusuarios VALUES(100,1,10,'S','S',2,'AA:BB:CC:DD:EE:FF'),(200,2,20,'N','N',1,''),(300,3,30,'SS','S',2,'');
    INSERT INTO radpop_radio_cliente_fibra VALUES(1,100,10,7,8,'',''),(2,200,20,7,8,'',''),(3,300,30,1,8,'',''),(4,300,30,2,8,'','');
    INSERT INTO su_oss_chamado VALUES
      (1,1,10,100,1,0,'A','2026-10-01 00:00:00',NULL,'Maria Exemplo: sem conexão. Contato maria@example.test, senha: private',NULL),
      (2,1,10,100,1,0,'F','2026-10-31 23:59:59','2026-11-01 09:00:00','Falha voltou.','Concluído'),
      (3,2,20,200,1,0,'EX','2026-10-15 12:00:00',NULL,'Sem conexão',NULL),
      (4,3,30,300,1,0,'UNKNOWN','2026-10-15 12:00:00',NULL,NULL,NULL),
      (5,1,20,200,1,0,'A','2026-10-16 00:00:00',NULL,NULL,NULL),
      (6,999,0,0,1,0,'A','2026-10-16 00:00:00',NULL,NULL,NULL),
      (7,1,10,100,2,0,'A','2026-10-16 00:00:00',NULL,NULL,NULL),
      (8,1,10,100,1,0,'A','2026-11-01 00:00:00',NULL,NULL,NULL),
      (9,1,10,100,1,0,'A','2026-09-30 23:59:59',NULL,NULL,NULL);
    INSERT INTO su_oss_chamado_mensagem VALUES(1,1,'2026-10-02 10:00:00','Relato posterior'),(2,1,'2026-10-01 10:00:00','Relato inicial'),(3,8,'2026-11-01 01:00:00','Fora do período');`);
  const insert = db.prepare("INSERT INTO su_oss_chamado VALUES(?,?,10,100,1,0,'A','2026-10-10 10:00:00',NULL,'Falha',NULL)");
  for (let i = 0; i < extra; i++) insert.run(100 + i, 1);
  const select = vi.fn(async (q: IxcReadQuery) => {
    assertReadQuery(q);
    // Equivalent SQLite syntax for the three MariaDB text projections.
    const sql = q.sql.replace(/LEFT\(([^,]+),6000\)/g, "SUBSTR($1,1,6000)").replace(/CHAR_LENGTH\(/g, "LENGTH(");
    return db.prepare(sql).all(...q.params);
  });
  const reader = { withSnapshot: async <T>(read: (s: IxcReadSession) => Promise<T>) => read({ select } as IxcReadSession) };
  return { db, select, reader, service: new OrderAnalysisService(reader, ai, () => new Date("2026-11-19T15:00:00Z")) };
}
describe("Análise de OS por assunto e período", () => {
  it("usa a configuração salva mais recente a cada nova análise, incluindo Gemini", async () => {
    const { db, reader } = fixture();
    const runtime = vi
      .spyOn(AiSettingsService.prototype, "runtime")
      .mockResolvedValue({ provider: "gemini", model: "gemini-test", key: "GEMINI_KEY" });
    const generate = vi.spyOn(AiProviderClient.prototype, "generate").mockResolvedValue(report());
    const service = new OrderAnalysisService(reader);
    try {
      expect((await service.analyze(filters)).ai).toMatchObject({ status: "completed", provider: "gemini", model: "gemini-test" });
      expect(generate.mock.calls[0]?.[0]).toEqual({ provider: "gemini", model: "gemini-test", key: "GEMINI_KEY" });
      runtime.mockResolvedValue({ provider: "openai", model: "gpt-new", key: "OPENAI_KEY" });
      expect((await service.analyze(filters)).ai).toMatchObject({ status: "completed", provider: "openai", model: "gpt-new" });
      expect(generate.mock.calls.at(-1)?.[0]).toEqual({ provider: "openai", model: "gpt-new", key: "OPENAI_KEY" });
    } finally {
      db.close();
    }
  });
  it("coleta todos os status, inclui os dois limites do período e separa recorrência de concentração geográfica", async () => {
    const { db, service } = fixture();
    try {
      const data = await service.analyze(filters);
      expect(data.orders.map((o) => o.id)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(data.totals).toMatchObject({
        orders: 6,
        customers: 3,
        recurringCustomers: 1,
        closed: 1,
        missingCustomer: 1,
        missingCity: 1,
        missingNetworkBranch: 3,
      });
      expect(data.orders[0]?.messages.map((m) => m.body)).toEqual(["Relato inicial", "Relato posterior"]);
      expect(data.messageCount).toBe(2);
      expect(data.clusters.find((c) => c.networkBranch === "8:7")).toMatchObject({ customers: 2, orders: 3, city: "Cidade A" });
      expect(data.orders.find((o) => o.id === 4)?.networkBranch).toBeNull();
      expect(data.orders.find((o) => o.id === 5)).toMatchObject({ contractId: null, loginId: null, networkBranch: null });
      expect(data.customers.find((c) => c.id === 1)).toMatchObject({ total: 3, online: 1, offline: 0, linkedLogins: 1 });
      expect(data.customers.find((c) => c.id === 3)).toMatchObject({ offline: 1, online: 0 });
      expect(data.ai.status).toBe("unconfigured");
      expect((await service.subjects()).subjects).toHaveLength(2);
      expect((await service.analyze({ ...filters, subjectId: 2, from: "2026-10-01", to: "2026-10-02" })).ai.status).toBe("empty");
    } finally {
      db.close();
    }
  });
  it("percorre todas as páginas de OS e histórico sem limitar silenciosamente aos primeiros resultados", async () => {
    const { db, service, select } = fixture(new OrderAiService(""), 501);
    try {
      const add = db.prepare("INSERT INTO su_oss_chamado_mensagem VALUES(?,1,'2026-10-10 00:00:00','Histórico')");
      for (let i = 0; i < 1001; i++) add.run(10 + i);
      const data = await service.analyze(filters);
      expect(data.orders).toHaveLength(507);
      expect(data.messageCount).toBe(1003);
      expect(data.orders[0]?.messages).toHaveLength(1003);
      expect(select.mock.calls.filter(([q]) => q.name === "analysis-orders")).toHaveLength(2);
      expect(select.mock.calls.filter(([q]) => q.name === "analysis-messages").length).toBeGreaterThan(2);
    } finally {
      db.close();
    }
  });
  it("envia apenas referências de clientes, sinaliza truncamento e mantém indicadores quando a IA falha", async () => {
    const post = vi.fn().mockResolvedValue(response());
    const { db, service } = fixture(new OrderAiService("test-key", "test-model", post));
    try {
      const data = await service.analyze(filters);
      expect(data.ai.status).toBe("completed");
      const body = post.mock.calls[0]![1];
      expect(body).toMatchObject({ model: "test-model", store: false, text: { format: { type: "json_schema", strict: true } } });
      expect(body.input).not.toMatch(/Maria Exemplo|José Exemplo|maria@example|private|customerName|loginId/);
      expect(JSON.parse(body.input).orders[0].customer).toBe("C1");
      post.mockRejectedValueOnce(new Error("SECRET_PROVIDER_ERROR"));
      const failed = await service.analyze(filters);
      expect(failed.ai.status).toBe("failed");
      expect(failed.totals.orders).toBe(6);
      expect(JSON.stringify(failed)).not.toContain("SECRET_PROVIDER_ERROR");
      db.prepare("UPDATE su_oss_chamado SET mensagem=? WHERE id=1").run("x".repeat(6001));
      expect((await service.analyze(filters)).warnings.join(" ")).toContain("abreviados");
    } finally {
      db.close();
    }
  });
  it("rejeita filtros inválidos, assunto inexistente e excesso de OS antes de chamar a IA", async () => {
    for (const value of [
      { ...filters, subjectId: "1" },
      { ...filters, subjectId: 0 },
      { ...filters, from: "2026-02-30" },
      { ...filters, from: "2026-11-01" },
      { ...filters, from: "2024-01-01" },
      { ...filters, sql: "SELECT" },
    ])
      expect(orderAnalysisQuery.safeParse(value).success).toBe(false);
    const { db, service } = fixture(new OrderAiService(""), 5001);
    try {
      await expect(service.analyze({ ...filters, subjectId: 999 })).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.analyze(filters)).rejects.toMatchObject({ statusCode: 422 });
    } finally {
      db.close();
    }
  });
});

describe("Concorrência de análises", () => {
  it("limita análises simultâneas e libera a próxima consulta após falha", async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise<never>((_resolve, fail) => {
      reject = fail;
    });
    const service = new OrderAnalysisService({ withSnapshot: () => pending }, new OrderAiService(""));
    const first = service.analyze(filters);
    await expect(service.analyze(filters)).rejects.toMatchObject({ statusCode: 429 });
    reject(new Error("Consulta indisponível"));
    await expect(first).rejects.toThrow("Consulta indisponível");
    await expect(service.analyze(filters)).rejects.toThrow("Consulta indisponível");
  });
});

describe("Integração IA", () => {
  const order: OrderAiInput = {
    id: 1,
    customer: "C1",
    city: "Cidade A",
    networkBranch: "8:7",
    openedAt: "2026-10-01",
    status: "F",
    message: "Falha",
    response: null,
    messages: [],
  };
  it("rejeita referências inventadas, recusas e respostas incompletas", async () => {
    for (const value of [
      response(report([999])),
      { data: { status: "incomplete" } },
      { data: { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] } },
      response({ ...report(), findings: [{ ...report().findings[0]!, orderIds: [] }] }),
    ]) {
      const ai = new OrderAiService("key", "model", vi.fn().mockResolvedValue(value));
      await expect(ai.analyze([order], {})).rejects.toThrow();
    }
  });
  it("divide históricos grandes, consolida todos os lotes e interrompe ao cancelar", async () => {
    const post = vi.fn().mockResolvedValue(response());
    const ai = new OrderAiService("key", "model", post);
    const result = await ai.analyze(
      [{ ...order, messages: Array.from({ length: 25 }, () => ({ date: null, body: "x".repeat(6000) })) }],
      {}
    );
    expect(result.batches).toBeGreaterThan(1);
    const batchCalls = post.mock.calls.filter(([, body]) => JSON.parse(body.input).orders);
    expect(batchCalls.flatMap(([, body]) => JSON.parse(body.input).orders).reduce((count, o) => count + o.messages.length, 0)).toBe(25);
    expect(batchCalls.every(([, body]) => body.input.length < 41000)).toBe(true);
    const controller = new AbortController();
    controller.abort();
    const previous = post.mock.calls.length;
    await expect(ai.analyze([order], {}, controller.signal)).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(previous);
  });
  it("recusa volume de entrada excessivo antes de consumir a API", async () => {
    const post = vi.fn();
    const ai = new OrderAiService("key", "model", post);
    await expect(
      ai.analyze([{ ...order, messages: Array.from({ length: 500 }, () => ({ date: null, body: "x".repeat(6000) })) }], {})
    ).rejects.toThrow("Volume de mensagens");
    expect(post).not.toHaveBeenCalled();
  });
  it("remove dados de contato, nomes e credenciais de texto sem executar HTML", () => {
    expect(
      redactOrderText("<b>Maria Exemplo</b> maria@example.test 192.168.1.2 AA:BB:CC:DD:EE:FF CPF 123.456.789-00 senha: secreto", [
        "Maria Exemplo",
      ])
    ).not.toMatch(/<b>|Maria|example.test|192.168|AA:BB|123.456|secreto/);
  });
});

describe("Acesso à análise de OS", () => {
  it("exige autenticação e ambas as permissões, valida o corpo e esconde erros privados", async () => {
    vi.spyOn(AuthService.prototype, "authenticate").mockImplementation(async (request) =>
      request.headers.authorization
        ? {
            id: 1,
            name: "Teste",
            email: "test@example.test",
            role: "OPERATOR",
            permissions:
              request.headers.authorization === "allowed" ? ["support.orders.view", "support.orders.analyze"] : ["support.orders.analyze"],
          }
        : null
    );
    const analyze = vi.spyOn(OrderAnalysisService.prototype, "analyze").mockRejectedValue(new Error("PRIVATE_SQL"));
    const subjects = vi
      .spyOn(OrderAnalysisService.prototype, "subjects")
      .mockResolvedValue({ subjects: [], configured: false, model: "test" });
    const app = Fastify();
    await app.register(supportRoutes, { prefix: "/api/support" });
    try {
      for (const [method, url] of [
        ["POST", "/api/support/order-analysis"],
        ["GET", "/api/support/order-analysis/subjects"],
      ] as const) {
        expect((await app.inject({ method, url, ...(method === "POST" ? { payload: filters } : {}) })).statusCode).toBe(401);
        expect(
          (await app.inject({ method, url, headers: { authorization: "denied" }, ...(method === "POST" ? { payload: filters } : {}) }))
            .statusCode
        ).toBe(403);
      }
      expect(analyze).not.toHaveBeenCalled();
      expect(subjects).not.toHaveBeenCalled();
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/support/order-analysis",
            headers: { authorization: "allowed" },
            payload: { ...filters, subjectId: 0 },
          })
        ).statusCode
      ).toBe(400);
      expect(analyze).not.toHaveBeenCalled();
      const failed = await app.inject({
        method: "POST",
        url: "/api/support/order-analysis",
        headers: { authorization: "allowed" },
        payload: filters,
      });
      expect(failed.statusCode).toBe(502);
      expect(failed.body).not.toContain("PRIVATE_SQL");
      expect(failed.headers["cache-control"]).toBe("no-store");
      const loaded = await app.inject({ url: "/api/support/order-analysis/subjects", headers: { authorization: "allowed" } });
      expect(loaded.statusCode).toBe(200);
      expect(loaded.headers["cache-control"]).toBe("no-store");
      expect(effectivePermissions("OPERATOR", ["support.orders.view"])).not.toContain("support.orders.analyze");
    } finally {
      await app.close();
    }
  });
});
