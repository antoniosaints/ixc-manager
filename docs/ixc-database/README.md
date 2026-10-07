# Banco IXC: estrutura e consultas de leitura

Inspeção realizada em **06/10/2026**, MariaDB **11.4.3**, horário do servidor **UTC−03**. Foram identificadas **930 tabelas**, **14.133 colunas**, **2.087 entradas de colunas em índices** e **154 vínculos de colunas por foreign key**. Esses dois últimos números não são a quantidade de índices ou relacionamentos distintos. O usuário fornecido tem exclusivamente privilégios de leitura; não foi feito teste de escrita.

## O que ficou pronto

- `schema.json`: estrutura completa das 930 tabelas, tipos, nulabilidade, comentários, índices e FKs; sem registros, valores padrão ou credenciais.
- `catalog.json`: índice local por tabela, quantidade de colunas, chave primária e estimativa de linhas. As estimativas do InnoDB não são contagens exatas.
- `server/src/integrations/ixc/database/maps/tables.generated.ts`: tipos e mapas de **35 tabelas principais** de Financeiro, Churn, Suporte e Upgrades.
- `maps/schemaCatalog.ts`: acesso aos mapas completos de qualquer uma das 930 tabelas pelo snapshot local, sem banco/API.
- `maps/relations.ts`: vínculos com distinção entre FK declarada, vínculo validado em um período e hipótese que ainda precisa de validação.
- `maps/valueMappers.ts`: dinheiro exato, IDs grandes, datas legadas, regime contábil e estado do login.
- `IxcReadDatabase.ts`: pool independente do banco local da aplicação; transações de leitura em REPEATABLE READ; SQL parametrizado, até três conexões, limite de 15 segundos por SELECT, sem múltiplas instruções.
- `financeQueries.ts` e `IxcFinanceReadRepository.ts`: consultas financeiras agregadas e mapeadas, prontas para reutilização. Nenhum endpoint recebe SQL do usuário.
- `benchmark.json`, `validation.json` e `parity.json`: tempos, EXPLAIN, contagens de qualidade e indicadores de igualdade; não contêm valores financeiros ou dados de clientes.

A configuração está em `.env` e no arquivo de exemplo já existente, `.env.example`, usando `DATABASE_IXC_*`. `DATABASE_URL` continua apontando ao banco local de autenticação/configuração/retencão. O banco IXC é uma conexão separada.

O Redis fornecido também foi configurado: `REDIS_DB=default` é interpretado como banco lógico **0**, e Queue/Worker usam o prefixo **casanalise_**. A autenticação do Redis foi validada com PING, sem criar chaves. A análise SQL não depende de Redis e não foi criado cache de resultados financeiros. O novo Redis/prefixo define um namespace diferente para as filas existentes.

**O painel Financeiro agora usa SQL de leitura.** A rota `GET /api/finance/dashboard` usa `FinanceSqlService` e `dashboardQueries.ts`, com cinco consultas agregadas em uma transação consistente. Foram mantidas as permissões e o `Cache-Control: no-store`. O navegador não acessa o banco. Não houve alteração das regras de score de Churn.

Foi implementado filtro de regime (todos, caixa, competência, manual), inadimplência atual nas faixas de 1–30, 31–60, 61–90 e acima de 90 dias, e situação de conciliação dos lançamentos. Títulos cancelados/estornados e antigos renegociados são separados; transferências internas não entram no resultado R/D. Saldos negativos/ausentes tornam o indicador indisponível com aviso, em vez de produzir um zero incorreto.

