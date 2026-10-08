// Generated offline from docs/ixc-database/schema.json. Run npm run ixc:maps -w server.
// These types describe storage, not DTOs: never expose entire rows or credentials.
import type { IxcDecimal, IxcBigInt, IxcDate, IxcDateTime, IxcBinary } from "../types.js";

export interface FnMovimFinanRow {
  id: number;
  data: IxcDate;
  id_conta: number;
  documento: string;
  credito: IxcDecimal;
  debito: IxcDecimal;
  historico: string;
  id_movim_finan: number;
  pdesconto: IxcDecimal;
  vdesconto: IxcDecimal;
  pacrescimo: IxcDecimal;
  vacrescimo: IxcDecimal;
  id_receber: IxcBigInt;
  id_pagar: number;
  tipo_lanc: "M" | "P" | "R" | "D" | "C" | "AC" | "AF" | "T" | "";
  vencimento: IxcDate;
  data_pagamento: IxcDate;
  data_recebimento: IxcDate;
  id_entrada: number | null;
  id_saida: number | null;
  id_inventario: number | null;
  id_baixa_lote: number | null;
  sistema_origem: number | null;
  id_origem: number | null;
  id_adiantamento_cliente: number | null;
  id_adiantamento_fornecedor: number | null;
  filial_id: number;
  conciliado: "S" | "N" | "" | null;
  conciliado_extrato: string | null;
  conciliado_fn: string | null;
  conta_: number | null;
  id_fornecedor: number | null;
  tipo_recebimento: "D" | "H" | "C" | "CD" | "DP" | "T" | "P" | "DC" | "B" | "";
  id_cli_aux_rec: number | null;
  valor_troco: IxcDecimal | null;
  debito_aux_composto: IxcDecimal | null;
  id_renegociacao: number | null;
  id_movim_cheque: number | null;
  id_operador: number | null;
  id_ajuste_estoque: number | null;
  id_motivo_desconto: number | null;
  id_lote_retorno: number | null;
  id_classe_finan: number | null;
  id_conta_class_finan_a: number | null;
  id_conciliacao_lote: number | null;
  chave_recebimento: string | null;
  ultima_atualizacao: IxcDateTime;
  chave_recebimento_unico: string | null;
  id_grade_contabil: number | null;
  cancelamento: string | null;
  id_movimento_produto_comodato: number | null;
  id_transf_almox: number | null;
  id_fn_tranferencia_caixa: number | null;
  descontos_adicionais: IxcDecimal | null;
  valor_liquido_recebido: IxcDecimal | null;
  valor_recebido_dinheiro: IxcDecimal | null;
  registrado_por: string | null;
  registrado_em: IxcDateTime | null;
  atualizado_por: string | null;
  id_arquivo_importado: number | null;
  centro_custo_regra_criterio: "CE" | "CR" | "" | null;
  id_centro_custo_criterio_rateio: number | null;
  id_centro_custo_rel_centro_custo_categoria: number | null;
  id_centro_custo_categoria_filtro: number | null;
  id_centro_custo_projeto: number | null;
  estrutura_centro_custo_centro_resultado: "CC" | "CR" | "";
  centro_resultado_regra_criterio: "CER" | "CR" | "";
  id_centro_resultado_rel_centro_custo_categoria: number | null;
  id_centro_custo_criterio_rateio_centro_resultado: number | null;
  valor_juros: IxcDecimal | null;
  valor_multas: IxcDecimal | null;
}

export interface FnAreceberRow {
  id: IxcBigInt;
  id_saida: number;
  data_emissao: IxcDate;
  valor: IxcDecimal;
  obs: string;
  status: "A" | "R" | "P" | "C" | "";
  valor_recebido: IxcDecimal;
  liberado: "N" | "S" | "";
  id_cliente: number;
  data_vencimento: IxcDate;
  documento: string;
  tipo_recebimento:
    | "Boleto"
    | "Cheque"
    | "Cartão"
    | "Dinheiro"
    | "Depósito"
    | "Gateway"
    | "Débito"
    | "Fatura"
    | "ArrecadacaoRecebimento"
    | "Transferencia"
    | "Pix"
    | "";
  id_conta: number;
  valor_aberto: IxcDecimal | null;
  id_carteira_cobranca: number | null;
  filial_id: number;
  baixa_automatica: "S" | "N" | "" | null;
  nparcela: number | null;
  id_mot_cancelamento: number | null;
  data_cancelamento: IxcDate | null;
  valor_cancelado: IxcDecimal | null;
  id_contrato: number | null;
  libera_periodo: "N" | "S" | "" | null;
  caixa: number | null;
  id_remessa: number | null;
  status_remessa: string | null;
  previsao: "N" | "S" | "M" | "";
  parcela_proporcional: "S" | "N" | "" | null;
  nn_boleto: string | null;
  gateway_link: string | null;
  lote: number | null;
  tipo_cobranca: "I" | "E" | "" | null;
  id_cobranca: number | null;
  status_cobranca: string | null;
  id_contrato_avulso: number | null;
  pagamento_valor: IxcDecimal | null;
  pagamento_data: IxcDate | null;
  id_nota_gerada: number | null;
  id_im_imovel: number | null;
  impresso: "S" | "N" | "";
  duplicata: string | null;
  id_sip: number | null;
  boleto: IxcBigInt | null;
  gerencianet_token: string | null;
  id_renegociacao: number | null;
  tipo_renegociacao: "R" | "N" | "" | null;
  id_renegociacao_novo: number | null;
  valor_ate_vencimento: IxcDecimal | null;
  valor_desconto_ate_vencimento: IxcDecimal | null;
  data_ini_cdr_voip: IxcDateTime | null;
  data_fin_cdr_voip: IxcDateTime | null;
  id_remessa_baixa: number | null;
  forma_recebimento: "M" | "R" | "" | null;
  arquivo_remessa_baixado: "S" | "N" | "" | null;
  id_remessa_alteracao: number | null;
  motivo_alteracao: string | null;
  baixa_data: IxcDateTime | null;
  credito_data: IxcDate | null;
  baixa_id_operador: number | null;
  cancelamento_id_operador: number | null;
  numero_parcela_recorrente: number | null;
  id_contrato_principal: number | null;
  id_nota_gerada_opc2: number | null;
  id_nota_gerada_opc3: number | null;
  id_nota_gerada_opc4: number | null;
  titulo_importado: "S" | "N" | "" | null;
  tarifa_gateway_lancada: "S" | "N" | "";
  linha_digitavel: string | null;
  data_inicial_ligacoes: IxcDate | null;
  data_final_ligacoes: IxcDate | null;
  origem_importacao: string | null;
  tipo_pagamento_cartao: "N" | "R" | "" | null;
  ultima_atualizacao: IxcDateTime;
  titulo_protestado: "S" | "N" | "" | null;
  enviado_remessa_baixa: "S" | "N" | "";
  aguardando_confirmacao_pagamento: "S" | "N" | "";
  desconto_condicional_valor: IxcDecimal | null;
  validade_desconto_condicional: IxcDate | null;
  pix_txid: string | null;
  pix_id_carteira_cobranca: number | null;
  parcelado_cartao: "N" | "S" | "";
  em_processamento: "N" | "S" | "" | null;
  id_assinatura_cliente: number | null;
  recebido_via_pix: "S" | "N" | "";
  data_inicial: IxcDate | null;
  data_final: IxcDate | null;
  data_cotacao_diaria: IxcDate | null;
  valor_cotacao_diaria: IxcDecimal | null;
  valor_moeda_original: IxcDecimal | null;
  moeda: string | null;
  descontos_adicionais: IxcDecimal | null;
  id_lote_geracao_financeiro_fatura: number | null;
  ids_faturas_origem: string | null;
  ids_contratos_origem: string | null;
  pix_status: "A" | "C" | "" | null;
  id_lote_geracao_financeiro: number | null;
  credit_card_transaction_id: string | null;
  charge_id: string | null;
  estornado: "S" | "N" | "";
  titulo_renegociado: "S" | "N" | "";
  conta_recebimento: number | null;
  pix_txid_recorrente: string | null;
  pix_status_recorrente: "CRIADA" | "ATIVA" | "CONCLUIDA" | "EXPIRADA" | "REJEITADA" | "CANCELADA" | "" | null;
  valor_juros_multa: IxcDecimal | null;
  valor_total_com_juros: IxcDecimal | null;
  bandeira_pagamento: string | null;
  titulo_negativacao_integracao: "S" | "N" | "" | null;
  recebido_por_recorrencia: "S" | "N" | "";
  tipo_cobranca_pix: "COM_VENCIMENTO" | "IMEDIATA" | "" | null;
  valor_juros: IxcDecimal | null;
  valor_multas: IxcDecimal | null;
  tentativa_pix_recorrente: number | null;
  data_prevista_tentativa_pix_recorrente: IxcDate | null;
  sequencialFacilito: number | null;
  agencia_sequencial: number | null;
  em_cobranca: "S" | "N" | "" | null;
}

export interface FnApagarRow {
  id: number;
  id_fornecedor: number;
  id_entrada: number;
  data_emissao: IxcDate;
  data_vencimento: IxcDate;
  obs: string | null;
  valor: IxcDecimal;
  status: "A" | "F" | "P" | "C" | "";
  valor_pago: IxcDecimal;
  liberado: "N" | "S" | "";
  tipo_pagamento: string | null;
  documento: string;
  valor_aberto: IxcDecimal | null;
  id_conta: number | null;
  previsao: string | null;
  sistema_origem: number | null;
  id_origem: number | null;
  filial_id: number;
  codigo_barras: string | null;
  duplicata: string | null;
  lote: string | null;
  id_contas: number | null;
  valor_cancelado: IxcDecimal | null;
  data_cancelamento: IxcDate | null;
  id_mot_cancelamento: number | null;
  cancelamento_id_operador: number | null;
  valor_total_pago: IxcDecimal;
  data_pagamento: IxcDateTime | null;
  debito_data: IxcDate | null;
  id_remessa_pagamento: number | null;
  eh_despesa_veiculo: "S" | "N" | "";
  status_auditoria: "A" | "R" | "V" | "C" | "N" | "";
  id_lote_importacao: number | null;
  chave_pix: string | null;
  ultima_atualizacao: IxcDateTime;
  id_lote_pagamento: IxcBigInt | null;
  tipo_pix: "CPF_CNPJ" | "CELULAR" | "EMAIL" | "ALEATORIA" | "COPIA_E_COLA" | "" | null;
  numero_nota: string | null;
  id_dado_bancario: number | null;
  comunicado: "S" | "N" | "" | null;
  estornado: "S" | "N" | "" | null;
  id_funcionario: number | null;
  data_termino: IxcDate;
  despesa_tipo: number | null;
  conta_pagamento: number | null;
  centro_custo_regra_criterio: "CE" | "CR" | "" | null;
  id_centro_custo_rel_centro_custo_categoria: number | null;
  id_centro_custo_criterio_rateio: number | null;
  id_centro_custo_categoria_filtro: number | null;
}

export interface PlanejamentoAnaliticoRow {
  id: number;
  planejamento_analitico: string;
  id_planejamento: number;
  conta: number;
  tipo: string | null;
  auxiliar: number | null;
  classificacao: string | null;
  conta_dominio: string | null;
  sequencia_planejamento_analitico: number | null;
  id_planejamento_analitico_finan: number | null;
  previsao: "M" | "S" | "N" | "";
  ativo: "S" | "N" | "";
}

export interface PlanejamentoRow {
  id: number;
  planejamento: string;
  tipo: "A" | "P" | "R" | "D" | "C" | "PT" | "";
  cod_planejamento: string;
  nivel_superior: number | null;
  contador: number | null;
  conta_dominio: string | null;
  subtipo: "DA" | "DV" | "DF" | "CV" | "CF" | "" | null;
}

export interface ContasRow {
  id: number;
  conta: string;
  numero_conta: string;
  agencia: string;
  cod_banco: string;
  data_abertura: IxcDate;
  saldo_abertura: IxcDecimal;
  tipo_conta: "C" | "B" | "D" | "";
  id_planejamento: number;
  ativo: "S" | "N" | "";
  descricao: string | null;
  numero_conta_dv: string | null;
  agencia_dv: string | null;
  layout_conciliacao: string | null;
  filial_padrao: number | null;
  permitir_pag_saldo_negativo: "S" | "N" | "";
  cnpj: string | null;
  razao_banco: string | null;
  numero_cooperativa: string | null;
  parametro_troca_eletronica: string | null;
  numero_convenio: string | null;
  operacao: string | null;
  suframa: string | null;
  cep: string | null;
  logradouro: string | null;
  numero_residencia: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: number | null;
  numero_convenio_fornecedor: string | null;
  intermediary_name: string | null;
  intermediary_cnpj: string | null;
  intermediary_city_id: number | null;
  intermediary_street: string | null;
  intermediary_number: string | null;
  intermediary_complement: string | null;
  intermediary_neighborhood: string | null;
  integration_name: string | null;
  integration_client_id: string | null;
  integration_client_secret: string | null;
  integration_environment: "H" | "P" | "";
  integration_secret_key: string | null;
  id_centro_custo_rel_centro_custo_categoria_padrao: number | null;
  anexar_comprovante_cpa_auto: "S" | "N" | "";
  modalidade_conta: "CONTA_CORRENTE" | "CONTA_PAGAMENTO" | "" | null;
}

export interface FilialRow {
  id: number;
  razao: string | null;
  id_empresa: number | null;
  fantasia: string | null;
  cidade: number | null;
  endereco: string | null;
  numero: string | null;
  cep: string | null;
  ie: string | null;
  cnpj: string | null;
  telefone: string | null;
  telefone1: string | null;
  fax: string | null;
  regime_tributario: number | null;
  ato_anatel: string | null;
  im: string | null;
  cnae: string | null;
  rt: "1" | "2" | "3" | "0-13" | "0-15" | "0-23" | "0-47" | "R-99-PN" | "" | null;
  complemento: string | null;
  bairro: string;
  iest: string | null;
  logo: string | null;
  nfe_ambiente: "1" | "2" | "" | null;
  nfe_formato_imp: "P" | "L" | "" | null;
  nfe_canhoto: "S" | "N" | "" | null;
  nfe_certificado: string | null;
  nfe_chave: string | null;
  nfe_email: string | null;
  nfe_email_senha: string | null;
  email: string | null;
  site: string | null;
  nfe_inf_complementar: string | null;
  contato: string | null;
  background_cor: string | null;
  background_logo: string | null;
  im_numero_creci: string | null;
  tipo_pessoa: "J" | "F" | "1" | "2" | "" | null;
  sici_numero_fistel: string | null;
  desc_auxiliar_fone_os: string | null;
  ramal: string | null;
  rt_especial: string | null;
  insentivo_cultural: "0" | "1" | "" | null;
  opcao_simples: "0" | "1" | "" | null;
  nfse_padrao: string | null;
  nfse_senha_acesso: string | null;
  nfse_url_servico: string | null;
  nfce_imprime_produtos: "S" | "N" | "" | null;
  nfce_id_token: string | null;
  nfce_csc: string | null;
  nfe_id_email_envio_cliente: number | null;
  nfe_envia_pdf_email: "S" | "N" | "";
  nfe_envia_xml_email: "S" | "N" | "";
  logo_docs: string | null;
  enviar_email_suporte: "S" | "N" | "" | null;
  email_suporte: string | null;
  img_assinatura: string | null;
  id_rps_modelo_impressao: number | null;
  id_filial_doc_opcional: number | null;
  contador_nome: string | null;
  contador_cnpj: string | null;
  contador_cpf: string | null;
  contador_crc: string | null;
  contador_uf: string | null;
  contador_cep: string | null;
  contador_endereco: string | null;
  contador_numero: string | null;
  contador_complemento: string | null;
  contador_bairro: string | null;
  contador_telefone: string | null;
  contador_fax: string | null;
  contador_email: string | null;
  nfse_cod_cidade: string | null;
  latitude: string | null;
  longitude: string | null;
  facebook: string | null;
  iss_exigibilidade: number | null;
  cnae_complementar: string | null;
  id_filial_isss_exig: number | null;
  nfe_id_envio_email_fornecedor: number | null;
  usuario_nfse: string;
  contador_cidade: number | null;
  insentivo_fiscal: number;
  email_envio_contrato_assinado_filial: string | null;
  envia_email_assinatura_digital_contrato: "S" | "N" | "P" | "" | null;
  smtp_envio_email_assinatura_contrato_digital: number | null;
  certificado_valido: "S" | "N" | "" | null;
  cor_mapa: string | null;
  envia_anexo_pdf: "S" | "N" | "" | null;
  id_envio_email_personalizado: number | null;
  numero_eot: string | null;
  id_integracao_serasa: number;
  tv_id_regiao: number | null;
  id_filial_doc_opc2: number | null;
  id_filial_doc_opc3: number | null;
  id_filial_doc_opc4: number | null;
  identificador_na_febraban: number | null;
  whatsapp: string | null;
  inserir_inf_adic_contrato_descricao_servico: "S" | "N" | "";
  nfse_client_id: string | null;
  nfse_client_secret: string | null;
  id_cnae: number | null;
  nfse_aedf: string | null;
  nfse_cfps: number | null;
  token_rdstation: string | null;
  id_canal_venda_marketing: number | null;
  token: string | null;
  permite_conversoes_duplicadas: "S" | "N" | "";
  integracao_assinatura_digital: number | null;
  ativo: "S" | "N" | "";
  importar_dfe_automaticamente: "S" | "N" | "" | null;
  nfe_ambiente_62: "1" | "2" | "" | null;
  regime_fiscal_col: "48" | "49" | "" | null;
  tipo_documento_identificacao_col: "11" | "12" | "13" | "21" | "22" | "31" | "41" | "42" | "47" | "50" | "91" | "CI" | "RUC" | "NUIT" | "";
  ciiu_col: "6110" | "6120" | "6130" | "6190" | "" | null;
  curl_type: string;
  contador: "S" | "N" | "";
  rotina_nfse: number | null;
  centro_custo_status: "A" | "I" | "";
  gerar_login: "S" | "N" | "" | null;
  padrao_gerar_login: string | null;
  tributacao_por_ramo_de_atividade: "S" | "N" | "" | null;
  forma_tributacao: number | null;
  cod_classificacao_tribut_cbs_ibs: string;
  cod_situacao_tribut_cbs_ibs: string | null;
  base_calculo_cbs_ibs: number | null;
  tipo_documento_nota_saida: number | null;
  tipo_documento_nota_entrada: number | null;
  reducao_aliquota: IxcDecimal | null;
  centro_custo_data_ativacao: IxcDateTime | null;
  atividade_economica: string | null;
  amb_nacional: "S" | "N" | "" | null;
  mostrar_info_adicionais_anatel: "S" | "N" | "";
  regime_apuracao_tributaria_sn: string | null;
  almox_padrao: number | null;
  op_uso_consumo_pessoal: "S" | "N" | "" | null;
  enviar_im: "S" | "N" | "" | null;
  total_tributos_simples: IxcDecimal | null;
  enviar_aliquota_iss: "S" | "N" | "";
  obs_integracao: string | null;
  tipo_totalizacao_tributos: "P" | "V" | "";
  enviar_cbs_ibs: "S" | "N" | "";
  envia_numero_beneficio_municipal: "S" | "N" | "";
}

export interface FnExtratoRow {
  id: number;
  data: IxcDate;
  documento: string | null;
  historico: string;
  id_conta: number;
  info1: string | null;
  info2: string | null;
  debito: IxcDecimal | null;
  credito: IxcDecimal | null;
  conciliado: "S" | "N" | "" | null;
  ids_financeiro: string | null;
  conciliado_financeiro: string | null;
  id_extrato: string | null;
  conciliado_extrato: string | null;
  id_conciliacao_lote: number | null;
  pix_txid: string | null;
}

export interface FnTransferenciaCaixaRow {
  id: number;
  id_conta_origem: number | null;
  id_conta_destino: number | null;
  id_operador: number | null;
  valor: IxcDecimal | null;
  data_transferencia: IxcDateTime | null;
  create_time: IxcDateTime;
  update_time: IxcDateTime;
  historico: string | null;
  tipo_recebimento: "D" | "B" | "H" | "T" | "C" | "CD" | "DP" | "P" | "";
  conta_origem: string | null;
  conta_destino: string | null;
  contas_id_origem: number;
  contas_id_destino: number;
}

export interface CentroCustoRateioRow {
  id: number;
  id_centro_custo_rel_centro_custo_categoria: number | null;
  id_fn_apagar: number | null;
  id_movimento_produtos: number | null;
  id_planejamento_analitico: number;
  quantidade: IxcDecimal;
  porcentagem: IxcDecimal;
  valor: IxcDecimal;
  data_contabilizacao: IxcDate | null;
  id_centro_custo_projeto: number | null;
  id_fn_movim_finan: number | null;
}

export interface FornecedorRow {
  id: number;
  razao: string;
  fantasia: string;
  telefone: string | null;
  email: string;
  representante: string;
  telefone_representante: string;
  cidade: number;
  id_conta: number;
  data: IxcDate | null;
  ativo: "S" | "N" | "" | null;
  tipo_pessoa: "F" | "J" | "E" | "" | null;
  cpf_cnpj: string | null;
  ie_identidade: string | null;
  endereco: string | null;
  numero: string | null;
  referencia: string | null;
  bairro: string | null;
  cep: string | null;
  nomecidade: string | null;
  celular: string | null;
  site: string | null;
  siglauf: string | null;
  paiz: number | null;
  rg_orgao_emissor: string | null;
  tipo: number | null;
  tipo_plano_id: number | null;
  id_operadora_celular: number;
  obs: string | null;
  duplicata: string | null;
  lote: string | null;
  id_cliente_conversao: number;
  ultima_atualizacao: IxcDateTime | null;
  contribuinte_icms: "S" | "N" | "I" | "" | null;
  pix_cpf_cnpj: string | null;
  pix_celular: string | null;
  data_nascimento: IxcDate | null;
  regime_fiscal_col: "48" | "49" | "" | null;
  tipo_documento_identificacao_col: "11" | "12" | "13" | "21" | "22" | "31" | "41" | "42" | "47" | "50" | "91" | "CI" | "RUC" | "NUIT" | "";
  despesa_tipo: number | null;
  iss_classificacao_padrao: string;
  pis_retem: "S" | "N" | "";
  cofins_retem: "S" | "N" | "";
  csll_retem: "S" | "N" | "";
  irrf_retem: "S" | "N" | "";
  desconto_irrf_valor_inferior: "S" | "N" | "";
  inss_retem: "S" | "N" | "";
  cli_desconta_iss_retido_total: "S" | "N" | "";
  regime_tributario: "RN" | "SNC" | "SNM" | "SNRR" | "" | null;
}

export interface ClienteRow {
  id: number;
  razao: string;
  fantasia: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: number | null;
  uf: number | null;
  cnpj_cpf: string | null;
  ie_identidade: string | null;
  cond_pagamento: number;
  fone: string | null;
  cep: string | null;
  email: string | null;
  tipo_pessoa: "J" | "F" | "E" | "1" | "2" | "3" | "" | null;
  id_tipo_cliente: number | null;
  ativo: "S" | "N" | "";
  id_conta: number;
  status_internet: "N" | "A" | "D" | "CM" | "CA" | "CE" | "FA" | "" | null;
  bloqueio_automatico: "S" | "N" | "" | null;
  aviso_atraso: "S" | "N" | "" | null;
  obs: string | null;
  dia_vencimento: number | null;
  data: IxcDate | null;
  id_myauth: number | null;
  telefone_comercial: string | null;
  telefone_celular: string | null;
  referencia: string | null;
  complemento: string | null;
  ramal: string | null;
  senha: string | null;
  nao_bloquear_ate: IxcDate | null;
  nao_avisar_ate: IxcDate | null;
  id_vendedor: number | null;
  isuf: string | null;
  tipo_assinante: "1" | "2" | "3" | "4" | "5" | "6" | "" | null;
  data_nascimento: IxcDate | null;
  contato: string | null;
  hotsite_email: string | null;
  hotsite_acesso: number | null;
  estado_civil: "Casado" | "Solteiro" | "Divorciado" | "Viúvo" | "" | null;
  filial_id: number;
  latitude: string | null;
  longitude: string | null;
  crm: "S" | "N" | "";
  id_candato_tipo: number | null;
  tabela_preco: number | null;
  rg_orgao_emissor: string | null;
  nacionalidade: string | null;
  deb_automatico: string | null;
  deb_agencia: string | null;
  deb_conta: string | null;
  alerta: string | null;
  data_cadastro: IxcDate | null;
  endereco_cob: string | null;
  numero_cob: string | null;
  bairro_cob: string | null;
  cidade_cob: number | null;
  uf_cob: number | null;
  cep_cob: string | null;
  referencia_cob: string | null;
  complemento_cob: string | null;
  participa_cobranca: "S" | "N" | "P" | "";
  num_dias_cob: number | null;
  profissao: string | null;
  url_site: string | null;
  url_sistema: string | null;
  ip_sistema: string | null;
  porta_ssh_sistema: number | null;
  senha_root_sistema: string | null;
  remessa_debito: number | null;
  id_operadora_celular: number | null;
  participa_pre_cobranca: "S" | "N" | "";
  cob_envia_email: "S" | "N" | "";
  cob_envia_sms: "S" | "N" | "";
  contribuinte_icms: "S" | "N" | "I" | "";
  id_condominio: number | null;
  nome_pai: string | null;
  nome_mae: string | null;
  quantidade_dependentes: number | null;
  nome_conjuge: string | null;
  fone_conjuge: string | null;
  cpf_conjuge: string | null;
  rg_conjuge: string | null;
  data_nascimento_conjuge: IxcDate | null;
  moradia: "P" | "A" | "" | null;
  nome_contador: string | null;
  telefone_contador: string | null;
  ref_com_empresa1: string | null;
  ref_com_empresa2: string | null;
  ref_com_fone1: string | null;
  ref_com_fone2: string | null;
  ref_pes_nome1: string | null;
  ref_pes_nome2: string | null;
  ref_pes_fone1: string | null;
  ref_pes_fone2: string | null;
  emp_empresa: string | null;
  emp_cnpj: string | null;
  emp_cep: string | null;
  emp_endereco: string | null;
  emp_cidade: number | null;
  emp_fone: string | null;
  emp_contato: string | null;
  emp_cargo: string | null;
  emp_remuneracao: IxcDecimal | null;
  emp_data_admissao: IxcDate | null;
  website: string | null;
  skype: string | null;
  status_prospeccao: "C" | "S" | "A" | "N" | "V" | "P" | "AB" | "SV" | "SP" | "AC" | "" | null;
  prospeccao_ultimo_contato: IxcDate | null;
  prospeccao_proximo_contato: IxcDate | null;
  orgao_publico: "S" | "N" | "";
  pipe_id_organizacao: number | null;
  im: string | null;
  responsavel: number | null;
  bloco: string | null;
  apartamento: string | null;
  cif: string | null;
  grau_satisfacao: "1" | "2" | "3" | "4" | "5" | "" | null;
  idx: number | null;
  iss_classificacao: string;
  iss_classificacao_padrao: string;
  tipo_cliente_scm:
    "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "99" | "0-13" | "0-15" | "0-23" | "0-47" | "R-99-PN" | "" | null;
  pis_retem: "S" | "N" | "";
  cofins_retem: "S" | "N" | "";
  csll_retem: "S" | "N" | "";
  irrf_retem: "S" | "N" | "";
  cpf_pai: string | null;
  cpf_mae: string | null;
  identidade_pai: string | null;
  identidade_mae: string | null;
  nascimento_pai: IxcDate | null;
  nascimento_mae: IxcDate | null;
  id_canal_venda: number | null;
  whatsapp: string | null;
  inscricao_municipal: string | null;
  nome_representante_1: string | null;
  nome_representante_2: string | null;
  cpf_representante_1: string | null;
  cpf_representante_2: string | null;
  identidade_representante_1: string | null;
  identidade_representante_2: string | null;
  id_contato_principal: number | null;
  id_concorrente: number | null;
  id_perfil: number | null;
  codigo_operacao: number | null;
  convert_cliente_forn: "S" | "N" | "" | null;
  tipo_pessoa_titular_conta: "F" | "J" | "" | null;
  cnpj_cpf_titular_conta: string | null;
  crm_data_vencemos: IxcDate | null;
  crm_data_perdemos: IxcDate | null;
  crm_data_novo: IxcDate | null;
  crm_data_sondagem: IxcDate | null;
  crm_data_apresentando: IxcDate | null;
  crm_data_negociando: IxcDate | null;
  crm_data_abortamos: IxcDate | null;
  crm_data_sem_porta_disponivel: IxcDate | null;
  crm_data_sem_viabilidade: IxcDate | null;
  cadastrado_no_galaxPay: "S" | "N" | "";
  atualizar_cadastro_galaxPay: "S" | "N" | "";
  id_galaxPay: number;
  acesso_automatico_central: string;
  primeiro_acesso_central: string;
  ativo_serasa: number | null;
  id_vd_contrato_desejado: number | null;
  foto_cartao: IxcBinary | null;
  ultima_atualizacao: IxcDateTime;
  permite_armazenar_cartoes: "S" | "N" | "";
  yapay_token_account: string | null;
  cli_desconta_iss_retido_total: "S" | "N" | "";
  tv_code: string | null;
  tv_access_token: string | null;
  tv_token_expires_in: IxcDateTime | null;
  tv_refresh_token: string | null;
  cidade_naturalidade: number | null;
  cadastrado_via_viabilidade: "S" | "N" | "" | null;
  substatus_prospeccao: number | null;
  tipo_localidade: "R" | "U" | "";
  qtd_pessoas_calc_vel: number | null;
  qtd_smart_calc_vel: number | null;
  qtd_celular_calc_vel: number | null;
  qtd_computador_calc_vel: number | null;
  qtd_console_calc_vel: number | null;
  freq_pessoas_calc_vel: string | null;
  freq_smart_calc_vel: string | null;
  freq_celular_calc_vel: string | null;
  freq_computador_calc_vel: string | null;
  freq_console_calc_vel: string | null;
  resultado_calc_vel: string | null;
  tipo_cobranca_auto_viab: number | null;
  plano_negociacao_auto_viab: number | null;
  data_reserva_auto_viab: IxcDate | null;
  melhor_periodo_reserva_auto_viab: "M" | "N" | "T" | "" | null;
  facebook: string | null;
  alterar_senha_primeiro_acesso: "S" | "N" | "P" | "" | null;
  hash_redefinir_senha: string | null;
  data_hash_redefinir_senha: IxcDateTime | null;
  senha_hotsite_md5: "S" | "N" | "" | null;
  operador_neutro: number | null;
  external_id: string | null;
  external_system: string | null;
  status_viabilidade: "S" | "N" | "" | null;
  tipo_rede: "P" | "N" | "A" | "" | null;
  rede_ativacao: "P" | "N" | "" | null;
  indicado_por: number | null;
  numero_antigo: string | null;
  numero_cob_antigo: string | null;
  id_fornecedor_conversao: number;
  id_campanha: number | null;
  desconto_irrf_valor_inferior: "S" | "N" | "";
  id_vindi: number | null;
  antigo_acesso_central: "S" | "N" | "A" | "" | null;
  filtra_filial: "S" | "N" | "" | null;
  tipo_documento_identificacao: string;
  regua_cobranca_wpp: "S" | "N" | "" | null;
  regua_cobranca_notificacao: "S" | "N" | "" | null;
  regime_fiscal_col: "48" | "49" | "" | null;
  regua_cobranca_considera: "S" | "N" | "P" | "";
  id_segmento: number | null;
  inss_retem: "S" | "N" | "";
  tipo_ente_governamental: "1" | "2" | "3" | "4" | "5" | "6" | "" | null;
  percentual_reducao: IxcDecimal | null;
  nome_social: string | null;
  Sexo: "F" | "M" | "NB" | "O" | "PNI" | "" | null;
  cadunico: "S" | "N" | "" | null;
  tipo_operacao_ente_governamental: "1" | "2" | "3" | "4" | "" | null;
}

export interface ClienteContratoRow {
  id: number;
  id_vd_contrato: number;
  id_cliente: number;
  status: "A" | "I" | "P" | "N" | "D" | "" | null;
  data: IxcDate;
  data_validade: IxcDate | null;
  pago_ate_data: IxcDate | null;
  renovacao_automatica: "S" | "N" | "" | null;
  valor_unitario: IxcDecimal | null;
  id_tipo_contrato: number;
  contrato: string | null;
  id_filial: number | null;
  id_tipo_documento: number | null;
  id_carteira_cobranca: number | null;
  id_vendedor: number | null;
  comissao: IxcDecimal | null;
  status_internet: "A" | "D" | "CM" | "CA" | "CE" | "FA" | "AA" | "" | null;
  bloqueio_automatico: "S" | "N" | "" | null;
  nao_bloquear_ate: IxcDate | null;
  aviso_atraso: "S" | "N" | "" | null;
  nao_avisar_ate: IxcDate | null;
  obs: string | null;
  id_modelo: number;
  cc_previsao: "P" | "N" | "S" | "M" | "";
  tipo_doc_opc: number | null;
  data_cancelamento: IxcDate | null;
  data_validada: IxcDate | null;
  taxa_instalacao: IxcDecimal | null;
  desconto_fidelidade: IxcDecimal | null;
  fidelidade: number | null;
  taxa_improdutiva: IxcDecimal | null;
  data_renovacao: IxcDate | null;
  tipo: "I" | "T" | "S" | "SVA" | "";
  tel_franquia_segundos: number | null;
  tel_franquia_prefix: string | null;
  obs_cancelamento: string | null;
  motivo_cancelamento: number | null;
  email_cobranca: string | null;
  tipo_cobranca: "P" | "I" | "E" | "";
  lote: number | null;
  condicao_pagamento_primeira_fat: number | null;
  data_negativacao: IxcDate | null;
  protocolo_negativacao: string | null;
  desbloqueio_confianca: "S" | "N" | "P" | "" | null;
  desbloqueio_confianca_ativo: "S" | "N" | "" | null;
  descricao_aux_plano_venda: string | null;
  avalista_1: number | null;
  avalista_2: number | null;
  rec_bandeira: string | null;
  rec_cartao: string | null;
  rec_token: string | null;
  data_ativacao: IxcDate | null;
  imp_importacao: "S" | "N" | "" | null;
  imp_carteira: "S" | "N" | "" | null;
  imp_rede: "S" | "N" | "" | null;
  imp_bkp: "S" | "N" | "" | null;
  imp_treinamento: "S" | "N" | "" | null;
  imp_status: "F" | "A" | "" | null;
  imp_obs: string | null;
  imp_realizado: "S" | "N" | "" | null;
  imp_motivo: string | null;
  imp_inicial: IxcDate | null;
  imp_final: IxcDate | null;
  ativacao_numero_parcelas: string | null;
  ativacao_vencimentos: string | null;
  ativacao_valor_parcela: IxcDecimal | null;
  id_tipo_doc_ativ: number | null;
  id_produto_ativ: number | null;
  id_cond_pag_ativ: number | null;
  id_vendedor_ativ: number | null;
  endereco_padrao_cliente: "S" | "N" | "";
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: number | null;
  cep: string | null;
  complemento: string | null;
  referencia: string | null;
  id_condominio: number | null;
  nf_info_adicionais: string | null;
  assinatura_digital: "S" | "N" | "P" | "" | null;
  tipo_produtos_plano: "P" | "PLA" | "PRO" | "";
  status_velocidade: string;
  bloco: string | null;
  apartamento: string | null;
  id_instalador: number | null;
  motivo_inclusao: "I" | "U" | "D" | "M" | "T" | "L" | "N" | "R" | "";
  latitude: string | null;
  longitude: string | null;
  id_crm_negociacoes: number | null;
  tipo_doc_opc2: number | null;
  tipo_doc_opc3: number | null;
  tipo_doc_opc4: number | null;
  liberacao_bloqueio_manual: "S" | "N" | "P" | "";
  indicacao_contrato_id: number;
  num_parcelas_atraso: number | null;
  dt_ult_ativacao: IxcDate | null;
  dt_ult_inativacao: IxcDate | null;
  dt_utl_negativacao: IxcDate | null;
  dt_ult_desb_conf: IxcDate | null;
  dt_ult_desativacao: IxcDate | null;
  dt_ult_bloq_manual: IxcDate | null;
  dt_ult_bloq_auto: IxcDate | null;
  dt_ult_finan_atraso: IxcDate | null;
  dt_ult_desiste: IxcDate | null;
  id_contrato_principal: number | null;
  dt_ult_des_bloq_conf: IxcDate | null;
  gerar_finan_assin_digital_contrato: "S" | "N" | "P" | "" | null;
  credit_card_recorrente_token: string | null;
  credit_card_recorrente_carteira_antiga: number | null;
  data_cadastro_sistema: IxcDate | null;
  credit_card_recorrente_bandeira_cartao: string | null;
  credit_card_recorrente_dv_cartao: string | null;
  id_responsavel: number | null;
  ultima_atualizacao: IxcDateTime;
  id_motivo_negativacao: number | null;
  obs_negativacao: string | null;
  data_acesso_desativado: IxcDate | null;
  restricao_auto_desbloqueio: "S" | "N" | "";
  motivo_restricao_auto_desbloq: string | null;
  ativo_summit: "S" | "N" | "";
  portabilidade_summit: "S" | "N" | "";
  inicio_vigencia_summit: IxcDate | null;
  fim_vigencia_summit: IxcDate | null;
  range_inicial_summit: string | null;
  range_final_summit: string | null;
  dt_ult_liberacao_susp_parc: IxcDate | null;
  nao_susp_parc_ate: IxcDate | null;
  liberacao_suspensao_parcial: "H" | "D" | "P" | "" | null;
  utilizando_auto_libera_susp_parc: "S" | "N" | "" | null;
  restricao_auto_libera_susp_parcial: "S" | "N" | "" | null;
  motivo_restri_auto_libera_parc: string | null;
  id_indexador_reajuste: number | null;
  id_cidade: string;
  data_inicial_suspensao: IxcDate | null;
  data_final_suspensao: IxcDate | null;
  contrato_suspenso: "S" | "N" | "";
  data_retomada_contrato: IxcDate | null;
  dt_ult_liberacao_temporaria: IxcDate | null;
  updated_responsible_seller: "S" | "N" | "" | null;
  data_desistencia: IxcDate | null;
  motivo_desistencia: number | null;
  obs_desistencia: string | null;
  obs_contrato: string | null;
  alerta_contrato: string | null;
  data_expiracao: IxcDate;
  numero_antigo: string | null;
  base_geracao_tipo_doc: "OPC" | "PROD" | "P" | "" | null;
  integracao_assinatura_digital: "S" | "N" | "P" | "" | null;
  token_assinatura_digital: string | null;
  url_assinatura_digital: string | null;
  moeda: string | null;
  testemunha_assinatura_digital: number | null;
  selfie_photo: "S" | "N" | "P" | "";
  document_photo: "S" | "N" | "P" | "";
  id_vindi: number | null;
  data_assinatura: IxcDate | null;
  ids_contratos_recorrencia: string | null;
  motivo_adicional: number | null;
  concorrente_mot_adicional: number | null;
  id_responsavel_desistencia: number | null;
  id_responsavel_cancelamento: number | null;
  id_responsavel_negativacao: number | null;
  chave_pix: string | null;
  tipo_localidade: "R" | "U" | "";
  isentar_contrato: "S" | "N" | "" | null;
  financeiro_migrado: "S" | "N" | "" | null;
  id_notifica_massa: number | null;
  estrato_social_col: "1" | "2" | "3" | "4" | "5" | "6" | "" | null;
  agrupar_financeiro_contrato: "S" | "N" | "P" | "";
  origem_cancelamento: "M" | "A" | "" | null;
  situacao_financeira_contrato: "R" | "IR" | "I" | "";
  dt_ult_desbloq_auto: IxcDate | null;
  dt_ult_desbloq_manual: IxcDate | null;
  aplica_desconto_tempo_bloqueio: "S" | "N" | "P" | "" | null;
  tempo_permanencia: IxcDecimal | null;
  status_recorrencia: "AGUARDANDO_APROVACAO" | "APROVADA" | "REJEITADA" | "EXPIRADA" | "CANCELADA" | "" | null;
  pix_recorrente_id_carteira_cobranca: number | null;
  email_assinatura_digital: string | null;
  contato_assinatura_digital: string | null;
  id_motivo_inclusao: number | null;
  dt_retorno_desb_conf: IxcDate | null;
  aplicar_desconto_tempo_bloqueio: "S" | "N" | "P" | "" | null;
}

export interface ClienteContratoHistoricoRow {
  id: number;
  historico: string;
  data: IxcDate;
  tipo: string | null;
  id_cliente: number;
  id_contrato: number | null;
  operador: number | null;
  created_at: IxcDateTime | null;
  url: string | null;
  request_body: string | null;
  response_body: string | null;
}

export interface VdContratosRow {
  id: number;
  nome: string;
  descricao: string | null;
  id_tipo_documento: number | null;
  id_vendedor: number | null;
  comissao: IxcDecimal | null;
  id_carteira_cobranca: number | null;
  valor_contrato: IxcDecimal | null;
  Ativo: "S" | "N" | "" | null;
  limitar_n_logins: "S" | "N" | "" | null;
  logins_simultaneos: number | null;
  valor_adicional: IxcDecimal | null;
  tipo: "I" | "T" | "S" | "SVA" | "";
  tel_franquia_segundos: number | null;
  tel_franquia_prefix: string | null;
  id_cidade: number | null;
  moeda: string | null;
  id_tipo_doc_ativ: number | null;
  id_produto_ativ: number | null;
  id_cond_pag_ativ: number | null;
  id_vendedor_ativ: number | null;
  id_filial: number | null;
  id_modelo: number | null;
  tipo_doc_opc: number | null;
  tipo_doc_opc2: number | null;
  tipo_doc_opc3: number | null;
  tipo_doc_opc4: number | null;
  utilizar_desconto_ate_vencimento: "S" | "N" | "" | null;
  id_produto_ate_vencimento: number | null;
  valor_desconto: IxcDecimal | null;
  utilizar_desconto_por_repeticao: "S" | "N" | "" | null;
  qtde_repeticoes_desconto: number | null;
  id_produto_contrato_vinc: number | null;
  mostrar_na_viabilidade: "S" | "N" | "";
  utilizar_desconto_no_produto_plano: "S" | "N" | "";
  ultima_atualizacao: IxcDateTime | null;
  fidelidade: number | null;
  base_geracao_por_tipo_doc: "OPC" | "PROD" | "P" | "" | null;
  tipo_pessoa: "F" | "J" | "E" | "T" | "";
  descricao_desconto: string | null;
}

export interface RadusuariosRow {
  id: number;
  id_cliente: number;
  id_grupo: number;
  senha: string | null;
  login: string;
  login_simultaneo: number;
  ativo: "S" | "N" | "";
  ip: string | null;
  mac: string | null;
  obs: string | null;
  auto_preencher_ip: "H" | "S" | "N" | "" | null;
  auto_preencher_mac: "H" | "S" | "N" | "" | null;
  fixar_ip: "H" | "S" | "N" | "" | null;
  id_contrato: number | null;
  autenticacao_por_mac: "P" | "N" | "S" | "MK" | "UN" | "WP" | "" | null;
  autenticacao: "L" | "M" | "H" | "V" | "D" | "I" | "E" | "" | null;
  cache: "S" | "N" | "" | null;
  relacionar_ip_ao_login: "H" | "S" | "N" | "" | null;
  relacionar_mac_ao_login: "H" | "S" | "N" | "" | null;
  online: "S" | "N" | "SS" | "I" | "" | null;
  concentrador: string | null;
  conexao: string | null;
  tipo_conexao: string | null;
  porta_http: string | null;
  id_concentrador: number | null;
  interface: number | null;
  latitude: string | null;
  longitude: string | null;
  tipo_conexao_mapa: "58" | "24" | "F" | "L" | "A" | "LTE" | "LDD" | "" | null;
  senha_md5: "N" | "S" | "";
  ip_aviso: string | null;
  id_transmissor: number | null;
  onu_mac: string | null;
  id_caixa_ftth: number | null;
  senha_router1: string | null;
  senha_router2: string | null;
  senha_rede_sem_fio: string | null;
  ftth_porta: number | null;
  id_porta_transmissor: number | null;
  cliente_tem_a_senha: "S" | "N" | "" | null;
  autenticacao_wps: "S" | "N" | "" | null;
  autenticacao_mac: "S" | "N" | "" | null;
  autenticacao_wpa: string | null;
  tipo_vinculo_plano: "D" | "C" | "P" | "G" | "";
  ultima_conexao_inicial: IxcDateTime | null;
  ultima_conexao_final: IxcDateTime | null;
  tempo_conectado: number | null;
  id_hardware: number | null;
  tipo_equipamento: "C" | "P" | "" | null;
  metragem_interna: number | null;
  metragem_externa: number | null;
  tronco: string | null;
  splitter: number | null;
  sinal_ultimo_atendimento: string | null;
  interface_transmissao: number | null;
  porta_router2: number | null;
  franquia_maximo: number | null;
  franquia_atingida: "S" | "N" | "";
  franquia_consumo: IxcDecimal | null;
  franquia_consumo_up: IxcDecimal | null;
  endereco: string | null;
  endereco_padrao_cliente: "S" | "N" | "C" | "";
  numero: string | null;
  bairro: string | null;
  cidade: number | null;
  cep: string | null;
  complemento: string | null;
  referencia: string | null;
  id_condominio: number | null;
  ssid_router_wifi: string | null;
  bloco: string | null;
  apartamento: number | null;
  vlan: number | null;
  vlan_ip_rede: string | null;
  id_df_projeto: number | null;
  rota: string;
  agent_circuit_id: string | null;
  usuario_router1: string | null;
  pd_ipv6: string | null;
  perfil_autorizar_onu: number | null;
  download_atual: IxcBigInt | null;
  upload_atual: IxcBigInt | null;
  relacionar_concentrador_ao_login: "S" | "N" | "H" | "" | null;
  pool_radius: number | null;
  id_rad_dns: number;
  modelo_tranmissor: string | null;
  ultima_atualizacao: IxcDateTime;
  gw_vlan: string | null;
  motivo_desconexao: string | null;
  count_desconexao: number | null;
  tempo_conexao: number | null;
  fixar_ipv6: "H" | "S" | "N" | "" | null;
  auto_preencher_ipv6: "H" | "S" | "N" | "" | null;
  relacionar_ipv6_ao_login: "H" | "S" | "N" | "" | null;
  id_filial: number | null;
  ip_aux: string | null;
  porta_aux: number | null;
  ponta: "A" | "B" | "C" | "" | null;
  id_radgrupos_pools: number | null;
  service_tag_vlan: "S" | "N" | "" | null;
  framed_fixar_ipv6: "H" | "S" | "N" | "" | null;
  framed_autopreencher_ipv6: "H" | "S" | "N" | "" | null;
  framed_relacionar_ipv6_ao_login: "H" | "S" | "N" | "" | null;
  framed_relaciona_ipv6_ao_login: "H" | "S" | "N" | "" | null;
  framed_pd_ipv6: string | null;
  id_integracao: number | null;
  lte_auth_key: string | null;
  lte_auth_opc: string | null;
  lte_id: string | null;
  lte_apns: string | null;
  acct_session_id: string | null;
  ssid_router_wifi_5ghz: string | null;
  senha_rede_sem_fio_5ghz: string | null;
  mtu: number;
  onu_compartilhada: "S" | "N" | "";
  id_reserva_rede_neutra: number | null;
  tipo_acesso: "https" | "http" | "";
  usuario_wpa2aes: string;
  senha_wpa2aes: string;
  pacote_lte: string | null;
  id_predio: number | null;
}

export interface RadCaixaFtthRow {
  id: number;
  descricao: string;
  id_transmissor: number | null;
  latitude: string | null;
  longitude: string | null;
  id_projeto: number | null;
  capacidade: number | null;
  id_diretorio: number | null;
  codigo_estilo_caixa: string;
  obs_caixa_ftth: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  id_cidade: number | null;
  id_tecnologia: number | null;
  status: "A" | "I" | "" | null;
  id_interface: number | null;
  ultima_atualizacao: IxcDateTime | null;
  id_mini_projeto: number | null;
  tipo: "P" | "N" | "A" | "" | null;
  idx: number | null;
  external_id: string | null;
}

export interface RadpopRadioRow {
  id: number;
  ssid: string;
  id_pop: number;
  canal: string | null;
  ip: string;
  login: string | null;
  senha: string | null;
  porta_ssh: number;
  pico_conexoes: number | null;
  pico_conexoes_dia: number | null;
  conexoes_ultima: number | null;
  conexoes_ulltima_data: IxcDateTime | null;
  pico_conexoes_dia_data: IxcDateTime | null;
  pico_conexoes_data: IxcDateTime | null;
  rssi: number | null;
  noisef: number | null;
  chwidth: number | null;
  wpa_psk: string | null;
  countrycode: number | null;
  wds: string | null;
  httpd_port: number | null;
  fabricante_modelo:
    | "SMARTOLT"
    | "U"
    | "M"
    | "I"
    | "O"
    | "FH"
    | "DC"
    | "HW"
    | "ZTE"
    | "HW2"
    | "PK"
    | "FK"
    | "FKG"
    | "INB"
    | "DIG"
    | "NK"
    | "FBT"
    | "FKWGL"
    | "VSOL"
    | "RAISE"
    | "CIAEPON"
    | "ZYXEL"
    | "UFIBER"
    | "FB6001"
    | "FKC"
    | "CIAGPON"
    | "ZTEC610"
    | "VSOLGPON"
    | "PHYHOME"
    | "INTELBRASG16"
    | "2FLEX"
    | "INTELBRASEPON"
    | "TPLINK"
    | "OLTNEUTRA"
    | "TH"
    | "TPLINKP700X"
    | ""
    | null;
  conexao: "58" | "24" | "C" | "F" | "" | null;
  uptime: string | null;
  fwversion: string | null;
  netrole: string | null;
  mode: string | null;
  apmac: string | null;
  channel: string | null;
  dfs: string | null;
  opmode: string | null;
  chains: string | null;
  ack: number | null;
  distance: string | null;
  ccq: number | null;
  txrate: IxcDecimal | null;
  rxrate: IxcDecimal | null;
  security: string | null;
  rstatus: number | null;
  time: IxcDateTime | null;
  speed_lan: IxcDecimal | null;
  speed_wlan: IxcDecimal | null;
  descricao: string | null;
  sinal: number | null;
  porta_telnet: number;
  porta_api: number | null;
  modelo: string | null;
  cpu_load: string | null;
  total_memory: string | null;
  free_memory: string | null;
  temperatura: string | null;
  voltagem: string | null;
  current_firmware: string | null;
  upgrade_firmware: string | null;
  ip_anm: string | null;
  gabinete: number | null;
  subrack: number | null;
  porta_telnet_tl1: number | null;
  login_anm: string | null;
  senha_anm: string | null;
  login_hw: string | null;
  senha_hw: string | null;
  usa_smart: "S" | "N" | "" | null;
  id_pv_grupo_backup: number | null;
  cor_mapa: string | null;
  id_olt: string | null;
  autosave: string | null;
  id_servidor_unms: number | null;
  id_olt_unms: string | null;
  id_prov_snmp: number | null;
  id_olt_conscius: number | null;
  perfil_fibra_padrao: number | null;
  ativo: "S" | "N" | "";
  id_olt_externo: number | null;
  usa_vpn: number;
  id_padrao_cores: number | null;
  busca_potencia: "S" | "N" | "";
  operador_neutro: number | null;
  perfil_neutro_bridge: number | null;
  perfil_neutro_router: number | null;
  timeout: number | null;
}

export interface RadpopRadioClienteFibraRow {
  id: number;
  id_transmissor: number;
  ponid: string | null;
  nome: string | null;
  onu_tipo: string | null;
  tipo_autenticacao: string | null;
  mac: string;
  versao: string | null;
  id_perfil: number | null;
  id_login: number | null;
  comandos: string | null;
  vlan: number | null;
  slotno: number | null;
  ponno: number | null;
  onu_numero: number | null;
  sinal_rx: IxcDecimal | null;
  sinal_tx: IxcDecimal | null;
  data_sinal: IxcDateTime | null;
  temperatura: IxcDecimal | null;
  voltagem: IxcDecimal | null;
  id_caixa_ftth: number | null;
  service_port: string | null;
  id_projeto: number | null;
  id_contrato: number | null;
  gemport: string | null;
  ip_gerencia: string | null;
  login_onu_cliente: string | null;
  senha_onu_cliente: string | null;
  porta_telnet_onu_cliente: string | null;
  perfil_onu_cliente: number | null;
  script_onu_cliente: string | null;
  porta_ftth: number | null;
  senorid: string | null;
  latitude: string | null;
  longitude: string | null;
  endereco_padrao_cliente: "S" | "N" | "" | null;
  id_condominio: number | null;
  bloco: string | null;
  apartamento: number | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: number | null;
  referencia: string | null;
  complemento: string | null;
  distancia_onu: string | null;
  vlan_pppoe: string | null;
  vlan_dhcp: string | null;
  vlan_tr69: string | null;
  vlan_voip: string | null;
  vlan_iptv: string | null;
  vlan_outros: string | null;
  id_ramal: number | null;
  id_onu_unms: string | null;
  id_hardware: number | null;
  serial_number: string | null;
  id_activity: number | null;
  radpop_estrutura: "S" | "N" | "";
  causa_ultima_queda: string | null;
  porta_web_onu_cliente: number | null;
  onu_compartilhada: "S" | "N" | "";
  rack: number | null;
  frame: number | null;
  onu_rede_neutra: "S" | "N" | "";
  tipo_operacao: "B" | "R" | "" | null;
  ultima_atualizacao: IxcDateTime;
  status_potencia: "regular" | "irregular" | "indefinido" | "";
  valores_antigos: string | null;
  status_autorizado: "NA" | "A" | "" | null;
  id_radpop_radio_porta: number | null;
  usuario_pppoe_hub: string | null;
  senha_pppoe_hub: string | null;
  posicao_inconsistente: "N" | "S" | "" | null;
}

export interface RadpopRadioClienteFibraPerfilRow {
  id: number;
  nome: string;
  comando: string;
  fabricante_modelo: string | null;
}

export interface RadpopRadioPortaRow {
  id: number;
  interface: string;
  ssid: string | null;
  id_pop_radio: number;
  canal: string | null;
  sinal: string | null;
  rssi: string | null;
  noise: string | null;
  chwidth: string | null;
  distancia: string | null;
  codigo_do_pais: string | null;
  wds: string | null;
  uptime: string | null;
  mode: string | null;
  mac: string | null;
  dfs: string | null;
  ack: string | null;
  ccq: string | null;
  txrate: string | null;
  rxrate: string | null;
  security: string | null;
  speed_lan: string | null;
  speed_wlan: string | null;
  chains: string | null;
  wpa: string | null;
  pais: string | null;
  frequency: string | null;
  band: string | null;
  conexao: "58" | "24" | "C" | "F" | "" | null;
  mtu: number | null;
  interface_type: string | null;
  radio_name: string | null;
  wireless_protocol: string | null;
  data: IxcDateTime | null;
  conexoes_ultima: number | null;
  vlan_uplink: number | null;
  id_slot: number | null;
  potencia_pon: number | null;
  numero_pon: number | null;
  vlan_pppoe: string | null;
  vlan_dhcp: string | null;
  vlan_tr69: string | null;
  vlan_voip: string | null;
  vlan_iptv: string | null;
  vlan_outros: string | null;
  descricao: string | null;
  potencia_limite: string | null;
  quantidade_onus: number | null;
  quantidade_onus_autorizadas: number | null;
}

export interface RadpopOltSlotRow {
  id: number;
  descricao: string | null;
  numero_slot: number;
  portas: number;
  id_transmissor: number;
}

export interface RadHardwareRow {
  id: number;
  hardware: string;
  tipo: "R" | "F" | "";
  obs: string | null;
  ativo: "S" | "N" | "" | null;
  script: string | null;
  porta_ssh: number | null;
  porta_telnet: number | null;
  login: string | null;
  fabricante: string | null;
  qtd_portas: number | null;
  imagem: string | null;
  hardware_tipo: string | null;
}

export interface DfProjetoRow {
  id: number;
  nome: string;
  latitude: string;
  longitude: string;
  zoom: number;
  status: "A" | "I" | "";
  id_filial: number | null;
  cor_mapa: string | null;
}

export interface RadacctRow {
  radacctid: IxcBigInt;
  acctsessionid: string;
  acctuniqueid: string;
  username: string;
  groupname: string | null;
  realm: string | null;
  nasipaddress: string;
  nasportid: string | null;
  nasporttype: string | null;
  acctstarttime: IxcDateTime | null;
  acctstoptime: IxcDateTime | null;
  acctsessiontime: number | null;
  acctauthentic: string | null;
  connectinfo_start: string | null;
  connectinfo_stop: string | null;
  acctinputoctets: IxcBigInt | null;
  acctoutputoctets: IxcBigInt | null;
  calledstationid: string;
  callingstationid: string;
  acctterminatecause: string;
  servicetype: string | null;
  framedprotocol: string | null;
  framedipaddress: string;
  acctstartdelay: number | null;
  acctstopdelay: number | null;
  xascendsessionsvrkey: string | null;
  cliente: IxcBigInt | null;
  acctupdatetime: IxcDateTime | null;
  acctinterval: number | null;
  framedipv6prefix: string | null;
  delegatedipv6prefix: string | null;
  nasipv6address: string | null;
}

export interface RadusuariosConsumoMRow {
  id: number;
  id_login: number | null;
  consumo: IxcBigInt | null;
  data: IxcDateTime | null;
  consumo_upload: IxcBigInt | null;
  maior_id_consumo: IxcBigInt | null;
}

export interface SuTicketRow {
  id: number;
  id_ticket_status: number | null;
  id_usuarios: number | null;
  titulo: string;
  data_criacao: IxcDateTime | null;
  data_ultima_alteracao: IxcDateTime;
  prioridade: "B" | "M" | "A" | "C" | "";
  id_ticket_origem: "I" | "H" | "A" | "" | null;
  id_ticket_setor: number;
  menssagem: string;
  id_cliente: number;
  status: "T" | "C" | "F" | "EX" | "OSAB" | "OSAG" | "OSEX" | "";
  protocolo: string | null;
  mensagens_nao_lida_cli: number;
  mensagens_nao_lida_sup: number;
  token: string | null;
  data_hora_os_aberta: IxcDateTime | null;
  data_hora_os_execucao: IxcDateTime | null;
  data_hora_execucao: IxcDateTime | null;
  data_hora_os_encaminhada: IxcDateTime | null;
  id_wfl_processo: number | null;
  id_assunto: number | null;
  id_resposta: number | null;
  latitude: string | null;
  longitude: string | null;
  id_login: number | null;
  endereco: string | null;
  origem_endereco: "C" | "L" | "CC" | "M" | "" | null;
  id_contrato: number | null;
  id_circuito: number | null;
  id_su_diagnostico: number | null;
  status_sla: string | null;
  id_filial: number | null;
  id_responsavel_tecnico: number | null;
  su_status: "N" | "P" | "EP" | "S" | "C" | "";
  interacao_pendente: "E" | "I" | "N" | "A" | "";
  id_evento_status_processo: number;
  melhor_horario_agenda: "M" | "T" | "N" | "Q" | "" | null;
  data_reservada: IxcDate | null;
  melhor_horario_reserva: "M" | "T" | "N" | "Q" | "" | null;
  origem_cadastro: "P" | "SV" | "";
  id_canal_atendimento: number | null;
  ultima_atualizacao: IxcDateTime;
  tipo: "C" | "E" | "" | null;
  id_estrutura: number | null;
  origem_endereco_estrutura: "E" | "M" | "" | null;
  id_usuario_abertura: number | null;
  updated_user: number | null;
}

export interface SuOssChamadoRow {
  id: number;
  id_cliente: number | null;
  id_login: number | null;
  prioridade: "B" | "N" | "A" | "C" | "";
  id_assunto: number;
  mensagem: string | null;
  data_abertura: IxcDateTime | null;
  data_agenda: IxcDateTime | null;
  id_tecnico: number | null;
  mensagem_resposta: string | null;
  status: "A" | "F" | "AN" | "EN" | "AS" | "AG" | "EX" | "RAG" | "DS" | "";
  id_filial: number | null;
  id_atendente: string | null;
  data_fechamento: IxcDateTime | null;
  setor: number | null;
  data_inicio: IxcDateTime | null;
  protocolo: string | null;
  data_reabertura: IxcDateTime | null;
  motivo_reabertura: string | null;
  id_usuario_reabertura: number | null;
  data_final: IxcDateTime | null;
  impresso: "S" | "N" | "";
  id_ticket: number | null;
  id_cobranca: number | null;
  id_oss_chamado: number | null;
  data_hora_analise: IxcDateTime | null;
  data_hora_encaminhado: IxcDateTime | null;
  data_hora_assumido: IxcDateTime | null;
  data_hora_execucao: IxcDateTime | null;
  id_wfl_param_os: number | null;
  id_wfl_tarefa: number | null;
  valor_total: IxcDecimal | null;
  valor_outras_despesas: IxcDecimal | null;
  valor_total_comissao: IxcDecimal;
  id_contrato_kit: number | null;
  gera_comissao: "S" | "N" | "";
  valor_unit_comissao: IxcDecimal;
  melhor_horario_agenda: "M" | "T" | "N" | "Q" | "" | null;
  idx: number | null;
  id_resposta: number | null;
  latitude: string | null;
  longitude: string | null;
  preview: string | null;
  origem_endereco: "C" | "L" | "CC" | "M" | "" | null;
  endereco: string | null;
  justificativa_sla_atrasado: string | null;
  id_receber: IxcBigInt | null;
  id_circuito: number | null;
  id_su_diagnostico: number | null;
  id_cidade: number | null;
  mostrar_os_sem_funcionario: "S" | "N" | "" | null;
  bairro: string | null;
  id_estrutura: number | null;
  tipo: "C" | "E" | "";
  origem_endereco_estrutura: "E" | "M" | "" | null;
  liberado: number;
  data_agenda_final: IxcDateTime | null;
  data_prazo_limite: IxcDateTime | null;
  data_reservada: IxcDate | null;
  data_reagendar: IxcDateTime | null;
  data_prev_final: IxcDateTime | null;
  origem_cadastro: "P" | "SV" | "M" | "CRM" | "CC" | "";
  status_sla: string | null;
  complemento: string | null;
  referencia: string | null;
  bloco: string | null;
  apartamento: string | null;
  ultima_atualizacao: IxcDateTime;
  id_condominio: number | null;
  origem_finalizacao: "SM" | "IPM" | "IPW" | "API" | "" | null;
  notificacao_push_agrupada: "S" | "N" | "";
  origem_os_aberta: "M" | "P" | "CRM" | "CC" | "" | null;
  habilita_assinatura_cliente: "S" | "N" | "";
  status_assinatura: "A" | "F" | "";
  status_pesquisa_satisfacao: number;
  id_kit_produto: number | null;
  id_kit_produto_wiz: number | null;
}

export interface SuOssAssuntoRow {
  id: number;
  assunto: string;
  modelo_impressao: IxcBinary;
  layout_impressao: number | null;
  id_tipo_doc_pedido: number | null;
  tipo_cobranca: "FAT" | "AM" | "GAR" | "NENHUM" | "";
  id_oss_kit: number | null;
  cor_marcador: string | null;
  id_tipo_doc_servico: number | null;
  id_tipo_doc_comodato: number | null;
  valor_comissao: IxcDecimal;
  ativo: "S" | "N" | "";
  tipo_comissao: "F" | "H" | "";
  permite_abrir_cliente_atraso: "S" | "N" | "P" | "";
  numero_de_vias: number | null;
  finalidade: "OS" | "AT" | "AM" | "";
  mostra_hotsite: "S" | "N" | "";
  imprimir_produto: "S" | "N" | "" | null;
  imprimir_servico: "S" | "N" | "" | null;
  imprimir_prod_serv: "S" | "N" | "" | null;
  fat_somente_finalizada: "S" | "N" | "";
  su_oss_modelo_impressao: number | null;
  modelo_email: number | null;
  meta_horas_abertura: IxcDecimal | null;
  meta_horas_agendamento: IxcDecimal | null;
  wiz_comodato: "M" | "E" | "O" | "";
  wiz_produtos: "M" | "E" | "O" | "";
  wiz_mensalidade: "M" | "E" | "O" | "";
  wiz_localizacao: "M" | "E" | "O" | "";
  wiz_arquivos: "M" | "E" | "O" | "";
  wiz_assinatura: "M" | "E" | "O" | "";
  id_cond_pag_produto: number | null;
  id_cond_pag_servico: number | null;
  sla_apenas_dias_uteis: "S" | "N" | "P" | "";
  wiz_autorizar_ONU: "M" | "E" | "" | null;
  wiz_resumo_os: "M" | "E" | "" | null;
  tipo: "C" | "E" | "A" | "" | null;
  metas_horas_abertura_ticket: IxcDecimal;
  endereco_padrao: "C" | "L" | "CC" | "M" | "E" | "" | null;
  exige_fotos_finalizacao_os: "S" | "N" | "";
  quantidade_fotos_finalizacao_os: number;
  diagnostico_obrigatorio_finalizacao_os: "S" | "N" | "";
  horario_tempo_assunto: IxcDecimal;
  wiz_servico: "M" | "E" | "";
  id_resposta_padrao: number | null;
  formato_endereco: string | null;
  card_data_reservada: "S" | "N" | "" | null;
  id_tipo_doc_patrimonio_venda: number | null;
  id_cond_pag_patrimonio_venda: number | null;
  validar_choque_horarios_agendamento_os: "S" | "N" | "";
  ultima_atualizacao: IxcDateTime | null;
  localizacao_obrigatoria_cliente_finalizacao_os: "S" | "N" | "";
  localizacao_obrigatoria_login_finalizacao_os: "S" | "N" | "";
  msg_regiao_manutencao: string | null;
  conta_limite_os_viab: "S" | "N" | "";
  id_vendedor_faturamento: number | null;
  obrigar_processo_atendimento: "S" | "N" | "" | null;
  id_processo: number | null;
  login_obrigatorio: "S" | "N" | "";
  setor_su_oss_chamado: number | null;
  descricao: string | null;
  wiz_dados_tecnicos: "M" | "E" | "";
  equipe_obrigatoria_finalizacao_os: "S" | "N" | "";
  id_resposta_padrao_finalizacao: number | null;
  habilitar_mini_projeto: "S" | "N" | "";
  wiz_assinatura_obrig: "S" | "N" | "";
  mesclar_mini_projetos_ao_finalizar_os: "S" | "N" | "";
  mostrar_no_service: "S" | "N" | "";
  id_checklist: number | null;
  wiz_service_mobile_adicionais: "M" | "E" | "";
  wiz_service_mobile_onu: "M" | "E" | "";
  wiz_service_mobile_loc: "M" | "E" | "";
  wiz_service_mobile_anexos: "M" | "E" | "";
  wiz_service_mobile_enviar_sms_deslocamento: "S" | "N" | "O" | "";
  wiz_service_mobile_checklist: "M" | "E" | "";
  service_mobile_max_parc_adic_serv: number;
  id_sms_deslocamento: number | null;
  integracao_assinatura_digital: "S" | "N" | "" | null;
  considerar_sla: "AB" | "AG" | "";
  wiz_service_mobile_prod_imobilizados: "M" | "E" | "";
  wiz_service_mobile_prod_outros: "M" | "E" | "";
  wiz_service_mobile_config_dispositivo: "M" | "E" | "";
  contrato_obrigatorio: "S" | "N" | "";
  id_msg_omnichannel_deslocamento: number | null;
  exige_comodato_finalizar_os: "S" | "N" | "";
  quantidade_equipamentos: number | null;
  exige_produto_finalizar_os: "S" | "N" | "";
  quantidade_produtos: number | null;
  conceder_desconto_login_regiao_manutencao: "S" | "N" | "";
  mostrar_checklist_analise_risco: "i" | "F" | "N" | "";
  id_questionario_analise_risco: number;
  id_questionario: number;
  obrigar_preenchimento_canal_atendimento: "S" | "N" | "";
  obrigatorio_status_complementar: "S" | "N" | "";
  habilita_assinatura_cliente: "S" | "N" | "";
  id_feedback: number;
  prioridade_padrao: "B" | "N" | "A" | "C" | "";
  mov_kit_produto: "S" | "N" | "";
}

export interface SuOssChamadoMensagemRow {
  id: number;
  id_chamado: number;
  mensagem: string;
  id_operador: number;
  data: IxcDateTime;
  status: "A" | "F" | "AN" | "EN" | "AS" | "AG" | "EX" | "RAG" | "DS" | "";
  id_tecnico: number | null;
  id_evento: number;
  data_inicio: IxcDateTime | null;
  data_final: IxcDateTime | null;
  id_compromisso: number | null;
  tipo_cobranca: "FAT" | "AM" | "GAR" | "NENHUM" | "" | null;
  id_equipe: number | null;
  id_proxima_tarefa: number | null;
  finaliza_processo: "S" | "N" | "";
  id_resposta: number | null;
  latitude: string | null;
  longitude: string | null;
  id_su_diagnostico: number | null;
  id_evento_status: number | null;
  gps_time: IxcDateTime | null;
  id_diagnostico_especifico: number | null;
  historico: string | null;
  gera_comissao: "S" | "N" | "" | null;
  origem_registro: "RM" | "RA" | "SW" | "IP" | "";
}

export interface SuOssChamadoHistoricoRow {
  id: IxcBigInt;
  su_oss_chamado_id: IxcBigInt;
  su_oss_chamado_tipo: "C" | "E" | "";
  data_movimentacao: IxcDateTime;
  operador_id: number | null;
  acao:
    | "INSERCAO"
    | "EDICAO"
    | "EXCLUSAO"
    | "DEVOLUCAO_COMODATO"
    | "EMPRESTIMO_COMODATO"
    | "ALOCADO_IMOBILIZADO"
    | "DEVOLVIDO_IMOBILIZADO"
    | "";
  tipo: "ENDERECO" | "ARQUIVO" | "SERVICO" | "PRODUTO" | "COMODATO" | "PATRIMONIO" | "ADICIONAL_MENSALIDADE" | "PRODUTO_IMOBILIZADO" | "";
  descricao: string | null;
  quantidade: IxcDecimal | null;
  valor_unitario: IxcDecimal | null;
  valor_total: IxcDecimal | null;
  patrimonio_id: number | null;
  patrimonio_numero: string | null;
  almoxarifado_id: number | null;
  mac: string | null;
  numero_serie: string | null;
  nome_arquivo: string | null;
}

export interface SuMensagensRow {
  id: number;
  mensagem: string;
  id_ticket: number;
  operador: number;
  data: IxcDateTime;
  titulo: string;
  status: "T" | "C" | "F" | "EX" | "OSAB" | "OSAG" | "OSEX" | "";
  data_inicio: IxcDateTime | null;
  data_final: IxcDateTime | null;
  id_resposta: number | null;
  latitude: string | null;
  longitude: string | null;
  id_su_diagnostico: number | null;
  existe_pendencia_externa: number | null;
  id_evento_status: number | null;
  su_status: "N" | "P" | "EP" | "S" | "C" | "" | null;
  visibilidade_mensagens: "PU" | "PR" | "P" | "";
  ultima_atualizacao: IxcDateTime;
  observacao: string | null;
}

export interface SuEventoStatusRow {
  id: number;
  descricao: string;
}

export interface SuOssEventoRow {
  id: number;
  descricao: string;
}

export interface SuTicketSetorRow {
  id: number;
  setor: string;
  email: string | null;
  presta_atendimento: "S" | "N" | "";
  exige_vinculo_produto: "S" | "N" | "";
  ordem: number | null;
  ativo: "S" | "N" | "";
  mostra_hotsite: "S" | "N" | "";
}

export interface SuDiagnosticoRow {
  id: number;
  descricao: string;
  ativo: "S" | "N" | "";
  id_setor: number | null;
  ultima_atualizacao: IxcDateTime;
  id_diagnostico: number | null;
}

export interface UsuariosRow {
  id: number;
  id_grupo: number;
  nome: string;
  email: string;
  senha: string;
  id_caixa: number | null;
  recebimentos_dia_atual: "S" | "N" | "";
  lancamentos_dia_atual: "S" | "N" | "";
  vendedor_padrao: number | null;
  funcionario: number | null;
  caixa_fn_receber: number | null;
  status: "A" | "I" | "";
  filtra_setor: "S" | "N" | "" | null;
  filtra_funcionario: "S" | "N" | "";
  desc_max_recebimento: IxcDecimal;
  desc_max_venda: IxcDecimal;
  token_push: string | null;
  crm_filtra_vendedor: "S" | "N" | "";
  pagamentos_dia_atual: "S" | "N" | "";
  enviar_monitoramento_host: "S" | "N" | "" | null;
  acesso_webservice: "S" | "N" | "" | null;
  qtde_liberacoes: number;
  tipo_alcada: "ADM" | "SUP" | "OP" | "";
  mostrar_os_sem_funcionario: "S" | "N" | "" | null;
  enviar_notificacao_backup: "S" | "N" | "" | null;
  imagem: string | null;
  callcenter: string | null;
  user_callcenter: "N" | "S" | "";
  desc_max_renegociacao: IxcDecimal;
  inmap_filtra_vendedor: "S" | "N" | "";
  permite_inutilizar_patrimonio: "S" | "N" | "" | null;
  alter_passwd_date: IxcDateTime | null;
  permite_acesso_ixc_mobile: "S" | "N" | "";
  token_inmapservice: string | null;
  helpmode_enabled: "S" | "N" | "" | null;
  language: "Pt-Br" | "En-Us" | "Es-Es" | "";
  permite_ver_diferenca: "S" | "N" | "";
  filtra_departamento_ticket: "S" | "N" | "";
  filtra_funcionario_ticket: "S" | "N" | "";
  mostrar_ticket_sem_funcionario: "S" | "N" | "";
  template: "d" | "vg" | "";
  administrador_kanban: "S" | "N" | "" | null;
  versao_fiberdocs: "O" | "N" | "" | null;
  filtrar_plano_venda_filial_contrato: string;
  scheme: string;
  token_webservice: string | null;
  secret_code: string | null;
  secret_active: "S" | "N" | "";
  secret_url: string;
  email_verified: number;
  sms_verified: number;
  token_verified: string | null;
  telefone: string | null;
  recovery_email: string | null;
  is_valid_tfa: number;
  desc_parc_atraso: "N" | "S" | "P" | "";
  finalizar_os_outro_setor: "S" | "N" | "" | null;
  desc_max_monetario: IxcDecimal | null;
  token_looker_generated_at: IxcDateTime | null;
  permite_alterar_comunicacao_fn_apagar: "S" | "N" | "" | null;
  filtra_colaborador_quadro_kanban: "S" | "N" | "";
  permitir_alterar_versao_chaves: "S" | "N" | "" | null;
  tipo_acesso: "A" | "M" | "W" | "";
  mode_density: "S" | "C" | "R" | "" | null;
  workflow_click_count: number;
  timeline_click_count: number;
  email_validation_status: "P" | "V" | "E" | "" | null;
  recovery_email_forgot_password: string | null;
}

export interface FuncionariosRow {
  id: number;
  funcionario: string;
  id_funcao: number | null;
  id_conta: number | null;
  coeficiente: IxcDecimal | null;
  filial_id: number;
  fone_celular: string | null;
  email: string | null;
  envia_email_os: "S" | "N" | "";
  envia_sms_os: "S" | "N" | "";
  integracao_calendario: "S" | "N" | "";
  id_setor_padrao: number | null;
  endereco: string | null;
  cidade: number | null;
  numero: string | null;
  bairro: string | null;
  uf: number | null;
  cep: string | null;
  complemento: string | null;
  referencia: string | null;
  cpf_cnpj: string | null;
  ie_identidade: string | null;
  rg_orgao_emissor: string | null;
  nacionalidade: string | null;
  data_nascimento: IxcDate | null;
  fone: string | null;
  telefone_comercial: string | null;
  assinatura_email: IxcBinary | null;
  id_email_smtp: number | null;
  ativo: "S" | "N" | "" | null;
  banco: string | null;
  agencia: string | null;
  numero_conta_dv: string | null;
  agencia_dv: string | null;
  conta: string | null;
  tipo_recebimento: "C" | "B" | "D" | "" | null;
  pipe_id_usuario: number | null;
  data_admissao: IxcDate | null;
  data_demissao: IxcDate | null;
  obs: string | null;
  img_assinatura: string | null;
  ultima_latitude: string | null;
  ultima_longitude: string | null;
  percen_max_desc_areceber: IxcDecimal | null;
  ramal: number | null;
  envia_telegram_os: "S" | "N" | "";
  telegram_chat_id_funcionario: string | null;
  id_chat_telegram_funcionario: number | null;
  cor_mapa: string | null;
  prj_custo_hora_base: IxcDecimal | null;
  prj_custo_hora_adicionais: IxcDecimal | null;
  camara_centralizadora: string | null;
  id_perfil_jornada_trabalho: number;
  nome_pai: string | null;
  nome_mae: string | null;
  estado_civil: "S" | "C" | "UE" | "D" | "V" | "SE" | "";
  nome_conjuge: string | null;
  dependentes_ir: number | null;
  num_dependentes: number | null;
  cor_raca: "A" | "B" | "I" | "P" | "N" | "O" | "";
  num_manequim: number | null;
  camiseta: "P" | "PP" | "M" | "G" | "GG" | "O" | "";
  possui_deficiencia: "S" | "N" | "";
  tipo_deficiencia: "F" | "A" | "V" | "M" | "MR" | "" | null;
  grau_escolaridade: "EF" | "EM" | "ES" | "PG" | "M" | "D" | "" | null;
  periodo_escolaridade: "M" | "V" | "N" | "" | null;
  estagio_escolaridade: "C" | "CR" | "I" | "" | null;
  fone_emergencia: string | null;
  falar_com: string | null;
  salario: IxcDecimal | null;
  cnh_categoria: string | null;
  cnh_numero: string | null;
  ctps_numero: string | null;
  ctps_serie: string | null;
  ctps_data_emissao: IxcDate | null;
  ctps_cidade_emissao: number | null;
  titulo_numero: string | null;
  titulo_zona: string | null;
  titulo_secao: string | null;
  cnh_vencimento: IxcDate | null;
  rg_conjuge: string | null;
  cpf_conjuge: string | null;
  pis_numero: string | null;
  pis_data: IxcDate | null;
  rg_data_emissao: IxcDate | null;
  dep_um_nome: string | null;
  dep_um_rg: string | null;
  dep_um_cpf: string | null;
  dep_dois_nome: string | null;
  dep_dois_rg: string | null;
  dep_dois_cpf: string | null;
  dep_tres_nome: string | null;
  dep_tres_rg: string | null;
  dep_tres_cpf: string | null;
  id_departamento: number | null;
  rastreador: string | null;
  last_location_update: IxcDateTime | null;
  ultima_atualizacao: IxcDateTime | null;
  id_conta_salario: number | null;
  cod_integracao_folha: number | null;
  gps_time: IxcDateTime | null;
  ferias_colaborador: "S" | "N" | "";
  exibir_colaborador_inmap: "S" | "N" | "";
  id_conta_decimo: number | null;
  chave_pix: string | null;
  tipo_chave_pix: "cpf_cnpj" | "celular" | "email" | "aleatoria" | "codigo_copia_cola" | "" | null;
  mostrar_no_quadro_kanban: "S" | "N" | "";
  rastreador_tipo: "S" | "N" | "";
  maximo_os_dia: number | null;
  vinculo_config_roteirizacao: "S" | "N" | "";
  tipo_documento_identificacao_col: "11" | "12" | "13" | "21" | "22" | "31" | "41" | "42" | "47" | "50" | "91" | "CI" | "RUC" | "NUIT" | "";
  id_centro_custo_rel_centro_custo_categoria: number | null;
  id_centro_custo_criterio_rateio: number | null;
  regra_centro_rateio: "CE" | "CR" | "";
  ctps_seleciona: "S" | "N" | "";
  cpf_seleciona: "S" | "N" | "";
  pis_seleciona: "S" | "N" | "";
  rg_seleciona: "S" | "N" | "";
  cnh_seleciona: "S" | "N" | "";
  titulo_eleitoral_seleciona: "S" | "N" | "";
  id_veiculo_padrao: number | null;
  obrigar_marcar_quilometragem: "S" | "N" | "" | null;
  id_centro_custo_categoria_filtro: number | null;
  usuario_id: number | null;
  notifica_monitoramento: "S" | "N" | "";
}

export interface ContatoRow {
  id: number;
  id_contato_tipo: number | null;
  id_cliente: number | null;
  id_fornecedor: number | null;
  nome: string;
  fone_residencial: string | null;
  fone_comercial: string | null;
  fone_celular: string | null;
  email: string | null;
  pipe_id_pessoa: number | null;
  principal: "S" | "N" | "" | null;
  skype: string | null;
  facebook: string | null;
  website: string | null;
  email_atendimento: "S" | "N" | "" | null;
  senha: string | null;
  permissoes: string | null;
  lid: "N" | "S" | "" | null;
  lead: "N" | "S" | "" | null;
  data: IxcDate | null;
  id_responsavel: number | null;
  obs: string | null;
  endereco: string | null;
  latitude: string | null;
  longitude: string | null;
  id_candidato_tipo: number | null;
  cnpj_cpf: string | null;
  cep: string | null;
  complemento: string | null;
  tipo_pessoa: "F" | "J" | "E" | "" | null;
  status_viabilidade: "S" | "N" | "" | null;
  bairro: string | null;
  cidade: number | null;
  uf: number | null;
  id_caixa_ftth: number | null;
  distancia_caixa_mais_proxima: string | null;
  data_cadastro: IxcDateTime | null;
  referencia: string | null;
  ativo: "S" | "N" | "";
  cadastro_site: "S" | "N" | "";
  velocidade_calculada: string | null;
  id_prospeccao: number | null;
  id_vd_contrato: number | null;
  id_tipo_elemento: number | null;
  razao: string | null;
  quantidade_pessoas_lead: number | null;
  quantidade_smart_lead: number | null;
  quantidade_celular_lead: number | null;
  quantidade_computador_lead: number | null;
  quantidade_console_lead: number | null;
  frequencia_pessoas_lead: string | null;
  frequencia_smart_lead: string | null;
  frequencia_celular_lead: string | null;
  frequencia_computador_lead: string | null;
  frequencia_console_lead: string | null;
  fone_whatsapp: string | null;
  data_nascimento: IxcDate | null;
  numero: string | null;
  ultima_atualizacao: IxcDateTime | null;
  id_filial: number | null;
  alerta: string | null;
  data_ult_verificacao_viab: IxcDate | null;
  identificador: string | null;
  origem_medium: string | null;
  origem_campaing: string | null;
  origem_source: string | null;
  caixa_mais_proxima: number | null;
  moradia: "P" | "A" | "" | null;
  tipo_localidade: "R" | "U" | "" | null;
  operador_neutro: number | null;
  external_id: string | null;
  external_system: string | null;
  tipo_rede: "P" | "N" | "A" | "" | null;
  conversao_duplicada_marketing: number | null;
  indicado_por: number | null;
  id_campanha: number | null;
  id_concorrente: number | null;
  identificador_ultima_conversao: string | null;
  id_estagio: number | null;
  ordem_kanban: number | null;
  id_estagio_anterior: number | null;
  tipo_documento_identificacao_col: "11" | "12" | "13" | "21" | "22" | "31" | "41" | "42" | "47" | "50" | "91" | "CI" | "RUC" | "NUIT" | "";
  id_segmento: number;
  id_perfil: number | null;
  id_tipo_relacionamento_contato: number | null;
  ids_contratos_vinculados: string | null;
  vincular_contrato: "S" | "N" | "" | null;
  instagram: string | null;
  id_condominio: number | null;
  bloco: string | null;
  apartamento: string | null;
  origem: "outros" | "kanban" | "sales_mobile" | "" | null;
  id_importacao: number | null;
}

export interface MovimentoComodatosRow {
  id: number;
  id_movimento_produtos: number | null;
  tipo: "E" | "S" | "" | null;
  id_produto: number | null;
  descricao: string | null;
  id_entrada: number | null;
  id_saida: number | null;
  id_cliente: number | null;
  id_contrato: number | null;
  id_filial: number | null;
  id_os: number | null;
  numero_nota: IxcBigInt | null;
  status_nota: "AG" | "F" | "A" | "C" | "D" | "" | null;
  tipo_documento: number | null;
  nota_emitida_em: IxcDate | null;
  nota_emitida_por: number | null;
  nota_cancelada_em: IxcDate | null;
  id_emprestimo: number | null;
  id_devolucao: number | null;
  filial_emissao: number | null;
  nf_complementar_comodato: string | null;
  motivo_dispensa_nf: string | null;
  realizado_envio_comprovante: "S" | "N" | "";
}

export interface MovimentoProdutosRow {
  id: number;
  id_produto: number | null;
  valor_unitario: IxcDecimal;
  quantidade: IxcDecimal;
  valor_ipi: IxcDecimal | null;
  valor_icm: IxcDecimal | null;
  valor_total: IxcDecimal;
  id_entrada: number;
  id_unidade: number | null;
  id_pedido_compra: number;
  id_pedido_compra_itens: number;
  pdesconto: IxcDecimal;
  vdesconto: IxcDecimal;
  cfop: number | null;
  bicms: IxcDecimal | null;
  picms: IxcDecimal | null;
  bipi: IxcDecimal | null;
  pipi: IxcDecimal | null;
  custo: IxcDecimal;
  tipo: "E" | "S" | "I" | "";
  id_saida: number;
  id_itens_pedido: number;
  qtde_saida: IxcDecimal | null;
  id_inventario: number | null;
  data: IxcDate | null;
  id_baixa_lote: number | null;
  id_acabamento: number | null;
  descricao: string | null;
  estoque: "S" | "N" | "L" | "" | null;
  filial_id: number;
  volumes: number | null;
  pcomissao: IxcDecimal | null;
  fator_conversao: IxcDecimal | null;
  tipo_tributacao: "ICMS" | "ISSQN" | "" | null;
  icms_regime: "1" | "2" | "" | null;
  icms_sn_stributaria: string | null;
  icms_sn_origem: number | null;
  pis_situacao_tributaria: string | null;
  cofins_situacao_tributaria: string | null;
  iss_tributacao: string | null;
  iss_valor_base_calculo: IxcDecimal | null;
  iss_aliquota: IxcDecimal | null;
  iss_lista_servico: string | null;
  iss_uf: number | null;
  iss_municipio_ocorencia: string | null;
  iss_valor: IxcDecimal | null;
  ncm: string | null;
  ex_tipi: string | null;
  id_classificacao_tributaria: number | null;
  pesol: IxcDecimal | null;
  pesob: IxcDecimal | null;
  unidade_sigla: string | null;
  codigo_fornecedor: string | null;
  id_lote: number | null;
  bicms_st: IxcDecimal | null;
  valor_icms_st: IxcDecimal | null;
  valor_frete: IxcDecimal | null;
  picms_st: IxcDecimal | null;
  descricao_fornecedor: string | null;
  cst: string | null;
  status: "N" | "C" | "" | null;
  id_class_fiscal: number | null;
  icms_modBC: number | null;
  di_adicao: string | null;
  di_cod_fabricante: number | null;
  di_seqadicao: number | null;
  mp_pis_bc: IxcDecimal | null;
  mp_pis_alq: IxcDecimal | null;
  mp_pis_valor: IxcDecimal | null;
  mp_cofins_bc: IxcDecimal | null;
  mp_cofins_alq: IxcDecimal | null;
  mp_cofins_valor: IxcDecimal | null;
  mp_ii_alq: IxcDecimal | null;
  mp_ii_valor: IxcDecimal | null;
  mp_ii_bc: IxcDecimal | null;
  mp_ii_desp_aduaneira: IxcDecimal | null;
  mp_ii_iof: IxcDecimal | null;
  mp_ipi_sit_tributaria: string | null;
  mp_ipi_classe_enguadramento: string | null;
  mp_ipi_cnpj_produtor: string | null;
  mp_ipi_codigo_enquadramento: string | null;
  mp_ipi_codigo_selo_controle: string | null;
  mp_ipi_tipo_calculo: "P" | "V" | "" | null;
  old_itens_pedido: number | null;
  id_contrato: number | null;
  id_contrato_servicos: number | null;
  patrimonio: number | null;
  numero_serie: string | null;
  status_comodato: "E" | "D" | "B" | "A" | "" | null;
  id_devolucao: number | null;
  icms_modBCst: number | null;
  icms_pMVAST: IxcDecimal | null;
  id_oss_mensagem: number | null;
  id_su_oss_kit_equipamento: number | null;
  garantia_oss: "S" | "N" | "";
  id_terceiro_oss: number | null;
  tipo_produto: "C" | "S" | "F" | "M" | "P" | "O" | "" | null;
  id_oss_chamado: number | null;
  difal_vbcufdest: IxcDecimal | null;
  difal_pfcupfdest: IxcDecimal | null;
  difal_picmsufdest: IxcDecimal | null;
  difal_picmsinter: IxcDecimal | null;
  difal_picmsinterpart: IxcDecimal | null;
  difal_vfcpufdest: IxcDecimal | null;
  difal_vicmsufdest: IxcDecimal | null;
  difal_vicmsufremet: IxcDecimal | null;
  valor_outros: IxcDecimal | null;
  iss_aliquota_retido: IxcDecimal | null;
  iss_valor_retido: IxcDecimal | null;
  ultima_atualizacao: IxcDateTime | null;
  id_negociacao: number | null;
  id_almox: number;
  id_transf_almox: number | null;
  icms_predbc: IxcDecimal | null;
  id_transf_almox_item: number | null;
  id_moeda: number | null;
  qtde_pedido: IxcDecimal | null;
  id_requisacao_material_item: number | null;
  irrf_aliquota: IxcDecimal | null;
  irrf_valor: IxcDecimal | null;
  csll_aliquota: IxcDecimal | null;
  csll_valor: IxcDecimal | null;
  pis_retido_aliquota: IxcDecimal | null;
  pis_retido_valor: IxcDecimal | null;
  cofins_retido_aliquota: IxcDecimal | null;
  cofins_retido_valor: IxcDecimal | null;
  tributacao_digitada: "S" | "N" | "";
  pacrescimo: IxcDecimal;
  vacrescimo: IxcDecimal;
  pdesconto_finan: IxcDecimal;
  vdesconto_finan: IxcDecimal;
  valor_isentas_icms: IxcDecimal | null;
  valor_outras_icms: IxcDecimal | null;
  id_ajuste_estoque: number | null;
  id_vd_contratos_produtos: number | null;
  id_cliente_contrato_servicos: number | null;
  tipo_fiscal_plano: "I" | "T" | "S" | "M" | "SVA" | "TV" | "SMP" | "";
  id_estrutura: number | null;
  imobilizado: "S" | "N" | "" | null;
  id_patrimonio: number | null;
  descartado: "S" | "N" | "" | null;
  id_equipamento_tv: number | null;
  status_produto: number | null;
  v_fust: IxcDecimal | null;
  v_funttel: IxcDecimal | null;
  p_fust: IxcDecimal | null;
  p_funttel: IxcDecimal | null;
  historico: string | null;
  tipo_preenchimento_tributacao: "CM" | "CA" | "CX" | "";
  numero_patrimonial: string | null;
  importando_dfe: "S" | "N" | "";
  ultima_situacao_patrimonio: number | null;
  nfci: string | null;
  tipo_transferencia: "AOS" | "" | null;
  mac: string | null;
  id_tipo_documento: number | null;
  movimento_cancelamento_venda: "S" | "N" | "";
  id_assinatura_cliente_produto: number | null;
  data_cotacao_diaria: IxcDate | null;
  valor_cotacao_diaria: IxcDecimal | null;
  valor_moeda_original: IxcDecimal | null;
  moeda_simbolo: string | null;
  bfcp_st: IxcDecimal | null;
  pfcp_st: IxcDecimal | null;
  valor_fcp_st: IxcDecimal | null;
  id_pedido_os: number | null;
  id_login: number | null;
  aliquota_fcp: IxcDecimal | null;
  valor_fcp: IxcDecimal | null;
  aliquota_fcp_st: IxcDecimal | null;
  garantia_ate: IxcDate | null;
  motivo_descarte: string | null;
  id_usuario_descarte: number | null;
  item_nf_anterior: string | null;
  codigo_especie: number | null;
  gera_3020: number | null;
  bfcp: IxcDecimal | null;
  cod_classificacao_servico: string;
  inss_aliquota: IxcDecimal | null;
  inss_valor: IxcDecimal | null;
  mp_iva_alq: IxcDecimal | null;
  mp_iva_bc: IxcDecimal | null;
  mp_iva_valor: IxcDecimal | null;
  iva_situation: string | null;
  faturado_pedido_os: "S" | "N" | "" | null;
  pedido_os_faturado: "S" | "N" | "" | null;
  mp_reteiva_valor: IxcDecimal | null;
  retefuente_retido_aliquota: IxcDecimal;
  retefuente_retido_valor: IxcDecimal | null;
  mp_reteica_valor: IxcDecimal | null;
  icms_predbcst: IxcDecimal | null;
  reteiva_aliquota: IxcDecimal | null;
  mp_reteica_aliquota: IxcDecimal | null;
  origem_movimento: "S" | "P" | "" | null;
  forma_tributacao: number | null;
  cod_classificacao_tribut_cbs_ibs: string | null;
  cod_situacao_tribut_cbs_ibs: string | null;
  cbs_ibs_base_calculo: IxcDecimal | null;
  cbs_aliquota: IxcDecimal | null;
  cbs_valor: IxcDecimal | null;
  ibs_estadual_aliquota: IxcDecimal | null;
  ibs_estadual_valor: IxcDecimal | null;
  ibs_municipal_aliquota: IxcDecimal | null;
  ibs_municipal_valor: IxcDecimal | null;
  reducao_aliquota: IxcDecimal | null;
  reducao_aliquota_governamental: IxcDecimal | null;
  aliquota_cbs_efetiva: IxcDecimal | null;
  aliquota_ibs_efetiva: IxcDecimal | null;
  aliquota_ibs_efetiva_munic: IxcDecimal | null;
  valor_ibs: IxcDecimal | null;
  cod_benef: string | null;
  diferimento_percent: IxcDecimal | null;
  estorno_cbs: IxcDecimal | null;
  estorno_ibs: IxcDecimal | null;
}

export interface ProdutosRow {
  id: number;
  descricao: string | null;
  codigo: string | null;
  ncm: string;
  unidade: number | null;
  valor: IxcDecimal | null;
  id_sub_grupo: number;
  controla_estoque: "N" | "S" | "L" | "";
  qtde_tecido_base: IxcDecimal;
  qtde_tecido_almofadas: IxcDecimal;
  codigo_tecido: number;
  qtde_min: IxcDecimal;
  qtde_max: IxcDecimal;
  ativo: "S" | "N" | "";
  id_conta_estoque: number;
  id_conta_despesa: number;
  id_conta_receita: number;
  data_inventario: IxcDate | null;
  qtde_inventario: IxcDecimal | null;
  qtde_entrada: IxcDecimal | null;
  qtde_saida: IxcDecimal | null;
  saldo: IxcDecimal | null;
  custo_medio: IxcDecimal | null;
  ultima_qtde_entrada: IxcDecimal | null;
  ultima_qtde_saida: IxcDecimal | null;
  movimentacao: "C" | "V" | "A" | "" | null;
  tipo: "C" | "S" | "F" | "M" | "P" | "O" | "" | null;
  descricao_alt: string | null;
  id_class_fiscal: number | null;
  preco_base: IxcDecimal | null;
  pcomissao: IxcDecimal | null;
  icms_issqn: "ICMS" | "ISSQN" | "NT" | "";
  pesob: IxcDecimal | null;
  pesol: IxcDecimal | null;
  data_ultima_compra: IxcDate | null;
  margem_lucro: IxcDecimal | null;
  valor_custo: IxcDecimal | null;
  custo_estoque: IxcDecimal | null;
  custo_medio_total: IxcDecimal | null;
  ecommerce: "S" | "N" | "P" | "" | null;
  descricao_completa: string | null;
  checkbox1: "S" | "N" | "" | null;
  checkbox2: "S" | "N" | "" | null;
  checkbox3: "S" | "N" | "" | null;
  checkbox4: "S" | "N" | "" | null;
  checkbox5: "S" | "N" | "" | null;
  checkbox6: "S" | "N" | "" | null;
  checkbox7: "S" | "N" | "" | null;
  checkbox8: "S" | "N" | "" | null;
  checkbox9: "S" | "N" | "" | null;
  checkbox10: "S" | "N" | "" | null;
  checkbox11: "S" | "N" | "" | null;
  checkbox12: "S" | "N" | "" | null;
  checkbox13: "S" | "N" | "" | null;
  checkbox14: "S" | "N" | "" | null;
  checkbox15: "S" | "N" | "" | null;
  checkbox16: "S" | "N" | "" | null;
  checkbox17: "S" | "N" | "" | null;
  checkbox18: "S" | "N" | "" | null;
  checkbox19: "S" | "N" | "" | null;
  checkbox20: "S" | "N" | "" | null;
  checkbox21: "S" | "N" | "" | null;
  checkbox22: "S" | "N" | "" | null;
  checkbox23: "S" | "N" | "" | null;
  checkbox24: "S" | "N" | "" | null;
  checkbox25: "S" | "N" | "" | null;
  checkbox26: "S" | "N" | "" | null;
  checkbox27: "S" | "N" | "" | null;
  checkbox28: "S" | "N" | "" | null;
  checkbox29: "S" | "N" | "" | null;
  checkbox30: "S" | "N" | "" | null;
  checkbox31: "S" | "N" | "" | null;
  checkbox32: "S" | "N" | "" | null;
  checkbox33: "S" | "N" | "" | null;
  checkbox34: "S" | "N" | "" | null;
  checkbox35: "S" | "N" | "" | null;
  subgrupo_tipo: string | null;
  id_tabela_fipe: number | null;
  chassi: string | null;
  renavan: string | null;
  km: number | null;
  cambio: number | null;
  qtdportas: number | null;
  veiculo_cor: string | null;
  veiculo_combustivel: string | null;
  checkbox36: "S" | "N" | "" | null;
  checkbox37: "S" | "N" | "" | null;
  checkbox38: "S" | "N" | "" | null;
  checkbox39: "S" | "N" | "" | null;
  checkbox40: "S" | "N" | "" | null;
  altura: IxcDecimal | null;
  largura: IxcDecimal | null;
  profundidade: IxcDecimal | null;
  imagem: string | null;
  ecommerce_prioridade: number | null;
  ecommerce_pg_inicial: "S" | "N" | "" | null;
  aceita_valor: "P" | "N" | "";
  vICMSSTRet: IxcDecimal | null;
  valor_prefixo: string;
  valor_sufixo: string | null;
  tipo_ecommerce: string | null;
  mostra_valor_ecommerce: string | null;
  cod_servico: string | null;
  codigo_barras: string | null;
  id_produtos_ncm_cest: string | null;
  iss_natureza_operacao: number | null;
  vencimento_garantia: IxcDateTime | null;
  id_categoria_patrimonio: number | null;
  id_classe_financeira: number | null;
  id_conta_comodato: number | null;
  tv_id_plataforma: number | null;
  tv_id_pacote_canais: number | null;
  tv_id_pacote_servicos: number | null;
  tv_id_servicos: number | null;
  tv_standalone: string | null;
  tv_id_canais: number | null;
  tv_data_inicial: IxcDateTime | null;
  tv_data_final: IxcDateTime | null;
  tv_LineUp: number | null;
  plataforma: string | null;
  tv_id_pacote_servicos_watch: number | null;
  total_tickets_watch: number | null;
  descricao_pacote_watch: string | null;
  controle_impressao_etiqueta: number | null;
  id_class_fiscal_entrada: number | null;
  ultima_atualizacao: IxcDateTime | null;
  tv_id_pacotes: string | null;
  tv_mus_produtos_disponiveis: string | null;
  id_integracao_tv: number | null;
  tv_id_pacote_temporario: number | null;
  tv_data_expiracao_pacote_temporario: IxcDate | null;
  tv_dias_expiracao_pacote_temporario: number | null;
  id_plano_mvno: number | null;
  produto_playhub: string | null;
  id_sva_integracao: number | null;
  id_sva_pacote: string | null;
  id_sva_pacote_adicional: string;
  id_tipo_documento_servico: number | null;
  id_fr_faturamento_classificacoes: number | null;
  tariff_plan: string | null;
  link: string | null;
  id_assinatura_integracao: number | null;
  plataforma_integracao: string | null;
  tv_dtvgo_produtos_disponiveis: string | null;
  tipo_produto_integracao: "A" | "C" | "";
  tv_id_pacotes_adicionais: string | null;
  integrador: number | null;
  limite_pacote: number | null;
  valor_adicional_pacote: IxcDecimal | null;
  cod_classificacao_servico: string;
  id_integracao_iot: number | null;
  id_produto_iot: string | null;
  codigo_externo_produto_col: string | null;
  id_classificacao_tributaria_col: number | null;
  id_integracao_fiscal_col: number | null;
  identificacao_item_sped: string | null;
  id_tipo_documento_servico_pj: number | null;
  descricao_produto_col: string | null;
  id_centro_custo_rel_centro_custo_categoria_padrao: number | null;
  excecao_tributacao_nfcom: "S" | "N" | "";
  centro_custo_regra_criterio: "CE" | "CR" | "" | null;
  id_centro_custo_criterio_rateio: number | null;
  obs: string | null;
  id_centro_resultado_rel_centro_custo_categoria_padrao: number | null;
  tp_transacao_pry: string | null;
  cnpj_op_longa_distancia: string | null;
}

export interface CidadeRow {
  id: number;
  nome: string;
  uf: number;
  regiao: string | null;
  cod_ibge: number | null;
  cod_siafi: string | null;
  latitude: string | null;
  longitude: string | null;
  cod_cidade_nfse_forquilhinha_sc: number | null;
  origem: "N" | "I" | "";
  api_id: number | null;
  codigo: string | null;
  distrito_cod: string | null;
  distrito_desc: string | null;
}

export interface IxcTableRows {
  fn_movim_finan: FnMovimFinanRow;
  fn_areceber: FnAreceberRow;
  fn_apagar: FnApagarRow;
  planejamento_analitico: PlanejamentoAnaliticoRow;
  planejamento: PlanejamentoRow;
  contas: ContasRow;
  filial: FilialRow;
  fn_extrato: FnExtratoRow;
  fn_transferencia_caixa: FnTransferenciaCaixaRow;
  centro_custo_rateio: CentroCustoRateioRow;
  fornecedor: FornecedorRow;
  cliente: ClienteRow;
  cliente_contrato: ClienteContratoRow;
  cliente_contrato_historico: ClienteContratoHistoricoRow;
  vd_contratos: VdContratosRow;
  radusuarios: RadusuariosRow;
  rad_caixa_ftth: RadCaixaFtthRow;
  radpop_radio: RadpopRadioRow;
  radpop_radio_cliente_fibra: RadpopRadioClienteFibraRow;
  radpop_radio_cliente_fibra_perfil: RadpopRadioClienteFibraPerfilRow;
  radpop_radio_porta: RadpopRadioPortaRow;
  radpop_olt_slot: RadpopOltSlotRow;
  rad_hardware: RadHardwareRow;
  df_projeto: DfProjetoRow;
  radacct: RadacctRow;
  radusuarios_consumo_m: RadusuariosConsumoMRow;
  su_ticket: SuTicketRow;
  su_oss_chamado: SuOssChamadoRow;
  su_oss_assunto: SuOssAssuntoRow;
  su_oss_chamado_mensagem: SuOssChamadoMensagemRow;
  su_oss_chamado_historico: SuOssChamadoHistoricoRow;
  su_mensagens: SuMensagensRow;
  su_evento_status: SuEventoStatusRow;
  su_oss_evento: SuOssEventoRow;
  su_ticket_setor: SuTicketSetorRow;
  su_diagnostico: SuDiagnosticoRow;
  usuarios: UsuariosRow;
  funcionarios: FuncionariosRow;
  contato: ContatoRow;
  movimento_comodatos: MovimentoComodatosRow;
  movimento_produtos: MovimentoProdutosRow;
  produtos: ProdutosRow;
  cidade: CidadeRow;
}

export const ixcTables = {
  fn_movim_finan: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      data: {
        type: "date",
        nullable: false,
      },
      id_conta: {
        type: "int(11)",
        nullable: false,
      },
      documento: {
        type: "varchar(50)",
        nullable: false,
      },
      credito: {
        type: "decimal(15,2)",
        nullable: false,
      },
      debito: {
        type: "decimal(15,2)",
        nullable: false,
      },
      historico: {
        type: "varchar(200)",
        nullable: false,
      },
      id_movim_finan: {
        type: "int(11)",
        nullable: false,
      },
      pdesconto: {
        type: "decimal(5,2)",
        nullable: false,
      },
      vdesconto: {
        type: "decimal(15,2)",
        nullable: false,
      },
      pacrescimo: {
        type: "decimal(5,2)",
        nullable: false,
      },
      vacrescimo: {
        type: "decimal(15,2)",
        nullable: false,
      },
      id_receber: {
        type: "bigint(15)",
        nullable: false,
      },
      id_pagar: {
        type: "int(11)",
        nullable: false,
      },
      tipo_lanc: {
        type: "enum('M','P','R','D','C','AC','AF','T')",
        nullable: false,
      },
      vencimento: {
        type: "date",
        nullable: false,
      },
      data_pagamento: {
        type: "date",
        nullable: false,
      },
      data_recebimento: {
        type: "date",
        nullable: false,
      },
      id_entrada: {
        type: "int(11)",
        nullable: true,
      },
      id_saida: {
        type: "int(11)",
        nullable: true,
      },
      id_inventario: {
        type: "int(11)",
        nullable: true,
      },
      id_baixa_lote: {
        type: "int(11)",
        nullable: true,
      },
      sistema_origem: {
        type: "int(11)",
        nullable: true,
      },
      id_origem: {
        type: "int(11)",
        nullable: true,
      },
      id_adiantamento_cliente: {
        type: "int(11)",
        nullable: true,
      },
      id_adiantamento_fornecedor: {
        type: "int(11)",
        nullable: true,
      },
      filial_id: {
        type: "int(11)",
        nullable: false,
      },
      conciliado: {
        type: "enum('S','N')",
        nullable: true,
      },
      conciliado_extrato: {
        type: "text",
        nullable: true,
      },
      conciliado_fn: {
        type: "mediumtext",
        nullable: true,
      },
      conta_: {
        type: "int(11)",
        nullable: true,
      },
      id_fornecedor: {
        type: "int(11)",
        nullable: true,
      },
      tipo_recebimento: {
        type: "enum('D','H','C','CD','DP','T','P','DC','B')",
        nullable: false,
      },
      id_cli_aux_rec: {
        type: "int(11)",
        nullable: true,
      },
      valor_troco: {
        type: "decimal(15,2)",
        nullable: true,
      },
      debito_aux_composto: {
        type: "decimal(15,2)",
        nullable: true,
      },
      id_renegociacao: {
        type: "int(11)",
        nullable: true,
      },
      id_movim_cheque: {
        type: "int(11)",
        nullable: true,
      },
      id_operador: {
        type: "int(11)",
        nullable: true,
      },
      id_ajuste_estoque: {
        type: "int(11)",
        nullable: true,
      },
      id_motivo_desconto: {
        type: "int(11)",
        nullable: true,
      },
      id_lote_retorno: {
        type: "int(11)",
        nullable: true,
      },
      id_classe_finan: {
        type: "int(11)",
        nullable: true,
      },
      id_conta_class_finan_a: {
        type: "int(11)",
        nullable: true,
      },
      id_conciliacao_lote: {
        type: "int(11)",
        nullable: true,
      },
      chave_recebimento: {
        type: "varchar(70)",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: false,
      },
      chave_recebimento_unico: {
        type: "varchar(70)",
        nullable: true,
      },
      id_grade_contabil: {
        type: "int(11)",
        nullable: true,
      },
      cancelamento: {
        type: "varchar(1)",
        nullable: true,
      },
      id_movimento_produto_comodato: {
        type: "int(11)",
        nullable: true,
      },
      id_transf_almox: {
        type: "int(11) unsigned",
        nullable: true,
      },
      id_fn_tranferencia_caixa: {
        type: "int(11)",
        nullable: true,
      },
      descontos_adicionais: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      valor_liquido_recebido: {
        type: "decimal(15,2)",
        nullable: true,
      },
      valor_recebido_dinheiro: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      registrado_por: {
        type: "varchar(10)",
        nullable: true,
      },
      registrado_em: {
        type: "timestamp",
        nullable: true,
      },
      atualizado_por: {
        type: "varchar(10)",
        nullable: true,
      },
      id_arquivo_importado: {
        type: "int(11) unsigned",
        nullable: true,
      },
      centro_custo_regra_criterio: {
        type: "enum('CE','CR')",
        nullable: true,
      },
      id_centro_custo_criterio_rateio: {
        type: "int(10) unsigned",
        nullable: true,
      },
      id_centro_custo_rel_centro_custo_categoria: {
        type: "int(10) unsigned",
        nullable: true,
      },
      id_centro_custo_categoria_filtro: {
        type: "int(10) unsigned",
        nullable: true,
      },
      id_centro_custo_projeto: {
        type: "int(10) unsigned",
        nullable: true,
      },
      estrutura_centro_custo_centro_resultado: {
        type: "enum('CC','CR')",
        nullable: false,
      },
      centro_resultado_regra_criterio: {
        type: "enum('CER','CR')",
        nullable: false,
      },
      id_centro_resultado_rel_centro_custo_categoria: {
        type: "int(10) unsigned",
        nullable: true,
      },
      id_centro_custo_criterio_rateio_centro_resultado: {
        type: "int(10) unsigned",
        nullable: true,
      },
      valor_juros: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      valor_multas: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "chave_recebimento",
        nonUnique: "1",
        position: "1",
        columnName: "chave_recebimento",
        type: "BTREE",
      },
      {
        name: "chave_recebimento_unico",
        nonUnique: "0",
        position: "1",
        columnName: "chave_recebimento_unico",
        type: "BTREE",
      },
      {
        name: "data",
        nonUnique: "1",
        position: "1",
        columnName: "data",
        type: "BTREE",
      },
      {
        name: "filial_id",
        nonUnique: "1",
        position: "1",
        columnName: "filial_id",
        type: "BTREE",
      },
      {
        name: "id_conciliacao_lote",
        nonUnique: "1",
        position: "1",
        columnName: "id_conciliacao_lote",
        type: "BTREE",
      },
      {
        name: "id_conta",
        nonUnique: "1",
        position: "1",
        columnName: "id_conta",
        type: "BTREE",
      },
      {
        name: "id_entrada",
        nonUnique: "1",
        position: "1",
        columnName: "id_entrada",
        type: "BTREE",
      },
      {
        name: "id_lote_retorno",
        nonUnique: "1",
        position: "1",
        columnName: "id_lote_retorno",
        type: "BTREE",
      },
      {
        name: "id_movimento_produto_comodato",
        nonUnique: "1",
        position: "1",
        columnName: "id_movimento_produto_comodato",
        type: "BTREE",
      },
      {
        name: "id_movim_cheque",
        nonUnique: "1",
        position: "1",
        columnName: "id_movim_cheque",
        type: "BTREE",
      },
      {
        name: "id_movim_finan",
        nonUnique: "1",
        position: "1",
        columnName: "id_movim_finan",
        type: "BTREE",
      },
      {
        name: "id_origem",
        nonUnique: "1",
        position: "1",
        columnName: "id_origem",
        type: "BTREE",
      },
      {
        name: "id_pagar",
        nonUnique: "1",
        position: "1",
        columnName: "id_pagar",
        type: "BTREE",
      },
      {
        name: "id_receber",
        nonUnique: "1",
        position: "1",
        columnName: "id_receber",
        type: "BTREE",
      },
      {
        name: "id_renegociacao",
        nonUnique: "1",
        position: "1",
        columnName: "id_renegociacao",
        type: "BTREE",
      },
      {
        name: "id_saida",
        nonUnique: "1",
        position: "1",
        columnName: "id_saida",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "tipo_lanc",
        nonUnique: "1",
        position: "1",
        columnName: "tipo_lanc",
        type: "BTREE",
      },
      {
        name: "ultima_atualizacao",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_atualizacao",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "fn_movim_finan_ibfk_1",
        columnName: "id_conta",
        referencedTable: "planejamento_analitico",
        referencedColumn: "id",
      },
      {
        name: "fn_movim_finan_ibfk_2",
        columnName: "filial_id",
        referencedTable: "filial",
        referencedColumn: "id",
      },
    ],
  },
  fn_areceber: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "bigint(15)",
        nullable: false,
      },
      id_saida: {
        type: "int(11)",
        nullable: false,
      },
      data_emissao: {
        type: "date",
        nullable: false,
      },
      valor: {
        type: "decimal(15,2)",
        nullable: false,
      },
      obs: {
        type: "varchar(200)",
        nullable: false,
      },
      status: {
        type: "enum('A','R','P','C')",
        nullable: false,
      },
      valor_recebido: {
        type: "decimal(15,2)",
        nullable: false,
      },
      liberado: {
        type: "enum('N','S')",
        nullable: false,
      },
      id_cliente: {
        type: "int(11)",
        nullable: false,
      },
      data_vencimento: {
        type: "date",
        nullable: false,
      },
      documento: {
        type: "varchar(50)",
        nullable: false,
      },
      tipo_recebimento: {
        type: "enum('Boleto','Cheque','Cartão','Dinheiro','Depósito','Gateway','Débito','Fatura','ArrecadacaoRecebimento','Transferencia','Pix')",
        nullable: false,
      },
      id_conta: {
        type: "int(11)",
        nullable: false,
      },
      valor_aberto: {
        type: "decimal(15,2)",
        nullable: true,
      },
      id_carteira_cobranca: {
        type: "int(11)",
        nullable: true,
      },
      filial_id: {
        type: "int(11)",
        nullable: false,
      },
      baixa_automatica: {
        type: "enum('S','N')",
        nullable: true,
      },
      nparcela: {
        type: "int(11)",
        nullable: true,
      },
      id_mot_cancelamento: {
        type: "int(11)",
        nullable: true,
      },
      data_cancelamento: {
        type: "date",
        nullable: true,
      },
      valor_cancelado: {
        type: "decimal(15,2)",
        nullable: true,
      },
      id_contrato: {
        type: "int(11)",
        nullable: true,
      },
      libera_periodo: {
        type: "enum('N','S')",
        nullable: true,
      },
      caixa: {
        type: "int(11)",
        nullable: true,
      },
      id_remessa: {
        type: "int(11)",
        nullable: true,
      },
      status_remessa: {
        type: "varchar(50)",
        nullable: true,
      },
      previsao: {
        type: "enum('N','S','M')",
        nullable: false,
      },
      parcela_proporcional: {
        type: "enum('S','N')",
        nullable: true,
      },
      nn_boleto: {
        type: "varchar(130)",
        nullable: true,
      },
      gateway_link: {
        type: "varchar(500)",
        nullable: true,
      },
      lote: {
        type: "int(11)",
        nullable: true,
      },
      tipo_cobranca: {
        type: "enum('I','E')",
        nullable: true,
      },
      id_cobranca: {
        type: "int(11)",
        nullable: true,
      },
      status_cobranca: {
        type: "varchar(2)",
        nullable: true,
      },
      id_contrato_avulso: {
        type: "int(11)",
        nullable: true,
      },
      pagamento_valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      pagamento_data: {
        type: "date",
        nullable: true,
      },
      id_nota_gerada: {
        type: "int(11)",
        nullable: true,
      },
      id_im_imovel: {
        type: "int(11)",
        nullable: true,
      },
      impresso: {
        type: "enum('S','N')",
        nullable: false,
      },
      duplicata: {
        type: "varchar(200)",
        nullable: true,
      },
      id_sip: {
        type: "int(11)",
        nullable: true,
      },
      boleto: {
        type: "bigint(15)",
        nullable: true,
      },
      gerencianet_token: {
        type: "varchar(255)",
        nullable: true,
      },
      id_renegociacao: {
        type: "int(11)",
        nullable: true,
      },
      tipo_renegociacao: {
        type: "enum('R','N')",
        nullable: true,
      },
      id_renegociacao_novo: {
        type: "int(11)",
        nullable: true,
      },
      valor_ate_vencimento: {
        type: "decimal(15,2)",
        nullable: true,
      },
      valor_desconto_ate_vencimento: {
        type: "decimal(15,2)",
        nullable: true,
      },
      data_ini_cdr_voip: {
        type: "datetime",
        nullable: true,
      },
      data_fin_cdr_voip: {
        type: "datetime",
        nullable: true,
      },
      id_remessa_baixa: {
        type: "int(11)",
        nullable: true,
      },
      forma_recebimento: {
        type: "enum('M','R')",
        nullable: true,
      },
      arquivo_remessa_baixado: {
        type: "enum('S','N')",
        nullable: true,
      },
      id_remessa_alteracao: {
        type: "int(11)",
        nullable: true,
      },
      motivo_alteracao: {
        type: "varchar(2)",
        nullable: true,
      },
      baixa_data: {
        type: "datetime",
        nullable: true,
      },
      credito_data: {
        type: "date",
        nullable: true,
      },
      baixa_id_operador: {
        type: "int(11)",
        nullable: true,
      },
      cancelamento_id_operador: {
        type: "int(11)",
        nullable: true,
      },
      numero_parcela_recorrente: {
        type: "int(11)",
        nullable: true,
      },
      id_contrato_principal: {
        type: "int(11)",
        nullable: true,
      },
      id_nota_gerada_opc2: {
        type: "int(11)",
        nullable: true,
      },
      id_nota_gerada_opc3: {
        type: "int(11)",
        nullable: true,
      },
      id_nota_gerada_opc4: {
        type: "int(11)",
        nullable: true,
      },
      titulo_importado: {
        type: "enum('S','N')",
        nullable: true,
      },
      tarifa_gateway_lancada: {
        type: "enum('S','N')",
        nullable: false,
      },
      linha_digitavel: {
        type: "varchar(512)",
        nullable: true,
      },
      data_inicial_ligacoes: {
        type: "date",
        nullable: true,
      },
      data_final_ligacoes: {
        type: "date",
        nullable: true,
      },
      origem_importacao: {
        type: "varchar(60)",
        nullable: true,
      },
      tipo_pagamento_cartao: {
        type: "enum('N','R')",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: false,
      },
      titulo_protestado: {
        type: "enum('S','N')",
        nullable: true,
      },
      enviado_remessa_baixa: {
        type: "enum('S','N')",
        nullable: false,
      },
      aguardando_confirmacao_pagamento: {
        type: "enum('S','N')",
        nullable: false,
      },
      desconto_condicional_valor: {
        type: "decimal(10,2)",
        nullable: true,
      },
      validade_desconto_condicional: {
        type: "date",
        nullable: true,
      },
      pix_txid: {
        type: "varchar(50)",
        nullable: true,
      },
      pix_id_carteira_cobranca: {
        type: "int(11)",
        nullable: true,
      },
      parcelado_cartao: {
        type: "enum('N','S')",
        nullable: false,
      },
      em_processamento: {
        type: "enum('N','S')",
        nullable: true,
      },
      id_assinatura_cliente: {
        type: "int(11)",
        nullable: true,
      },
      recebido_via_pix: {
        type: "enum('S','N')",
        nullable: false,
      },
      data_inicial: {
        type: "date",
        nullable: true,
      },
      data_final: {
        type: "date",
        nullable: true,
      },
      data_cotacao_diaria: {
        type: "date",
        nullable: true,
      },
      valor_cotacao_diaria: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      valor_moeda_original: {
        type: "decimal(15,3)",
        nullable: true,
      },
      moeda: {
        type: "varchar(5)",
        nullable: true,
      },
      descontos_adicionais: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      id_lote_geracao_financeiro_fatura: {
        type: "int(10) unsigned",
        nullable: true,
      },
      ids_faturas_origem: {
        type: "text",
        nullable: true,
      },
      ids_contratos_origem: {
        type: "text",
        nullable: true,
      },
      pix_status: {
        type: "enum('A','C')",
        nullable: true,
      },
      id_lote_geracao_financeiro: {
        type: "int(11) unsigned",
        nullable: true,
      },
      credit_card_transaction_id: {
        type: "varchar(255)",
        nullable: true,
      },
      charge_id: {
        type: "varchar(255)",
        nullable: true,
      },
      estornado: {
        type: "enum('S','N')",
        nullable: false,
      },
      titulo_renegociado: {
        type: "enum('S','N')",
        nullable: false,
      },
      conta_recebimento: {
        type: "int(11)",
        nullable: true,
      },
      pix_txid_recorrente: {
        type: "varchar(50)",
        nullable: true,
      },
      pix_status_recorrente: {
        type: "enum('CRIADA','ATIVA','CONCLUIDA','EXPIRADA','REJEITADA','CANCELADA')",
        nullable: true,
      },
      valor_juros_multa: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      valor_total_com_juros: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      bandeira_pagamento: {
        type: "varchar(10)",
        nullable: true,
      },
      titulo_negativacao_integracao: {
        type: "enum('S','N')",
        nullable: true,
      },
      recebido_por_recorrencia: {
        type: "enum('S','N')",
        nullable: false,
      },
      tipo_cobranca_pix: {
        type: "enum('COM_VENCIMENTO','IMEDIATA')",
        nullable: true,
      },
      valor_juros: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      valor_multas: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      tentativa_pix_recorrente: {
        type: "tinyint(3) unsigned",
        nullable: true,
      },
      data_prevista_tentativa_pix_recorrente: {
        type: "date",
        nullable: true,
      },
      sequencialFacilito: {
        type: "int(10) unsigned",
        nullable: true,
      },
      agencia_sequencial: {
        type: "int(10) unsigned",
        nullable: true,
      },
      em_cobranca: {
        type: "enum('S','N')",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "boleto",
        nonUnique: "1",
        position: "1",
        columnName: "boleto",
        type: "BTREE",
      },
      {
        name: "data_cancelamento",
        nonUnique: "1",
        position: "1",
        columnName: "data_cancelamento",
        type: "BTREE",
      },
      {
        name: "data_vencimento",
        nonUnique: "1",
        position: "1",
        columnName: "data_vencimento",
        type: "BTREE",
      },
      {
        name: "filial_id",
        nonUnique: "1",
        position: "1",
        columnName: "filial_id",
        type: "BTREE",
      },
      {
        name: "id_carteira_cobranca",
        nonUnique: "1",
        position: "1",
        columnName: "id_carteira_cobranca",
        type: "BTREE",
      },
      {
        name: "id_cliente",
        nonUnique: "1",
        position: "1",
        columnName: "id_cliente",
        type: "BTREE",
      },
      {
        name: "id_cobranca",
        nonUnique: "1",
        position: "1",
        columnName: "id_cobranca",
        type: "BTREE",
      },
      {
        name: "id_contrato",
        nonUnique: "1",
        position: "1",
        columnName: "id_contrato",
        type: "BTREE",
      },
      {
        name: "id_contrato_avulso",
        nonUnique: "1",
        position: "1",
        columnName: "id_contrato_avulso",
        type: "BTREE",
      },
      {
        name: "id_lote_geracao_financeiro",
        nonUnique: "1",
        position: "1",
        columnName: "id_lote_geracao_financeiro",
        type: "BTREE",
      },
      {
        name: "id_nota_gerada",
        nonUnique: "1",
        position: "1",
        columnName: "id_nota_gerada",
        type: "BTREE",
      },
      {
        name: "id_nota_gerada_opc2",
        nonUnique: "1",
        position: "1",
        columnName: "id_nota_gerada_opc2",
        type: "BTREE",
      },
      {
        name: "id_nota_gerada_opc3",
        nonUnique: "1",
        position: "1",
        columnName: "id_nota_gerada_opc3",
        type: "BTREE",
      },
      {
        name: "id_nota_gerada_opc4",
        nonUnique: "1",
        position: "1",
        columnName: "id_nota_gerada_opc4",
        type: "BTREE",
      },
      {
        name: "id_remessa",
        nonUnique: "1",
        position: "1",
        columnName: "id_remessa",
        type: "BTREE",
      },
      {
        name: "id_renegociacao",
        nonUnique: "1",
        position: "1",
        columnName: "id_renegociacao",
        type: "BTREE",
      },
      {
        name: "id_renegociacao_novo",
        nonUnique: "1",
        position: "1",
        columnName: "id_renegociacao_novo",
        type: "BTREE",
      },
      {
        name: "id_saida",
        nonUnique: "1",
        position: "1",
        columnName: "id_saida",
        type: "BTREE",
      },
      {
        name: "liberado",
        nonUnique: "1",
        position: "1",
        columnName: "liberado",
        type: "BTREE",
      },
      {
        name: "nn_boleto",
        nonUnique: "1",
        position: "1",
        columnName: "nn_boleto",
        type: "BTREE",
      },
      {
        name: "pagamento_data",
        nonUnique: "1",
        position: "1",
        columnName: "pagamento_data",
        type: "BTREE",
      },
      {
        name: "pix_txid",
        nonUnique: "1",
        position: "1",
        columnName: "pix_txid",
        type: "BTREE",
      },
      {
        name: "pix_txid_recorrente",
        nonUnique: "1",
        position: "1",
        columnName: "pix_txid_recorrente",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "status",
        nonUnique: "1",
        position: "1",
        columnName: "status",
        type: "BTREE",
      },
      {
        name: "ultima_atualizacao",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_atualizacao",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "fn_areceber_ibfk_1",
        columnName: "id_cliente",
        referencedTable: "cliente",
        referencedColumn: "id",
      },
    ],
  },
  fn_apagar: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      id_fornecedor: {
        type: "int(11)",
        nullable: false,
      },
      id_entrada: {
        type: "int(11)",
        nullable: false,
      },
      data_emissao: {
        type: "date",
        nullable: false,
      },
      data_vencimento: {
        type: "date",
        nullable: false,
      },
      obs: {
        type: "text",
        nullable: true,
      },
      valor: {
        type: "decimal(15,2)",
        nullable: false,
      },
      status: {
        type: "enum('A','F','P','C')",
        nullable: false,
      },
      valor_pago: {
        type: "decimal(15,2)",
        nullable: false,
      },
      liberado: {
        type: "enum('N','S')",
        nullable: false,
      },
      tipo_pagamento: {
        type: "set('Boleto','Cheque','Cartão','Dinheiro','Depósito','Débito','Transferencia','Pix')",
        nullable: true,
      },
      documento: {
        type: "varchar(100)",
        nullable: false,
      },
      valor_aberto: {
        type: "decimal(15,2)",
        nullable: true,
      },
      id_conta: {
        type: "int(11)",
        nullable: true,
      },
      previsao: {
        type: "varchar(1)",
        nullable: true,
      },
      sistema_origem: {
        type: "int(11)",
        nullable: true,
      },
      id_origem: {
        type: "int(11)",
        nullable: true,
      },
      filial_id: {
        type: "int(11)",
        nullable: false,
      },
      codigo_barras: {
        type: "varchar(100)",
        nullable: true,
      },
      duplicata: {
        type: "varchar(200)",
        nullable: true,
      },
      lote: {
        type: "varchar(200)",
        nullable: true,
      },
      id_contas: {
        type: "int(11)",
        nullable: true,
      },
      valor_cancelado: {
        type: "decimal(15,2)",
        nullable: true,
      },
      data_cancelamento: {
        type: "date",
        nullable: true,
      },
      id_mot_cancelamento: {
        type: "int(11)",
        nullable: true,
      },
      cancelamento_id_operador: {
        type: "int(11)",
        nullable: true,
      },
      valor_total_pago: {
        type: "decimal(15,2)",
        nullable: false,
      },
      data_pagamento: {
        type: "datetime",
        nullable: true,
      },
      debito_data: {
        type: "date",
        nullable: true,
      },
      id_remessa_pagamento: {
        type: "int(11)",
        nullable: true,
      },
      eh_despesa_veiculo: {
        type: "enum('S','N')",
        nullable: false,
      },
      status_auditoria: {
        type: "enum('A','R','V','C','N')",
        nullable: false,
      },
      id_lote_importacao: {
        type: "int(11)",
        nullable: true,
      },
      chave_pix: {
        type: "varchar(512)",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: false,
      },
      id_lote_pagamento: {
        type: "bigint(20) unsigned",
        nullable: true,
      },
      tipo_pix: {
        type: "enum('CPF_CNPJ','CELULAR','EMAIL','ALEATORIA','COPIA_E_COLA')",
        nullable: true,
      },
      numero_nota: {
        type: "varchar(100)",
        nullable: true,
      },
      id_dado_bancario: {
        type: "int(11)",
        nullable: true,
      },
      comunicado: {
        type: "enum('S','N')",
        nullable: true,
      },
      estornado: {
        type: "enum('S','N')",
        nullable: true,
      },
      id_funcionario: {
        type: "int(11) unsigned",
        nullable: true,
      },
      data_termino: {
        type: "date",
        nullable: false,
      },
      despesa_tipo: {
        type: "int(10) unsigned",
        nullable: true,
      },
      conta_pagamento: {
        type: "int(11)",
        nullable: true,
      },
      centro_custo_regra_criterio: {
        type: "enum('CE','CR')",
        nullable: true,
      },
      id_centro_custo_rel_centro_custo_categoria: {
        type: "int(10) unsigned",
        nullable: true,
      },
      id_centro_custo_criterio_rateio: {
        type: "int(10) unsigned",
        nullable: true,
      },
      id_centro_custo_categoria_filtro: {
        type: "int(10) unsigned",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "data_vencimento",
        nonUnique: "1",
        position: "1",
        columnName: "data_vencimento",
        type: "BTREE",
      },
      {
        name: "filial_id",
        nonUnique: "1",
        position: "1",
        columnName: "filial_id",
        type: "BTREE",
      },
      {
        name: "id_entrada",
        nonUnique: "1",
        position: "1",
        columnName: "id_entrada",
        type: "BTREE",
      },
      {
        name: "id_fornecedor",
        nonUnique: "1",
        position: "1",
        columnName: "id_fornecedor",
        type: "BTREE",
      },
      {
        name: "id_lote_importacao",
        nonUnique: "1",
        position: "1",
        columnName: "id_lote_importacao",
        type: "BTREE",
      },
      {
        name: "id_lote_pagamento",
        nonUnique: "1",
        position: "1",
        columnName: "id_lote_pagamento",
        type: "BTREE",
      },
      {
        name: "id_remessa_pagamento",
        nonUnique: "1",
        position: "1",
        columnName: "id_remessa_pagamento",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "fn_apagar_ibfk_1",
        columnName: "id_fornecedor",
        referencedTable: "fornecedor",
        referencedColumn: "id",
      },
      {
        name: "fn_apagar_ibfk_2",
        columnName: "filial_id",
        referencedTable: "filial",
        referencedColumn: "id",
      },
    ],
  },
  planejamento_analitico: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      planejamento_analitico: {
        type: "varchar(100)",
        nullable: false,
      },
      id_planejamento: {
        type: "int(11)",
        nullable: false,
      },
      conta: {
        type: "int(11)",
        nullable: false,
      },
      tipo: {
        type: "char(1)",
        nullable: true,
      },
      auxiliar: {
        type: "int(11)",
        nullable: true,
      },
      classificacao: {
        type: "varchar(50)",
        nullable: true,
      },
      conta_dominio: {
        type: "varchar(20)",
        nullable: true,
      },
      sequencia_planejamento_analitico: {
        type: "int(11)",
        nullable: true,
      },
      id_planejamento_analitico_finan: {
        type: "int(11)",
        nullable: true,
      },
      previsao: {
        type: "enum('M','S','N')",
        nullable: false,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: false,
      },
    },
    indexes: [
      {
        name: "conta",
        nonUnique: "1",
        position: "1",
        columnName: "conta",
        type: "BTREE",
      },
      {
        name: "id_planejamento",
        nonUnique: "1",
        position: "1",
        columnName: "id_planejamento",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "planejamento_analitico_ibfk_1",
        columnName: "id_planejamento",
        referencedTable: "planejamento",
        referencedColumn: "id",
      },
    ],
  },
  planejamento: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      planejamento: {
        type: "varchar(100)",
        nullable: false,
      },
      tipo: {
        type: "enum('A','P','R','D','C','PT')",
        nullable: false,
      },
      cod_planejamento: {
        type: "varchar(50)",
        nullable: false,
      },
      nivel_superior: {
        type: "int(11)",
        nullable: true,
      },
      contador: {
        type: "int(11)",
        nullable: true,
      },
      conta_dominio: {
        type: "varchar(20)",
        nullable: true,
      },
      subtipo: {
        type: "enum('DA','DV','DF','CV','CF')",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "cod_planejamento",
        nonUnique: "1",
        position: "1",
        columnName: "cod_planejamento",
        type: "BTREE",
      },
      {
        name: "nivel_superior",
        nonUnique: "1",
        position: "1",
        columnName: "nivel_superior",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  contas: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      conta: {
        type: "varchar(100)",
        nullable: false,
      },
      numero_conta: {
        type: "varchar(40)",
        nullable: false,
      },
      agencia: {
        type: "varchar(20)",
        nullable: false,
      },
      cod_banco: {
        type: "varchar(20)",
        nullable: false,
      },
      data_abertura: {
        type: "date",
        nullable: false,
      },
      saldo_abertura: {
        type: "decimal(15,2)",
        nullable: false,
      },
      tipo_conta: {
        type: "enum('C','B','D')",
        nullable: false,
      },
      id_planejamento: {
        type: "int(11)",
        nullable: false,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: false,
      },
      descricao: {
        type: "varchar(200)",
        nullable: true,
      },
      numero_conta_dv: {
        type: "varchar(3)",
        nullable: true,
      },
      agencia_dv: {
        type: "varchar(3)",
        nullable: true,
      },
      layout_conciliacao: {
        type: "varchar(200)",
        nullable: true,
      },
      filial_padrao: {
        type: "int(11)",
        nullable: true,
      },
      permitir_pag_saldo_negativo: {
        type: "enum('S','N')",
        nullable: false,
      },
      cnpj: {
        type: "varchar(30)",
        nullable: true,
      },
      razao_banco: {
        type: "varchar(100)",
        nullable: true,
      },
      numero_cooperativa: {
        type: "varchar(30)",
        nullable: true,
      },
      parametro_troca_eletronica: {
        type: "varchar(30)",
        nullable: true,
      },
      numero_convenio: {
        type: "varchar(20)",
        nullable: true,
      },
      operacao: {
        type: "varchar(20)",
        nullable: true,
      },
      suframa: {
        type: "varchar(250)",
        nullable: true,
      },
      cep: {
        type: "varchar(20)",
        nullable: true,
      },
      logradouro: {
        type: "varchar(250)",
        nullable: true,
      },
      numero_residencia: {
        type: "varchar(20)",
        nullable: true,
      },
      complemento: {
        type: "varchar(200)",
        nullable: true,
      },
      bairro: {
        type: "varchar(100)",
        nullable: true,
      },
      cidade: {
        type: "int(11) unsigned",
        nullable: true,
      },
      numero_convenio_fornecedor: {
        type: "varchar(20)",
        nullable: true,
      },
      intermediary_name: {
        type: "varchar(100)",
        nullable: true,
      },
      intermediary_cnpj: {
        type: "varchar(30)",
        nullable: true,
      },
      intermediary_city_id: {
        type: "int(11) unsigned",
        nullable: true,
      },
      intermediary_street: {
        type: "varchar(60)",
        nullable: true,
      },
      intermediary_number: {
        type: "varchar(10)",
        nullable: true,
      },
      intermediary_complement: {
        type: "varchar(60)",
        nullable: true,
      },
      intermediary_neighborhood: {
        type: "varchar(60)",
        nullable: true,
      },
      integration_name: {
        type: "varchar(100)",
        nullable: true,
      },
      integration_client_id: {
        type: "varchar(300)",
        nullable: true,
      },
      integration_client_secret: {
        type: "varchar(300)",
        nullable: true,
      },
      integration_environment: {
        type: "enum('H','P')",
        nullable: false,
      },
      integration_secret_key: {
        type: "varchar(300)",
        nullable: true,
      },
      id_centro_custo_rel_centro_custo_categoria_padrao: {
        type: "int(10) unsigned",
        nullable: true,
      },
      anexar_comprovante_cpa_auto: {
        type: "enum('S','N')",
        nullable: false,
      },
      modalidade_conta: {
        type: "enum('CONTA_CORRENTE','CONTA_PAGAMENTO')",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "id_planejamento",
        nonUnique: "1",
        position: "1",
        columnName: "id_planejamento",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "contas_ibfk_1",
        columnName: "id_planejamento",
        referencedTable: "planejamento_analitico",
        referencedColumn: "id",
      },
    ],
  },
  filial: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      razao: {
        type: "varchar(100)",
        nullable: true,
      },
      id_empresa: {
        type: "int(11)",
        nullable: true,
      },
      fantasia: {
        type: "varchar(100)",
        nullable: true,
      },
      cidade: {
        type: "int(11)",
        nullable: true,
      },
      endereco: {
        type: "varchar(200)",
        nullable: true,
      },
      numero: {
        type: "varchar(20)",
        nullable: true,
      },
      cep: {
        type: "varchar(20)",
        nullable: true,
      },
      ie: {
        type: "varchar(20)",
        nullable: true,
      },
      cnpj: {
        type: "varchar(30)",
        nullable: true,
      },
      telefone: {
        type: "varchar(20)",
        nullable: true,
      },
      telefone1: {
        type: "varchar(20)",
        nullable: true,
      },
      fax: {
        type: "varchar(20)",
        nullable: true,
      },
      regime_tributario: {
        type: "int(11)",
        nullable: true,
      },
      ato_anatel: {
        type: "varchar(100)",
        nullable: true,
      },
      im: {
        type: "varchar(15)",
        nullable: true,
      },
      cnae: {
        type: "varchar(7)",
        nullable: true,
      },
      rt: {
        type: "enum('1','2','3','0-13','0-15','0-23','0-47','R-99-PN')",
        nullable: true,
      },
      complemento: {
        type: "varchar(60)",
        nullable: true,
      },
      bairro: {
        type: "varchar(60)",
        nullable: false,
      },
      iest: {
        type: "varchar(14)",
        nullable: true,
      },
      logo: {
        type: "varchar(200)",
        nullable: true,
      },
      nfe_ambiente: {
        type: "enum('1','2')",
        nullable: true,
      },
      nfe_formato_imp: {
        type: "enum('P','L')",
        nullable: true,
      },
      nfe_canhoto: {
        type: "enum('S','N')",
        nullable: true,
      },
      nfe_certificado: {
        type: "varchar(500)",
        nullable: true,
      },
      nfe_chave: {
        type: "varchar(50)",
        nullable: true,
      },
      nfe_email: {
        type: "varchar(255)",
        nullable: true,
      },
      nfe_email_senha: {
        type: "varchar(100)",
        nullable: true,
      },
      email: {
        type: "varchar(250)",
        nullable: true,
      },
      site: {
        type: "varchar(250)",
        nullable: true,
      },
      nfe_inf_complementar: {
        type: "longtext",
        nullable: true,
      },
      contato: {
        type: "varchar(100)",
        nullable: true,
      },
      background_cor: {
        type: "varchar(20)",
        nullable: true,
      },
      background_logo: {
        type: "varchar(250)",
        nullable: true,
      },
      im_numero_creci: {
        type: "varchar(30)",
        nullable: true,
      },
      tipo_pessoa: {
        type: "enum('J','F','1','2')",
        nullable: true,
      },
      sici_numero_fistel: {
        type: "varchar(20)",
        nullable: true,
      },
      desc_auxiliar_fone_os: {
        type: "varchar(150)",
        nullable: true,
      },
      ramal: {
        type: "varchar(10)",
        nullable: true,
      },
      rt_especial: {
        type: "char(2)",
        nullable: true,
      },
      insentivo_cultural: {
        type: "enum('0','1')",
        nullable: true,
      },
      opcao_simples: {
        type: "enum('0','1')",
        nullable: true,
      },
      nfse_padrao: {
        type: "varchar(20)",
        nullable: true,
      },
      nfse_senha_acesso: {
        type: "varchar(100)",
        nullable: true,
      },
      nfse_url_servico: {
        type: "varchar(250)",
        nullable: true,
      },
      nfce_imprime_produtos: {
        type: "enum('S','N')",
        nullable: true,
      },
      nfce_id_token: {
        type: "varchar(6)",
        nullable: true,
      },
      nfce_csc: {
        type: "varchar(100)",
        nullable: true,
      },
      nfe_id_email_envio_cliente: {
        type: "int(11)",
        nullable: true,
      },
      nfe_envia_pdf_email: {
        type: "enum('S','N')",
        nullable: false,
      },
      nfe_envia_xml_email: {
        type: "enum('S','N')",
        nullable: false,
      },
      logo_docs: {
        type: "varchar(500)",
        nullable: true,
      },
      enviar_email_suporte: {
        type: "enum('S','N')",
        nullable: true,
      },
      email_suporte: {
        type: "varchar(255)",
        nullable: true,
      },
      img_assinatura: {
        type: "varchar(255)",
        nullable: true,
      },
      id_rps_modelo_impressao: {
        type: "int(11)",
        nullable: true,
      },
      id_filial_doc_opcional: {
        type: "int(11)",
        nullable: true,
      },
      contador_nome: {
        type: "varchar(100)",
        nullable: true,
      },
      contador_cnpj: {
        type: "varchar(30)",
        nullable: true,
      },
      contador_cpf: {
        type: "varchar(15)",
        nullable: true,
      },
      contador_crc: {
        type: "varchar(15)",
        nullable: true,
      },
      contador_uf: {
        type: "varchar(2)",
        nullable: true,
      },
      contador_cep: {
        type: "varchar(20)",
        nullable: true,
      },
      contador_endereco: {
        type: "varchar(200)",
        nullable: true,
      },
      contador_numero: {
        type: "varchar(20)",
        nullable: true,
      },
      contador_complemento: {
        type: "varchar(60)",
        nullable: true,
      },
      contador_bairro: {
        type: "varchar(60)",
        nullable: true,
      },
      contador_telefone: {
        type: "varchar(20)",
        nullable: true,
      },
      contador_fax: {
        type: "varchar(20)",
        nullable: true,
      },
      contador_email: {
        type: "varchar(250)",
        nullable: true,
      },
      nfse_cod_cidade: {
        type: "varchar(10)",
        nullable: true,
      },
      latitude: {
        type: "varchar(50)",
        nullable: true,
      },
      longitude: {
        type: "varchar(50)",
        nullable: true,
      },
      facebook: {
        type: "varchar(300)",
        nullable: true,
      },
      iss_exigibilidade: {
        type: "int(1)",
        nullable: true,
      },
      cnae_complementar: {
        type: "varchar(2)",
        nullable: true,
      },
      id_filial_isss_exig: {
        type: "int(11)",
        nullable: true,
      },
      nfe_id_envio_email_fornecedor: {
        type: "int(11)",
        nullable: true,
      },
      usuario_nfse: {
        type: "varchar(100)",
        nullable: false,
      },
      contador_cidade: {
        type: "int(11)",
        nullable: true,
      },
      insentivo_fiscal: {
        type: "int(11)",
        nullable: false,
      },
      email_envio_contrato_assinado_filial: {
        type: "varchar(100)",
        nullable: true,
      },
      envia_email_assinatura_digital_contrato: {
        type: "enum('S','N','P')",
        nullable: true,
      },
      smtp_envio_email_assinatura_contrato_digital: {
        type: "int(11)",
        nullable: true,
      },
      certificado_valido: {
        type: "enum('S','N')",
        nullable: true,
      },
      cor_mapa: {
        type: "varchar(45)",
        nullable: true,
      },
      envia_anexo_pdf: {
        type: "enum('S','N')",
        nullable: true,
      },
      id_envio_email_personalizado: {
        type: "int(11)",
        nullable: true,
      },
      numero_eot: {
        type: "varchar(60)",
        nullable: true,
      },
      id_integracao_serasa: {
        type: "int(11)",
        nullable: false,
      },
      tv_id_regiao: {
        type: "int(11)",
        nullable: true,
      },
      id_filial_doc_opc2: {
        type: "int(11)",
        nullable: true,
      },
      id_filial_doc_opc3: {
        type: "int(11)",
        nullable: true,
      },
      id_filial_doc_opc4: {
        type: "int(11)",
        nullable: true,
      },
      identificador_na_febraban: {
        type: "int(4)",
        nullable: true,
      },
      whatsapp: {
        type: "varchar(20)",
        nullable: true,
      },
      inserir_inf_adic_contrato_descricao_servico: {
        type: "enum('S','N')",
        nullable: false,
      },
      nfse_client_id: {
        type: "varchar(255)",
        nullable: true,
      },
      nfse_client_secret: {
        type: "varchar(255)",
        nullable: true,
      },
      id_cnae: {
        type: "int(11)",
        nullable: true,
      },
      nfse_aedf: {
        type: "varchar(10)",
        nullable: true,
      },
      nfse_cfps: {
        type: "int(11)",
        nullable: true,
      },
      token_rdstation: {
        type: "varchar(50)",
        nullable: true,
      },
      id_canal_venda_marketing: {
        type: "int(10) unsigned",
        nullable: true,
      },
      token: {
        type: "varchar(512)",
        nullable: true,
      },
      permite_conversoes_duplicadas: {
        type: "enum('S','N')",
        nullable: false,
      },
      integracao_assinatura_digital: {
        type: "int(10) unsigned",
        nullable: true,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: false,
      },
      importar_dfe_automaticamente: {
        type: "enum('S','N')",
        nullable: true,
      },
      nfe_ambiente_62: {
        type: "enum('1','2')",
        nullable: true,
      },
      regime_fiscal_col: {
        type: "enum('48','49')",
        nullable: true,
      },
      tipo_documento_identificacao_col: {
        type: "enum('11','12','13','21','22','31','41','42','47','50','91','CI','RUC','NUIT')",
        nullable: false,
      },
      ciiu_col: {
        type: "enum('6110','6120','6130','6190')",
        nullable: true,
      },
      curl_type: {
        type: "varchar(10)",
        nullable: false,
      },
      contador: {
        type: "enum('S','N')",
        nullable: false,
      },
      rotina_nfse: {
        type: "int(1) unsigned",
        nullable: true,
      },
      centro_custo_status: {
        type: "enum('A','I')",
        nullable: false,
      },
      gerar_login: {
        type: "enum('S','N')",
        nullable: true,
      },
      padrao_gerar_login: {
        type: "varchar(256)",
        nullable: true,
      },
      tributacao_por_ramo_de_atividade: {
        type: "enum('S','N')",
        nullable: true,
      },
      forma_tributacao: {
        type: "int(3) unsigned",
        nullable: true,
      },
      cod_classificacao_tribut_cbs_ibs: {
        type: "varchar(10)",
        nullable: false,
      },
      cod_situacao_tribut_cbs_ibs: {
        type: "varchar(110)",
        nullable: true,
      },
      base_calculo_cbs_ibs: {
        type: "int(2)",
        nullable: true,
      },
      tipo_documento_nota_saida: {
        type: "int(11) unsigned",
        nullable: true,
      },
      tipo_documento_nota_entrada: {
        type: "int(11)",
        nullable: true,
      },
      reducao_aliquota: {
        type: "decimal(7,4) unsigned",
        nullable: true,
      },
      centro_custo_data_ativacao: {
        type: "datetime",
        nullable: true,
      },
      atividade_economica: {
        type: "text",
        nullable: true,
      },
      amb_nacional: {
        type: "enum('S','N')",
        nullable: true,
      },
      mostrar_info_adicionais_anatel: {
        type: "enum('S','N')",
        nullable: false,
      },
      regime_apuracao_tributaria_sn: {
        type: "char(2)",
        nullable: true,
      },
      almox_padrao: {
        type: "int(11)",
        nullable: true,
      },
      op_uso_consumo_pessoal: {
        type: "enum('S','N')",
        nullable: true,
      },
      enviar_im: {
        type: "enum('S','N')",
        nullable: true,
      },
      total_tributos_simples: {
        type: "decimal(6,4) unsigned",
        nullable: true,
      },
      enviar_aliquota_iss: {
        type: "enum('S','N')",
        nullable: false,
      },
      obs_integracao: {
        type: "varchar(100)",
        nullable: true,
      },
      tipo_totalizacao_tributos: {
        type: "enum('P','V')",
        nullable: false,
      },
      enviar_cbs_ibs: {
        type: "enum('S','N')",
        nullable: false,
      },
      envia_numero_beneficio_municipal: {
        type: "enum('S','N')",
        nullable: false,
      },
    },
    indexes: [
      {
        name: "cidade",
        nonUnique: "1",
        position: "1",
        columnName: "cidade",
        type: "BTREE",
      },
      {
        name: "id_empresa",
        nonUnique: "1",
        position: "1",
        columnName: "id_empresa",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "filial_ibfk_1",
        columnName: "id_empresa",
        referencedTable: "empresa",
        referencedColumn: "id",
      },
      {
        name: "filial_ibfk_2",
        columnName: "cidade",
        referencedTable: "cidade",
        referencedColumn: "id",
      },
    ],
  },
  fn_extrato: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      data: {
        type: "date",
        nullable: false,
      },
      documento: {
        type: "varchar(100)",
        nullable: true,
      },
      historico: {
        type: "varchar(200)",
        nullable: false,
      },
      id_conta: {
        type: "int(11)",
        nullable: false,
      },
      info1: {
        type: "varchar(200)",
        nullable: true,
      },
      info2: {
        type: "varchar(200)",
        nullable: true,
      },
      debito: {
        type: "decimal(15,2)",
        nullable: true,
      },
      credito: {
        type: "decimal(15,2)",
        nullable: true,
      },
      conciliado: {
        type: "enum('S','N')",
        nullable: true,
      },
      ids_financeiro: {
        type: "mediumtext",
        nullable: true,
      },
      conciliado_financeiro: {
        type: "text",
        nullable: true,
      },
      id_extrato: {
        type: "varchar(100)",
        nullable: true,
      },
      conciliado_extrato: {
        type: "mediumtext",
        nullable: true,
      },
      id_conciliacao_lote: {
        type: "int(11)",
        nullable: true,
      },
      pix_txid: {
        type: "varchar(50)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "id_conciliacao_lote",
        nonUnique: "1",
        position: "1",
        columnName: "id_conciliacao_lote",
        type: "BTREE",
      },
      {
        name: "id_extrato",
        nonUnique: "1",
        position: "1",
        columnName: "id_extrato",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  fn_transferencia_caixa: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(10) unsigned",
        nullable: false,
      },
      id_conta_origem: {
        type: "int(11)",
        nullable: true,
      },
      id_conta_destino: {
        type: "int(11)",
        nullable: true,
      },
      id_operador: {
        type: "int(11)",
        nullable: true,
      },
      valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      data_transferencia: {
        type: "datetime",
        nullable: true,
      },
      create_time: {
        type: "timestamp",
        nullable: false,
      },
      update_time: {
        type: "timestamp",
        nullable: false,
      },
      historico: {
        type: "varchar(200)",
        nullable: true,
      },
      tipo_recebimento: {
        type: "enum('D','B','H','T','C','CD','DP','P')",
        nullable: false,
      },
      conta_origem: {
        type: "varchar(200)",
        nullable: true,
      },
      conta_destino: {
        type: "varchar(200)",
        nullable: true,
      },
      contas_id_origem: {
        type: "int(11)",
        nullable: false,
      },
      contas_id_destino: {
        type: "int(11)",
        nullable: false,
      },
    },
    indexes: [
      {
        name: "id_operador",
        nonUnique: "1",
        position: "1",
        columnName: "id_operador",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  centro_custo_rateio: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(10) unsigned",
        nullable: false,
      },
      id_centro_custo_rel_centro_custo_categoria: {
        type: "int(10) unsigned",
        nullable: true,
      },
      id_fn_apagar: {
        type: "int(11)",
        nullable: true,
      },
      id_movimento_produtos: {
        type: "int(11)",
        nullable: true,
      },
      id_planejamento_analitico: {
        type: "int(11)",
        nullable: false,
      },
      quantidade: {
        type: "decimal(15,9)",
        nullable: false,
      },
      porcentagem: {
        type: "decimal(8,5)",
        nullable: false,
      },
      valor: {
        type: "decimal(12,5)",
        nullable: false,
      },
      data_contabilizacao: {
        type: "date",
        nullable: true,
      },
      id_centro_custo_projeto: {
        type: "int(10) unsigned",
        nullable: true,
      },
      id_fn_movim_finan: {
        type: "int(10) unsigned",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  fornecedor: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      razao: {
        type: "varchar(100)",
        nullable: false,
      },
      fantasia: {
        type: "varchar(100)",
        nullable: false,
      },
      telefone: {
        type: "varchar(20)",
        nullable: true,
      },
      email: {
        type: "varchar(100)",
        nullable: false,
      },
      representante: {
        type: "varchar(100)",
        nullable: false,
      },
      telefone_representante: {
        type: "varchar(20)",
        nullable: false,
      },
      cidade: {
        type: "int(11)",
        nullable: false,
      },
      id_conta: {
        type: "int(11)",
        nullable: false,
      },
      data: {
        type: "date",
        nullable: true,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: true,
      },
      tipo_pessoa: {
        type: "enum('F','J','E')",
        nullable: true,
      },
      cpf_cnpj: {
        type: "varchar(30)",
        nullable: true,
      },
      ie_identidade: {
        type: "varchar(30)",
        nullable: true,
      },
      endereco: {
        type: "varchar(100)",
        nullable: true,
      },
      numero: {
        type: "varchar(20)",
        nullable: true,
      },
      referencia: {
        type: "varchar(100)",
        nullable: true,
      },
      bairro: {
        type: "varchar(100)",
        nullable: true,
      },
      cep: {
        type: "varchar(100)",
        nullable: true,
      },
      nomecidade: {
        type: "varchar(100)",
        nullable: true,
      },
      celular: {
        type: "varchar(20)",
        nullable: true,
      },
      site: {
        type: "varchar(200)",
        nullable: true,
      },
      siglauf: {
        type: "varchar(10)",
        nullable: true,
      },
      paiz: {
        type: "int(11)",
        nullable: true,
      },
      rg_orgao_emissor: {
        type: "varchar(20)",
        nullable: true,
      },
      tipo: {
        type: "int(11)",
        nullable: true,
      },
      tipo_plano_id: {
        type: "int(11)",
        nullable: true,
      },
      id_operadora_celular: {
        type: "int(11)",
        nullable: false,
      },
      obs: {
        type: "varchar(2048)",
        nullable: true,
      },
      duplicata: {
        type: "varchar(200)",
        nullable: true,
      },
      lote: {
        type: "varchar(200)",
        nullable: true,
      },
      id_cliente_conversao: {
        type: "int(11)",
        nullable: false,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: true,
      },
      contribuinte_icms: {
        type: "enum('S','N','I')",
        nullable: true,
      },
      pix_cpf_cnpj: {
        type: "varchar(30)",
        nullable: true,
      },
      pix_celular: {
        type: "varchar(20)",
        nullable: true,
      },
      data_nascimento: {
        type: "date",
        nullable: true,
      },
      regime_fiscal_col: {
        type: "enum('48','49')",
        nullable: true,
      },
      tipo_documento_identificacao_col: {
        type: "enum('11','12','13','21','22','31','41','42','47','50','91','CI','RUC','NUIT')",
        nullable: false,
      },
      despesa_tipo: {
        type: "int(10) unsigned",
        nullable: true,
      },
      iss_classificacao_padrao: {
        type: "varchar(2)",
        nullable: false,
      },
      pis_retem: {
        type: "enum('S','N')",
        nullable: false,
      },
      cofins_retem: {
        type: "enum('S','N')",
        nullable: false,
      },
      csll_retem: {
        type: "enum('S','N')",
        nullable: false,
      },
      irrf_retem: {
        type: "enum('S','N')",
        nullable: false,
      },
      desconto_irrf_valor_inferior: {
        type: "enum('S','N')",
        nullable: false,
      },
      inss_retem: {
        type: "enum('S','N')",
        nullable: false,
      },
      cli_desconta_iss_retido_total: {
        type: "enum('S','N')",
        nullable: false,
      },
      regime_tributario: {
        type: "enum('RN','SNC','SNM','SNRR')",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "cidade",
        nonUnique: "1",
        position: "1",
        columnName: "cidade",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "fornecedor_ibfk_1",
        columnName: "cidade",
        referencedTable: "cidade",
        referencedColumn: "id",
      },
    ],
  },
  cliente: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      razao: {
        type: "varchar(200)",
        nullable: false,
      },
      fantasia: {
        type: "varchar(200)",
        nullable: true,
      },
      endereco: {
        type: "varchar(200)",
        nullable: true,
      },
      numero: {
        type: "varchar(20)",
        nullable: true,
      },
      bairro: {
        type: "varchar(100)",
        nullable: true,
      },
      cidade: {
        type: "int(11)",
        nullable: true,
      },
      uf: {
        type: "int(11)",
        nullable: true,
      },
      cnpj_cpf: {
        type: "varchar(30)",
        nullable: true,
      },
      ie_identidade: {
        type: "varchar(30)",
        nullable: true,
      },
      cond_pagamento: {
        type: "int(11)",
        nullable: false,
      },
      fone: {
        type: "varchar(20)",
        nullable: true,
      },
      cep: {
        type: "varchar(20)",
        nullable: true,
      },
      email: {
        type: "varchar(256)",
        nullable: true,
      },
      tipo_pessoa: {
        type: "enum('J','F','E','1','2','3')",
        nullable: true,
      },
      id_tipo_cliente: {
        type: "int(11)",
        nullable: true,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_conta: {
        type: "int(11)",
        nullable: false,
      },
      status_internet: {
        type: "enum('N','A','D','CM','CA','CE','FA')",
        nullable: true,
      },
      bloqueio_automatico: {
        type: "enum('S','N')",
        nullable: true,
      },
      aviso_atraso: {
        type: "enum('S','N')",
        nullable: true,
      },
      obs: {
        type: "text",
        nullable: true,
      },
      dia_vencimento: {
        type: "int(11)",
        nullable: true,
      },
      data: {
        type: "date",
        nullable: true,
      },
      id_myauth: {
        type: "int(11)",
        nullable: true,
      },
      telefone_comercial: {
        type: "varchar(20)",
        nullable: true,
      },
      telefone_celular: {
        type: "varchar(20)",
        nullable: true,
      },
      referencia: {
        type: "varchar(200)",
        nullable: true,
      },
      complemento: {
        type: "varchar(100)",
        nullable: true,
      },
      ramal: {
        type: "varchar(20)",
        nullable: true,
      },
      senha: {
        type: "varchar(100)",
        nullable: true,
      },
      nao_bloquear_ate: {
        type: "date",
        nullable: true,
      },
      nao_avisar_ate: {
        type: "date",
        nullable: true,
      },
      id_vendedor: {
        type: "int(11)",
        nullable: true,
      },
      isuf: {
        type: "varchar(9)",
        nullable: true,
      },
      tipo_assinante: {
        type: "enum('1','2','3','4','5','6')",
        nullable: true,
      },
      data_nascimento: {
        type: "date",
        nullable: true,
      },
      contato: {
        type: "varchar(100)",
        nullable: true,
      },
      hotsite_email: {
        type: "varchar(150)",
        nullable: true,
      },
      hotsite_acesso: {
        type: "int(11)",
        nullable: true,
      },
      estado_civil: {
        type: "enum('Casado','Solteiro','Divorciado','Viúvo')",
        nullable: true,
      },
      filial_id: {
        type: "int(11)",
        nullable: false,
      },
      latitude: {
        type: "varchar(50)",
        nullable: true,
      },
      longitude: {
        type: "varchar(50)",
        nullable: true,
      },
      crm: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_candato_tipo: {
        type: "int(11)",
        nullable: true,
      },
      tabela_preco: {
        type: "int(11)",
        nullable: true,
      },
      rg_orgao_emissor: {
        type: "char(20)",
        nullable: true,
      },
      nacionalidade: {
        type: "varchar(30)",
        nullable: true,
      },
      deb_automatico: {
        type: "varchar(25)",
        nullable: true,
      },
      deb_agencia: {
        type: "varchar(10)",
        nullable: true,
      },
      deb_conta: {
        type: "varchar(20)",
        nullable: true,
      },
      alerta: {
        type: "text",
        nullable: true,
      },
      data_cadastro: {
        type: "date",
        nullable: true,
      },
      endereco_cob: {
        type: "varchar(200)",
        nullable: true,
      },
      numero_cob: {
        type: "varchar(20)",
        nullable: true,
      },
      bairro_cob: {
        type: "varchar(100)",
        nullable: true,
      },
      cidade_cob: {
        type: "int(11)",
        nullable: true,
      },
      uf_cob: {
        type: "int(11)",
        nullable: true,
      },
      cep_cob: {
        type: "varchar(20)",
        nullable: true,
      },
      referencia_cob: {
        type: "varchar(200)",
        nullable: true,
      },
      complemento_cob: {
        type: "varchar(100)",
        nullable: true,
      },
      participa_cobranca: {
        type: "enum('S','N','P')",
        nullable: false,
      },
      num_dias_cob: {
        type: "int(11)",
        nullable: true,
      },
      profissao: {
        type: "varchar(50)",
        nullable: true,
      },
      url_site: {
        type: "text",
        nullable: true,
      },
      url_sistema: {
        type: "text",
        nullable: true,
      },
      ip_sistema: {
        type: "varchar(100)",
        nullable: true,
      },
      porta_ssh_sistema: {
        type: "int(11)",
        nullable: true,
      },
      senha_root_sistema: {
        type: "varchar(100)",
        nullable: true,
      },
      remessa_debito: {
        type: "int(11)",
        nullable: true,
      },
      id_operadora_celular: {
        type: "int(11)",
        nullable: true,
      },
      participa_pre_cobranca: {
        type: "enum('S','N')",
        nullable: false,
      },
      cob_envia_email: {
        type: "enum('S','N')",
        nullable: false,
      },
      cob_envia_sms: {
        type: "enum('S','N')",
        nullable: false,
      },
      contribuinte_icms: {
        type: "enum('S','N','I')",
        nullable: false,
      },
      id_condominio: {
        type: "int(11)",
        nullable: true,
      },
      nome_pai: {
        type: "varchar(150)",
        nullable: true,
      },
      nome_mae: {
        type: "varchar(150)",
        nullable: true,
      },
      quantidade_dependentes: {
        type: "int(11)",
        nullable: true,
      },
      nome_conjuge: {
        type: "varchar(150)",
        nullable: true,
      },
      fone_conjuge: {
        type: "varchar(20)",
        nullable: true,
      },
      cpf_conjuge: {
        type: "varchar(15)",
        nullable: true,
      },
      rg_conjuge: {
        type: "varchar(20)",
        nullable: true,
      },
      data_nascimento_conjuge: {
        type: "date",
        nullable: true,
      },
      moradia: {
        type: "enum('P','A')",
        nullable: true,
      },
      nome_contador: {
        type: "varchar(150)",
        nullable: true,
      },
      telefone_contador: {
        type: "varchar(20)",
        nullable: true,
      },
      ref_com_empresa1: {
        type: "varchar(150)",
        nullable: true,
      },
      ref_com_empresa2: {
        type: "varchar(150)",
        nullable: true,
      },
      ref_com_fone1: {
        type: "varchar(20)",
        nullable: true,
      },
      ref_com_fone2: {
        type: "varchar(20)",
        nullable: true,
      },
      ref_pes_nome1: {
        type: "varchar(100)",
        nullable: true,
      },
      ref_pes_nome2: {
        type: "varchar(100)",
        nullable: true,
      },
      ref_pes_fone1: {
        type: "varchar(20)",
        nullable: true,
      },
      ref_pes_fone2: {
        type: "varchar(20)",
        nullable: true,
      },
      emp_empresa: {
        type: "varchar(150)",
        nullable: true,
      },
      emp_cnpj: {
        type: "varchar(20)",
        nullable: true,
      },
      emp_cep: {
        type: "varchar(15)",
        nullable: true,
      },
      emp_endereco: {
        type: "varchar(100)",
        nullable: true,
      },
      emp_cidade: {
        type: "int(11)",
        nullable: true,
      },
      emp_fone: {
        type: "varchar(20)",
        nullable: true,
      },
      emp_contato: {
        type: "varchar(100)",
        nullable: true,
      },
      emp_cargo: {
        type: "varchar(100)",
        nullable: true,
      },
      emp_remuneracao: {
        type: "decimal(15,2)",
        nullable: true,
      },
      emp_data_admissao: {
        type: "date",
        nullable: true,
      },
      website: {
        type: "varchar(200)",
        nullable: true,
      },
      skype: {
        type: "varchar(100)",
        nullable: true,
      },
      status_prospeccao: {
        type: "enum('C','S','A','N','V','P','AB','SV','SP','AC')",
        nullable: true,
      },
      prospeccao_ultimo_contato: {
        type: "date",
        nullable: true,
      },
      prospeccao_proximo_contato: {
        type: "date",
        nullable: true,
      },
      orgao_publico: {
        type: "enum('S','N')",
        nullable: false,
      },
      pipe_id_organizacao: {
        type: "int(11)",
        nullable: true,
      },
      im: {
        type: "varchar(20)",
        nullable: true,
      },
      responsavel: {
        type: "int(11)",
        nullable: true,
      },
      bloco: {
        type: "varchar(100)",
        nullable: true,
      },
      apartamento: {
        type: "varchar(11)",
        nullable: true,
      },
      cif: {
        type: "varchar(12)",
        nullable: true,
      },
      grau_satisfacao: {
        type: "enum('1','2','3','4','5')",
        nullable: true,
      },
      idx: {
        type: "int(11)",
        nullable: true,
      },
      iss_classificacao: {
        type: "varchar(2)",
        nullable: false,
      },
      iss_classificacao_padrao: {
        type: "varchar(2)",
        nullable: false,
      },
      tipo_cliente_scm: {
        type: "enum('01','02','03','04','05','06','07','08','99','0-13','0-15','0-23','0-47','R-99-PN')",
        nullable: true,
      },
      pis_retem: {
        type: "enum('S','N')",
        nullable: false,
      },
      cofins_retem: {
        type: "enum('S','N')",
        nullable: false,
      },
      csll_retem: {
        type: "enum('S','N')",
        nullable: false,
      },
      irrf_retem: {
        type: "enum('S','N')",
        nullable: false,
      },
      cpf_pai: {
        type: "varchar(30)",
        nullable: true,
      },
      cpf_mae: {
        type: "varchar(30)",
        nullable: true,
      },
      identidade_pai: {
        type: "varchar(30)",
        nullable: true,
      },
      identidade_mae: {
        type: "varchar(30)",
        nullable: true,
      },
      nascimento_pai: {
        type: "date",
        nullable: true,
      },
      nascimento_mae: {
        type: "date",
        nullable: true,
      },
      id_canal_venda: {
        type: "int(11)",
        nullable: true,
      },
      whatsapp: {
        type: "varchar(20)",
        nullable: true,
      },
      inscricao_municipal: {
        type: "varchar(30)",
        nullable: true,
      },
      nome_representante_1: {
        type: "varchar(200)",
        nullable: true,
      },
      nome_representante_2: {
        type: "varchar(200)",
        nullable: true,
      },
      cpf_representante_1: {
        type: "varchar(30)",
        nullable: true,
      },
      cpf_representante_2: {
        type: "varchar(30)",
        nullable: true,
      },
      identidade_representante_1: {
        type: "varchar(30)",
        nullable: true,
      },
      identidade_representante_2: {
        type: "varchar(30)",
        nullable: true,
      },
      id_contato_principal: {
        type: "int(11)",
        nullable: true,
      },
      id_concorrente: {
        type: "int(11)",
        nullable: true,
      },
      id_perfil: {
        type: "int(11)",
        nullable: true,
      },
      codigo_operacao: {
        type: "int(10)",
        nullable: true,
      },
      convert_cliente_forn: {
        type: "enum('S','N')",
        nullable: true,
      },
      tipo_pessoa_titular_conta: {
        type: "enum('F','J')",
        nullable: true,
      },
      cnpj_cpf_titular_conta: {
        type: "varchar(30)",
        nullable: true,
      },
      crm_data_vencemos: {
        type: "date",
        nullable: true,
      },
      crm_data_perdemos: {
        type: "date",
        nullable: true,
      },
      crm_data_novo: {
        type: "date",
        nullable: true,
      },
      crm_data_sondagem: {
        type: "date",
        nullable: true,
      },
      crm_data_apresentando: {
        type: "date",
        nullable: true,
      },
      crm_data_negociando: {
        type: "date",
        nullable: true,
      },
      crm_data_abortamos: {
        type: "date",
        nullable: true,
      },
      crm_data_sem_porta_disponivel: {
        type: "date",
        nullable: true,
      },
      crm_data_sem_viabilidade: {
        type: "date",
        nullable: true,
      },
      cadastrado_no_galaxPay: {
        type: "enum('S','N')",
        nullable: false,
      },
      atualizar_cadastro_galaxPay: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_galaxPay: {
        type: "int(11)",
        nullable: false,
      },
      acesso_automatico_central: {
        type: "varchar(1)",
        nullable: false,
      },
      primeiro_acesso_central: {
        type: "varchar(1)",
        nullable: false,
      },
      ativo_serasa: {
        type: "int(11)",
        nullable: true,
      },
      id_vd_contrato_desejado: {
        type: "int(11)",
        nullable: true,
      },
      foto_cartao: {
        type: "blob",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: false,
      },
      permite_armazenar_cartoes: {
        type: "enum('S','N')",
        nullable: false,
      },
      yapay_token_account: {
        type: "varchar(100)",
        nullable: true,
      },
      cli_desconta_iss_retido_total: {
        type: "enum('S','N')",
        nullable: false,
      },
      tv_code: {
        type: "text",
        nullable: true,
      },
      tv_access_token: {
        type: "text",
        nullable: true,
      },
      tv_token_expires_in: {
        type: "datetime",
        nullable: true,
      },
      tv_refresh_token: {
        type: "text",
        nullable: true,
      },
      cidade_naturalidade: {
        type: "int(11)",
        nullable: true,
      },
      cadastrado_via_viabilidade: {
        type: "enum('S','N')",
        nullable: true,
      },
      substatus_prospeccao: {
        type: "int(11)",
        nullable: true,
      },
      tipo_localidade: {
        type: "enum('R','U')",
        nullable: false,
      },
      qtd_pessoas_calc_vel: {
        type: "int(11)",
        nullable: true,
      },
      qtd_smart_calc_vel: {
        type: "int(11)",
        nullable: true,
      },
      qtd_celular_calc_vel: {
        type: "int(11)",
        nullable: true,
      },
      qtd_computador_calc_vel: {
        type: "int(11)",
        nullable: true,
      },
      qtd_console_calc_vel: {
        type: "int(11)",
        nullable: true,
      },
      freq_pessoas_calc_vel: {
        type: "varchar(7)",
        nullable: true,
      },
      freq_smart_calc_vel: {
        type: "varchar(7)",
        nullable: true,
      },
      freq_celular_calc_vel: {
        type: "varchar(7)",
        nullable: true,
      },
      freq_computador_calc_vel: {
        type: "varchar(7)",
        nullable: true,
      },
      freq_console_calc_vel: {
        type: "varchar(7)",
        nullable: true,
      },
      resultado_calc_vel: {
        type: "varchar(20)",
        nullable: true,
      },
      tipo_cobranca_auto_viab: {
        type: "int(11)",
        nullable: true,
      },
      plano_negociacao_auto_viab: {
        type: "int(11)",
        nullable: true,
      },
      data_reserva_auto_viab: {
        type: "date",
        nullable: true,
      },
      melhor_periodo_reserva_auto_viab: {
        type: "enum('M','N','T')",
        nullable: true,
      },
      facebook: {
        type: "varchar(250)",
        nullable: true,
      },
      alterar_senha_primeiro_acesso: {
        type: "enum('S','N','P')",
        nullable: true,
      },
      hash_redefinir_senha: {
        type: "varchar(32)",
        nullable: true,
      },
      data_hash_redefinir_senha: {
        type: "datetime",
        nullable: true,
      },
      senha_hotsite_md5: {
        type: "enum('S','N')",
        nullable: true,
      },
      operador_neutro: {
        type: "int(11) unsigned",
        nullable: true,
      },
      external_id: {
        type: "varchar(100)",
        nullable: true,
      },
      external_system: {
        type: "varchar(50)",
        nullable: true,
      },
      status_viabilidade: {
        type: "enum('S','N')",
        nullable: true,
      },
      tipo_rede: {
        type: "enum('P','N','A')",
        nullable: true,
      },
      rede_ativacao: {
        type: "enum('P','N')",
        nullable: true,
      },
      indicado_por: {
        type: "int(11)",
        nullable: true,
      },
      numero_antigo: {
        type: "varchar(40)",
        nullable: true,
      },
      numero_cob_antigo: {
        type: "varchar(40)",
        nullable: true,
      },
      id_fornecedor_conversao: {
        type: "int(11) unsigned",
        nullable: false,
      },
      id_campanha: {
        type: "int(11)",
        nullable: true,
      },
      desconto_irrf_valor_inferior: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_vindi: {
        type: "int(10) unsigned",
        nullable: true,
      },
      antigo_acesso_central: {
        type: "enum('S','N','A')",
        nullable: true,
      },
      filtra_filial: {
        type: "enum('S','N')",
        nullable: true,
      },
      tipo_documento_identificacao: {
        type: "varchar(10)",
        nullable: false,
      },
      regua_cobranca_wpp: {
        type: "enum('S','N')",
        nullable: true,
      },
      regua_cobranca_notificacao: {
        type: "enum('S','N')",
        nullable: true,
      },
      regime_fiscal_col: {
        type: "enum('48','49')",
        nullable: true,
      },
      regua_cobranca_considera: {
        type: "enum('S','N','P')",
        nullable: false,
      },
      id_segmento: {
        type: "tinyint(3) unsigned",
        nullable: true,
      },
      inss_retem: {
        type: "enum('S','N')",
        nullable: false,
      },
      tipo_ente_governamental: {
        type: "enum('1','2','3','4','5','6')",
        nullable: true,
      },
      percentual_reducao: {
        type: "decimal(7,4) unsigned",
        nullable: true,
      },
      nome_social: {
        type: "varchar(200)",
        nullable: true,
      },
      Sexo: {
        type: "enum('F','M','NB','O','PNI')",
        nullable: true,
      },
      cadunico: {
        type: "enum('S','N')",
        nullable: true,
      },
      tipo_operacao_ente_governamental: {
        type: "enum('1','2','3','4')",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "bairro",
        nonUnique: "1",
        position: "1",
        columnName: "bairro",
        type: "BTREE",
      },
      {
        name: "bairro_cob",
        nonUnique: "1",
        position: "1",
        columnName: "bairro_cob",
        type: "BTREE",
      },
      {
        name: "cep",
        nonUnique: "1",
        position: "1",
        columnName: "cep",
        type: "BTREE",
      },
      {
        name: "cidade",
        nonUnique: "1",
        position: "1",
        columnName: "cidade",
        type: "BTREE",
      },
      {
        name: "cidade_cob",
        nonUnique: "1",
        position: "1",
        columnName: "cidade_cob",
        type: "BTREE",
      },
      {
        name: "cnpj_cpf",
        nonUnique: "1",
        position: "1",
        columnName: "cnpj_cpf",
        type: "BTREE",
      },
      {
        name: "cond_pagamento",
        nonUnique: "1",
        position: "1",
        columnName: "cond_pagamento",
        type: "BTREE",
      },
      {
        name: "email",
        nonUnique: "1",
        position: "1",
        columnName: "email",
        type: "BTREE",
      },
      {
        name: "emp_cidade",
        nonUnique: "1",
        position: "1",
        columnName: "emp_cidade",
        type: "BTREE",
      },
      {
        name: "fantasia",
        nonUnique: "1",
        position: "1",
        columnName: "fantasia",
        type: "BTREE",
      },
      {
        name: "filial_id",
        nonUnique: "1",
        position: "1",
        columnName: "filial_id",
        type: "BTREE",
      },
      {
        name: "fone",
        nonUnique: "1",
        position: "1",
        columnName: "fone",
        type: "BTREE",
      },
      {
        name: "hotsite_email",
        nonUnique: "1",
        position: "1",
        columnName: "hotsite_email",
        type: "BTREE",
      },
      {
        name: "id_candato_tipo",
        nonUnique: "1",
        position: "1",
        columnName: "id_candato_tipo",
        type: "BTREE",
      },
      {
        name: "id_concorrente",
        nonUnique: "1",
        position: "1",
        columnName: "id_concorrente",
        type: "BTREE",
      },
      {
        name: "id_condominio",
        nonUnique: "1",
        position: "1",
        columnName: "id_condominio",
        type: "BTREE",
      },
      {
        name: "id_perfil",
        nonUnique: "1",
        position: "1",
        columnName: "id_perfil",
        type: "BTREE",
      },
      {
        name: "id_tipo_cliente",
        nonUnique: "1",
        position: "1",
        columnName: "id_tipo_cliente",
        type: "BTREE",
      },
      {
        name: "latitude",
        nonUnique: "1",
        position: "1",
        columnName: "latitude",
        type: "BTREE",
      },
      {
        name: "longitude",
        nonUnique: "1",
        position: "1",
        columnName: "longitude",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "razao",
        nonUnique: "1",
        position: "1",
        columnName: "razao",
        type: "BTREE",
      },
      {
        name: "responsavel",
        nonUnique: "1",
        position: "1",
        columnName: "responsavel",
        type: "BTREE",
      },
      {
        name: "tabela_preco",
        nonUnique: "1",
        position: "1",
        columnName: "tabela_preco",
        type: "BTREE",
      },
      {
        name: "telefone_celular",
        nonUnique: "1",
        position: "1",
        columnName: "telefone_celular",
        type: "BTREE",
      },
      {
        name: "telefone_comercial",
        nonUnique: "1",
        position: "1",
        columnName: "telefone_comercial",
        type: "BTREE",
      },
      {
        name: "uf",
        nonUnique: "1",
        position: "1",
        columnName: "uf",
        type: "BTREE",
      },
      {
        name: "ultima_atualizacao",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_atualizacao",
        type: "BTREE",
      },
      {
        name: "whatsapp",
        nonUnique: "1",
        position: "1",
        columnName: "whatsapp",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "cliente_ibfk_3",
        columnName: "cidade",
        referencedTable: "cidade",
        referencedColumn: "id",
      },
    ],
  },
  cliente_contrato: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      id_vd_contrato: {
        type: "int(11)",
        nullable: false,
      },
      id_cliente: {
        type: "int(11)",
        nullable: false,
      },
      status: {
        type: "enum('A','I','P','N','D')",
        nullable: true,
      },
      data: {
        type: "date",
        nullable: false,
      },
      data_validade: {
        type: "date",
        nullable: true,
      },
      pago_ate_data: {
        type: "date",
        nullable: true,
      },
      renovacao_automatica: {
        type: "enum('S','N')",
        nullable: true,
      },
      valor_unitario: {
        type: "decimal(15,5)",
        nullable: true,
      },
      id_tipo_contrato: {
        type: "int(11)",
        nullable: false,
      },
      contrato: {
        type: "varchar(100)",
        nullable: true,
      },
      id_filial: {
        type: "int(11)",
        nullable: true,
      },
      id_tipo_documento: {
        type: "int(11)",
        nullable: true,
      },
      id_carteira_cobranca: {
        type: "int(11)",
        nullable: true,
      },
      id_vendedor: {
        type: "int(11)",
        nullable: true,
      },
      comissao: {
        type: "decimal(5,2)",
        nullable: true,
      },
      status_internet: {
        type: "enum('A','D','CM','CA','CE','FA','AA')",
        nullable: true,
      },
      bloqueio_automatico: {
        type: "enum('S','N')",
        nullable: true,
      },
      nao_bloquear_ate: {
        type: "date",
        nullable: true,
      },
      aviso_atraso: {
        type: "enum('S','N')",
        nullable: true,
      },
      nao_avisar_ate: {
        type: "date",
        nullable: true,
      },
      obs: {
        type: "text",
        nullable: true,
      },
      id_modelo: {
        type: "int(11)",
        nullable: false,
      },
      cc_previsao: {
        type: "enum('P','N','S','M')",
        nullable: false,
      },
      tipo_doc_opc: {
        type: "int(11)",
        nullable: true,
      },
      data_cancelamento: {
        type: "date",
        nullable: true,
      },
      data_validada: {
        type: "date",
        nullable: true,
      },
      taxa_instalacao: {
        type: "decimal(15,2)",
        nullable: true,
      },
      desconto_fidelidade: {
        type: "decimal(15,2)",
        nullable: true,
      },
      fidelidade: {
        type: "int(11)",
        nullable: true,
      },
      taxa_improdutiva: {
        type: "decimal(15,3)",
        nullable: true,
      },
      data_renovacao: {
        type: "date",
        nullable: true,
      },
      tipo: {
        type: "enum('I','T','S','SVA')",
        nullable: false,
      },
      tel_franquia_segundos: {
        type: "int(11)",
        nullable: true,
      },
      tel_franquia_prefix: {
        type: "varchar(250)",
        nullable: true,
      },
      obs_cancelamento: {
        type: "text",
        nullable: true,
      },
      motivo_cancelamento: {
        type: "int(11)",
        nullable: true,
      },
      email_cobranca: {
        type: "varchar(250)",
        nullable: true,
      },
      tipo_cobranca: {
        type: "enum('P','I','E')",
        nullable: false,
      },
      lote: {
        type: "int(11)",
        nullable: true,
      },
      condicao_pagamento_primeira_fat: {
        type: "int(11)",
        nullable: true,
      },
      data_negativacao: {
        type: "date",
        nullable: true,
      },
      protocolo_negativacao: {
        type: "varchar(50)",
        nullable: true,
      },
      desbloqueio_confianca: {
        type: "enum('S','N','P')",
        nullable: true,
      },
      desbloqueio_confianca_ativo: {
        type: "enum('S','N')",
        nullable: true,
      },
      descricao_aux_plano_venda: {
        type: "varchar(200)",
        nullable: true,
      },
      avalista_1: {
        type: "int(11)",
        nullable: true,
      },
      avalista_2: {
        type: "int(11)",
        nullable: true,
      },
      rec_bandeira: {
        type: "varchar(12)",
        nullable: true,
      },
      rec_cartao: {
        type: "varchar(20)",
        nullable: true,
      },
      rec_token: {
        type: "varchar(80)",
        nullable: true,
      },
      data_ativacao: {
        type: "date",
        nullable: true,
      },
      imp_importacao: {
        type: "enum('S','N')",
        nullable: true,
      },
      imp_carteira: {
        type: "enum('S','N')",
        nullable: true,
      },
      imp_rede: {
        type: "enum('S','N')",
        nullable: true,
      },
      imp_bkp: {
        type: "enum('S','N')",
        nullable: true,
      },
      imp_treinamento: {
        type: "enum('S','N')",
        nullable: true,
      },
      imp_status: {
        type: "enum('F','A')",
        nullable: true,
      },
      imp_obs: {
        type: "text",
        nullable: true,
      },
      imp_realizado: {
        type: "enum('S','N')",
        nullable: true,
      },
      imp_motivo: {
        type: "varchar(250)",
        nullable: true,
      },
      imp_inicial: {
        type: "date",
        nullable: true,
      },
      imp_final: {
        type: "date",
        nullable: true,
      },
      ativacao_numero_parcelas: {
        type: "varchar(100)",
        nullable: true,
      },
      ativacao_vencimentos: {
        type: "varchar(150)",
        nullable: true,
      },
      ativacao_valor_parcela: {
        type: "decimal(15,2)",
        nullable: true,
      },
      id_tipo_doc_ativ: {
        type: "int(11)",
        nullable: true,
      },
      id_produto_ativ: {
        type: "int(11)",
        nullable: true,
      },
      id_cond_pag_ativ: {
        type: "int(11)",
        nullable: true,
      },
      id_vendedor_ativ: {
        type: "int(11)",
        nullable: true,
      },
      endereco_padrao_cliente: {
        type: "enum('S','N')",
        nullable: false,
      },
      endereco: {
        type: "varchar(200)",
        nullable: true,
      },
      numero: {
        type: "varchar(20)",
        nullable: true,
      },
      bairro: {
        type: "varchar(100)",
        nullable: true,
      },
      cidade: {
        type: "int(11)",
        nullable: true,
      },
      cep: {
        type: "varchar(20)",
        nullable: true,
      },
      complemento: {
        type: "varchar(200)",
        nullable: true,
      },
      referencia: {
        type: "varchar(200)",
        nullable: true,
      },
      id_condominio: {
        type: "int(11)",
        nullable: true,
      },
      nf_info_adicionais: {
        type: "varchar(1500)",
        nullable: true,
      },
      assinatura_digital: {
        type: "enum('S','N','P')",
        nullable: true,
      },
      tipo_produtos_plano: {
        type: "enum('P','PLA','PRO')",
        nullable: false,
      },
      status_velocidade: {
        type: "varchar(2)",
        nullable: false,
      },
      bloco: {
        type: "varchar(100)",
        nullable: true,
      },
      apartamento: {
        type: "varchar(11)",
        nullable: true,
      },
      id_instalador: {
        type: "int(11)",
        nullable: true,
      },
      motivo_inclusao: {
        type: "enum('I','U','D','M','T','L','N','R')",
        nullable: false,
      },
      latitude: {
        type: "varchar(30)",
        nullable: true,
      },
      longitude: {
        type: "varchar(30)",
        nullable: true,
      },
      id_crm_negociacoes: {
        type: "int(11)",
        nullable: true,
      },
      tipo_doc_opc2: {
        type: "int(11)",
        nullable: true,
      },
      tipo_doc_opc3: {
        type: "int(11)",
        nullable: true,
      },
      tipo_doc_opc4: {
        type: "int(11)",
        nullable: true,
      },
      liberacao_bloqueio_manual: {
        type: "enum('S','N','P')",
        nullable: false,
      },
      indicacao_contrato_id: {
        type: "int(11)",
        nullable: false,
      },
      num_parcelas_atraso: {
        type: "int(11)",
        nullable: true,
      },
      dt_ult_ativacao: {
        type: "date",
        nullable: true,
      },
      dt_ult_inativacao: {
        type: "date",
        nullable: true,
      },
      dt_utl_negativacao: {
        type: "date",
        nullable: true,
      },
      dt_ult_desb_conf: {
        type: "date",
        nullable: true,
      },
      dt_ult_desativacao: {
        type: "date",
        nullable: true,
      },
      dt_ult_bloq_manual: {
        type: "date",
        nullable: true,
      },
      dt_ult_bloq_auto: {
        type: "date",
        nullable: true,
      },
      dt_ult_finan_atraso: {
        type: "date",
        nullable: true,
      },
      dt_ult_desiste: {
        type: "date",
        nullable: true,
      },
      id_contrato_principal: {
        type: "int(11)",
        nullable: true,
      },
      dt_ult_des_bloq_conf: {
        type: "date",
        nullable: true,
      },
      gerar_finan_assin_digital_contrato: {
        type: "enum('S','N','P')",
        nullable: true,
      },
      credit_card_recorrente_token: {
        type: "varchar(512)",
        nullable: true,
      },
      credit_card_recorrente_carteira_antiga: {
        type: "int(11)",
        nullable: true,
      },
      data_cadastro_sistema: {
        type: "date",
        nullable: true,
      },
      credit_card_recorrente_bandeira_cartao: {
        type: "varchar(10)",
        nullable: true,
      },
      credit_card_recorrente_dv_cartao: {
        type: "varchar(4)",
        nullable: true,
      },
      id_responsavel: {
        type: "int(11)",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: false,
      },
      id_motivo_negativacao: {
        type: "int(11)",
        nullable: true,
      },
      obs_negativacao: {
        type: "text",
        nullable: true,
      },
      data_acesso_desativado: {
        type: "date",
        nullable: true,
      },
      restricao_auto_desbloqueio: {
        type: "enum('S','N')",
        nullable: false,
      },
      motivo_restricao_auto_desbloq: {
        type: "text",
        nullable: true,
      },
      ativo_summit: {
        type: "enum('S','N')",
        nullable: false,
      },
      portabilidade_summit: {
        type: "enum('S','N')",
        nullable: false,
      },
      inicio_vigencia_summit: {
        type: "date",
        nullable: true,
      },
      fim_vigencia_summit: {
        type: "date",
        nullable: true,
      },
      range_inicial_summit: {
        type: "varchar(15)",
        nullable: true,
      },
      range_final_summit: {
        type: "varchar(15)",
        nullable: true,
      },
      dt_ult_liberacao_susp_parc: {
        type: "date",
        nullable: true,
      },
      nao_susp_parc_ate: {
        type: "date",
        nullable: true,
      },
      liberacao_suspensao_parcial: {
        type: "enum('H','D','P')",
        nullable: true,
      },
      utilizando_auto_libera_susp_parc: {
        type: "enum('S','N')",
        nullable: true,
      },
      restricao_auto_libera_susp_parcial: {
        type: "enum('S','N')",
        nullable: true,
      },
      motivo_restri_auto_libera_parc: {
        type: "text",
        nullable: true,
      },
      id_indexador_reajuste: {
        type: "int(11)",
        nullable: true,
      },
      id_cidade: {
        type: "text",
        nullable: false,
      },
      data_inicial_suspensao: {
        type: "date",
        nullable: true,
      },
      data_final_suspensao: {
        type: "date",
        nullable: true,
      },
      contrato_suspenso: {
        type: "enum('S','N')",
        nullable: false,
      },
      data_retomada_contrato: {
        type: "date",
        nullable: true,
      },
      dt_ult_liberacao_temporaria: {
        type: "date",
        nullable: true,
      },
      updated_responsible_seller: {
        type: "enum('S','N')",
        nullable: true,
      },
      data_desistencia: {
        type: "date",
        nullable: true,
      },
      motivo_desistencia: {
        type: "int(11) unsigned",
        nullable: true,
      },
      obs_desistencia: {
        type: "text",
        nullable: true,
      },
      obs_contrato: {
        type: "text",
        nullable: true,
      },
      alerta_contrato: {
        type: "text",
        nullable: true,
      },
      data_expiracao: {
        type: "date",
        nullable: false,
      },
      numero_antigo: {
        type: "varchar(40)",
        nullable: true,
      },
      base_geracao_tipo_doc: {
        type: "enum('OPC','PROD','P')",
        nullable: true,
      },
      integracao_assinatura_digital: {
        type: "enum('S','N','P')",
        nullable: true,
      },
      token_assinatura_digital: {
        type: "varchar(50)",
        nullable: true,
      },
      url_assinatura_digital: {
        type: "varchar(250)",
        nullable: true,
      },
      moeda: {
        type: "varchar(5)",
        nullable: true,
      },
      testemunha_assinatura_digital: {
        type: "int(11) unsigned",
        nullable: true,
      },
      selfie_photo: {
        type: "enum('S','N','P')",
        nullable: false,
      },
      document_photo: {
        type: "enum('S','N','P')",
        nullable: false,
      },
      id_vindi: {
        type: "int(10) unsigned",
        nullable: true,
      },
      data_assinatura: {
        type: "date",
        nullable: true,
      },
      ids_contratos_recorrencia: {
        type: "text",
        nullable: true,
      },
      motivo_adicional: {
        type: "int(10) unsigned",
        nullable: true,
      },
      concorrente_mot_adicional: {
        type: "int(10) unsigned",
        nullable: true,
      },
      id_responsavel_desistencia: {
        type: "int(5) unsigned",
        nullable: true,
      },
      id_responsavel_cancelamento: {
        type: "int(5) unsigned",
        nullable: true,
      },
      id_responsavel_negativacao: {
        type: "int(5) unsigned",
        nullable: true,
      },
      chave_pix: {
        type: "varchar(120)",
        nullable: true,
      },
      tipo_localidade: {
        type: "enum('R','U')",
        nullable: false,
      },
      isentar_contrato: {
        type: "enum('S','N')",
        nullable: true,
      },
      financeiro_migrado: {
        type: "enum('S','N')",
        nullable: true,
      },
      id_notifica_massa: {
        type: "int(11)",
        nullable: true,
      },
      estrato_social_col: {
        type: "enum('1','2','3','4','5','6')",
        nullable: true,
      },
      agrupar_financeiro_contrato: {
        type: "enum('S','N','P')",
        nullable: false,
      },
      origem_cancelamento: {
        type: "enum('M','A')",
        nullable: true,
      },
      situacao_financeira_contrato: {
        type: "enum('R','IR','I')",
        nullable: false,
      },
      dt_ult_desbloq_auto: {
        type: "date",
        nullable: true,
      },
      dt_ult_desbloq_manual: {
        type: "date",
        nullable: true,
      },
      aplica_desconto_tempo_bloqueio: {
        type: "enum('S','N','P')",
        nullable: true,
      },
      tempo_permanencia: {
        type: "decimal(4,1) unsigned",
        nullable: true,
      },
      status_recorrencia: {
        type: "enum('AGUARDANDO_APROVACAO','APROVADA','REJEITADA','EXPIRADA','CANCELADA')",
        nullable: true,
      },
      pix_recorrente_id_carteira_cobranca: {
        type: "int(11) unsigned",
        nullable: true,
      },
      email_assinatura_digital: {
        type: "varchar(256)",
        nullable: true,
      },
      contato_assinatura_digital: {
        type: "varchar(100)",
        nullable: true,
      },
      id_motivo_inclusao: {
        type: "int(11) unsigned",
        nullable: true,
      },
      dt_retorno_desb_conf: {
        type: "date",
        nullable: true,
      },
      aplicar_desconto_tempo_bloqueio: {
        type: "enum('S','N','P')",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "bairro",
        nonUnique: "1",
        position: "1",
        columnName: "bairro",
        type: "BTREE",
      },
      {
        name: "cep",
        nonUnique: "1",
        position: "1",
        columnName: "cep",
        type: "BTREE",
      },
      {
        name: "cidade",
        nonUnique: "1",
        position: "1",
        columnName: "cidade",
        type: "BTREE",
      },
      {
        name: "id_carteira_cobranca",
        nonUnique: "1",
        position: "1",
        columnName: "id_carteira_cobranca",
        type: "BTREE",
      },
      {
        name: "id_cliente",
        nonUnique: "1",
        position: "1",
        columnName: "id_cliente",
        type: "BTREE",
      },
      {
        name: "id_crm_negociacoes",
        nonUnique: "1",
        position: "1",
        columnName: "id_crm_negociacoes",
        type: "BTREE",
      },
      {
        name: "id_filial",
        nonUnique: "1",
        position: "1",
        columnName: "id_filial",
        type: "BTREE",
      },
      {
        name: "id_modelo",
        nonUnique: "1",
        position: "1",
        columnName: "id_modelo",
        type: "BTREE",
      },
      {
        name: "id_tipo_contrato",
        nonUnique: "1",
        position: "1",
        columnName: "id_tipo_contrato",
        type: "BTREE",
      },
      {
        name: "id_tipo_documento",
        nonUnique: "1",
        position: "1",
        columnName: "id_tipo_documento",
        type: "BTREE",
      },
      {
        name: "id_vd_contrato",
        nonUnique: "1",
        position: "1",
        columnName: "id_vd_contrato",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "ultima_atualizacao",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_atualizacao",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "cliente_contrato_ibfk_1",
        columnName: "id_vd_contrato",
        referencedTable: "vd_contratos",
        referencedColumn: "id",
      },
      {
        name: "cliente_contrato_ibfk_2",
        columnName: "id_cliente",
        referencedTable: "cliente",
        referencedColumn: "id",
      },
      {
        name: "cliente_contrato_ibfk_3",
        columnName: "id_filial",
        referencedTable: "filial",
        referencedColumn: "id",
      },
      {
        name: "cliente_contrato_ibfk_4",
        columnName: "id_tipo_contrato",
        referencedTable: "cliente_contrato_tipo",
        referencedColumn: "id",
      },
      {
        name: "cliente_contrato_ibfk_5",
        columnName: "id_modelo",
        referencedTable: "cliente_contrato_modelo",
        referencedColumn: "id",
      },
    ],
  },
  cliente_contrato_historico: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      historico: {
        type: "text",
        nullable: false,
      },
      data: {
        type: "date",
        nullable: false,
      },
      tipo: {
        type: "varchar(30)",
        nullable: true,
      },
      id_cliente: {
        type: "int(11)",
        nullable: false,
      },
      id_contrato: {
        type: "int(11)",
        nullable: true,
      },
      operador: {
        type: "int(11) unsigned",
        nullable: true,
      },
      created_at: {
        type: "datetime",
        nullable: true,
      },
      url: {
        type: "varchar(255)",
        nullable: true,
      },
      request_body: {
        type: "text",
        nullable: true,
      },
      response_body: {
        type: "text",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "data",
        nonUnique: "1",
        position: "1",
        columnName: "data",
        type: "BTREE",
      },
      {
        name: "id_cliente",
        nonUnique: "1",
        position: "1",
        columnName: "id_cliente",
        type: "BTREE",
      },
      {
        name: "id_contrato",
        nonUnique: "1",
        position: "1",
        columnName: "id_contrato",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  vd_contratos: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      nome: {
        type: "varchar(200)",
        nullable: false,
      },
      descricao: {
        type: "varchar(200)",
        nullable: true,
      },
      id_tipo_documento: {
        type: "int(11)",
        nullable: true,
      },
      id_vendedor: {
        type: "int(11)",
        nullable: true,
      },
      comissao: {
        type: "decimal(5,2)",
        nullable: true,
      },
      id_carteira_cobranca: {
        type: "int(11)",
        nullable: true,
      },
      valor_contrato: {
        type: "decimal(15,9)",
        nullable: true,
      },
      Ativo: {
        type: "enum('S','N')",
        nullable: true,
      },
      limitar_n_logins: {
        type: "enum('S','N')",
        nullable: true,
      },
      logins_simultaneos: {
        type: "int(11)",
        nullable: true,
      },
      valor_adicional: {
        type: "decimal(15,2)",
        nullable: true,
      },
      tipo: {
        type: "enum('I','T','S','SVA')",
        nullable: false,
      },
      tel_franquia_segundos: {
        type: "int(11)",
        nullable: true,
      },
      tel_franquia_prefix: {
        type: "varchar(250)",
        nullable: true,
      },
      id_cidade: {
        type: "int(11)",
        nullable: true,
      },
      moeda: {
        type: "varchar(10)",
        nullable: true,
      },
      id_tipo_doc_ativ: {
        type: "int(11)",
        nullable: true,
      },
      id_produto_ativ: {
        type: "int(11)",
        nullable: true,
      },
      id_cond_pag_ativ: {
        type: "int(11)",
        nullable: true,
      },
      id_vendedor_ativ: {
        type: "int(11)",
        nullable: true,
      },
      id_filial: {
        type: "int(4)",
        nullable: true,
      },
      id_modelo: {
        type: "int(11)",
        nullable: true,
      },
      tipo_doc_opc: {
        type: "int(11)",
        nullable: true,
      },
      tipo_doc_opc2: {
        type: "int(11)",
        nullable: true,
      },
      tipo_doc_opc3: {
        type: "int(11)",
        nullable: true,
      },
      tipo_doc_opc4: {
        type: "int(11)",
        nullable: true,
      },
      utilizar_desconto_ate_vencimento: {
        type: "enum('S','N')",
        nullable: true,
      },
      id_produto_ate_vencimento: {
        type: "int(11)",
        nullable: true,
      },
      valor_desconto: {
        type: "decimal(15,2)",
        nullable: true,
      },
      utilizar_desconto_por_repeticao: {
        type: "enum('S','N')",
        nullable: true,
      },
      qtde_repeticoes_desconto: {
        type: "int(11)",
        nullable: true,
      },
      id_produto_contrato_vinc: {
        type: "int(11)",
        nullable: true,
      },
      mostrar_na_viabilidade: {
        type: "enum('S','N')",
        nullable: false,
      },
      utilizar_desconto_no_produto_plano: {
        type: "enum('S','N')",
        nullable: false,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: true,
      },
      fidelidade: {
        type: "int(10) unsigned",
        nullable: true,
      },
      base_geracao_por_tipo_doc: {
        type: "enum('OPC','PROD','P')",
        nullable: true,
      },
      tipo_pessoa: {
        type: "enum('F','J','E','T')",
        nullable: false,
      },
      descricao_desconto: {
        type: "varchar(255)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "id_carteira_cobranca",
        nonUnique: "1",
        position: "1",
        columnName: "id_carteira_cobranca",
        type: "BTREE",
      },
      {
        name: "id_cidade",
        nonUnique: "1",
        position: "1",
        columnName: "id_cidade",
        type: "BTREE",
      },
      {
        name: "id_cond_pag_ativ",
        nonUnique: "1",
        position: "1",
        columnName: "id_cond_pag_ativ",
        type: "BTREE",
      },
      {
        name: "id_filial",
        nonUnique: "1",
        position: "1",
        columnName: "id_filial",
        type: "BTREE",
      },
      {
        name: "id_modelo",
        nonUnique: "1",
        position: "1",
        columnName: "id_modelo",
        type: "BTREE",
      },
      {
        name: "id_produto_ativ",
        nonUnique: "1",
        position: "1",
        columnName: "id_produto_ativ",
        type: "BTREE",
      },
      {
        name: "id_tipo_documento",
        nonUnique: "1",
        position: "1",
        columnName: "id_tipo_documento",
        type: "BTREE",
      },
      {
        name: "id_tipo_doc_ativ",
        nonUnique: "1",
        position: "1",
        columnName: "id_tipo_doc_ativ",
        type: "BTREE",
      },
      {
        name: "id_vendedor",
        nonUnique: "1",
        position: "1",
        columnName: "id_vendedor",
        type: "BTREE",
      },
      {
        name: "id_vendedor_ativ",
        nonUnique: "1",
        position: "1",
        columnName: "id_vendedor_ativ",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "ultima_atualizacao",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_atualizacao",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  radusuarios: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      id_cliente: {
        type: "int(11)",
        nullable: false,
      },
      id_grupo: {
        type: "int(11)",
        nullable: false,
      },
      senha: {
        type: "varchar(50)",
        nullable: true,
      },
      login: {
        type: "varchar(50)",
        nullable: false,
      },
      login_simultaneo: {
        type: "int(11)",
        nullable: false,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: false,
      },
      ip: {
        type: "varchar(30)",
        nullable: true,
      },
      mac: {
        type: "varchar(30)",
        nullable: true,
      },
      obs: {
        type: "longtext",
        nullable: true,
      },
      auto_preencher_ip: {
        type: "enum('H','S','N')",
        nullable: true,
      },
      auto_preencher_mac: {
        type: "enum('H','S','N')",
        nullable: true,
      },
      fixar_ip: {
        type: "enum('H','S','N')",
        nullable: true,
      },
      id_contrato: {
        type: "int(11)",
        nullable: true,
      },
      autenticacao_por_mac: {
        type: "enum('P','N','S','MK','UN','WP')",
        nullable: true,
      },
      autenticacao: {
        type: "enum('L','M','H','V','D','I','E')",
        nullable: true,
      },
      cache: {
        type: "enum('S','N')",
        nullable: true,
      },
      relacionar_ip_ao_login: {
        type: "enum('H','S','N')",
        nullable: true,
      },
      relacionar_mac_ao_login: {
        type: "enum('H','S','N')",
        nullable: true,
      },
      online: {
        type: "enum('S','N','SS','I')",
        nullable: true,
      },
      concentrador: {
        type: "varchar(50)",
        nullable: true,
      },
      conexao: {
        type: "varchar(100)",
        nullable: true,
      },
      tipo_conexao: {
        type: "varchar(50)",
        nullable: true,
      },
      porta_http: {
        type: "varchar(10)",
        nullable: true,
      },
      id_concentrador: {
        type: "int(11)",
        nullable: true,
      },
      interface: {
        type: "int(11)",
        nullable: true,
      },
      latitude: {
        type: "varchar(50)",
        nullable: true,
      },
      longitude: {
        type: "varchar(50)",
        nullable: true,
      },
      tipo_conexao_mapa: {
        type: "enum('58','24','F','L','A','LTE','LDD')",
        nullable: true,
      },
      senha_md5: {
        type: "enum('N','S')",
        nullable: false,
      },
      ip_aviso: {
        type: "varchar(100)",
        nullable: true,
      },
      id_transmissor: {
        type: "int(11)",
        nullable: true,
      },
      onu_mac: {
        type: "varchar(30)",
        nullable: true,
      },
      id_caixa_ftth: {
        type: "int(11)",
        nullable: true,
      },
      senha_router1: {
        type: "varchar(50)",
        nullable: true,
      },
      senha_router2: {
        type: "varchar(50)",
        nullable: true,
      },
      senha_rede_sem_fio: {
        type: "varchar(50)",
        nullable: true,
      },
      ftth_porta: {
        type: "int(11)",
        nullable: true,
      },
      id_porta_transmissor: {
        type: "int(11)",
        nullable: true,
      },
      cliente_tem_a_senha: {
        type: "enum('S','N')",
        nullable: true,
      },
      autenticacao_wps: {
        type: "enum('S','N')",
        nullable: true,
      },
      autenticacao_mac: {
        type: "enum('S','N')",
        nullable: true,
      },
      autenticacao_wpa: {
        type: "varchar(30)",
        nullable: true,
      },
      tipo_vinculo_plano: {
        type: "enum('D','C','P','G')",
        nullable: false,
      },
      ultima_conexao_inicial: {
        type: "datetime",
        nullable: true,
      },
      ultima_conexao_final: {
        type: "datetime",
        nullable: true,
      },
      tempo_conectado: {
        type: "int(11)",
        nullable: true,
      },
      id_hardware: {
        type: "int(11)",
        nullable: true,
      },
      tipo_equipamento: {
        type: "enum('C','P')",
        nullable: true,
      },
      metragem_interna: {
        type: "int(11)",
        nullable: true,
      },
      metragem_externa: {
        type: "int(11)",
        nullable: true,
      },
      tronco: {
        type: "varchar(100)",
        nullable: true,
      },
      splitter: {
        type: "int(11)",
        nullable: true,
      },
      sinal_ultimo_atendimento: {
        type: "varchar(20)",
        nullable: true,
      },
      interface_transmissao: {
        type: "int(11)",
        nullable: true,
      },
      porta_router2: {
        type: "int(5)",
        nullable: true,
      },
      franquia_maximo: {
        type: "int(11)",
        nullable: true,
      },
      franquia_atingida: {
        type: "enum('S','N')",
        nullable: false,
      },
      franquia_consumo: {
        type: "decimal(10,5)",
        nullable: true,
      },
      franquia_consumo_up: {
        type: "decimal(10,5)",
        nullable: true,
      },
      endereco: {
        type: "varchar(200)",
        nullable: true,
      },
      endereco_padrao_cliente: {
        type: "enum('S','N','C')",
        nullable: false,
      },
      numero: {
        type: "varchar(20)",
        nullable: true,
      },
      bairro: {
        type: "varchar(100)",
        nullable: true,
      },
      cidade: {
        type: "int(11)",
        nullable: true,
      },
      cep: {
        type: "varchar(20)",
        nullable: true,
      },
      complemento: {
        type: "varchar(200)",
        nullable: true,
      },
      referencia: {
        type: "varchar(200)",
        nullable: true,
      },
      id_condominio: {
        type: "int(11)",
        nullable: true,
      },
      ssid_router_wifi: {
        type: "varchar(50)",
        nullable: true,
      },
      bloco: {
        type: "varchar(100)",
        nullable: true,
      },
      apartamento: {
        type: "int(11)",
        nullable: true,
      },
      vlan: {
        type: "int(11)",
        nullable: true,
      },
      vlan_ip_rede: {
        type: "varchar(50)",
        nullable: true,
      },
      id_df_projeto: {
        type: "int(11)",
        nullable: true,
      },
      rota: {
        type: "varchar(20)",
        nullable: false,
      },
      agent_circuit_id: {
        type: "varchar(100)",
        nullable: true,
      },
      usuario_router1: {
        type: "varchar(50)",
        nullable: true,
      },
      pd_ipv6: {
        type: "varchar(100)",
        nullable: true,
      },
      perfil_autorizar_onu: {
        type: "int(11)",
        nullable: true,
      },
      download_atual: {
        type: "bigint(20)",
        nullable: true,
      },
      upload_atual: {
        type: "bigint(20)",
        nullable: true,
      },
      relacionar_concentrador_ao_login: {
        type: "enum('S','N','H')",
        nullable: true,
      },
      pool_radius: {
        type: "int(11)",
        nullable: true,
      },
      id_rad_dns: {
        type: "int(11)",
        nullable: false,
      },
      modelo_tranmissor: {
        type: "varchar(10)",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: false,
      },
      gw_vlan: {
        type: "varchar(50)",
        nullable: true,
      },
      motivo_desconexao: {
        type: "varchar(32)",
        nullable: true,
      },
      count_desconexao: {
        type: "int(11)",
        nullable: true,
      },
      tempo_conexao: {
        type: "int(11)",
        nullable: true,
      },
      fixar_ipv6: {
        type: "enum('H','S','N')",
        nullable: true,
      },
      auto_preencher_ipv6: {
        type: "enum('H','S','N')",
        nullable: true,
      },
      relacionar_ipv6_ao_login: {
        type: "enum('H','S','N')",
        nullable: true,
      },
      id_filial: {
        type: "int(4)",
        nullable: true,
      },
      ip_aux: {
        type: "varchar(50)",
        nullable: true,
      },
      porta_aux: {
        type: "int(6)",
        nullable: true,
      },
      ponta: {
        type: "enum('A','B','C')",
        nullable: true,
      },
      id_radgrupos_pools: {
        type: "int(11)",
        nullable: true,
      },
      service_tag_vlan: {
        type: "enum('S','N')",
        nullable: true,
      },
      framed_fixar_ipv6: {
        type: "enum('H','S','N')",
        nullable: true,
      },
      framed_autopreencher_ipv6: {
        type: "enum('H','S','N')",
        nullable: true,
      },
      framed_relacionar_ipv6_ao_login: {
        type: "enum('H','S','N')",
        nullable: true,
      },
      framed_relaciona_ipv6_ao_login: {
        type: "enum('H','S','N')",
        nullable: true,
      },
      framed_pd_ipv6: {
        type: "varchar(100)",
        nullable: true,
      },
      id_integracao: {
        type: "int(11)",
        nullable: true,
      },
      lte_auth_key: {
        type: "varchar(100)",
        nullable: true,
      },
      lte_auth_opc: {
        type: "varchar(100)",
        nullable: true,
      },
      lte_id: {
        type: "varchar(100)",
        nullable: true,
      },
      lte_apns: {
        type: "varchar(100)",
        nullable: true,
      },
      acct_session_id: {
        type: "varchar(100)",
        nullable: true,
      },
      ssid_router_wifi_5ghz: {
        type: "varchar(50)",
        nullable: true,
      },
      senha_rede_sem_fio_5ghz: {
        type: "varchar(50)",
        nullable: true,
      },
      mtu: {
        type: "int(4) unsigned",
        nullable: false,
      },
      onu_compartilhada: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_reserva_rede_neutra: {
        type: "int(11)",
        nullable: true,
      },
      tipo_acesso: {
        type: "enum('https','http')",
        nullable: false,
      },
      usuario_wpa2aes: {
        type: "varchar(50)",
        nullable: false,
      },
      senha_wpa2aes: {
        type: "varchar(50)",
        nullable: false,
      },
      pacote_lte: {
        type: "varchar(50)",
        nullable: true,
      },
      id_predio: {
        type: "int(11) unsigned",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "agent_circuit_id",
        nonUnique: "1",
        position: "1",
        columnName: "agent_circuit_id",
        type: "BTREE",
      },
      {
        name: "bairro",
        nonUnique: "1",
        position: "1",
        columnName: "bairro",
        type: "BTREE",
      },
      {
        name: "cep",
        nonUnique: "1",
        position: "1",
        columnName: "cep",
        type: "BTREE",
      },
      {
        name: "cidade",
        nonUnique: "1",
        position: "1",
        columnName: "cidade",
        type: "BTREE",
      },
      {
        name: "id_caixa_ftth",
        nonUnique: "1",
        position: "1",
        columnName: "id_caixa_ftth",
        type: "BTREE",
      },
      {
        name: "id_cliente",
        nonUnique: "1",
        position: "1",
        columnName: "id_cliente",
        type: "BTREE",
      },
      {
        name: "id_concentrador",
        nonUnique: "1",
        position: "1",
        columnName: "id_concentrador",
        type: "BTREE",
      },
      {
        name: "id_contrato",
        nonUnique: "1",
        position: "1",
        columnName: "id_contrato",
        type: "BTREE",
      },
      {
        name: "id_df_projeto",
        nonUnique: "1",
        position: "1",
        columnName: "id_df_projeto",
        type: "BTREE",
      },
      {
        name: "id_grupo",
        nonUnique: "1",
        position: "1",
        columnName: "id_grupo",
        type: "BTREE",
      },
      {
        name: "id_porta_transmissor",
        nonUnique: "1",
        position: "1",
        columnName: "id_porta_transmissor",
        type: "BTREE",
      },
      {
        name: "id_transmissor",
        nonUnique: "1",
        position: "1",
        columnName: "id_transmissor",
        type: "BTREE",
      },
      {
        name: "ip",
        nonUnique: "1",
        position: "1",
        columnName: "ip",
        type: "BTREE",
      },
      {
        name: "latitude",
        nonUnique: "1",
        position: "1",
        columnName: "latitude",
        type: "BTREE",
      },
      {
        name: "login_2",
        nonUnique: "1",
        position: "1",
        columnName: "login",
        type: "BTREE",
      },
      {
        name: "longitude",
        nonUnique: "1",
        position: "1",
        columnName: "longitude",
        type: "BTREE",
      },
      {
        name: "mac",
        nonUnique: "1",
        position: "1",
        columnName: "mac",
        type: "BTREE",
      },
      {
        name: "online",
        nonUnique: "1",
        position: "1",
        columnName: "online",
        type: "BTREE",
      },
      {
        name: "pd_ipv6",
        nonUnique: "1",
        position: "1",
        columnName: "pd_ipv6",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "ultima_atualizacao",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_atualizacao",
        type: "BTREE",
      },
      {
        name: "ultima_conexao_inicial",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_conexao_inicial",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "radusuarios_ibfk_1",
        columnName: "id_cliente",
        referencedTable: "cliente",
        referencedColumn: "id",
      },
    ],
  },
  rad_caixa_ftth: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      descricao: {
        type: "varchar(100)",
        nullable: false,
      },
      id_transmissor: {
        type: "int(11)",
        nullable: true,
      },
      latitude: {
        type: "varchar(45)",
        nullable: true,
      },
      longitude: {
        type: "varchar(45)",
        nullable: true,
      },
      id_projeto: {
        type: "int(11)",
        nullable: true,
      },
      capacidade: {
        type: "int(11)",
        nullable: true,
      },
      id_diretorio: {
        type: "int(11)",
        nullable: true,
      },
      codigo_estilo_caixa: {
        type: "varchar(10)",
        nullable: false,
      },
      obs_caixa_ftth: {
        type: "text",
        nullable: true,
      },
      cep: {
        type: "varchar(20)",
        nullable: true,
      },
      endereco: {
        type: "varchar(100)",
        nullable: true,
      },
      numero: {
        type: "varchar(20)",
        nullable: true,
      },
      bairro: {
        type: "varchar(100)",
        nullable: true,
      },
      id_cidade: {
        type: "int(11)",
        nullable: true,
      },
      id_tecnologia: {
        type: "int(11)",
        nullable: true,
      },
      status: {
        type: "enum('A','I')",
        nullable: true,
      },
      id_interface: {
        type: "int(11)",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: true,
      },
      id_mini_projeto: {
        type: "int(11)",
        nullable: true,
      },
      tipo: {
        type: "enum('P','N','A')",
        nullable: true,
      },
      idx: {
        type: "int(11)",
        nullable: true,
      },
      external_id: {
        type: "varchar(40)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "bairro",
        nonUnique: "1",
        position: "1",
        columnName: "bairro",
        type: "BTREE",
      },
      {
        name: "cep",
        nonUnique: "1",
        position: "1",
        columnName: "cep",
        type: "BTREE",
      },
      {
        name: "codigo_estilo_caixa",
        nonUnique: "1",
        position: "1",
        columnName: "codigo_estilo_caixa",
        type: "BTREE",
      },
      {
        name: "id_cidade",
        nonUnique: "1",
        position: "1",
        columnName: "id_cidade",
        type: "BTREE",
      },
      {
        name: "id_diretorio",
        nonUnique: "1",
        position: "1",
        columnName: "id_diretorio",
        type: "BTREE",
      },
      {
        name: "id_projeto",
        nonUnique: "1",
        position: "1",
        columnName: "id_projeto",
        type: "BTREE",
      },
      {
        name: "id_tecnologia",
        nonUnique: "1",
        position: "1",
        columnName: "id_tecnologia",
        type: "BTREE",
      },
      {
        name: "id_transmissor_2",
        nonUnique: "1",
        position: "1",
        columnName: "id_transmissor",
        type: "BTREE",
      },
      {
        name: "latitude",
        nonUnique: "1",
        position: "1",
        columnName: "latitude",
        type: "BTREE",
      },
      {
        name: "longitude",
        nonUnique: "1",
        position: "1",
        columnName: "longitude",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  radpop_radio: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      ssid: {
        type: "varchar(100)",
        nullable: false,
      },
      id_pop: {
        type: "int(11)",
        nullable: false,
      },
      canal: {
        type: "varchar(20)",
        nullable: true,
      },
      ip: {
        type: "char(100)",
        nullable: false,
      },
      login: {
        type: "varchar(100)",
        nullable: true,
      },
      senha: {
        type: "varchar(200)",
        nullable: true,
      },
      porta_ssh: {
        type: "int(11)",
        nullable: false,
      },
      pico_conexoes: {
        type: "int(11)",
        nullable: true,
      },
      pico_conexoes_dia: {
        type: "int(11)",
        nullable: true,
      },
      conexoes_ultima: {
        type: "int(11)",
        nullable: true,
      },
      conexoes_ulltima_data: {
        type: "datetime",
        nullable: true,
      },
      pico_conexoes_dia_data: {
        type: "datetime",
        nullable: true,
      },
      pico_conexoes_data: {
        type: "datetime",
        nullable: true,
      },
      rssi: {
        type: "int(11)",
        nullable: true,
      },
      noisef: {
        type: "int(11)",
        nullable: true,
      },
      chwidth: {
        type: "int(11)",
        nullable: true,
      },
      wpa_psk: {
        type: "varchar(100)",
        nullable: true,
      },
      countrycode: {
        type: "int(11)",
        nullable: true,
      },
      wds: {
        type: "varchar(20)",
        nullable: true,
      },
      httpd_port: {
        type: "int(11)",
        nullable: true,
      },
      fabricante_modelo: {
        type: "enum('SMARTOLT','U','M','I','O','FH','DC','HW','ZTE','HW2','PK','FK','FKG','INB','DIG','NK','FBT','FKWGL','VSOL','RAISE','CIAEPON','ZYXEL','UFIBER','FB6001','FKC','CIAGPON','ZTEC610','VSOLGPON','PHYHOME','INTELBRASG16','2FLEX','INTELBRASEPON','TPLINK','OLTNEUTRA','TH','TPLINKP700X')",
        nullable: true,
      },
      conexao: {
        type: "enum('58','24','C','F')",
        nullable: true,
      },
      uptime: {
        type: "varchar(30)",
        nullable: true,
      },
      fwversion: {
        type: "varchar(50)",
        nullable: true,
      },
      netrole: {
        type: "varchar(30)",
        nullable: true,
      },
      mode: {
        type: "varchar(10)",
        nullable: true,
      },
      apmac: {
        type: "varchar(30)",
        nullable: true,
      },
      channel: {
        type: "varchar(30)",
        nullable: true,
      },
      dfs: {
        type: "varchar(15)",
        nullable: true,
      },
      opmode: {
        type: "varchar(30)",
        nullable: true,
      },
      chains: {
        type: "varchar(10)",
        nullable: true,
      },
      ack: {
        type: "int(11)",
        nullable: true,
      },
      distance: {
        type: "varchar(30)",
        nullable: true,
      },
      ccq: {
        type: "int(11)",
        nullable: true,
      },
      txrate: {
        type: "decimal(10,3)",
        nullable: true,
      },
      rxrate: {
        type: "decimal(10,3)",
        nullable: true,
      },
      security: {
        type: "varchar(10)",
        nullable: true,
      },
      rstatus: {
        type: "int(11)",
        nullable: true,
      },
      time: {
        type: "datetime",
        nullable: true,
      },
      speed_lan: {
        type: "decimal(10,3)",
        nullable: true,
      },
      speed_wlan: {
        type: "decimal(10,3)",
        nullable: true,
      },
      descricao: {
        type: "varchar(50)",
        nullable: true,
      },
      sinal: {
        type: "int(11)",
        nullable: true,
      },
      porta_telnet: {
        type: "int(11)",
        nullable: false,
      },
      porta_api: {
        type: "int(11)",
        nullable: true,
      },
      modelo: {
        type: "varchar(50)",
        nullable: true,
      },
      cpu_load: {
        type: "varchar(50)",
        nullable: true,
      },
      total_memory: {
        type: "varchar(50)",
        nullable: true,
      },
      free_memory: {
        type: "varchar(50)",
        nullable: true,
      },
      temperatura: {
        type: "varchar(50)",
        nullable: true,
      },
      voltagem: {
        type: "varchar(50)",
        nullable: true,
      },
      current_firmware: {
        type: "varchar(50)",
        nullable: true,
      },
      upgrade_firmware: {
        type: "varchar(50)",
        nullable: true,
      },
      ip_anm: {
        type: "char(100)",
        nullable: true,
      },
      gabinete: {
        type: "int(11)",
        nullable: true,
      },
      subrack: {
        type: "int(11)",
        nullable: true,
      },
      porta_telnet_tl1: {
        type: "int(11)",
        nullable: true,
      },
      login_anm: {
        type: "varchar(50)",
        nullable: true,
      },
      senha_anm: {
        type: "varchar(50)",
        nullable: true,
      },
      login_hw: {
        type: "varchar(100)",
        nullable: true,
      },
      senha_hw: {
        type: "varchar(100)",
        nullable: true,
      },
      usa_smart: {
        type: "enum('S','N')",
        nullable: true,
      },
      id_pv_grupo_backup: {
        type: "int(11)",
        nullable: true,
      },
      cor_mapa: {
        type: "varchar(45)",
        nullable: true,
      },
      id_olt: {
        type: "varchar(100)",
        nullable: true,
      },
      autosave: {
        type: "varchar(30)",
        nullable: true,
      },
      id_servidor_unms: {
        type: "int(11)",
        nullable: true,
      },
      id_olt_unms: {
        type: "varchar(200)",
        nullable: true,
      },
      id_prov_snmp: {
        type: "int(11)",
        nullable: true,
      },
      id_olt_conscius: {
        type: "int(11)",
        nullable: true,
      },
      perfil_fibra_padrao: {
        type: "int(11)",
        nullable: true,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_olt_externo: {
        type: "int(11)",
        nullable: true,
      },
      usa_vpn: {
        type: "tinyint(1)",
        nullable: false,
      },
      id_padrao_cores: {
        type: "int(11)",
        nullable: true,
      },
      busca_potencia: {
        type: "enum('S','N')",
        nullable: false,
      },
      operador_neutro: {
        type: "int(10) unsigned",
        nullable: true,
      },
      perfil_neutro_bridge: {
        type: "int(10) unsigned",
        nullable: true,
      },
      perfil_neutro_router: {
        type: "int(10) unsigned",
        nullable: true,
      },
      timeout: {
        type: "smallint(5) unsigned",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "id_pop",
        nonUnique: "1",
        position: "1",
        columnName: "id_pop",
        type: "BTREE",
      },
      {
        name: "id_pv_grupo_backup",
        nonUnique: "1",
        position: "1",
        columnName: "id_pv_grupo_backup",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "radpop_radio_ibfk_1",
        columnName: "id_pop",
        referencedTable: "radpop",
        referencedColumn: "id",
      },
    ],
  },
  radpop_radio_cliente_fibra: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      id_transmissor: {
        type: "int(11)",
        nullable: false,
      },
      ponid: {
        type: "varchar(30)",
        nullable: true,
      },
      nome: {
        type: "varchar(100)",
        nullable: true,
      },
      onu_tipo: {
        type: "varchar(50)",
        nullable: true,
      },
      tipo_autenticacao: {
        type: "varchar(50)",
        nullable: true,
      },
      mac: {
        type: "varchar(50)",
        nullable: false,
      },
      versao: {
        type: "varchar(50)",
        nullable: true,
      },
      id_perfil: {
        type: "int(11)",
        nullable: true,
      },
      id_login: {
        type: "int(11)",
        nullable: true,
      },
      comandos: {
        type: "text",
        nullable: true,
      },
      vlan: {
        type: "int(11)",
        nullable: true,
      },
      slotno: {
        type: "int(11)",
        nullable: true,
      },
      ponno: {
        type: "int(11)",
        nullable: true,
      },
      onu_numero: {
        type: "int(11)",
        nullable: true,
      },
      sinal_rx: {
        type: "decimal(5,2)",
        nullable: true,
      },
      sinal_tx: {
        type: "decimal(5,2)",
        nullable: true,
      },
      data_sinal: {
        type: "datetime",
        nullable: true,
      },
      temperatura: {
        type: "decimal(5,2)",
        nullable: true,
      },
      voltagem: {
        type: "decimal(5,2)",
        nullable: true,
      },
      id_caixa_ftth: {
        type: "int(11)",
        nullable: true,
      },
      service_port: {
        type: "varchar(20)",
        nullable: true,
      },
      id_projeto: {
        type: "int(11)",
        nullable: true,
      },
      id_contrato: {
        type: "int(11)",
        nullable: true,
      },
      gemport: {
        type: "varchar(8)",
        nullable: true,
      },
      ip_gerencia: {
        type: "varchar(20)",
        nullable: true,
      },
      login_onu_cliente: {
        type: "varchar(30)",
        nullable: true,
      },
      senha_onu_cliente: {
        type: "varchar(30)",
        nullable: true,
      },
      porta_telnet_onu_cliente: {
        type: "varchar(10)",
        nullable: true,
      },
      perfil_onu_cliente: {
        type: "int(11)",
        nullable: true,
      },
      script_onu_cliente: {
        type: "text",
        nullable: true,
      },
      porta_ftth: {
        type: "int(11)",
        nullable: true,
      },
      senorid: {
        type: "varchar(4)",
        nullable: true,
      },
      latitude: {
        type: "varchar(50)",
        nullable: true,
      },
      longitude: {
        type: "varchar(50)",
        nullable: true,
      },
      endereco_padrao_cliente: {
        type: "enum('S','N')",
        nullable: true,
      },
      id_condominio: {
        type: "int(11)",
        nullable: true,
      },
      bloco: {
        type: "varchar(100)",
        nullable: true,
      },
      apartamento: {
        type: "int(11)",
        nullable: true,
      },
      cep: {
        type: "varchar(20)",
        nullable: true,
      },
      endereco: {
        type: "varchar(200)",
        nullable: true,
      },
      numero: {
        type: "varchar(20)",
        nullable: true,
      },
      bairro: {
        type: "varchar(100)",
        nullable: true,
      },
      cidade: {
        type: "int(11)",
        nullable: true,
      },
      referencia: {
        type: "varchar(200)",
        nullable: true,
      },
      complemento: {
        type: "varchar(200)",
        nullable: true,
      },
      distancia_onu: {
        type: "varchar(50)",
        nullable: true,
      },
      vlan_pppoe: {
        type: "varchar(20)",
        nullable: true,
      },
      vlan_dhcp: {
        type: "varchar(20)",
        nullable: true,
      },
      vlan_tr69: {
        type: "varchar(20)",
        nullable: true,
      },
      vlan_voip: {
        type: "varchar(20)",
        nullable: true,
      },
      vlan_iptv: {
        type: "varchar(20)",
        nullable: true,
      },
      vlan_outros: {
        type: "varchar(20)",
        nullable: true,
      },
      id_ramal: {
        type: "int(11)",
        nullable: true,
      },
      id_onu_unms: {
        type: "varchar(200)",
        nullable: true,
      },
      id_hardware: {
        type: "int(11)",
        nullable: true,
      },
      serial_number: {
        type: "varchar(100)",
        nullable: true,
      },
      id_activity: {
        type: "int(11)",
        nullable: true,
      },
      radpop_estrutura: {
        type: "enum('S','N')",
        nullable: false,
      },
      causa_ultima_queda: {
        type: "varchar(30)",
        nullable: true,
      },
      porta_web_onu_cliente: {
        type: "int(11)",
        nullable: true,
      },
      onu_compartilhada: {
        type: "enum('S','N')",
        nullable: false,
      },
      rack: {
        type: "tinyint(3) unsigned",
        nullable: true,
      },
      frame: {
        type: "tinyint(3) unsigned",
        nullable: true,
      },
      onu_rede_neutra: {
        type: "enum('S','N')",
        nullable: false,
      },
      tipo_operacao: {
        type: "enum('B','R')",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: false,
      },
      status_potencia: {
        type: "enum('regular','irregular','indefinido')",
        nullable: false,
      },
      valores_antigos: {
        type: "text",
        nullable: true,
      },
      status_autorizado: {
        type: "enum('NA','A')",
        nullable: true,
      },
      id_radpop_radio_porta: {
        type: "int(10) unsigned",
        nullable: true,
      },
      usuario_pppoe_hub: {
        type: "varchar(255)",
        nullable: true,
      },
      senha_pppoe_hub: {
        type: "varchar(255)",
        nullable: true,
      },
      posicao_inconsistente: {
        type: "enum('N','S')",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "id_caixa_ftth",
        nonUnique: "1",
        position: "1",
        columnName: "id_caixa_ftth",
        type: "BTREE",
      },
      {
        name: "id_contrato",
        nonUnique: "1",
        position: "1",
        columnName: "id_contrato",
        type: "BTREE",
      },
      {
        name: "id_login",
        nonUnique: "1",
        position: "1",
        columnName: "id_login",
        type: "BTREE",
      },
      {
        name: "id_perfil",
        nonUnique: "1",
        position: "1",
        columnName: "id_perfil",
        type: "BTREE",
      },
      {
        name: "id_projeto",
        nonUnique: "1",
        position: "1",
        columnName: "id_projeto",
        type: "BTREE",
      },
      {
        name: "id_transmissor",
        nonUnique: "1",
        position: "1",
        columnName: "id_transmissor",
        type: "BTREE",
      },
      {
        name: "mac",
        nonUnique: "1",
        position: "1",
        columnName: "mac",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  radpop_radio_cliente_fibra_perfil: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      nome: {
        type: "varchar(100)",
        nullable: false,
      },
      comando: {
        type: "text",
        nullable: false,
      },
      fabricante_modelo: {
        type: "varchar(25)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  radpop_radio_porta: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      interface: {
        type: "varchar(100)",
        nullable: false,
      },
      ssid: {
        type: "varchar(100)",
        nullable: true,
      },
      id_pop_radio: {
        type: "int(11)",
        nullable: false,
      },
      canal: {
        type: "varchar(30)",
        nullable: true,
      },
      sinal: {
        type: "varchar(30)",
        nullable: true,
      },
      rssi: {
        type: "varchar(30)",
        nullable: true,
      },
      noise: {
        type: "varchar(30)",
        nullable: true,
      },
      chwidth: {
        type: "varchar(30)",
        nullable: true,
      },
      distancia: {
        type: "varchar(30)",
        nullable: true,
      },
      codigo_do_pais: {
        type: "varchar(30)",
        nullable: true,
      },
      wds: {
        type: "varchar(30)",
        nullable: true,
      },
      uptime: {
        type: "varchar(30)",
        nullable: true,
      },
      mode: {
        type: "varchar(30)",
        nullable: true,
      },
      mac: {
        type: "varchar(30)",
        nullable: true,
      },
      dfs: {
        type: "varchar(30)",
        nullable: true,
      },
      ack: {
        type: "varchar(30)",
        nullable: true,
      },
      ccq: {
        type: "varchar(30)",
        nullable: true,
      },
      txrate: {
        type: "varchar(30)",
        nullable: true,
      },
      rxrate: {
        type: "varchar(30)",
        nullable: true,
      },
      security: {
        type: "varchar(30)",
        nullable: true,
      },
      speed_lan: {
        type: "varchar(30)",
        nullable: true,
      },
      speed_wlan: {
        type: "varchar(30)",
        nullable: true,
      },
      chains: {
        type: "varchar(30)",
        nullable: true,
      },
      wpa: {
        type: "varchar(30)",
        nullable: true,
      },
      pais: {
        type: "varchar(50)",
        nullable: true,
      },
      frequency: {
        type: "varchar(50)",
        nullable: true,
      },
      band: {
        type: "varchar(50)",
        nullable: true,
      },
      conexao: {
        type: "enum('58','24','C','F')",
        nullable: true,
      },
      mtu: {
        type: "int(11)",
        nullable: true,
      },
      interface_type: {
        type: "varchar(50)",
        nullable: true,
      },
      radio_name: {
        type: "varchar(50)",
        nullable: true,
      },
      wireless_protocol: {
        type: "varchar(50)",
        nullable: true,
      },
      data: {
        type: "datetime",
        nullable: true,
      },
      conexoes_ultima: {
        type: "int(11)",
        nullable: true,
      },
      vlan_uplink: {
        type: "int(11)",
        nullable: true,
      },
      id_slot: {
        type: "int(11)",
        nullable: true,
      },
      potencia_pon: {
        type: "double(5,2)",
        nullable: true,
      },
      numero_pon: {
        type: "int(11)",
        nullable: true,
      },
      vlan_pppoe: {
        type: "varchar(20)",
        nullable: true,
      },
      vlan_dhcp: {
        type: "varchar(20)",
        nullable: true,
      },
      vlan_tr69: {
        type: "varchar(20)",
        nullable: true,
      },
      vlan_voip: {
        type: "varchar(20)",
        nullable: true,
      },
      vlan_iptv: {
        type: "varchar(20)",
        nullable: true,
      },
      vlan_outros: {
        type: "varchar(20)",
        nullable: true,
      },
      descricao: {
        type: "varchar(50)",
        nullable: true,
      },
      potencia_limite: {
        type: "varchar(6)",
        nullable: true,
      },
      quantidade_onus: {
        type: "smallint(5) unsigned",
        nullable: true,
      },
      quantidade_onus_autorizadas: {
        type: "int(10) unsigned",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "id_pop_radio",
        nonUnique: "1",
        position: "1",
        columnName: "id_pop_radio",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  radpop_olt_slot: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      descricao: {
        type: "varchar(100)",
        nullable: true,
      },
      numero_slot: {
        type: "int(11)",
        nullable: false,
      },
      portas: {
        type: "int(11)",
        nullable: false,
      },
      id_transmissor: {
        type: "int(11)",
        nullable: false,
      },
    },
    indexes: [
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  rad_hardware: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      hardware: {
        type: "varchar(100)",
        nullable: false,
      },
      tipo: {
        type: "enum('R','F')",
        nullable: false,
      },
      obs: {
        type: "varchar(200)",
        nullable: true,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: true,
      },
      script: {
        type: "longtext",
        nullable: true,
      },
      porta_ssh: {
        type: "int(11)",
        nullable: true,
      },
      porta_telnet: {
        type: "int(11)",
        nullable: true,
      },
      login: {
        type: "varchar(100)",
        nullable: true,
      },
      fabricante: {
        type: "varchar(100)",
        nullable: true,
      },
      qtd_portas: {
        type: "int(20)",
        nullable: true,
      },
      imagem: {
        type: "varchar(500)",
        nullable: true,
      },
      hardware_tipo: {
        type: "varchar(50)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  df_projeto: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      nome: {
        type: "varchar(100)",
        nullable: false,
      },
      latitude: {
        type: "varchar(45)",
        nullable: false,
      },
      longitude: {
        type: "varchar(45)",
        nullable: false,
      },
      zoom: {
        type: "int(11)",
        nullable: false,
      },
      status: {
        type: "enum('A','I')",
        nullable: false,
      },
      id_filial: {
        type: "int(11)",
        nullable: true,
      },
      cor_mapa: {
        type: "varchar(45)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  radacct: {
    primaryKey: ["radacctid"],
    columns: {
      radacctid: {
        type: "bigint(21)",
        nullable: false,
      },
      acctsessionid: {
        type: "varchar(64)",
        nullable: false,
      },
      acctuniqueid: {
        type: "varchar(32)",
        nullable: false,
      },
      username: {
        type: "varchar(64)",
        nullable: false,
      },
      groupname: {
        type: "varchar(64)",
        nullable: true,
      },
      realm: {
        type: "varchar(64)",
        nullable: true,
      },
      nasipaddress: {
        type: "varchar(50)",
        nullable: false,
      },
      nasportid: {
        type: "varchar(100)",
        nullable: true,
      },
      nasporttype: {
        type: "varchar(32)",
        nullable: true,
      },
      acctstarttime: {
        type: "datetime",
        nullable: true,
      },
      acctstoptime: {
        type: "datetime",
        nullable: true,
      },
      acctsessiontime: {
        type: "int(12)",
        nullable: true,
      },
      acctauthentic: {
        type: "varchar(32)",
        nullable: true,
      },
      connectinfo_start: {
        type: "varchar(50)",
        nullable: true,
      },
      connectinfo_stop: {
        type: "varchar(50)",
        nullable: true,
      },
      acctinputoctets: {
        type: "bigint(20)",
        nullable: true,
      },
      acctoutputoctets: {
        type: "bigint(20)",
        nullable: true,
      },
      calledstationid: {
        type: "varchar(50)",
        nullable: false,
      },
      callingstationid: {
        type: "varchar(50)",
        nullable: false,
      },
      acctterminatecause: {
        type: "varchar(32)",
        nullable: false,
      },
      servicetype: {
        type: "varchar(32)",
        nullable: true,
      },
      framedprotocol: {
        type: "varchar(32)",
        nullable: true,
      },
      framedipaddress: {
        type: "varchar(15)",
        nullable: false,
      },
      acctstartdelay: {
        type: "int(12)",
        nullable: true,
      },
      acctstopdelay: {
        type: "int(12)",
        nullable: true,
      },
      xascendsessionsvrkey: {
        type: "varchar(10)",
        nullable: true,
      },
      cliente: {
        type: "bigint(20)",
        nullable: true,
      },
      acctupdatetime: {
        type: "datetime",
        nullable: true,
      },
      acctinterval: {
        type: "int(12)",
        nullable: true,
      },
      framedipv6prefix: {
        type: "varchar(43)",
        nullable: true,
      },
      delegatedipv6prefix: {
        type: "varchar(40)",
        nullable: true,
      },
      nasipv6address: {
        type: "varchar(50)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "acctsessionid",
        nonUnique: "1",
        position: "1",
        columnName: "acctsessionid",
        type: "BTREE",
      },
      {
        name: "acctstarttime",
        nonUnique: "1",
        position: "1",
        columnName: "acctstarttime",
        type: "BTREE",
      },
      {
        name: "acctstoptime",
        nonUnique: "1",
        position: "1",
        columnName: "acctstoptime",
        type: "BTREE",
      },
      {
        name: "acctuniqueid",
        nonUnique: "1",
        position: "1",
        columnName: "acctuniqueid",
        type: "BTREE",
      },
      {
        name: "acctuniqueid_key",
        nonUnique: "0",
        position: "1",
        columnName: "acctuniqueid",
        type: "BTREE",
      },
      {
        name: "framedipaddress",
        nonUnique: "1",
        position: "1",
        columnName: "framedipaddress",
        type: "BTREE",
      },
      {
        name: "nasipaddress",
        nonUnique: "1",
        position: "1",
        columnName: "nasipaddress",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "radacctid",
        type: "BTREE",
      },
      {
        name: "username",
        nonUnique: "1",
        position: "1",
        columnName: "username",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  radusuarios_consumo_m: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      id_login: {
        type: "int(11)",
        nullable: true,
      },
      consumo: {
        type: "bigint(15)",
        nullable: true,
      },
      data: {
        type: "datetime",
        nullable: true,
      },
      consumo_upload: {
        type: "bigint(15)",
        nullable: true,
      },
      maior_id_consumo: {
        type: "bigint(20)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "data",
        nonUnique: "1",
        position: "1",
        columnName: "data",
        type: "BTREE",
      },
      {
        name: "id_login",
        nonUnique: "1",
        position: "1",
        columnName: "id_login",
        type: "BTREE",
      },
      {
        name: "maior_id_consumo",
        nonUnique: "1",
        position: "1",
        columnName: "maior_id_consumo",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "radusuarios_consumo_m_ibfk_1",
        columnName: "id_login",
        referencedTable: "radusuarios",
        referencedColumn: "id",
      },
    ],
  },
  su_ticket: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      id_ticket_status: {
        type: "int(11)",
        nullable: true,
      },
      id_usuarios: {
        type: "int(11)",
        nullable: true,
      },
      titulo: {
        type: "varchar(200)",
        nullable: false,
      },
      data_criacao: {
        type: "datetime",
        nullable: true,
      },
      data_ultima_alteracao: {
        type: "datetime",
        nullable: false,
      },
      prioridade: {
        type: "enum('B','M','A','C')",
        nullable: false,
      },
      id_ticket_origem: {
        type: "enum('I','H','A')",
        nullable: true,
      },
      id_ticket_setor: {
        type: "int(11)",
        nullable: false,
      },
      menssagem: {
        type: "longtext",
        nullable: false,
      },
      id_cliente: {
        type: "int(11)",
        nullable: false,
      },
      status: {
        type: "enum('T','C','F','EX','OSAB','OSAG','OSEX')",
        nullable: false,
      },
      protocolo: {
        type: "varchar(50)",
        nullable: true,
      },
      mensagens_nao_lida_cli: {
        type: "int(11)",
        nullable: false,
      },
      mensagens_nao_lida_sup: {
        type: "int(11)",
        nullable: false,
      },
      token: {
        type: "varchar(64)",
        nullable: true,
      },
      data_hora_os_aberta: {
        type: "datetime",
        nullable: true,
      },
      data_hora_os_execucao: {
        type: "datetime",
        nullable: true,
      },
      data_hora_execucao: {
        type: "datetime",
        nullable: true,
      },
      data_hora_os_encaminhada: {
        type: "datetime",
        nullable: true,
      },
      id_wfl_processo: {
        type: "int(11)",
        nullable: true,
      },
      id_assunto: {
        type: "int(11)",
        nullable: true,
      },
      id_resposta: {
        type: "int(11)",
        nullable: true,
      },
      latitude: {
        type: "varchar(50)",
        nullable: true,
      },
      longitude: {
        type: "varchar(50)",
        nullable: true,
      },
      id_login: {
        type: "int(11)",
        nullable: true,
      },
      endereco: {
        type: "varchar(150)",
        nullable: true,
      },
      origem_endereco: {
        type: "enum('C','L','CC','M')",
        nullable: true,
      },
      id_contrato: {
        type: "int(11)",
        nullable: true,
      },
      id_circuito: {
        type: "int(11)",
        nullable: true,
      },
      id_su_diagnostico: {
        type: "int(11)",
        nullable: true,
      },
      status_sla: {
        type: "char(1)",
        nullable: true,
      },
      id_filial: {
        type: "int(11)",
        nullable: true,
      },
      id_responsavel_tecnico: {
        type: "int(11)",
        nullable: true,
      },
      su_status: {
        type: "enum('N','P','EP','S','C')",
        nullable: false,
      },
      interacao_pendente: {
        type: "enum('E','I','N','A')",
        nullable: false,
      },
      id_evento_status_processo: {
        type: "int(11)",
        nullable: false,
      },
      melhor_horario_agenda: {
        type: "enum('M','T','N','Q')",
        nullable: true,
      },
      data_reservada: {
        type: "date",
        nullable: true,
      },
      melhor_horario_reserva: {
        type: "enum('M','T','N','Q')",
        nullable: true,
      },
      origem_cadastro: {
        type: "enum('P','SV')",
        nullable: false,
      },
      id_canal_atendimento: {
        type: "int(11)",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: false,
      },
      tipo: {
        type: "enum('C','E')",
        nullable: true,
      },
      id_estrutura: {
        type: "int(11)",
        nullable: true,
      },
      origem_endereco_estrutura: {
        type: "enum('E','M')",
        nullable: true,
      },
      id_usuario_abertura: {
        type: "int(50) unsigned",
        nullable: true,
      },
      updated_user: {
        type: "int(50) unsigned",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "data_reservada",
        nonUnique: "1",
        position: "1",
        columnName: "data_reservada",
        type: "BTREE",
      },
      {
        name: "id_assunto",
        nonUnique: "1",
        position: "1",
        columnName: "id_assunto",
        type: "BTREE",
      },
      {
        name: "id_circuito",
        nonUnique: "1",
        position: "1",
        columnName: "id_circuito",
        type: "BTREE",
      },
      {
        name: "id_cliente",
        nonUnique: "1",
        position: "1",
        columnName: "id_cliente",
        type: "BTREE",
      },
      {
        name: "id_contrato",
        nonUnique: "1",
        position: "1",
        columnName: "id_contrato",
        type: "BTREE",
      },
      {
        name: "id_estrutura",
        nonUnique: "1",
        position: "1",
        columnName: "id_estrutura",
        type: "BTREE",
      },
      {
        name: "id_login",
        nonUnique: "1",
        position: "1",
        columnName: "id_login",
        type: "BTREE",
      },
      {
        name: "id_resposta",
        nonUnique: "1",
        position: "1",
        columnName: "id_resposta",
        type: "BTREE",
      },
      {
        name: "id_su_diagnostico",
        nonUnique: "1",
        position: "1",
        columnName: "id_su_diagnostico",
        type: "BTREE",
      },
      {
        name: "id_ticket_setor",
        nonUnique: "1",
        position: "1",
        columnName: "id_ticket_setor",
        type: "BTREE",
      },
      {
        name: "id_ticket_status",
        nonUnique: "1",
        position: "1",
        columnName: "id_ticket_status",
        type: "BTREE",
      },
      {
        name: "id_usuarios_2",
        nonUnique: "1",
        position: "1",
        columnName: "id_usuarios",
        type: "BTREE",
      },
      {
        name: "id_wfl_processo",
        nonUnique: "1",
        position: "1",
        columnName: "id_wfl_processo",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "protocolo",
        nonUnique: "1",
        position: "1",
        columnName: "protocolo",
        type: "BTREE",
      },
      {
        name: "ultima_atualizacao",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_atualizacao",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  su_oss_chamado: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      id_cliente: {
        type: "int(11)",
        nullable: true,
      },
      id_login: {
        type: "int(11)",
        nullable: true,
      },
      prioridade: {
        type: "enum('B','N','A','C')",
        nullable: false,
      },
      id_assunto: {
        type: "int(11)",
        nullable: false,
      },
      mensagem: {
        type: "text",
        nullable: true,
      },
      data_abertura: {
        type: "datetime",
        nullable: true,
      },
      data_agenda: {
        type: "datetime",
        nullable: true,
      },
      id_tecnico: {
        type: "int(11)",
        nullable: true,
      },
      mensagem_resposta: {
        type: "varchar(3500)",
        nullable: true,
      },
      status: {
        type: "enum('A','F','AN','EN','AS','AG','EX','RAG','DS')",
        nullable: false,
      },
      id_filial: {
        type: "int(11)",
        nullable: true,
      },
      id_atendente: {
        type: "varchar(150)",
        nullable: true,
      },
      data_fechamento: {
        type: "datetime",
        nullable: true,
      },
      setor: {
        type: "int(11)",
        nullable: true,
      },
      data_inicio: {
        type: "datetime",
        nullable: true,
      },
      protocolo: {
        type: "varchar(50)",
        nullable: true,
      },
      data_reabertura: {
        type: "datetime",
        nullable: true,
      },
      motivo_reabertura: {
        type: "varchar(500)",
        nullable: true,
      },
      id_usuario_reabertura: {
        type: "int(11)",
        nullable: true,
      },
      data_final: {
        type: "datetime",
        nullable: true,
      },
      impresso: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_ticket: {
        type: "int(11)",
        nullable: true,
      },
      id_cobranca: {
        type: "int(11)",
        nullable: true,
      },
      id_oss_chamado: {
        type: "int(11)",
        nullable: true,
      },
      data_hora_analise: {
        type: "datetime",
        nullable: true,
      },
      data_hora_encaminhado: {
        type: "datetime",
        nullable: true,
      },
      data_hora_assumido: {
        type: "datetime",
        nullable: true,
      },
      data_hora_execucao: {
        type: "datetime",
        nullable: true,
      },
      id_wfl_param_os: {
        type: "int(11)",
        nullable: true,
      },
      id_wfl_tarefa: {
        type: "int(11)",
        nullable: true,
      },
      valor_total: {
        type: "decimal(15,2)",
        nullable: true,
      },
      valor_outras_despesas: {
        type: "decimal(15,2)",
        nullable: true,
      },
      valor_total_comissao: {
        type: "decimal(10,2)",
        nullable: false,
      },
      id_contrato_kit: {
        type: "int(11)",
        nullable: true,
      },
      gera_comissao: {
        type: "enum('S','N')",
        nullable: false,
      },
      valor_unit_comissao: {
        type: "decimal(10,2)",
        nullable: false,
      },
      melhor_horario_agenda: {
        type: "enum('M','T','N','Q')",
        nullable: true,
      },
      idx: {
        type: "int(11)",
        nullable: true,
      },
      id_resposta: {
        type: "int(11)",
        nullable: true,
      },
      latitude: {
        type: "varchar(50)",
        nullable: true,
      },
      longitude: {
        type: "varchar(50)",
        nullable: true,
      },
      preview: {
        type: "text",
        nullable: true,
      },
      origem_endereco: {
        type: "enum('C','L','CC','M')",
        nullable: true,
      },
      endereco: {
        type: "varchar(150)",
        nullable: true,
      },
      justificativa_sla_atrasado: {
        type: "text",
        nullable: true,
      },
      id_receber: {
        type: "bigint(15)",
        nullable: true,
      },
      id_circuito: {
        type: "int(11)",
        nullable: true,
      },
      id_su_diagnostico: {
        type: "int(11)",
        nullable: true,
      },
      id_cidade: {
        type: "int(11)",
        nullable: true,
      },
      mostrar_os_sem_funcionario: {
        type: "enum('S','N')",
        nullable: true,
      },
      bairro: {
        type: "varchar(100)",
        nullable: true,
      },
      id_estrutura: {
        type: "int(11)",
        nullable: true,
      },
      tipo: {
        type: "enum('C','E')",
        nullable: false,
      },
      origem_endereco_estrutura: {
        type: "enum('E','M')",
        nullable: true,
      },
      liberado: {
        type: "int(11)",
        nullable: false,
      },
      data_agenda_final: {
        type: "datetime",
        nullable: true,
      },
      data_prazo_limite: {
        type: "datetime",
        nullable: true,
      },
      data_reservada: {
        type: "date",
        nullable: true,
      },
      data_reagendar: {
        type: "datetime",
        nullable: true,
      },
      data_prev_final: {
        type: "datetime",
        nullable: true,
      },
      origem_cadastro: {
        type: "enum('P','SV','M','CRM','CC')",
        nullable: false,
      },
      status_sla: {
        type: "varchar(1)",
        nullable: true,
      },
      complemento: {
        type: "varchar(100)",
        nullable: true,
      },
      referencia: {
        type: "varchar(100)",
        nullable: true,
      },
      bloco: {
        type: "varchar(100)",
        nullable: true,
      },
      apartamento: {
        type: "varchar(100)",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: false,
      },
      id_condominio: {
        type: "int(10) unsigned",
        nullable: true,
      },
      origem_finalizacao: {
        type: "enum('SM','IPM','IPW','API')",
        nullable: true,
      },
      notificacao_push_agrupada: {
        type: "enum('S','N')",
        nullable: false,
      },
      origem_os_aberta: {
        type: "enum('M','P','CRM','CC')",
        nullable: true,
      },
      habilita_assinatura_cliente: {
        type: "enum('S','N')",
        nullable: false,
      },
      status_assinatura: {
        type: "enum('A','F')",
        nullable: false,
      },
      status_pesquisa_satisfacao: {
        type: "int(11)",
        nullable: false,
      },
      id_kit_produto: {
        type: "int(50) unsigned",
        nullable: true,
      },
      id_kit_produto_wiz: {
        type: "int(50) unsigned",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "id_assunto",
        nonUnique: "1",
        position: "1",
        columnName: "id_assunto",
        type: "BTREE",
      },
      {
        name: "id_atendente",
        nonUnique: "1",
        position: "1",
        columnName: "id_atendente",
        type: "BTREE",
      },
      {
        name: "id_cidade",
        nonUnique: "1",
        position: "1",
        columnName: "id_cidade",
        type: "BTREE",
      },
      {
        name: "id_cliente_2",
        nonUnique: "1",
        position: "1",
        columnName: "id_cliente",
        type: "BTREE",
      },
      {
        name: "id_cobranca",
        nonUnique: "1",
        position: "1",
        columnName: "id_cobranca",
        type: "BTREE",
      },
      {
        name: "id_contrato_kit",
        nonUnique: "1",
        position: "1",
        columnName: "id_contrato_kit",
        type: "BTREE",
      },
      {
        name: "id_estrutura",
        nonUnique: "1",
        position: "1",
        columnName: "id_estrutura",
        type: "BTREE",
      },
      {
        name: "id_filial",
        nonUnique: "1",
        position: "1",
        columnName: "id_filial",
        type: "BTREE",
      },
      {
        name: "id_login",
        nonUnique: "1",
        position: "1",
        columnName: "id_login",
        type: "BTREE",
      },
      {
        name: "id_su_diagnostico",
        nonUnique: "1",
        position: "1",
        columnName: "id_su_diagnostico",
        type: "BTREE",
      },
      {
        name: "id_tecnico",
        nonUnique: "1",
        position: "1",
        columnName: "id_tecnico",
        type: "BTREE",
      },
      {
        name: "id_ticket",
        nonUnique: "1",
        position: "1",
        columnName: "id_ticket",
        type: "BTREE",
      },
      {
        name: "id_wfl_param_os",
        nonUnique: "1",
        position: "1",
        columnName: "id_wfl_param_os",
        type: "BTREE",
      },
      {
        name: "id_wfl_tarefa",
        nonUnique: "1",
        position: "1",
        columnName: "id_wfl_tarefa",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "protocolo",
        nonUnique: "1",
        position: "1",
        columnName: "protocolo",
        type: "BTREE",
      },
      {
        name: "status",
        nonUnique: "1",
        position: "1",
        columnName: "status",
        type: "BTREE",
      },
      {
        name: "ultima_atualizacao",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_atualizacao",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  su_oss_assunto: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      assunto: {
        type: "varchar(100)",
        nullable: false,
      },
      modelo_impressao: {
        type: "blob",
        nullable: false,
      },
      layout_impressao: {
        type: "int(11)",
        nullable: true,
      },
      id_tipo_doc_pedido: {
        type: "int(11)",
        nullable: true,
      },
      tipo_cobranca: {
        type: "enum('FAT','AM','GAR','NENHUM')",
        nullable: false,
      },
      id_oss_kit: {
        type: "int(11)",
        nullable: true,
      },
      cor_marcador: {
        type: "varchar(10)",
        nullable: true,
      },
      id_tipo_doc_servico: {
        type: "int(11)",
        nullable: true,
      },
      id_tipo_doc_comodato: {
        type: "int(11)",
        nullable: true,
      },
      valor_comissao: {
        type: "decimal(10,2)",
        nullable: false,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: false,
      },
      tipo_comissao: {
        type: "enum('F','H')",
        nullable: false,
      },
      permite_abrir_cliente_atraso: {
        type: "enum('S','N','P')",
        nullable: false,
      },
      numero_de_vias: {
        type: "int(11)",
        nullable: true,
      },
      finalidade: {
        type: "enum('OS','AT','AM')",
        nullable: false,
      },
      mostra_hotsite: {
        type: "enum('S','N')",
        nullable: false,
      },
      imprimir_produto: {
        type: "enum('S','N')",
        nullable: true,
      },
      imprimir_servico: {
        type: "enum('S','N')",
        nullable: true,
      },
      imprimir_prod_serv: {
        type: "enum('S','N')",
        nullable: true,
      },
      fat_somente_finalizada: {
        type: "enum('S','N')",
        nullable: false,
      },
      su_oss_modelo_impressao: {
        type: "int(11)",
        nullable: true,
      },
      modelo_email: {
        type: "int(6)",
        nullable: true,
      },
      meta_horas_abertura: {
        type: "decimal(9,1)",
        nullable: true,
      },
      meta_horas_agendamento: {
        type: "decimal(9,1)",
        nullable: true,
      },
      wiz_comodato: {
        type: "enum('M','E','O')",
        nullable: false,
      },
      wiz_produtos: {
        type: "enum('M','E','O')",
        nullable: false,
      },
      wiz_mensalidade: {
        type: "enum('M','E','O')",
        nullable: false,
      },
      wiz_localizacao: {
        type: "enum('M','E','O')",
        nullable: false,
      },
      wiz_arquivos: {
        type: "enum('M','E','O')",
        nullable: false,
      },
      wiz_assinatura: {
        type: "enum('M','E','O')",
        nullable: false,
      },
      id_cond_pag_produto: {
        type: "int(11)",
        nullable: true,
      },
      id_cond_pag_servico: {
        type: "int(11)",
        nullable: true,
      },
      sla_apenas_dias_uteis: {
        type: "enum('S','N','P')",
        nullable: false,
      },
      wiz_autorizar_ONU: {
        type: "enum('M','E')",
        nullable: true,
      },
      wiz_resumo_os: {
        type: "enum('M','E')",
        nullable: true,
      },
      tipo: {
        type: "enum('C','E','A')",
        nullable: true,
      },
      metas_horas_abertura_ticket: {
        type: "decimal(9,1)",
        nullable: false,
      },
      endereco_padrao: {
        type: "enum('C','L','CC','M','E')",
        nullable: true,
      },
      exige_fotos_finalizacao_os: {
        type: "enum('S','N')",
        nullable: false,
      },
      quantidade_fotos_finalizacao_os: {
        type: "int(11)",
        nullable: false,
      },
      diagnostico_obrigatorio_finalizacao_os: {
        type: "enum('S','N')",
        nullable: false,
      },
      horario_tempo_assunto: {
        type: "decimal(9,3)",
        nullable: false,
      },
      wiz_servico: {
        type: "enum('M','E')",
        nullable: false,
      },
      id_resposta_padrao: {
        type: "int(11)",
        nullable: true,
      },
      formato_endereco: {
        type: "varchar(200)",
        nullable: true,
      },
      card_data_reservada: {
        type: "enum('S','N')",
        nullable: true,
      },
      id_tipo_doc_patrimonio_venda: {
        type: "int(11)",
        nullable: true,
      },
      id_cond_pag_patrimonio_venda: {
        type: "int(11)",
        nullable: true,
      },
      validar_choque_horarios_agendamento_os: {
        type: "enum('S','N')",
        nullable: false,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: true,
      },
      localizacao_obrigatoria_cliente_finalizacao_os: {
        type: "enum('S','N')",
        nullable: false,
      },
      localizacao_obrigatoria_login_finalizacao_os: {
        type: "enum('S','N')",
        nullable: false,
      },
      msg_regiao_manutencao: {
        type: "text",
        nullable: true,
      },
      conta_limite_os_viab: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_vendedor_faturamento: {
        type: "int(11)",
        nullable: true,
      },
      obrigar_processo_atendimento: {
        type: "enum('S','N')",
        nullable: true,
      },
      id_processo: {
        type: "int(11)",
        nullable: true,
      },
      login_obrigatorio: {
        type: "enum('S','N')",
        nullable: false,
      },
      setor_su_oss_chamado: {
        type: "int(11)",
        nullable: true,
      },
      descricao: {
        type: "varchar(3500)",
        nullable: true,
      },
      wiz_dados_tecnicos: {
        type: "enum('M','E')",
        nullable: false,
      },
      equipe_obrigatoria_finalizacao_os: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_resposta_padrao_finalizacao: {
        type: "int(11)",
        nullable: true,
      },
      habilitar_mini_projeto: {
        type: "enum('S','N')",
        nullable: false,
      },
      wiz_assinatura_obrig: {
        type: "enum('S','N')",
        nullable: false,
      },
      mesclar_mini_projetos_ao_finalizar_os: {
        type: "enum('S','N')",
        nullable: false,
      },
      mostrar_no_service: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_checklist: {
        type: "int(11) unsigned",
        nullable: true,
      },
      wiz_service_mobile_adicionais: {
        type: "enum('M','E')",
        nullable: false,
      },
      wiz_service_mobile_onu: {
        type: "enum('M','E')",
        nullable: false,
      },
      wiz_service_mobile_loc: {
        type: "enum('M','E')",
        nullable: false,
      },
      wiz_service_mobile_anexos: {
        type: "enum('M','E')",
        nullable: false,
      },
      wiz_service_mobile_enviar_sms_deslocamento: {
        type: "enum('S','N','O')",
        nullable: false,
      },
      wiz_service_mobile_checklist: {
        type: "enum('M','E')",
        nullable: false,
      },
      service_mobile_max_parc_adic_serv: {
        type: "int(2) unsigned",
        nullable: false,
      },
      id_sms_deslocamento: {
        type: "int(10) unsigned",
        nullable: true,
      },
      integracao_assinatura_digital: {
        type: "enum('S','N')",
        nullable: true,
      },
      considerar_sla: {
        type: "enum('AB','AG')",
        nullable: false,
      },
      wiz_service_mobile_prod_imobilizados: {
        type: "enum('M','E')",
        nullable: false,
      },
      wiz_service_mobile_prod_outros: {
        type: "enum('M','E')",
        nullable: false,
      },
      wiz_service_mobile_config_dispositivo: {
        type: "enum('M','E')",
        nullable: false,
      },
      contrato_obrigatorio: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_msg_omnichannel_deslocamento: {
        type: "int(10) unsigned",
        nullable: true,
      },
      exige_comodato_finalizar_os: {
        type: "enum('S','N')",
        nullable: false,
      },
      quantidade_equipamentos: {
        type: "int(11)",
        nullable: true,
      },
      exige_produto_finalizar_os: {
        type: "enum('S','N')",
        nullable: false,
      },
      quantidade_produtos: {
        type: "int(11)",
        nullable: true,
      },
      conceder_desconto_login_regiao_manutencao: {
        type: "enum('S','N')",
        nullable: false,
      },
      mostrar_checklist_analise_risco: {
        type: "enum('i','F','N')",
        nullable: false,
      },
      id_questionario_analise_risco: {
        type: "int(10) unsigned",
        nullable: false,
      },
      id_questionario: {
        type: "int(10) unsigned",
        nullable: false,
      },
      obrigar_preenchimento_canal_atendimento: {
        type: "enum('S','N')",
        nullable: false,
      },
      obrigatorio_status_complementar: {
        type: "enum('S','N')",
        nullable: false,
      },
      habilita_assinatura_cliente: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_feedback: {
        type: "int(10) unsigned",
        nullable: false,
      },
      prioridade_padrao: {
        type: "enum('B','N','A','C')",
        nullable: false,
      },
      mov_kit_produto: {
        type: "enum('S','N')",
        nullable: false,
      },
    },
    indexes: [
      {
        name: "id_cond_pag_produto",
        nonUnique: "1",
        position: "1",
        columnName: "id_cond_pag_produto",
        type: "BTREE",
      },
      {
        name: "id_cond_pag_servico",
        nonUnique: "1",
        position: "1",
        columnName: "id_cond_pag_servico",
        type: "BTREE",
      },
      {
        name: "id_oss_kit",
        nonUnique: "1",
        position: "1",
        columnName: "id_oss_kit",
        type: "BTREE",
      },
      {
        name: "id_tipo_doc_comodato",
        nonUnique: "1",
        position: "1",
        columnName: "id_tipo_doc_comodato",
        type: "BTREE",
      },
      {
        name: "id_tipo_doc_pedido",
        nonUnique: "1",
        position: "1",
        columnName: "id_tipo_doc_pedido",
        type: "BTREE",
      },
      {
        name: "id_tipo_doc_servico",
        nonUnique: "1",
        position: "1",
        columnName: "id_tipo_doc_servico",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "ultima_atualizacao",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_atualizacao",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  su_oss_chamado_mensagem: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      id_chamado: {
        type: "int(11)",
        nullable: false,
      },
      mensagem: {
        type: "longtext",
        nullable: false,
      },
      id_operador: {
        type: "int(11)",
        nullable: false,
      },
      data: {
        type: "datetime",
        nullable: false,
      },
      status: {
        type: "enum('A','F','AN','EN','AS','AG','EX','RAG','DS')",
        nullable: false,
      },
      id_tecnico: {
        type: "int(11)",
        nullable: true,
      },
      id_evento: {
        type: "int(11)",
        nullable: false,
      },
      data_inicio: {
        type: "datetime",
        nullable: true,
      },
      data_final: {
        type: "datetime",
        nullable: true,
      },
      id_compromisso: {
        type: "int(11)",
        nullable: true,
      },
      tipo_cobranca: {
        type: "enum('FAT','AM','GAR','NENHUM')",
        nullable: true,
      },
      id_equipe: {
        type: "int(11)",
        nullable: true,
      },
      id_proxima_tarefa: {
        type: "int(11)",
        nullable: true,
      },
      finaliza_processo: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_resposta: {
        type: "int(11)",
        nullable: true,
      },
      latitude: {
        type: "varchar(45)",
        nullable: true,
      },
      longitude: {
        type: "varchar(45)",
        nullable: true,
      },
      id_su_diagnostico: {
        type: "int(11)",
        nullable: true,
      },
      id_evento_status: {
        type: "int(11)",
        nullable: true,
      },
      gps_time: {
        type: "datetime",
        nullable: true,
      },
      id_diagnostico_especifico: {
        type: "int(11)",
        nullable: true,
      },
      historico: {
        type: "varchar(200)",
        nullable: true,
      },
      gera_comissao: {
        type: "enum('S','N')",
        nullable: true,
      },
      origem_registro: {
        type: "enum('RM','RA','SW','IP')",
        nullable: false,
      },
    },
    indexes: [
      {
        name: "id_chamado",
        nonUnique: "1",
        position: "1",
        columnName: "id_chamado",
        type: "BTREE",
      },
      {
        name: "id_compromisso",
        nonUnique: "1",
        position: "1",
        columnName: "id_compromisso",
        type: "BTREE",
      },
      {
        name: "id_equipe",
        nonUnique: "1",
        position: "1",
        columnName: "id_equipe",
        type: "BTREE",
      },
      {
        name: "id_evento",
        nonUnique: "1",
        position: "1",
        columnName: "id_evento",
        type: "BTREE",
      },
      {
        name: "id_operador",
        nonUnique: "1",
        position: "1",
        columnName: "id_operador",
        type: "BTREE",
      },
      {
        name: "id_proxima_tarefa",
        nonUnique: "1",
        position: "1",
        columnName: "id_proxima_tarefa",
        type: "BTREE",
      },
      {
        name: "id_resposta",
        nonUnique: "1",
        position: "1",
        columnName: "id_resposta",
        type: "BTREE",
      },
      {
        name: "id_su_diagnostico",
        nonUnique: "1",
        position: "1",
        columnName: "id_su_diagnostico",
        type: "BTREE",
      },
      {
        name: "id_tecnico",
        nonUnique: "1",
        position: "1",
        columnName: "id_tecnico",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  su_oss_chamado_historico: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "bigint(20)",
        nullable: false,
      },
      su_oss_chamado_id: {
        type: "bigint(20)",
        nullable: false,
      },
      su_oss_chamado_tipo: {
        type: "enum('C','E')",
        nullable: false,
      },
      data_movimentacao: {
        type: "datetime",
        nullable: false,
      },
      operador_id: {
        type: "int(11)",
        nullable: true,
      },
      acao: {
        type: "enum('INSERCAO','EDICAO','EXCLUSAO','DEVOLUCAO_COMODATO','EMPRESTIMO_COMODATO','ALOCADO_IMOBILIZADO','DEVOLVIDO_IMOBILIZADO')",
        nullable: false,
      },
      tipo: {
        type: "enum('ENDERECO','ARQUIVO','SERVICO','PRODUTO','COMODATO','PATRIMONIO','ADICIONAL_MENSALIDADE','PRODUTO_IMOBILIZADO')",
        nullable: false,
      },
      descricao: {
        type: "text",
        nullable: true,
      },
      quantidade: {
        type: "decimal(15,9)",
        nullable: true,
      },
      valor_unitario: {
        type: "decimal(18,9)",
        nullable: true,
      },
      valor_total: {
        type: "decimal(15,2)",
        nullable: true,
      },
      patrimonio_id: {
        type: "int(11)",
        nullable: true,
      },
      patrimonio_numero: {
        type: "varchar(50)",
        nullable: true,
      },
      almoxarifado_id: {
        type: "int(11)",
        nullable: true,
      },
      mac: {
        type: "varchar(100)",
        nullable: true,
      },
      numero_serie: {
        type: "varchar(50)",
        nullable: true,
      },
      nome_arquivo: {
        type: "varchar(500)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  su_mensagens: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      mensagem: {
        type: "longtext",
        nullable: false,
      },
      id_ticket: {
        type: "int(11)",
        nullable: false,
      },
      operador: {
        type: "int(11)",
        nullable: false,
      },
      data: {
        type: "datetime",
        nullable: false,
      },
      titulo: {
        type: "varchar(200)",
        nullable: false,
      },
      status: {
        type: "enum('T','C','F','EX','OSAB','OSAG','OSEX')",
        nullable: false,
      },
      data_inicio: {
        type: "datetime",
        nullable: true,
      },
      data_final: {
        type: "datetime",
        nullable: true,
      },
      id_resposta: {
        type: "int(11)",
        nullable: true,
      },
      latitude: {
        type: "varchar(50)",
        nullable: true,
      },
      longitude: {
        type: "varchar(50)",
        nullable: true,
      },
      id_su_diagnostico: {
        type: "int(11)",
        nullable: true,
      },
      existe_pendencia_externa: {
        type: "int(11)",
        nullable: true,
      },
      id_evento_status: {
        type: "int(11)",
        nullable: true,
      },
      su_status: {
        type: "enum('N','P','EP','S','C')",
        nullable: true,
      },
      visibilidade_mensagens: {
        type: "enum('PU','PR','P')",
        nullable: false,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: false,
      },
      observacao: {
        type: "text",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "id_resposta",
        nonUnique: "1",
        position: "1",
        columnName: "id_resposta",
        type: "BTREE",
      },
      {
        name: "id_su_diagnostico",
        nonUnique: "1",
        position: "1",
        columnName: "id_su_diagnostico",
        type: "BTREE",
      },
      {
        name: "id_ticket",
        nonUnique: "1",
        position: "1",
        columnName: "id_ticket",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "ultima_atualizacao",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_atualizacao",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "su_mensagens_ibfk_1",
        columnName: "id_ticket",
        referencedTable: "su_ticket",
        referencedColumn: "id",
      },
    ],
  },
  su_evento_status: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      descricao: {
        type: "varchar(100)",
        nullable: false,
      },
    },
    indexes: [
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  su_oss_evento: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      descricao: {
        type: "varchar(100)",
        nullable: false,
      },
    },
    indexes: [
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  su_ticket_setor: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      setor: {
        type: "varchar(200)",
        nullable: false,
      },
      email: {
        type: "text",
        nullable: true,
      },
      presta_atendimento: {
        type: "enum('S','N')",
        nullable: false,
      },
      exige_vinculo_produto: {
        type: "enum('S','N')",
        nullable: false,
      },
      ordem: {
        type: "int(11)",
        nullable: true,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: false,
      },
      mostra_hotsite: {
        type: "enum('S','N')",
        nullable: false,
      },
    },
    indexes: [
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  su_diagnostico: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      descricao: {
        type: "varchar(150)",
        nullable: false,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_setor: {
        type: "int(11)",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: false,
      },
      id_diagnostico: {
        type: "int(11)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  usuarios: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      id_grupo: {
        type: "int(11)",
        nullable: false,
      },
      nome: {
        type: "varchar(150)",
        nullable: false,
      },
      email: {
        type: "varchar(200)",
        nullable: false,
      },
      senha: {
        type: "varchar(255)",
        nullable: false,
      },
      id_caixa: {
        type: "int(11)",
        nullable: true,
      },
      recebimentos_dia_atual: {
        type: "enum('S','N')",
        nullable: false,
      },
      lancamentos_dia_atual: {
        type: "enum('S','N')",
        nullable: false,
      },
      vendedor_padrao: {
        type: "int(11)",
        nullable: true,
      },
      funcionario: {
        type: "int(11)",
        nullable: true,
      },
      caixa_fn_receber: {
        type: "int(11)",
        nullable: true,
      },
      status: {
        type: "enum('A','I')",
        nullable: false,
      },
      filtra_setor: {
        type: "enum('S','N')",
        nullable: true,
      },
      filtra_funcionario: {
        type: "enum('S','N')",
        nullable: false,
      },
      desc_max_recebimento: {
        type: "decimal(5,2)",
        nullable: false,
      },
      desc_max_venda: {
        type: "decimal(5,2)",
        nullable: false,
      },
      token_push: {
        type: "varchar(180)",
        nullable: true,
      },
      crm_filtra_vendedor: {
        type: "enum('S','N')",
        nullable: false,
      },
      pagamentos_dia_atual: {
        type: "enum('S','N')",
        nullable: false,
      },
      enviar_monitoramento_host: {
        type: "enum('S','N')",
        nullable: true,
      },
      acesso_webservice: {
        type: "enum('S','N')",
        nullable: true,
      },
      qtde_liberacoes: {
        type: "int(11)",
        nullable: false,
      },
      tipo_alcada: {
        type: "enum('ADM','SUP','OP')",
        nullable: false,
      },
      mostrar_os_sem_funcionario: {
        type: "enum('S','N')",
        nullable: true,
      },
      enviar_notificacao_backup: {
        type: "enum('S','N')",
        nullable: true,
      },
      imagem: {
        type: "varchar(1024)",
        nullable: true,
      },
      callcenter: {
        type: "varchar(30)",
        nullable: true,
      },
      user_callcenter: {
        type: "enum('N','S')",
        nullable: false,
      },
      desc_max_renegociacao: {
        type: "decimal(5,2)",
        nullable: false,
      },
      inmap_filtra_vendedor: {
        type: "enum('S','N')",
        nullable: false,
      },
      permite_inutilizar_patrimonio: {
        type: "enum('S','N')",
        nullable: true,
      },
      alter_passwd_date: {
        type: "datetime",
        nullable: true,
      },
      permite_acesso_ixc_mobile: {
        type: "enum('S','N')",
        nullable: false,
      },
      token_inmapservice: {
        type: "varchar(163)",
        nullable: true,
      },
      helpmode_enabled: {
        type: "enum('S','N')",
        nullable: true,
      },
      language: {
        type: "enum('Pt-Br','En-Us','Es-Es')",
        nullable: false,
      },
      permite_ver_diferenca: {
        type: "enum('S','N')",
        nullable: false,
      },
      filtra_departamento_ticket: {
        type: "enum('S','N')",
        nullable: false,
      },
      filtra_funcionario_ticket: {
        type: "enum('S','N')",
        nullable: false,
      },
      mostrar_ticket_sem_funcionario: {
        type: "enum('S','N')",
        nullable: false,
      },
      template: {
        type: "enum('d','vg')",
        nullable: false,
      },
      administrador_kanban: {
        type: "enum('S','N')",
        nullable: true,
      },
      versao_fiberdocs: {
        type: "enum('O','N')",
        nullable: true,
      },
      filtrar_plano_venda_filial_contrato: {
        type: "varchar(1)",
        nullable: false,
      },
      scheme: {
        type: "varchar(255)",
        nullable: false,
      },
      token_webservice: {
        type: "mediumtext",
        nullable: true,
      },
      secret_code: {
        type: "varchar(300)",
        nullable: true,
      },
      secret_active: {
        type: "enum('S','N')",
        nullable: false,
      },
      secret_url: {
        type: "varchar(300)",
        nullable: false,
      },
      email_verified: {
        type: "tinyint(3) unsigned",
        nullable: false,
      },
      sms_verified: {
        type: "tinyint(3) unsigned",
        nullable: false,
      },
      token_verified: {
        type: "varchar(250)",
        nullable: true,
      },
      telefone: {
        type: "varchar(25)",
        nullable: true,
      },
      recovery_email: {
        type: "varchar(200)",
        nullable: true,
      },
      is_valid_tfa: {
        type: "tinyint(3) unsigned",
        nullable: false,
      },
      desc_parc_atraso: {
        type: "enum('N','S','P')",
        nullable: false,
      },
      finalizar_os_outro_setor: {
        type: "enum('S','N')",
        nullable: true,
      },
      desc_max_monetario: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      token_looker_generated_at: {
        type: "datetime",
        nullable: true,
      },
      permite_alterar_comunicacao_fn_apagar: {
        type: "enum('S','N')",
        nullable: true,
      },
      filtra_colaborador_quadro_kanban: {
        type: "enum('S','N')",
        nullable: false,
      },
      permitir_alterar_versao_chaves: {
        type: "enum('S','N')",
        nullable: true,
      },
      tipo_acesso: {
        type: "enum('A','M','W')",
        nullable: false,
      },
      mode_density: {
        type: "enum('S','C','R')",
        nullable: true,
      },
      workflow_click_count: {
        type: "int(11)",
        nullable: false,
      },
      timeline_click_count: {
        type: "int(11)",
        nullable: false,
      },
      email_validation_status: {
        type: "enum('P','V','E')",
        nullable: true,
      },
      recovery_email_forgot_password: {
        type: "varchar(200)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "caixa_fn_receber",
        nonUnique: "1",
        position: "1",
        columnName: "caixa_fn_receber",
        type: "BTREE",
      },
      {
        name: "funcionario",
        nonUnique: "1",
        position: "1",
        columnName: "funcionario",
        type: "BTREE",
      },
      {
        name: "id_caixa",
        nonUnique: "1",
        position: "1",
        columnName: "id_caixa",
        type: "BTREE",
      },
      {
        name: "id_grupo",
        nonUnique: "1",
        position: "1",
        columnName: "id_grupo",
        type: "BTREE",
      },
      {
        name: "nome",
        nonUnique: "1",
        position: "1",
        columnName: "nome",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "vendedor_padrao",
        nonUnique: "1",
        position: "1",
        columnName: "vendedor_padrao",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "usuarios_ibfk_1",
        columnName: "id_grupo",
        referencedTable: "usuarios_grupo",
        referencedColumn: "id",
      },
    ],
  },
  funcionarios: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      funcionario: {
        type: "varchar(100)",
        nullable: false,
      },
      id_funcao: {
        type: "int(11)",
        nullable: true,
      },
      id_conta: {
        type: "int(11)",
        nullable: true,
      },
      coeficiente: {
        type: "decimal(15,9)",
        nullable: true,
      },
      filial_id: {
        type: "int(11)",
        nullable: false,
      },
      fone_celular: {
        type: "varchar(20)",
        nullable: true,
      },
      email: {
        type: "varchar(120)",
        nullable: true,
      },
      envia_email_os: {
        type: "enum('S','N')",
        nullable: false,
      },
      envia_sms_os: {
        type: "enum('S','N')",
        nullable: false,
      },
      integracao_calendario: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_setor_padrao: {
        type: "int(11)",
        nullable: true,
      },
      endereco: {
        type: "varchar(200)",
        nullable: true,
      },
      cidade: {
        type: "int(11)",
        nullable: true,
      },
      numero: {
        type: "varchar(20)",
        nullable: true,
      },
      bairro: {
        type: "varchar(100)",
        nullable: true,
      },
      uf: {
        type: "int(11)",
        nullable: true,
      },
      cep: {
        type: "varchar(20)",
        nullable: true,
      },
      complemento: {
        type: "varchar(100)",
        nullable: true,
      },
      referencia: {
        type: "varchar(100)",
        nullable: true,
      },
      cpf_cnpj: {
        type: "varchar(30)",
        nullable: true,
      },
      ie_identidade: {
        type: "varchar(30)",
        nullable: true,
      },
      rg_orgao_emissor: {
        type: "char(20)",
        nullable: true,
      },
      nacionalidade: {
        type: "varchar(30)",
        nullable: true,
      },
      data_nascimento: {
        type: "date",
        nullable: true,
      },
      fone: {
        type: "varchar(20)",
        nullable: true,
      },
      telefone_comercial: {
        type: "varchar(20)",
        nullable: true,
      },
      assinatura_email: {
        type: "blob",
        nullable: true,
      },
      id_email_smtp: {
        type: "int(11)",
        nullable: true,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: true,
      },
      banco: {
        type: "varchar(11)",
        nullable: true,
      },
      agencia: {
        type: "varchar(100)",
        nullable: true,
      },
      numero_conta_dv: {
        type: "varchar(3)",
        nullable: true,
      },
      agencia_dv: {
        type: "varchar(3)",
        nullable: true,
      },
      conta: {
        type: "varchar(20)",
        nullable: true,
      },
      tipo_recebimento: {
        type: "enum('C','B','D')",
        nullable: true,
      },
      pipe_id_usuario: {
        type: "int(11)",
        nullable: true,
      },
      data_admissao: {
        type: "date",
        nullable: true,
      },
      data_demissao: {
        type: "date",
        nullable: true,
      },
      obs: {
        type: "text",
        nullable: true,
      },
      img_assinatura: {
        type: "varchar(255)",
        nullable: true,
      },
      ultima_latitude: {
        type: "varchar(45)",
        nullable: true,
      },
      ultima_longitude: {
        type: "varchar(45)",
        nullable: true,
      },
      percen_max_desc_areceber: {
        type: "decimal(15,2)",
        nullable: true,
      },
      ramal: {
        type: "int(11)",
        nullable: true,
      },
      envia_telegram_os: {
        type: "enum('S','N')",
        nullable: false,
      },
      telegram_chat_id_funcionario: {
        type: "varchar(200)",
        nullable: true,
      },
      id_chat_telegram_funcionario: {
        type: "int(11)",
        nullable: true,
      },
      cor_mapa: {
        type: "varchar(45)",
        nullable: true,
      },
      prj_custo_hora_base: {
        type: "decimal(15,2)",
        nullable: true,
      },
      prj_custo_hora_adicionais: {
        type: "decimal(15,2)",
        nullable: true,
      },
      camara_centralizadora: {
        type: "varchar(3)",
        nullable: true,
      },
      id_perfil_jornada_trabalho: {
        type: "int(11)",
        nullable: false,
      },
      nome_pai: {
        type: "varchar(120)",
        nullable: true,
      },
      nome_mae: {
        type: "varchar(120)",
        nullable: true,
      },
      estado_civil: {
        type: "enum('S','C','UE','D','V','SE')",
        nullable: false,
      },
      nome_conjuge: {
        type: "varchar(120)",
        nullable: true,
      },
      dependentes_ir: {
        type: "int(2)",
        nullable: true,
      },
      num_dependentes: {
        type: "int(2)",
        nullable: true,
      },
      cor_raca: {
        type: "enum('A','B','I','P','N','O')",
        nullable: false,
      },
      num_manequim: {
        type: "int(11)",
        nullable: true,
      },
      camiseta: {
        type: "enum('P','PP','M','G','GG','O')",
        nullable: false,
      },
      possui_deficiencia: {
        type: "enum('S','N')",
        nullable: false,
      },
      tipo_deficiencia: {
        type: "enum('F','A','V','M','MR')",
        nullable: true,
      },
      grau_escolaridade: {
        type: "enum('EF','EM','ES','PG','M','D')",
        nullable: true,
      },
      periodo_escolaridade: {
        type: "enum('M','V','N')",
        nullable: true,
      },
      estagio_escolaridade: {
        type: "enum('C','CR','I')",
        nullable: true,
      },
      fone_emergencia: {
        type: "varchar(20)",
        nullable: true,
      },
      falar_com: {
        type: "varchar(60)",
        nullable: true,
      },
      salario: {
        type: "decimal(15,2)",
        nullable: true,
      },
      cnh_categoria: {
        type: "set('A','B','C','D','E')",
        nullable: true,
      },
      cnh_numero: {
        type: "varchar(25)",
        nullable: true,
      },
      ctps_numero: {
        type: "varchar(25)",
        nullable: true,
      },
      ctps_serie: {
        type: "varchar(10)",
        nullable: true,
      },
      ctps_data_emissao: {
        type: "date",
        nullable: true,
      },
      ctps_cidade_emissao: {
        type: "int(11)",
        nullable: true,
      },
      titulo_numero: {
        type: "varchar(20)",
        nullable: true,
      },
      titulo_zona: {
        type: "varchar(5)",
        nullable: true,
      },
      titulo_secao: {
        type: "varchar(5)",
        nullable: true,
      },
      cnh_vencimento: {
        type: "date",
        nullable: true,
      },
      rg_conjuge: {
        type: "varchar(30)",
        nullable: true,
      },
      cpf_conjuge: {
        type: "varchar(30)",
        nullable: true,
      },
      pis_numero: {
        type: "varchar(20)",
        nullable: true,
      },
      pis_data: {
        type: "date",
        nullable: true,
      },
      rg_data_emissao: {
        type: "date",
        nullable: true,
      },
      dep_um_nome: {
        type: "varchar(120)",
        nullable: true,
      },
      dep_um_rg: {
        type: "varchar(20)",
        nullable: true,
      },
      dep_um_cpf: {
        type: "varchar(20)",
        nullable: true,
      },
      dep_dois_nome: {
        type: "varchar(120)",
        nullable: true,
      },
      dep_dois_rg: {
        type: "varchar(20)",
        nullable: true,
      },
      dep_dois_cpf: {
        type: "varchar(20)",
        nullable: true,
      },
      dep_tres_nome: {
        type: "varchar(120)",
        nullable: true,
      },
      dep_tres_rg: {
        type: "varchar(20)",
        nullable: true,
      },
      dep_tres_cpf: {
        type: "varchar(20)",
        nullable: true,
      },
      id_departamento: {
        type: "int(11)",
        nullable: true,
      },
      rastreador: {
        type: "varchar(50)",
        nullable: true,
      },
      last_location_update: {
        type: "timestamp",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: true,
      },
      id_conta_salario: {
        type: "int(11)",
        nullable: true,
      },
      cod_integracao_folha: {
        type: "int(11)",
        nullable: true,
      },
      gps_time: {
        type: "datetime",
        nullable: true,
      },
      ferias_colaborador: {
        type: "enum('S','N')",
        nullable: false,
      },
      exibir_colaborador_inmap: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_conta_decimo: {
        type: "int(10) unsigned",
        nullable: true,
      },
      chave_pix: {
        type: "varchar(120)",
        nullable: true,
      },
      tipo_chave_pix: {
        type: "enum('cpf_cnpj','celular','email','aleatoria','codigo_copia_cola')",
        nullable: true,
      },
      mostrar_no_quadro_kanban: {
        type: "enum('S','N')",
        nullable: false,
      },
      rastreador_tipo: {
        type: "enum('S','N')",
        nullable: false,
      },
      maximo_os_dia: {
        type: "int(10) unsigned",
        nullable: true,
      },
      vinculo_config_roteirizacao: {
        type: "enum('S','N')",
        nullable: false,
      },
      tipo_documento_identificacao_col: {
        type: "enum('11','12','13','21','22','31','41','42','47','50','91','CI','RUC','NUIT')",
        nullable: false,
      },
      id_centro_custo_rel_centro_custo_categoria: {
        type: "int(10) unsigned",
        nullable: true,
      },
      id_centro_custo_criterio_rateio: {
        type: "int(10) unsigned",
        nullable: true,
      },
      regra_centro_rateio: {
        type: "enum('CE','CR')",
        nullable: false,
      },
      ctps_seleciona: {
        type: "enum('S','N')",
        nullable: false,
      },
      cpf_seleciona: {
        type: "enum('S','N')",
        nullable: false,
      },
      pis_seleciona: {
        type: "enum('S','N')",
        nullable: false,
      },
      rg_seleciona: {
        type: "enum('S','N')",
        nullable: false,
      },
      cnh_seleciona: {
        type: "enum('S','N')",
        nullable: false,
      },
      titulo_eleitoral_seleciona: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_veiculo_padrao: {
        type: "int(10) unsigned",
        nullable: true,
      },
      obrigar_marcar_quilometragem: {
        type: "enum('S','N')",
        nullable: true,
      },
      id_centro_custo_categoria_filtro: {
        type: "int(10) unsigned",
        nullable: true,
      },
      usuario_id: {
        type: "int(10) unsigned",
        nullable: true,
      },
      notifica_monitoramento: {
        type: "enum('S','N')",
        nullable: false,
      },
    },
    indexes: [
      {
        name: "cidade",
        nonUnique: "1",
        position: "1",
        columnName: "cidade",
        type: "BTREE",
      },
      {
        name: "filial_id",
        nonUnique: "1",
        position: "1",
        columnName: "filial_id",
        type: "BTREE",
      },
      {
        name: "id_conta_salario",
        nonUnique: "1",
        position: "1",
        columnName: "id_conta_salario",
        type: "BTREE",
      },
      {
        name: "id_funcao",
        nonUnique: "1",
        position: "1",
        columnName: "id_funcao",
        type: "BTREE",
      },
      {
        name: "id_setor_padrao",
        nonUnique: "1",
        position: "1",
        columnName: "id_setor_padrao",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "funcionarios_ibfk_1",
        columnName: "filial_id",
        referencedTable: "filial",
        referencedColumn: "id",
      },
      {
        name: "funcionarios_ibfk_2",
        columnName: "cidade",
        referencedTable: "cidade",
        referencedColumn: "id",
      },
    ],
  },
  contato: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      id_contato_tipo: {
        type: "int(11)",
        nullable: true,
      },
      id_cliente: {
        type: "int(11)",
        nullable: true,
      },
      id_fornecedor: {
        type: "int(11)",
        nullable: true,
      },
      nome: {
        type: "varchar(200)",
        nullable: false,
      },
      fone_residencial: {
        type: "varchar(20)",
        nullable: true,
      },
      fone_comercial: {
        type: "varchar(20)",
        nullable: true,
      },
      fone_celular: {
        type: "varchar(20)",
        nullable: true,
      },
      email: {
        type: "varchar(100)",
        nullable: true,
      },
      pipe_id_pessoa: {
        type: "int(11)",
        nullable: true,
      },
      principal: {
        type: "enum('S','N')",
        nullable: true,
      },
      skype: {
        type: "varchar(100)",
        nullable: true,
      },
      facebook: {
        type: "varchar(250)",
        nullable: true,
      },
      website: {
        type: "varchar(250)",
        nullable: true,
      },
      email_atendimento: {
        type: "enum('S','N')",
        nullable: true,
      },
      senha: {
        type: "varchar(64)",
        nullable: true,
      },
      permissoes: {
        type: "varchar(1024)",
        nullable: true,
      },
      lid: {
        type: "enum('N','S')",
        nullable: true,
      },
      lead: {
        type: "enum('N','S')",
        nullable: true,
      },
      data: {
        type: "date",
        nullable: true,
      },
      id_responsavel: {
        type: "int(11)",
        nullable: true,
      },
      obs: {
        type: "text",
        nullable: true,
      },
      endereco: {
        type: "varchar(100)",
        nullable: true,
      },
      latitude: {
        type: "varchar(45)",
        nullable: true,
      },
      longitude: {
        type: "varchar(45)",
        nullable: true,
      },
      id_candidato_tipo: {
        type: "int(11)",
        nullable: true,
      },
      cnpj_cpf: {
        type: "varchar(30)",
        nullable: true,
      },
      cep: {
        type: "varchar(20)",
        nullable: true,
      },
      complemento: {
        type: "varchar(100)",
        nullable: true,
      },
      tipo_pessoa: {
        type: "enum('F','J','E')",
        nullable: true,
      },
      status_viabilidade: {
        type: "enum('S','N')",
        nullable: true,
      },
      bairro: {
        type: "varchar(100)",
        nullable: true,
      },
      cidade: {
        type: "int(11)",
        nullable: true,
      },
      uf: {
        type: "int(11)",
        nullable: true,
      },
      id_caixa_ftth: {
        type: "int(11)",
        nullable: true,
      },
      distancia_caixa_mais_proxima: {
        type: "varchar(45)",
        nullable: true,
      },
      data_cadastro: {
        type: "datetime",
        nullable: true,
      },
      referencia: {
        type: "varchar(100)",
        nullable: true,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: false,
      },
      cadastro_site: {
        type: "enum('S','N')",
        nullable: false,
      },
      velocidade_calculada: {
        type: "varchar(45)",
        nullable: true,
      },
      id_prospeccao: {
        type: "int(11)",
        nullable: true,
      },
      id_vd_contrato: {
        type: "int(11)",
        nullable: true,
      },
      id_tipo_elemento: {
        type: "int(11)",
        nullable: true,
      },
      razao: {
        type: "varchar(200)",
        nullable: true,
      },
      quantidade_pessoas_lead: {
        type: "int(11)",
        nullable: true,
      },
      quantidade_smart_lead: {
        type: "int(11)",
        nullable: true,
      },
      quantidade_celular_lead: {
        type: "int(11)",
        nullable: true,
      },
      quantidade_computador_lead: {
        type: "int(11)",
        nullable: true,
      },
      quantidade_console_lead: {
        type: "int(11)",
        nullable: true,
      },
      frequencia_pessoas_lead: {
        type: "varchar(100)",
        nullable: true,
      },
      frequencia_smart_lead: {
        type: "varchar(100)",
        nullable: true,
      },
      frequencia_celular_lead: {
        type: "varchar(100)",
        nullable: true,
      },
      frequencia_computador_lead: {
        type: "varchar(100)",
        nullable: true,
      },
      frequencia_console_lead: {
        type: "varchar(100)",
        nullable: true,
      },
      fone_whatsapp: {
        type: "varchar(20)",
        nullable: true,
      },
      data_nascimento: {
        type: "date",
        nullable: true,
      },
      numero: {
        type: "varchar(20)",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: true,
      },
      id_filial: {
        type: "int(11)",
        nullable: true,
      },
      alerta: {
        type: "text",
        nullable: true,
      },
      data_ult_verificacao_viab: {
        type: "date",
        nullable: true,
      },
      identificador: {
        type: "varchar(500)",
        nullable: true,
      },
      origem_medium: {
        type: "varchar(500)",
        nullable: true,
      },
      origem_campaing: {
        type: "varchar(500)",
        nullable: true,
      },
      origem_source: {
        type: "varchar(500)",
        nullable: true,
      },
      caixa_mais_proxima: {
        type: "int(11) unsigned",
        nullable: true,
      },
      moradia: {
        type: "enum('P','A')",
        nullable: true,
      },
      tipo_localidade: {
        type: "enum('R','U')",
        nullable: true,
      },
      operador_neutro: {
        type: "int(11) unsigned",
        nullable: true,
      },
      external_id: {
        type: "varchar(100)",
        nullable: true,
      },
      external_system: {
        type: "varchar(50)",
        nullable: true,
      },
      tipo_rede: {
        type: "enum('P','N','A')",
        nullable: true,
      },
      conversao_duplicada_marketing: {
        type: "int(11) unsigned",
        nullable: true,
      },
      indicado_por: {
        type: "int(11)",
        nullable: true,
      },
      id_campanha: {
        type: "int(10) unsigned",
        nullable: true,
      },
      id_concorrente: {
        type: "int(11)",
        nullable: true,
      },
      identificador_ultima_conversao: {
        type: "varchar(500)",
        nullable: true,
      },
      id_estagio: {
        type: "int(11)",
        nullable: true,
      },
      ordem_kanban: {
        type: "double",
        nullable: true,
      },
      id_estagio_anterior: {
        type: "int(11) unsigned",
        nullable: true,
      },
      tipo_documento_identificacao_col: {
        type: "enum('11','12','13','21','22','31','41','42','47','50','91','CI','RUC','NUIT')",
        nullable: false,
      },
      id_segmento: {
        type: "int(11) unsigned",
        nullable: false,
      },
      id_perfil: {
        type: "int(11) unsigned",
        nullable: true,
      },
      id_tipo_relacionamento_contato: {
        type: "int(11) unsigned",
        nullable: true,
      },
      ids_contratos_vinculados: {
        type: "varchar(300)",
        nullable: true,
      },
      vincular_contrato: {
        type: "enum('S','N')",
        nullable: true,
      },
      instagram: {
        type: "varchar(300)",
        nullable: true,
      },
      id_condominio: {
        type: "int(11) unsigned",
        nullable: true,
      },
      bloco: {
        type: "varchar(100)",
        nullable: true,
      },
      apartamento: {
        type: "varchar(11)",
        nullable: true,
      },
      origem: {
        type: "enum('outros','kanban','sales_mobile')",
        nullable: true,
      },
      id_importacao: {
        type: "int(11) unsigned",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "id_cliente",
        nonUnique: "1",
        position: "1",
        columnName: "id_cliente",
        type: "BTREE",
      },
      {
        name: "id_contato_tipo",
        nonUnique: "1",
        position: "1",
        columnName: "id_contato_tipo",
        type: "BTREE",
      },
      {
        name: "id_fornecedor",
        nonUnique: "1",
        position: "1",
        columnName: "id_fornecedor",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "ultima_atualizacao",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_atualizacao",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  movimento_comodatos: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      id_movimento_produtos: {
        type: "int(11)",
        nullable: true,
      },
      tipo: {
        type: "enum('E','S')",
        nullable: true,
      },
      id_produto: {
        type: "int(11)",
        nullable: true,
      },
      descricao: {
        type: "varchar(255)",
        nullable: true,
      },
      id_entrada: {
        type: "int(11)",
        nullable: true,
      },
      id_saida: {
        type: "int(11)",
        nullable: true,
      },
      id_cliente: {
        type: "int(11)",
        nullable: true,
      },
      id_contrato: {
        type: "int(11)",
        nullable: true,
      },
      id_filial: {
        type: "int(11)",
        nullable: true,
      },
      id_os: {
        type: "int(11)",
        nullable: true,
      },
      numero_nota: {
        type: "bigint(15) unsigned",
        nullable: true,
      },
      status_nota: {
        type: "enum('AG','F','A','C','D')",
        nullable: true,
      },
      tipo_documento: {
        type: "int(11)",
        nullable: true,
      },
      nota_emitida_em: {
        type: "date",
        nullable: true,
      },
      nota_emitida_por: {
        type: "int(11)",
        nullable: true,
      },
      nota_cancelada_em: {
        type: "date",
        nullable: true,
      },
      id_emprestimo: {
        type: "int(11)",
        nullable: true,
      },
      id_devolucao: {
        type: "int(11)",
        nullable: true,
      },
      filial_emissao: {
        type: "int(11) unsigned",
        nullable: true,
      },
      nf_complementar_comodato: {
        type: "varchar(5000)",
        nullable: true,
      },
      motivo_dispensa_nf: {
        type: "text",
        nullable: true,
      },
      realizado_envio_comprovante: {
        type: "enum('S','N')",
        nullable: false,
      },
    },
    indexes: [
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
    ],
    foreignKeys: [],
  },
  movimento_produtos: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      id_produto: {
        type: "int(11)",
        nullable: true,
      },
      valor_unitario: {
        type: "decimal(18,9)",
        nullable: false,
      },
      quantidade: {
        type: "decimal(15,9)",
        nullable: false,
      },
      valor_ipi: {
        type: "decimal(15,2)",
        nullable: true,
      },
      valor_icm: {
        type: "decimal(15,2)",
        nullable: true,
      },
      valor_total: {
        type: "decimal(15,2)",
        nullable: false,
      },
      id_entrada: {
        type: "int(11)",
        nullable: false,
      },
      id_unidade: {
        type: "int(11)",
        nullable: true,
      },
      id_pedido_compra: {
        type: "int(11)",
        nullable: false,
      },
      id_pedido_compra_itens: {
        type: "int(11)",
        nullable: false,
      },
      pdesconto: {
        type: "decimal(8,5)",
        nullable: false,
      },
      vdesconto: {
        type: "decimal(15,2)",
        nullable: false,
      },
      cfop: {
        type: "int(11)",
        nullable: true,
      },
      bicms: {
        type: "decimal(15,2)",
        nullable: true,
      },
      picms: {
        type: "decimal(5,2)",
        nullable: true,
      },
      bipi: {
        type: "decimal(15,2)",
        nullable: true,
      },
      pipi: {
        type: "decimal(5,2)",
        nullable: true,
      },
      custo: {
        type: "decimal(15,2)",
        nullable: false,
      },
      tipo: {
        type: "enum('E','S','I')",
        nullable: false,
      },
      id_saida: {
        type: "int(11)",
        nullable: false,
      },
      id_itens_pedido: {
        type: "int(11)",
        nullable: false,
      },
      qtde_saida: {
        type: "decimal(15,9)",
        nullable: true,
      },
      id_inventario: {
        type: "int(11)",
        nullable: true,
      },
      data: {
        type: "date",
        nullable: true,
      },
      id_baixa_lote: {
        type: "int(11)",
        nullable: true,
      },
      id_acabamento: {
        type: "int(11)",
        nullable: true,
      },
      descricao: {
        type: "varchar(200)",
        nullable: true,
      },
      estoque: {
        type: "enum('S','N','L')",
        nullable: true,
      },
      filial_id: {
        type: "int(11)",
        nullable: false,
      },
      volumes: {
        type: "int(11)",
        nullable: true,
      },
      pcomissao: {
        type: "decimal(5,2)",
        nullable: true,
      },
      fator_conversao: {
        type: "decimal(15,9)",
        nullable: true,
      },
      tipo_tributacao: {
        type: "enum('ICMS','ISSQN')",
        nullable: true,
      },
      icms_regime: {
        type: "enum('1','2')",
        nullable: true,
      },
      icms_sn_stributaria: {
        type: "varchar(3)",
        nullable: true,
      },
      icms_sn_origem: {
        type: "int(11)",
        nullable: true,
      },
      pis_situacao_tributaria: {
        type: "varchar(10)",
        nullable: true,
      },
      cofins_situacao_tributaria: {
        type: "varchar(10)",
        nullable: true,
      },
      iss_tributacao: {
        type: "varchar(2)",
        nullable: true,
      },
      iss_valor_base_calculo: {
        type: "decimal(15,2)",
        nullable: true,
      },
      iss_aliquota: {
        type: "decimal(5,4)",
        nullable: true,
      },
      iss_lista_servico: {
        type: "varchar(9)",
        nullable: true,
      },
      iss_uf: {
        type: "int(11)",
        nullable: true,
      },
      iss_municipio_ocorencia: {
        type: "varchar(10)",
        nullable: true,
      },
      iss_valor: {
        type: "decimal(15,5)",
        nullable: true,
      },
      ncm: {
        type: "varchar(50)",
        nullable: true,
      },
      ex_tipi: {
        type: "varchar(50)",
        nullable: true,
      },
      id_classificacao_tributaria: {
        type: "int(11)",
        nullable: true,
      },
      pesol: {
        type: "decimal(15,3)",
        nullable: true,
      },
      pesob: {
        type: "decimal(15,3)",
        nullable: true,
      },
      unidade_sigla: {
        type: "varchar(10)",
        nullable: true,
      },
      codigo_fornecedor: {
        type: "varchar(50)",
        nullable: true,
      },
      id_lote: {
        type: "int(11)",
        nullable: true,
      },
      bicms_st: {
        type: "decimal(15,2)",
        nullable: true,
      },
      valor_icms_st: {
        type: "decimal(15,2)",
        nullable: true,
      },
      valor_frete: {
        type: "decimal(15,2)",
        nullable: true,
      },
      picms_st: {
        type: "decimal(5,2)",
        nullable: true,
      },
      descricao_fornecedor: {
        type: "varchar(150)",
        nullable: true,
      },
      cst: {
        type: "varchar(10)",
        nullable: true,
      },
      status: {
        type: "enum('N','C')",
        nullable: true,
      },
      id_class_fiscal: {
        type: "int(11)",
        nullable: true,
      },
      icms_modBC: {
        type: "smallint(6)",
        nullable: true,
      },
      di_adicao: {
        type: "varchar(3)",
        nullable: true,
      },
      di_cod_fabricante: {
        type: "int(11)",
        nullable: true,
      },
      di_seqadicao: {
        type: "int(11)",
        nullable: true,
      },
      mp_pis_bc: {
        type: "decimal(15,2)",
        nullable: true,
      },
      mp_pis_alq: {
        type: "decimal(5,3)",
        nullable: true,
      },
      mp_pis_valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      mp_cofins_bc: {
        type: "decimal(15,2)",
        nullable: true,
      },
      mp_cofins_alq: {
        type: "decimal(5,3)",
        nullable: true,
      },
      mp_cofins_valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      mp_ii_alq: {
        type: "decimal(5,3)",
        nullable: true,
      },
      mp_ii_valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      mp_ii_bc: {
        type: "decimal(15,2)",
        nullable: true,
      },
      mp_ii_desp_aduaneira: {
        type: "decimal(15,2)",
        nullable: true,
      },
      mp_ii_iof: {
        type: "decimal(15,2)",
        nullable: true,
      },
      mp_ipi_sit_tributaria: {
        type: "varchar(3)",
        nullable: true,
      },
      mp_ipi_classe_enguadramento: {
        type: "varchar(50)",
        nullable: true,
      },
      mp_ipi_cnpj_produtor: {
        type: "varchar(30)",
        nullable: true,
      },
      mp_ipi_codigo_enquadramento: {
        type: "varchar(30)",
        nullable: true,
      },
      mp_ipi_codigo_selo_controle: {
        type: "varchar(100)",
        nullable: true,
      },
      mp_ipi_tipo_calculo: {
        type: "enum('P','V')",
        nullable: true,
      },
      old_itens_pedido: {
        type: "int(11)",
        nullable: true,
      },
      id_contrato: {
        type: "int(11)",
        nullable: true,
      },
      id_contrato_servicos: {
        type: "int(11)",
        nullable: true,
      },
      patrimonio: {
        type: "int(11)",
        nullable: true,
      },
      numero_serie: {
        type: "varchar(50)",
        nullable: true,
      },
      status_comodato: {
        type: "enum('E','D','B','A')",
        nullable: true,
      },
      id_devolucao: {
        type: "int(11)",
        nullable: true,
      },
      icms_modBCst: {
        type: "smallint(6)",
        nullable: true,
      },
      icms_pMVAST: {
        type: "decimal(10,2)",
        nullable: true,
      },
      id_oss_mensagem: {
        type: "int(11)",
        nullable: true,
      },
      id_su_oss_kit_equipamento: {
        type: "int(11)",
        nullable: true,
      },
      garantia_oss: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_terceiro_oss: {
        type: "int(11)",
        nullable: true,
      },
      tipo_produto: {
        type: "enum('C','S','F','M','P','O')",
        nullable: true,
      },
      id_oss_chamado: {
        type: "int(11)",
        nullable: true,
      },
      difal_vbcufdest: {
        type: "decimal(15,2)",
        nullable: true,
      },
      difal_pfcupfdest: {
        type: "decimal(15,2)",
        nullable: true,
      },
      difal_picmsufdest: {
        type: "decimal(15,2)",
        nullable: true,
      },
      difal_picmsinter: {
        type: "decimal(15,2)",
        nullable: true,
      },
      difal_picmsinterpart: {
        type: "decimal(15,2)",
        nullable: true,
      },
      difal_vfcpufdest: {
        type: "decimal(15,2)",
        nullable: true,
      },
      difal_vicmsufdest: {
        type: "decimal(15,2)",
        nullable: true,
      },
      difal_vicmsufremet: {
        type: "decimal(15,2)",
        nullable: true,
      },
      valor_outros: {
        type: "decimal(15,2)",
        nullable: true,
      },
      iss_aliquota_retido: {
        type: "decimal(5,4)",
        nullable: true,
      },
      iss_valor_retido: {
        type: "decimal(15,5)",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "datetime",
        nullable: true,
      },
      id_negociacao: {
        type: "int(11)",
        nullable: true,
      },
      id_almox: {
        type: "int(11)",
        nullable: false,
      },
      id_transf_almox: {
        type: "int(11)",
        nullable: true,
      },
      icms_predbc: {
        type: "decimal(10,3)",
        nullable: true,
      },
      id_transf_almox_item: {
        type: "int(11)",
        nullable: true,
      },
      id_moeda: {
        type: "int(11)",
        nullable: true,
      },
      qtde_pedido: {
        type: "decimal(15,9)",
        nullable: true,
      },
      id_requisacao_material_item: {
        type: "int(11)",
        nullable: true,
      },
      irrf_aliquota: {
        type: "decimal(3,2)",
        nullable: true,
      },
      irrf_valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      csll_aliquota: {
        type: "decimal(3,2)",
        nullable: true,
      },
      csll_valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      pis_retido_aliquota: {
        type: "decimal(3,2)",
        nullable: true,
      },
      pis_retido_valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      cofins_retido_aliquota: {
        type: "decimal(3,2)",
        nullable: true,
      },
      cofins_retido_valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      tributacao_digitada: {
        type: "enum('S','N')",
        nullable: false,
      },
      pacrescimo: {
        type: "decimal(8,5)",
        nullable: false,
      },
      vacrescimo: {
        type: "decimal(15,2)",
        nullable: false,
      },
      pdesconto_finan: {
        type: "decimal(5,2)",
        nullable: false,
      },
      vdesconto_finan: {
        type: "decimal(15,2)",
        nullable: false,
      },
      valor_isentas_icms: {
        type: "decimal(15,2)",
        nullable: true,
      },
      valor_outras_icms: {
        type: "decimal(15,2)",
        nullable: true,
      },
      id_ajuste_estoque: {
        type: "int(11)",
        nullable: true,
      },
      id_vd_contratos_produtos: {
        type: "int(11)",
        nullable: true,
      },
      id_cliente_contrato_servicos: {
        type: "int(11)",
        nullable: true,
      },
      tipo_fiscal_plano: {
        type: "enum('I','T','S','M','SVA','TV','SMP')",
        nullable: false,
      },
      id_estrutura: {
        type: "int(11)",
        nullable: true,
      },
      imobilizado: {
        type: "enum('S','N')",
        nullable: true,
      },
      id_patrimonio: {
        type: "int(11)",
        nullable: true,
      },
      descartado: {
        type: "enum('S','N')",
        nullable: true,
      },
      id_equipamento_tv: {
        type: "int(11)",
        nullable: true,
      },
      status_produto: {
        type: "int(11)",
        nullable: true,
      },
      v_fust: {
        type: "decimal(15,2)",
        nullable: true,
      },
      v_funttel: {
        type: "decimal(15,2)",
        nullable: true,
      },
      p_fust: {
        type: "decimal(3,2)",
        nullable: true,
      },
      p_funttel: {
        type: "decimal(3,2)",
        nullable: true,
      },
      historico: {
        type: "varchar(150)",
        nullable: true,
      },
      tipo_preenchimento_tributacao: {
        type: "enum('CM','CA','CX')",
        nullable: false,
      },
      numero_patrimonial: {
        type: "varchar(25)",
        nullable: true,
      },
      importando_dfe: {
        type: "enum('S','N')",
        nullable: false,
      },
      ultima_situacao_patrimonio: {
        type: "int(11)",
        nullable: true,
      },
      nfci: {
        type: "varchar(250)",
        nullable: true,
      },
      tipo_transferencia: {
        type: "enum('AOS')",
        nullable: true,
      },
      mac: {
        type: "varchar(100)",
        nullable: true,
      },
      id_tipo_documento: {
        type: "int(11)",
        nullable: true,
      },
      movimento_cancelamento_venda: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_assinatura_cliente_produto: {
        type: "int(11)",
        nullable: true,
      },
      data_cotacao_diaria: {
        type: "date",
        nullable: true,
      },
      valor_cotacao_diaria: {
        type: "decimal(15,2)",
        nullable: true,
      },
      valor_moeda_original: {
        type: "decimal(15,3)",
        nullable: true,
      },
      moeda_simbolo: {
        type: "varchar(5)",
        nullable: true,
      },
      bfcp_st: {
        type: "decimal(15,2)",
        nullable: true,
      },
      pfcp_st: {
        type: "decimal(5,2)",
        nullable: true,
      },
      valor_fcp_st: {
        type: "decimal(15,2)",
        nullable: true,
      },
      id_pedido_os: {
        type: "int(11)",
        nullable: true,
      },
      id_login: {
        type: "int(11)",
        nullable: true,
      },
      aliquota_fcp: {
        type: "decimal(5,3) unsigned",
        nullable: true,
      },
      valor_fcp: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      aliquota_fcp_st: {
        type: "decimal(5,3) unsigned",
        nullable: true,
      },
      garantia_ate: {
        type: "date",
        nullable: true,
      },
      motivo_descarte: {
        type: "varchar(255)",
        nullable: true,
      },
      id_usuario_descarte: {
        type: "int(11)",
        nullable: true,
      },
      item_nf_anterior: {
        type: "text",
        nullable: true,
      },
      codigo_especie: {
        type: "int(15) unsigned",
        nullable: true,
      },
      gera_3020: {
        type: "int(1) unsigned",
        nullable: true,
      },
      bfcp: {
        type: "decimal(15,2)",
        nullable: true,
      },
      cod_classificacao_servico: {
        type: "varchar(30)",
        nullable: false,
      },
      inss_aliquota: {
        type: "decimal(4,2) unsigned",
        nullable: true,
      },
      inss_valor: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      mp_iva_alq: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      mp_iva_bc: {
        type: "decimal(15,2)",
        nullable: true,
      },
      mp_iva_valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      iva_situation: {
        type: "varchar(10)",
        nullable: true,
      },
      faturado_pedido_os: {
        type: "enum('S','N')",
        nullable: true,
      },
      pedido_os_faturado: {
        type: "enum('S','N')",
        nullable: true,
      },
      mp_reteiva_valor: {
        type: "decimal(10,2) unsigned",
        nullable: true,
      },
      retefuente_retido_aliquota: {
        type: "decimal(3,2) unsigned",
        nullable: false,
      },
      retefuente_retido_valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      mp_reteica_valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      icms_predbcst: {
        type: "decimal(10,3) unsigned",
        nullable: true,
      },
      reteiva_aliquota: {
        type: "decimal(3,2)",
        nullable: true,
      },
      mp_reteica_aliquota: {
        type: "decimal(3,2)",
        nullable: true,
      },
      origem_movimento: {
        type: "enum('S','P')",
        nullable: true,
      },
      forma_tributacao: {
        type: "int(3) unsigned",
        nullable: true,
      },
      cod_classificacao_tribut_cbs_ibs: {
        type: "varchar(10)",
        nullable: true,
      },
      cod_situacao_tribut_cbs_ibs: {
        type: "varchar(110)",
        nullable: true,
      },
      cbs_ibs_base_calculo: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      cbs_aliquota: {
        type: "decimal(7,4) unsigned",
        nullable: true,
      },
      cbs_valor: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      ibs_estadual_aliquota: {
        type: "decimal(7,4) unsigned",
        nullable: true,
      },
      ibs_estadual_valor: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      ibs_municipal_aliquota: {
        type: "decimal(7,4) unsigned",
        nullable: true,
      },
      ibs_municipal_valor: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      reducao_aliquota: {
        type: "decimal(7,4) unsigned",
        nullable: true,
      },
      reducao_aliquota_governamental: {
        type: "decimal(7,4) unsigned",
        nullable: true,
      },
      aliquota_cbs_efetiva: {
        type: "decimal(7,4) unsigned",
        nullable: true,
      },
      aliquota_ibs_efetiva: {
        type: "decimal(7,4) unsigned",
        nullable: true,
      },
      aliquota_ibs_efetiva_munic: {
        type: "decimal(7,4) unsigned",
        nullable: true,
      },
      valor_ibs: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      cod_benef: {
        type: "tinytext",
        nullable: true,
      },
      diferimento_percent: {
        type: "decimal(7,4) unsigned",
        nullable: true,
      },
      estorno_cbs: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
      estorno_ibs: {
        type: "decimal(15,2) unsigned",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "data",
        nonUnique: "1",
        position: "1",
        columnName: "data",
        type: "BTREE",
      },
      {
        name: "filial_id",
        nonUnique: "1",
        position: "1",
        columnName: "filial_id",
        type: "BTREE",
      },
      {
        name: "id_ajuste_estoque",
        nonUnique: "1",
        position: "1",
        columnName: "id_ajuste_estoque",
        type: "BTREE",
      },
      {
        name: "id_almox",
        nonUnique: "1",
        position: "1",
        columnName: "id_almox",
        type: "BTREE",
      },
      {
        name: "id_classificacao_tributaria",
        nonUnique: "1",
        position: "1",
        columnName: "id_classificacao_tributaria",
        type: "BTREE",
      },
      {
        name: "id_class_fiscal",
        nonUnique: "1",
        position: "1",
        columnName: "id_class_fiscal",
        type: "BTREE",
      },
      {
        name: "id_cliente_contrato_servicos",
        nonUnique: "1",
        position: "1",
        columnName: "id_cliente_contrato_servicos",
        type: "BTREE",
      },
      {
        name: "id_contrato",
        nonUnique: "1",
        position: "1",
        columnName: "id_contrato",
        type: "BTREE",
      },
      {
        name: "id_devolucao",
        nonUnique: "1",
        position: "1",
        columnName: "id_devolucao",
        type: "BTREE",
      },
      {
        name: "id_entrada",
        nonUnique: "1",
        position: "1",
        columnName: "id_entrada",
        type: "BTREE",
      },
      {
        name: "id_estrutura",
        nonUnique: "1",
        position: "1",
        columnName: "id_estrutura",
        type: "BTREE",
      },
      {
        name: "id_inventario",
        nonUnique: "1",
        position: "1",
        columnName: "id_inventario",
        type: "BTREE",
      },
      {
        name: "id_oss_chamado",
        nonUnique: "1",
        position: "1",
        columnName: "id_oss_chamado",
        type: "BTREE",
      },
      {
        name: "id_oss_mensagem",
        nonUnique: "1",
        position: "1",
        columnName: "id_oss_mensagem",
        type: "BTREE",
      },
      {
        name: "id_patrimonio",
        nonUnique: "1",
        position: "1",
        columnName: "id_patrimonio",
        type: "BTREE",
      },
      {
        name: "id_pedido_os",
        nonUnique: "1",
        position: "1",
        columnName: "id_pedido_os",
        type: "BTREE",
      },
      {
        name: "id_produto_2",
        nonUnique: "1",
        position: "1",
        columnName: "id_produto",
        type: "BTREE",
      },
      {
        name: "id_saida",
        nonUnique: "1",
        position: "1",
        columnName: "id_saida",
        type: "BTREE",
      },
      {
        name: "id_transf_almox",
        nonUnique: "1",
        position: "1",
        columnName: "id_transf_almox",
        type: "BTREE",
      },
      {
        name: "id_transf_almox_item",
        nonUnique: "1",
        position: "1",
        columnName: "id_transf_almox_item",
        type: "BTREE",
      },
      {
        name: "id_unidade",
        nonUnique: "1",
        position: "1",
        columnName: "id_unidade",
        type: "BTREE",
      },
      {
        name: "id_vd_contratos_produtos",
        nonUnique: "1",
        position: "1",
        columnName: "id_vd_contratos_produtos",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "status_comodato",
        nonUnique: "1",
        position: "1",
        columnName: "status_comodato",
        type: "BTREE",
      },
      {
        name: "tipo_produto",
        nonUnique: "1",
        position: "1",
        columnName: "tipo_produto",
        type: "BTREE",
      },
      {
        name: "tipo_transferencia",
        nonUnique: "1",
        position: "1",
        columnName: "tipo_transferencia",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "movimento_produtos_fk_produto",
        columnName: "id_produto",
        referencedTable: "produtos",
        referencedColumn: "id",
      },
      {
        name: "movimento_produtos_ibfk_2",
        columnName: "filial_id",
        referencedTable: "filial",
        referencedColumn: "id",
      },
    ],
  },
  produtos: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      descricao: {
        type: "varchar(200)",
        nullable: true,
      },
      codigo: {
        type: "varchar(50)",
        nullable: true,
      },
      ncm: {
        type: "varchar(50)",
        nullable: false,
      },
      unidade: {
        type: "int(11)",
        nullable: true,
      },
      valor: {
        type: "decimal(15,2)",
        nullable: true,
      },
      id_sub_grupo: {
        type: "int(11)",
        nullable: false,
      },
      controla_estoque: {
        type: "enum('N','S','L')",
        nullable: false,
      },
      qtde_tecido_base: {
        type: "decimal(15,9)",
        nullable: false,
      },
      qtde_tecido_almofadas: {
        type: "decimal(15,9)",
        nullable: false,
      },
      codigo_tecido: {
        type: "int(11)",
        nullable: false,
      },
      qtde_min: {
        type: "decimal(15,9)",
        nullable: false,
      },
      qtde_max: {
        type: "decimal(15,9)",
        nullable: false,
      },
      ativo: {
        type: "enum('S','N')",
        nullable: false,
      },
      id_conta_estoque: {
        type: "int(11)",
        nullable: false,
      },
      id_conta_despesa: {
        type: "int(11)",
        nullable: false,
      },
      id_conta_receita: {
        type: "int(11)",
        nullable: false,
      },
      data_inventario: {
        type: "date",
        nullable: true,
      },
      qtde_inventario: {
        type: "decimal(15,9)",
        nullable: true,
      },
      qtde_entrada: {
        type: "decimal(15,9)",
        nullable: true,
      },
      qtde_saida: {
        type: "decimal(15,9)",
        nullable: true,
      },
      saldo: {
        type: "decimal(18,9)",
        nullable: true,
      },
      custo_medio: {
        type: "decimal(15,6)",
        nullable: true,
      },
      ultima_qtde_entrada: {
        type: "decimal(15,9)",
        nullable: true,
      },
      ultima_qtde_saida: {
        type: "decimal(15,9)",
        nullable: true,
      },
      movimentacao: {
        type: "enum('C','V','A')",
        nullable: true,
      },
      tipo: {
        type: "enum('C','S','F','M','P','O')",
        nullable: true,
      },
      descricao_alt: {
        type: "varchar(500)",
        nullable: true,
      },
      id_class_fiscal: {
        type: "int(11)",
        nullable: true,
      },
      preco_base: {
        type: "decimal(15,2)",
        nullable: true,
      },
      pcomissao: {
        type: "decimal(5,2)",
        nullable: true,
      },
      icms_issqn: {
        type: "enum('ICMS','ISSQN','NT')",
        nullable: false,
      },
      pesob: {
        type: "decimal(15,3)",
        nullable: true,
      },
      pesol: {
        type: "decimal(15,3)",
        nullable: true,
      },
      data_ultima_compra: {
        type: "date",
        nullable: true,
      },
      margem_lucro: {
        type: "decimal(15,2)",
        nullable: true,
      },
      valor_custo: {
        type: "decimal(15,2)",
        nullable: true,
      },
      custo_estoque: {
        type: "decimal(15,2)",
        nullable: true,
      },
      custo_medio_total: {
        type: "decimal(15,2)",
        nullable: true,
      },
      ecommerce: {
        type: "enum('S','N','P')",
        nullable: true,
      },
      descricao_completa: {
        type: "longtext",
        nullable: true,
      },
      checkbox1: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox2: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox3: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox4: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox5: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox6: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox7: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox8: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox9: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox10: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox11: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox12: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox13: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox14: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox15: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox16: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox17: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox18: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox19: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox20: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox21: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox22: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox23: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox24: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox25: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox26: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox27: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox28: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox29: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox30: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox31: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox32: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox33: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox34: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox35: {
        type: "enum('S','N')",
        nullable: true,
      },
      subgrupo_tipo: {
        type: "varchar(10)",
        nullable: true,
      },
      id_tabela_fipe: {
        type: "int(11)",
        nullable: true,
      },
      chassi: {
        type: "varchar(50)",
        nullable: true,
      },
      renavan: {
        type: "varchar(15)",
        nullable: true,
      },
      km: {
        type: "int(11)",
        nullable: true,
      },
      cambio: {
        type: "tinyint(4)",
        nullable: true,
      },
      qtdportas: {
        type: "smallint(6)",
        nullable: true,
      },
      veiculo_cor: {
        type: "varchar(100)",
        nullable: true,
      },
      veiculo_combustivel: {
        type: "varchar(100)",
        nullable: true,
      },
      checkbox36: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox37: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox38: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox39: {
        type: "enum('S','N')",
        nullable: true,
      },
      checkbox40: {
        type: "enum('S','N')",
        nullable: true,
      },
      altura: {
        type: "decimal(10,1)",
        nullable: true,
      },
      largura: {
        type: "decimal(10,1)",
        nullable: true,
      },
      profundidade: {
        type: "decimal(10,1)",
        nullable: true,
      },
      imagem: {
        type: "varchar(300)",
        nullable: true,
      },
      ecommerce_prioridade: {
        type: "smallint(6)",
        nullable: true,
      },
      ecommerce_pg_inicial: {
        type: "enum('S','N')",
        nullable: true,
      },
      aceita_valor: {
        type: "enum('P','N')",
        nullable: false,
      },
      vICMSSTRet: {
        type: "decimal(10,2)",
        nullable: true,
      },
      valor_prefixo: {
        type: "varchar(30)",
        nullable: false,
      },
      valor_sufixo: {
        type: "varchar(30)",
        nullable: true,
      },
      tipo_ecommerce: {
        type: "varchar(2)",
        nullable: true,
      },
      mostra_valor_ecommerce: {
        type: "varchar(1)",
        nullable: true,
      },
      cod_servico: {
        type: "varchar(9)",
        nullable: true,
      },
      codigo_barras: {
        type: "varchar(100)",
        nullable: true,
      },
      id_produtos_ncm_cest: {
        type: "varchar(20)",
        nullable: true,
      },
      iss_natureza_operacao: {
        type: "int(11)",
        nullable: true,
      },
      vencimento_garantia: {
        type: "datetime",
        nullable: true,
      },
      id_categoria_patrimonio: {
        type: "int(11)",
        nullable: true,
      },
      id_classe_financeira: {
        type: "int(11)",
        nullable: true,
      },
      id_conta_comodato: {
        type: "int(11)",
        nullable: true,
      },
      tv_id_plataforma: {
        type: "int(11)",
        nullable: true,
      },
      tv_id_pacote_canais: {
        type: "int(11)",
        nullable: true,
      },
      tv_id_pacote_servicos: {
        type: "int(11)",
        nullable: true,
      },
      tv_id_servicos: {
        type: "int(11)",
        nullable: true,
      },
      tv_standalone: {
        type: "varchar(1)",
        nullable: true,
      },
      tv_id_canais: {
        type: "int(11)",
        nullable: true,
      },
      tv_data_inicial: {
        type: "datetime",
        nullable: true,
      },
      tv_data_final: {
        type: "datetime",
        nullable: true,
      },
      tv_LineUp: {
        type: "int(11)",
        nullable: true,
      },
      plataforma: {
        type: "varchar(15)",
        nullable: true,
      },
      tv_id_pacote_servicos_watch: {
        type: "int(11)",
        nullable: true,
      },
      total_tickets_watch: {
        type: "int(11)",
        nullable: true,
      },
      descricao_pacote_watch: {
        type: "varchar(300)",
        nullable: true,
      },
      controle_impressao_etiqueta: {
        type: "int(11)",
        nullable: true,
      },
      id_class_fiscal_entrada: {
        type: "int(11)",
        nullable: true,
      },
      ultima_atualizacao: {
        type: "timestamp",
        nullable: true,
      },
      tv_id_pacotes: {
        type: "varchar(50)",
        nullable: true,
      },
      tv_mus_produtos_disponiveis: {
        type: "set('mumo','paramountplus','noggin','bebanca','begamer','tocalivros:curadoria','tocalivros:audiobook','hube','kaspersky:internetsecurity','kaspersky:passwordmanager','kaspersky:totalsecurity','cartoon','eiplus','hbo:paytv','hbo:bb','descomplica:enem','monetolab:quadrinhos','monetolab:revistas','qualifica:pro','bittrainers','verisoft:bancah','bebanca:revistas','bebanca:premium','bibliotechie','verisoft:livroh','verisoft:minutocarreira','kaspersky:combo1','kaspersky:safekids','tntstadio','gravioladigital:mdc','gravioladigital:cov','gravioladigital:minicov','partiu','mediquo','kaspersky:standard1','kaspersky:standard3','kaspersky:standard5','kaspersky:standardplus3')",
        nullable: true,
      },
      id_integracao_tv: {
        type: "int(11)",
        nullable: true,
      },
      tv_id_pacote_temporario: {
        type: "int(11)",
        nullable: true,
      },
      tv_data_expiracao_pacote_temporario: {
        type: "date",
        nullable: true,
      },
      tv_dias_expiracao_pacote_temporario: {
        type: "int(3)",
        nullable: true,
      },
      id_plano_mvno: {
        type: "int(11)",
        nullable: true,
      },
      produto_playhub: {
        type: "varchar(15)",
        nullable: true,
      },
      id_sva_integracao: {
        type: "int(11)",
        nullable: true,
      },
      id_sva_pacote: {
        type: "varchar(200)",
        nullable: true,
      },
      id_sva_pacote_adicional: {
        type: "varchar(250)",
        nullable: false,
      },
      id_tipo_documento_servico: {
        type: "int(11)",
        nullable: true,
      },
      id_fr_faturamento_classificacoes: {
        type: "int(11)",
        nullable: true,
      },
      tariff_plan: {
        type: "varchar(100)",
        nullable: true,
      },
      link: {
        type: "varchar(150)",
        nullable: true,
      },
      id_assinatura_integracao: {
        type: "int(11)",
        nullable: true,
      },
      plataforma_integracao: {
        type: "varchar(45)",
        nullable: true,
      },
      tv_dtvgo_produtos_disponiveis: {
        type: "varchar(255)",
        nullable: true,
      },
      tipo_produto_integracao: {
        type: "enum('A','C')",
        nullable: false,
      },
      tv_id_pacotes_adicionais: {
        type: "varchar(100)",
        nullable: true,
      },
      integrador: {
        type: "int(11) unsigned",
        nullable: true,
      },
      limite_pacote: {
        type: "int(11) unsigned",
        nullable: true,
      },
      valor_adicional_pacote: {
        type: "decimal(15,2)",
        nullable: true,
      },
      cod_classificacao_servico: {
        type: "varchar(30)",
        nullable: false,
      },
      id_integracao_iot: {
        type: "int(10) unsigned",
        nullable: true,
      },
      id_produto_iot: {
        type: "varchar(120)",
        nullable: true,
      },
      codigo_externo_produto_col: {
        type: "varchar(100)",
        nullable: true,
      },
      id_classificacao_tributaria_col: {
        type: "int(11)",
        nullable: true,
      },
      id_integracao_fiscal_col: {
        type: "int(11)",
        nullable: true,
      },
      identificacao_item_sped: {
        type: "varchar(30)",
        nullable: true,
      },
      id_tipo_documento_servico_pj: {
        type: "int(10) unsigned",
        nullable: true,
      },
      descricao_produto_col: {
        type: "varchar(100)",
        nullable: true,
      },
      id_centro_custo_rel_centro_custo_categoria_padrao: {
        type: "int(10) unsigned",
        nullable: true,
      },
      excecao_tributacao_nfcom: {
        type: "enum('S','N')",
        nullable: false,
      },
      centro_custo_regra_criterio: {
        type: "enum('CE','CR')",
        nullable: true,
      },
      id_centro_custo_criterio_rateio: {
        type: "int(10) unsigned",
        nullable: true,
      },
      obs: {
        type: "varchar(2048)",
        nullable: true,
      },
      id_centro_resultado_rel_centro_custo_categoria_padrao: {
        type: "int(10) unsigned",
        nullable: true,
      },
      tp_transacao_pry: {
        type: "varchar(2)",
        nullable: true,
      },
      cnpj_op_longa_distancia: {
        type: "varchar(25)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "id_categoria_patrimonio",
        nonUnique: "1",
        position: "1",
        columnName: "id_categoria_patrimonio",
        type: "BTREE",
      },
      {
        name: "id_classe_financeira",
        nonUnique: "1",
        position: "1",
        columnName: "id_classe_financeira",
        type: "BTREE",
      },
      {
        name: "id_class_fiscal",
        nonUnique: "1",
        position: "1",
        columnName: "id_class_fiscal",
        type: "BTREE",
      },
      {
        name: "id_conta_despesa",
        nonUnique: "1",
        position: "1",
        columnName: "id_conta_despesa",
        type: "BTREE",
      },
      {
        name: "id_conta_estoque",
        nonUnique: "1",
        position: "1",
        columnName: "id_conta_estoque",
        type: "BTREE",
      },
      {
        name: "id_conta_receita",
        nonUnique: "1",
        position: "1",
        columnName: "id_conta_receita",
        type: "BTREE",
      },
      {
        name: "id_sub_grupo",
        nonUnique: "1",
        position: "1",
        columnName: "id_sub_grupo",
        type: "BTREE",
      },
      {
        name: "id_tabela_fipe",
        nonUnique: "1",
        position: "1",
        columnName: "id_tabela_fipe",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "ultima_atualizacao",
        nonUnique: "1",
        position: "1",
        columnName: "ultima_atualizacao",
        type: "BTREE",
      },
      {
        name: "unidade",
        nonUnique: "1",
        position: "1",
        columnName: "unidade",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "produtos_ibfk_1",
        columnName: "unidade",
        referencedTable: "unidades",
        referencedColumn: "id",
      },
      {
        name: "produtos_ibfk_2",
        columnName: "id_sub_grupo",
        referencedTable: "sub_grupo_produdos",
        referencedColumn: "id",
      },
      {
        name: "produtos_ibfk_3",
        columnName: "id_class_fiscal",
        referencedTable: "cnf_classificacao_tributaria",
        referencedColumn: "id",
      },
    ],
  },
  cidade: {
    primaryKey: ["id"],
    columns: {
      id: {
        type: "int(11)",
        nullable: false,
      },
      nome: {
        type: "varchar(100)",
        nullable: false,
      },
      uf: {
        type: "int(11)",
        nullable: false,
      },
      regiao: {
        type: "varchar(100)",
        nullable: true,
      },
      cod_ibge: {
        type: "int(10) unsigned",
        nullable: true,
      },
      cod_siafi: {
        type: "varchar(10)",
        nullable: true,
      },
      latitude: {
        type: "varchar(30)",
        nullable: true,
      },
      longitude: {
        type: "varchar(30)",
        nullable: true,
      },
      cod_cidade_nfse_forquilhinha_sc: {
        type: "int(10)",
        nullable: true,
      },
      origem: {
        type: "enum('N','I')",
        nullable: false,
      },
      api_id: {
        type: "int(11) unsigned",
        nullable: true,
      },
      codigo: {
        type: "varchar(10)",
        nullable: true,
      },
      distrito_cod: {
        type: "varchar(3)",
        nullable: true,
      },
      distrito_desc: {
        type: "varchar(150)",
        nullable: true,
      },
    },
    indexes: [
      {
        name: "api_id",
        nonUnique: "0",
        position: "1",
        columnName: "api_id",
        type: "BTREE",
      },
      {
        name: "cod_ibge",
        nonUnique: "1",
        position: "1",
        columnName: "cod_ibge",
        type: "BTREE",
      },
      {
        name: "PRIMARY",
        nonUnique: "0",
        position: "1",
        columnName: "id",
        type: "BTREE",
      },
      {
        name: "uf",
        nonUnique: "1",
        position: "1",
        columnName: "uf",
        type: "BTREE",
      },
    ],
    foreignKeys: [
      {
        name: "cidade_ibfk_1",
        columnName: "uf",
        referencedTable: "uf",
        referencedColumn: "id",
      },
    ],
  },
} as const;
