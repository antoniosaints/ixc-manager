# Análise de ordens de serviço com IA

Em **Suporte → Análise de OS com IA**, escolha o assunto e as datas e clique em **Analisar ordens**. O período considera a abertura da OS no relógio do IXC/Brasília, inclui o último dia inteiro e todos os status. O resultado fica na memória da tela até sair ou fazer outra análise. Não há alteração no IXC nem armazenamento dos relatórios na aplicação.

## Configuração

Como administrador, abra **Configurações → Inteligência artificial** (`/settings/ai`):

1. Selecione **OpenAI** ou **Google Gemini API**.
2. Escolha uma sugestão de modelo ou digite o identificador disponível na sua conta.
3. Cadastre a chave da API. Deixe vazio para manter uma chave já cadastrada para esse provedor.
4. Clique em **Testar conexão** para verificar autenticação, acesso ao modelo e geração de JSON estruturado. O teste usa os dados do formulário sem salvar, não envia OS e pode consumir uma pequena cota da API.
5. Clique em **Salvar e usar este provedor**. A próxima análise usa a configuração salva, sem editar `.env` ou reiniciar o backend.

Cada provedor mantém sua própria chave e modelo. Trocar de provedor preserva a chave do outro. Remover uma chave desabilita o resumo por esse provedor até cadastrar outra; a remoção não reativa silenciosamente uma chave antiga do ambiente. Sugestões de modelos não garantem disponibilidade na conta: use o teste e consulte a lista do provedor. O identificador também pode ser informado manualmente.

`OPENAI_API_KEY` e `OPENAI_MODEL` continuam sendo aceitos como configuração legada inicial, até que a chave seja substituída ou removida pela tela. Não é necessário defini-los para usar o novo cadastro. Nunca coloque chaves em variáveis `VITE_*`, no frontend ou em arquivos versionados. Sem chave, a ferramenta continua oferecendo contagens e evidências, com aviso explícito de que o resumo por IA não foi gerado.

O cadastro é persistido em `retention_ai_settings`, na base **da aplicação**. A tabela é criada automaticamente na primeira gravação explícita, quando a conta tem permissão CREATE; instalações com usuário restrito podem aplicar `server/migrations/020_ai_settings.sql` previamente. GET e teste não criam tabelas. Conflitos entre dois administradores retornam 409 pedindo recarregar, sem sobrescrever alterações silenciosamente.

As chaves são criptografadas com AES-256-GCM e chave mestra gerada automaticamente em `server/data/ai-secrets/master.key` (permissão 0600, diretório 0700). O arquivo não é versionado e a chave nunca é devolvida nas APIs de configuração. **Em contêineres, preserve `server/data` em um volume persistente e inclua-o no backup junto com a base da aplicação.** Todos os processos/réplicas precisam compartilhar a mesma chave mestra. Perder esse arquivo exige restaurar o backup ou cadastrar as chaves das APIs novamente. A leitura de um segredo nunca recria automaticamente uma chave mestra perdida.

Rotas exclusivas de ADMIN, com `no-store` e logs silenciosos: `GET/PUT /api/settings/ai` e `POST /api/settings/ai/test`. O teste gera apenas `{ "ok": true }` via o mesmo adaptador estruturado usado pela análise, tem prazo de 50 segundos, sanitiza erros e não grava o resultado do teste. Um sucesso confirma acesso naquele momento, não garante cota ou disponibilidade futuras.

A permissão `support.orders.analyze` exige também `support.orders.view`. ADMIN possui acesso; padrões de Operador, Gestor e preset Suporte incluem a nova permissão. Perfis personalizados e exceções existentes continuam prevalecendo e podem ser ajustados em Configurações → Perfis.

## Fontes e interpretação

- OS e assunto: `su_oss_chamado` e `su_oss_assunto`, filtradas por `id_assunto` e `data_abertura`. Descrição em `mensagem`, resposta em `mensagem_resposta`, histórico em `su_oss_chamado_mensagem.id_chamado`. Mensagens posteriores à abertura podem estar fora do período escolhido: a seleção é de OS, e a revisão usa todo o histórico atualmente disponível dessas OS.
- Recorrência: cliente com duas ou mais OS do assunto dentro do período. Essa contagem não comprova que houve a mesma falha técnica; a IA revisa os textos para avaliar essa hipótese. Não há comparação implícita com períodos anteriores ou com a base total de clientes da cidade.
- Cliente por `id_cliente`; contrato por `id_contrato_kit`, validado pelo mesmo cliente; login por `id_login`, validado pelo mesmo cliente e pelo contrato da OS quando preenchido. Um login de outro cliente/contrato não fornece cidade, ramal ou conexão.
- Cidade prioriza `su_oss_chamado.id_cidade`. Sem cidade na OS, respeita o endereço padrão do login: cliente para S/C; nos demais casos, cidade do login, contrato e cliente, nessa ordem. A origem pode ser o cadastro atual, e não uma reconstrução histórica do endereço.
- Ramal **de rede**, não ramal telefônico: `radpop_radio_cliente_fibra.id_ramal`, escopado por `id_transmissor`, exibido como `transmissor:ramal`. Exige ONU compatível com o login e contrato do mesmo cliente; contrato antigo só é aceito com serial compatível, seguindo `LoginOnuLink`. Mais de um transmissor/ramal ou ramal ausente deixa a associação desconhecida. Não usa uma ONU arbitrária nem substitui ramal por CTO, filial ou concentrador.
- Conexão: `radusuarios.online` dos logins confirmados e distintos associados às OS. S = online, N/SS = offline; demais estados são desconhecidos. Não inclui outros logins do cliente que não estejam associados a essas OS. O dado é uma consulta atual, não prova de conexão na época da abertura. Não há monitoramento contínuo ou alertas em segundo plano; **Analisar ordens** refaz a coleta e o resumo. Atualizar consulta no header somente recarrega assuntos e configuração, sem iniciar outra chamada paga à IA.
- Contagens, vínculos e textos são coletados no mesmo snapshot somente leitura; a transação é encerrada antes das chamadas à IA. Não há multiplicação de OS por joins de ONU/mensagens.