A aba **Caixa e bancos** consulta `GET /api/finance/banks` somente ao ser aberta. Ela mostra saldo inicial, saldo cadastrado na criação quando dentro do período, entradas, saídas e saldo final calculado. A base é `saldo_abertura` + variação desde `data_abertura`. A variação bancária usa débito − crédito, validada no sinal das transferências desta instalação. Esses valores são calculados e não representam confirmação de saldo pela instituição bancária. Abertura inválida, conta contábil compartilhada, lançamento possivelmente duplicando a abertura ou indisponibilidade histórica impedem a apresentação de um saldo como válido. Saldos bancários não recebem o filtro de regime; sob filtro de filial ficam indisponíveis, pois a abertura pertence à conta completa.

A conciliação apresentada é o estado `fn_movim_finan.conciliado` no período, com conciliados, pendentes e sem informação. **Não é comparação automática com o extrato**: a tentativa de consulta por data em `fn_extrato` excedeu 15 segundos e foi interrompida. Sem índice/réplica adequada, o painel não faz essa varredura em cada carregamento. Nenhum índice foi criado.

A carteira vencida usa saldos atuais e a data atual de Brasília, independente do início/fim escolhidos. Não reconstrói uma posição histórica de inadimplência com saldos atuais. Títulos com vencimento inválido são separados, com alerta. Regime, filial e conta se aplicam à carteira vencida.

## Navegação pelas pendências e históricos de suporte

Os cards de inadimplência abrem `GET /api/finance/pending`, com carteira atual por faixa de atraso ou títulos em aberto/vencidos no período. A lista mostra cliente/fornecedor, contrato, título/documento, conta analítica, filial, valor original, recebido/pago e saldo aberto. A busca por nome ou IDs, ordenação por vencimento/saldo e paginação são feitas no banco. As mesmas exclusões e filtros do indicador são usados no detalhamento; as datas das faixas ficam no WHERE sem funções, preservando o uso de índices. IDs de títulos grandes são strings. A escolha de filiais e contas usa nomes consultados por `GET /api/finance/options`: contas R/D e contas vinculadas a caixa/bancos, complementadas pelas contas da movimentação do período. Isso evita oferecer milhares de contas patrimoniais individuais sem movimentação relevante no painel.

As rotas `GET /api/support/customers/:id/{orders|tickets}/:caseId`, `/messages` e `/movements` carregam os detalhes ao expandir um registro. A visão geral inclui assunto, prioridade, setor, técnico, diagnóstico, endereço, datas/etapas e vínculos de contrato/login. Mensagens de OS usam `su_oss_chamado_mensagem`, com nomes do operador, técnico, diagnóstico e evento. Movimentações de materiais/comodatos/patrimônio usam `su_oss_chamado_historico`. Eventos/observações dos atendimentos vêm de `su_mensagens`, a mesma fonte das mensagens; a aba de movimentações oferece a mensagem associada em uma expansão. Não há reconstrução inventada de alterações que não estejam registradas.

Todas essas rotas exigem as permissões existentes de Financeiro ou cadastro do cliente e OS/atendimento. O vínculo entre cliente e registro é verificado antes de ler o histórico. As respostas usam campos explícitos, `no-store`, transações de leitura, paginação e limites de tempo. Texto é mostrado escapado, e textos acima de 16.000 caracteres são sinalizados como limitados, com consulta completa disponível no IXC. Nenhuma mensagem ou registro financeiro é persistido na aplicação.

Na validação real, as cinco listas de atraso responderam em **72–175 ms** e seus totais/contagens coincidiram com os cards. Recebíveis e pagamentos em aberto no período também coincidiram. Históricos de OS/atendimentos responderam em aproximadamente **54–161 ms**; a OS consultada não tinha movimentação de materiais, o que foi retornado como lista vazia. O relatório `drilldown-validation.json` guarda apenas tempos, contagens e indicadores de igualdade. Os novos mapas de histórico são gerados do snapshot local, sem nova inspeção estrutural no banco.

## Medição com dados reais

Período atual: **01–06/10/2026**. Comparação: **25–30/09/2026**.

