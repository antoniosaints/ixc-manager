import type { IxcTableRows } from "./tables.generated.js";

type Table = keyof IxcTableRows;
function relation<F extends Table, T extends Table>(
  fromTable: F,
  fromColumn: keyof IxcTableRows[F],
  toTable: T,
  toColumn: keyof IxcTableRows[T],
  evidence: "foreign-key" | "period-validated" | "inferred",
  purpose: string
) {
  return { fromTable, fromColumn, toTable, toColumn, evidence, purpose, cardinality: "many-to-one" as const };
}
/** FK is authoritative. Inferred links require a scoped data check before enabling a new analysis. */
export const ixcRelations = [
  relation("fn_movim_finan", "id_conta", "planejamento_analitico", "id", "foreign-key", "Conta analítica do lançamento"),
  relation("planejamento_analitico", "id_planejamento", "planejamento", "id", "foreign-key", "Conta sintética e tipo R/D/A/P"),
  relation(
    "contas",
    "id_planejamento",
    "planejamento_analitico",
    "id",
    "foreign-key",
    "Conta contábil do caixa/banco: o nome da coluna não aponta ao sintético"
  ),
  relation("fn_movim_finan", "filial_id", "filial", "id", "foreign-key", "Filial do lançamento"),
  relation(
    "fn_areceber",
    "id_conta",
    "planejamento_analitico",
    "id",
    "period-validated",
    "Conta do título: sem FK, vínculos verificados em 25/09–06/10/2026"
  ),
  relation(
    "fn_apagar",
    "id_conta",
    "planejamento_analitico",
    "id",
    "period-validated",
    "Conta do título: sem FK, vínculos verificados em 25/09–06/10/2026"
  ),
  relation("fn_movim_finan", "id_receber", "fn_areceber", "id", "inferred", "Título de origem; pode ter várias baixas"),
  relation("fn_movim_finan", "id_pagar", "fn_apagar", "id", "inferred", "Título de origem; pode ter várias baixas"),
  relation(
    "fn_movim_finan",
    "id_fn_tranferencia_caixa",
    "fn_transferencia_caixa",
    "id",
    "inferred",
    "Transferência interna; grafia tranferencia é a coluna real"
  ),
  relation("fn_transferencia_caixa", "contas_id_origem", "contas", "id", "inferred", "Caixa/banco de origem"),
  relation("fn_transferencia_caixa", "contas_id_destino", "contas", "id", "inferred", "Caixa/banco de destino"),
  relation(
    "centro_custo_rateio",
    "id_fn_movim_finan",
    "fn_movim_finan",
    "id",
    "inferred",
    "Rateio: agregar antes de juntar para evitar duplicação de valores"
  ),
  relation("fn_extrato", "id_conta", "contas", "id", "inferred", "Conta bancária do extrato: validar antes de conciliar"),
  relation("fn_areceber", "id_cliente", "cliente", "id", "foreign-key", "Cliente do recebível"),
  relation("fn_areceber", "id_contrato", "cliente_contrato", "id", "inferred", "Contrato do recebível"),
  relation("fn_apagar", "id_fornecedor", "fornecedor", "id", "foreign-key", "Fornecedor da despesa"),
  relation("cliente_contrato", "id_cliente", "cliente", "id", "foreign-key", "Contratos do cliente"),
  relation("cliente_contrato", "id_vd_contrato", "vd_contratos", "id", "foreign-key", "Plano comercial"),
  relation("cliente_contrato_historico", "id_contrato", "cliente_contrato", "id", "inferred", "Histórico do contrato"),
  relation("radusuarios", "id_cliente", "cliente", "id", "foreign-key", "Logins do cliente"),
  relation("radusuarios", "id_caixa_ftth", "rad_caixa_ftth", "id", "inferred", "Caixa de atendimento vinculada ao login"),
  relation(
    "radpop_radio_cliente_fibra",
    "id_login",
    "radusuarios",
    "id",
    "period-validated",
    "Sinal óptico da ONU; validar contrato compatível e tratar vínculos duplicados, conferido em 07/10/2026"
  ),
  relation("rad_caixa_ftth", "id_transmissor", "radpop_radio", "id", "inferred", "Transmissor da caixa; selecionar somente identificação"),
  relation("rad_caixa_ftth", "id_cidade", "cidade", "id", "inferred", "Cidade da caixa de atendimento"),
  relation("radusuarios", "id_contrato", "cliente_contrato", "id", "inferred", "Logins do contrato"),
  relation("radusuarios_consumo_m", "id_login", "radusuarios", "id", "foreign-key", "Consumo mensal por login"),
  relation("su_ticket", "id_cliente", "cliente", "id", "inferred", "Atendimentos; su_status difere do status de fluxo"),
  relation("su_ticket", "id_contrato", "cliente_contrato", "id", "inferred", "Atendimentos do contrato"),
  relation("su_oss_chamado", "id_cliente", "cliente", "id", "inferred", "Ordens do cliente"),
  relation("su_oss_chamado", "id_contrato_kit", "cliente_contrato", "id", "inferred", "Contrato da OS usa id_contrato_kit"),
  relation("su_oss_chamado", "id_assunto", "su_oss_assunto", "id", "inferred", "Nome do assunto da OS"),
  relation("contato", "id_cliente", "cliente", "id", "inferred", "Contatos adicionais"),
  relation(
    "movimento_comodatos",
    "id_contrato",
    "cliente_contrato",
    "id",
    "inferred",
    "Documentos de comodato; conferir devoluções e cancelamentos"
  ),
  relation("movimento_produtos", "id_contrato", "cliente_contrato", "id", "inferred", "Itens vinculados ao contrato"),
  relation("movimento_produtos", "id_produto", "produtos", "id", "foreign-key", "Produto do movimento"),
] as const;