## IA e dados

O backend usa o provedor salvo: OpenAI por `https://api.openai.com/v1/responses`, com `store: false`, ou Gemini por `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, com autenticação no header `x-goog-api-key`. Nenhuma chave vai na URL. Ambos usam JSON Schema e validação local do resultado. Hosts são fixos, modelos são validados e redirects HTTP são desabilitados. Referências: [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) e [Gemini generateContent](https://ai.google.dev/api/generate-content).

São enviados textos de OS, datas, status, cidade, referência de ramal e identificadores de evidência. Clientes recebem referências locais C1/C2 etc.; nomes, logins e campos estruturados de contato/documento/endereço não são enviados. Os textos passam por remoção automática de nomes conhecidos, emails, IPv4, MAC, sequências de contato/documento e credenciais no formato `senha: valor`. Essa redução é heurística e não garante anonimização integral de texto livre. A interface informa o provedor configurado antes da análise e o relatório identifica o provedor efetivamente usado. Retenção e uso dos dados seguem as condições da conta do provedor; `store: false` da OpenAI não equivale a garantia de retenção zero e não é enviado ao Gemini.

O prompt trata mensagens como dados não confiáveis, exige distinguir fatos/relatos/hipóteses, e não oferece ferramentas ou execução de comandos ao modelo. A resposta é renderizada como texto Vue. Cada achado exige IDs de OS existentes no lote; consolidações só podem usar evidências presentes nos relatórios de entrada. Referências inventadas, recusas, JSON inválido e respostas incompletas são rejeitados. Isso valida a referência, mas não comprova por si só a qualidade da conclusão, que continua exigindo revisão técnica.

Todos os lotes são revisados antes de consolidar o relatório. Históricos grandes são divididos sem contar partes da mesma OS como novas ocorrências. A consolidação é hierárquica para limitar o contexto. Falhas do provedor preservam os indicadores e evidências e mostram um aviso; nenhum texto calculado localmente é apresentado como resumo de IA.

## Limites e operação

- Até 366 dias, 5.000 OS, 50.000 mensagens e 12 milhões de caracteres de textos por consulta. Acima do limite, retorna erro pedindo um período menor, sem gerar relatório de uma amostra silenciosa.
- Cada descrição, resposta e mensagem é abreviada a 6.000 caracteres no SQL. O resultado marca os registros abreviados e avisa que a revisão textual tem cobertura parcial.
- Até 2,4 milhões de caracteres de entrada textual serializada para a IA; acima disso preserva os indicadores e informa falha no resumo, sugerindo reduzir o período. Lotes de aproximadamente 40 mil caracteres, chamadas individuais com timeout de 90 segundos e prazo total de 240 segundos para a etapa de IA.
- Uma análise em andamento por processo do backend, com resposta 429 para concorrência adicional. Não há fila, cache compartilhado nem persistência de jobs; em instalações com vários processos, o limite é por processo.
- Consultas SQL parametrizadas com timeout por SELECT. Permissões verificadas antes das consultas; `Cache-Control: no-store` e logs silenciosos nas rotas. Erros não expõem SQL, chaves, payloads ou resposta bruta do provedor.
- Cancelar ou sair da tela aborta a requisição e interrompe leituras/chamadas seguintes. Uma chamada já recebida pelo provedor pode ter sido processada/cobrada. Cada nova análise pode consumir tokens; não há execução automática ao carregar a tela, trocar filtros ou atualizar o header.
- O proxy Vite tem uma regra anterior à regra geral de 8 segundos para `/api/support/order-analysis`, com 300 segundos de espera pela API. Em produção, o proxy reverso deve permitir esse tempo para essa rota; o Vite não configura o proxy de produção.

## Validação

`server/tests/OrderAnalysis.test.ts` cobre SQL em fixture relacional, limites inclusivos de datas e assunto, paginação de OS e histórico, vínculos incorretos e ramal ambíguo, contagem distinta de clientes/logins, dados ausentes, minimização do payload, falha do provedor, referências inventadas, consolidação em lotes, cancelamento e permissões HTTP. Chamadas de IA são simuladas nos testes, sem envio de dados reais ou consumo de tokens.

`server/tests/AiSettings.test.ts` cobre criptografia e permissões do arquivo, reinicialização/concorrência/perda da chave mestra, cadastro e remoção de chaves separadas por provedor, manutenção de segredo ao editar modelo, substituição da configuração legada, teste sem persistência, geração Gemini com schema, evidências inválidas, instalação da tabela, conflitos de revisão, sanitização de falhas e autorização ADMIN. A análise de OS também é testada consultando a configuração mais recente a cada chamada.