| Consulta                                                    | Tempo observado | Resultado                                                           |
| ----------------------------------------------------------- | --------------: | ------------------------------------------------------------------- |
| Painel atual via API                                        |       18.123 ms | Consulta completa, sem alertas                                      |
| Repositório SQL, quatro SELECTs em uma transação de leitura |          392 ms | Agregados de movimentos, recebíveis, pagamentos e controle do razão |
| Primeira medição do repositório SQL                         |          376 ms | 25.091 movimentos agrupados em 1.373 linhas                         |

Na comparação, receitas/despesas atuais e anteriores, totais vencidos/em aberto e quantidades de títulos em aberto coincidiram. O ganho observado foi de **aproximadamente 46 vezes**. O painel enriquecido foi validado entre 0,5 e 0,7 segundo para o período atual e a aba de bancos em 2,3 segundos. O filtro por filial respondeu em 0,38 segundo; janeiro a outubro levou 13,26 segundos, com todos os indicadores disponíveis. A disponibilidade por escopo está em `dashboard-validation.json`. É uma medição deste período/instalação, não uma garantia para um ano inteiro ou alta concorrência. API e SQL foram lidos em momentos próximos; futuras comparações podem divergir se o IXC mudar entre as consultas.

O EXPLAIN mostrou acesso por intervalo no índice `fn_movim_finan.data`, junções pela PK de contas analíticas/sintéticas e uso de `data_vencimento` nos recebíveis/pagamentos. Não é necessário criar índice para obter o ganho já medido. A redução vem principalmente de agregar no banco e eliminar a paginação e transporte dos registros completos.

## Tabelas e significado

| Área                 | Tabelas mapeadas                                                                                           | Uso                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Movimentação         | `fn_movim_finan`                                                                                           | Débito/crédito por data, conta e filial; referências a títulos e transferências |
| Plano de contas      | `planejamento_analitico`, `planejamento`                                                                   | Conta analítica, conta sintética, natureza R/D/A/P, hierarquia e regime         |
| Caixa e banco        | `contas`, `fn_extrato`, `fn_transferencia_caixa`                                                           | Abertura, extrato/conciliação e transferências                                  |
| Títulos              | `fn_areceber`, `fn_apagar`, `fornecedor`                                                                   | Valores previstos, abertos, recebidos/pagos, cancelados e estornados            |
| Rateio               | `centro_custo_rateio`                                                                                      | Rateios vinculados a movimentos/títulos; junção pode multiplicar registros      |
| Cadastro e comercial | `cliente`, `cliente_contrato`, `cliente_contrato_historico`, `vd_contratos`, `filial`, `cidade`, `contato` | Cliente, planos, contratos, permanência, filiais e contatos                     |
| Rede                 | `radusuarios`, `radacct`, `radusuarios_consumo_m`                                                          | Login/contrato, sessões e consumo                                               |
| Suporte e comodato   | `su_ticket`, `su_oss_chamado`, `su_oss_assunto`, `movimento_comodatos`, `movimento_produtos`, `produtos`   | Atendimentos, OS, assuntos, materiais e documentos                              |

Os tipos gerados descrevem o armazenamento, incluindo nomes de colunas de credenciais, mas **não são DTOs públicos**. Consultas e respostas devem selecionar campos explícitos. Evitar `SELECT *`, logar linhas ou devolver tokens/senhas/documentos completos. Campos `DECIMAL` e `BIGINT` chegam como strings; o mapper monetário usa `bigint` para os centavos e serializa como string. `NULL` não vira zero e datas `0000-00-00` não viram datas válidas. O enum vazio existente em registros legados é previsto nos tipos.

## Precisão financeira: decisões necessárias

1. **Separar caixa e competência.** A documentação IXC define `planejamento_analitico.previsao`: `S` = caixa, `N` = competência e `M` = manual. Foram encontrados movimentos de caixa e competência no mesmo período. Um resultado misturado não deve ser apresentado como fluxo de caixa puro. O repositório preserva esses grupos para oferecer um filtro explícito.
2. **Separar resultado e patrimônio.** Receitas/despesas usam R/D; A/P são contrapartidas patrimoniais. Não somar todas as contas como receita. O vínculo real é `fn_movim_finan.id_conta → planejamento_analitico.id → planejamento.id`. Os tipos analítico/sintético coincidiram no período verificado.
3. **Distinguir banco de conta contábil.** `contas.id_planejamento` tem FK para **planejamento_analitico.id**, apesar do nome. `fn_areceber.id_conta` e `fn_apagar.id_conta` também apontaram para contas analíticas no recorte verificado, mas sem FK. As relações bancárias do extrato ainda são hipóteses explícitas.
4. **Tratar cancelamentos, estornos e renegociações.** Títulos com `status=C` ou `estornado=S` ficam separados e marcados como excluídos pela regra atual. Antigos títulos renegociados são excluídos dos saldos, e valores negativos/nulos produzem um aviso de indisponibilidade. `fn_movim_finan.cancelamento` é varchar, sem enum: códigos diferentes de vazio/N são separados com aviso, sem atribuir significado aos códigos desconhecidos. No recorte estava vazio. Essa regra conservadora precisa ser reconciliada com o relatório IXC quando aparecerem outros códigos.
5. **Identificar transferências internas.** Foram encontrados 10 movimentos vinculados a transferências no período atual + anterior. A coluna real é `id_fn_tranferencia_caixa`. Esses grupos são excluídos de receitas/despesas e mantidos na movimentação técnica. Origem e destino são validados; vínculos inconsistentes produzem aviso.
6. **Evitar multiplicação nos JOINs.** Um título pode ter várias baixas e um lançamento pode ter vários rateios. Agregar cada lado antes de cruzar; não juntar registros brutos e depois somar o valor original repetido.
7. **Separar estoque de dívida e vencimentos do período.** O indicador atual de aberto considera somente títulos com vencimento no intervalo selecionado. Para inadimplência total, incluir todo saldo positivo vencido até a data de referência e mostrar faixas de atraso. Para projeção, usar os vencimentos futuros. Dar nomes diferentes a esses indicadores.
8. **Construir balancete com saldo inicial.** Débito/crédito do intervalo não constitui, sozinho, um balanço patrimonial completo. Para saldo bancário acumulado, conferir `saldo_abertura`, `data_abertura`, movimentos anteriores e conciliação; validar se a abertura já foi lançada para não contar duas vezes.

No recorte validado, o razão completo teve débitos e créditos iguais, não houve contas sem vínculo ou divergência de tipo, nem saldos abertos nulos/negativos. Esse resultado valida o recorte, não atesta todos os exercícios históricos. Em filtro de uma única conta, não exigir igualdade dos débitos/créditos como se fosse o razão completo.

## Melhorias recomendadas para o painel

A leitura do painel já foi migrada, com comparação do período anterior e escolha de regime. Com os mesmos dados podemos oferecer ranking por conta/filial/fornecedor, evolução diária/mensal, atraso por faixas, recebimentos e pagamentos realizados versus previstos, descontos, juros e multas. A classificação de "realizado" precisa usar as baixas/datas corretas, distinguindo-as da data de lançamento e do vencimento.

Saldo inicial/final calculado por caixa/banco e estado de conciliação dos lançamentos foram adicionados. Próximas extensões: conferência com o extrato bancário, apresentação da DRE/hierarquia de contas; identificar títulos renegociados e movimentações sem contrapartida. As tabelas de classes/liquidações e várias estruturas de centros de custo aparecem vazias nas estimativas; primeiro validar cobertura real antes de prometer gráficos por centro de custo.

Para filtros combinados de períodos longos, avaliar com EXPLAIN índices compostos `(filial_id, data)` e `(id_conta, data)` em `fn_movim_finan`, e combinações de filial/conta com `data_vencimento` nos títulos. **Nenhum índice foi criado.** O usuário de leitura não deve executar DDL. Eventuais mudanças são tarefa do administrador IXC e devem ser justificadas por medidas de carga.

`fn_extrato.data` não tem índice: o EXPLAIN indicou varredura estimada de aproximadamente 222 mil linhas. Antes de usar extratos intensamente em tempo real, avaliar índice/data/conta ou leitura em réplica. Para crescimento de volume, uma réplica de leitura reduz competição com a operação IXC; mostrar o horário/atraso de atualização se a réplica tiver defasagem.

## Observações úteis para Churn e Suporte

- No comentário de `radusuarios.online`, `SS` significa login que nunca autenticou; não é online. `I` é estado indefinido. O novo mapper diferencia ambos. Revisar as regras antigas antes de trocar a fonte.
- `su_ticket.su_status` é diferente de `status`, que inclui estados de fluxo/OS. Contagens de atendimentos abertos/encerrados devem usar o campo adequado.
- O contrato da OS está em `su_oss_chamado.id_contrato_kit`; o nome do assunto vem de `su_oss_assunto`.
- Sessão de Radius ainda aberta não é uma desconexão. Consultar por login e intervalo, validar encerramento/causa e alcance do histórico. A estimativa atual de `radacct` é aproximadamente 30 mil linhas; isso não prova que contenha todo o histórico que a API entrega.
- Consumo mensal: agrupar por login/mês e comparar períodos equivalentes. O FK de `radusuarios_consumo_m.id_login` foi confirmado.

## Reutilizar e atualizar os mapas

```bash
# Consulta exclusivamente o snapshot local, sem conectar ao IXC:
npm run ixc:maps -w server

# Atualiza metadados quando houver mudança de versão/estrutura:
npm run ixc:schema -w server
npm run ixc:maps -w server

# Quatro SELECTs financeiros + EXPLAIN; salva apenas tempos/contagens:
npm run ixc:validate -w server -- 2026-10-01 2026-10-06
```

Não executar inspeção estrutural a cada requisição. Buscar a tabela/coluna no catálogo e nos tipos locais; atualizar o snapshot somente quando necessário. Financeiro está conectado à camada SQL nova. Churn/Suporte mantêm suas fontes anteriores; os mapas locais permitem migrá-los sem nova descoberta estrutural.

## Fontes oficiais consultadas

- [IXC: mensagens da OS](https://wiki-erp.ixcsoft.com.br/documentacao/menu-sistema/suporte/ordens-de-servicos/abas/aba-mensagens.html).
- [IXC: abas e estados do atendimento](https://wiki-erp.ixcsoft.com.br/documentacao/menu-sistema/suporte/atendimentos/atendimentos).
- [IXC: mensagens do atendimento](https://wiki-erp.ixcsoft.com.br/documentacao/menu-sistema/suporte/atendimentos/abas/aba-mensagens-atendimento.html).
- [IXC: contas contábeis analíticas e regime caixa/competência](https://wiki-erp.ixcsoft.com.br/documentacao/menu-sistema/contabilidade/plano-de-contas/contas-contabeis-analiticas.html).
- [IXC: balancete, saldo inicial e interpretação de débito/crédito](https://wiki-erp.ixcsoft.com.br/documentacao/menu-relatorios/relatorios-gerenciais/relatorio-de-balancete/imprimir-relatorio-balancete.html).
- [MariaDB: transações somente leitura](https://mariadb.com/docs/server/reference/sql-statements/administrative-sql-statements/set-commands/set-transaction).
- [MariaDB: limite de tempo por consulta](https://mariadb.com/docs/server/ha-and-performance/optimization-and-tuning/query-optimizations/query-limits-and-timeouts).

A documentação IXC usa débito/crédito com a sua própria convenção de saída/entrada. A conciliação com os relatórios da instalação é necessária antes de apresentar um balanço completo.
