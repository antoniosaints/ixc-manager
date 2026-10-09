# Manobra de portas na CTO

O botão **Manobra de portas** fica ao lado de **Ver no mapa** e **Atualizar caixa** no modal da CTO. Ele permite mover um login para uma porta livre ou trocar os cadastros de dois logins da mesma CTO, com revisão e confirmação antes das gravações.

## API e vínculos

A coleção Postman do IXC documenta `PUT /radusuarios/{id}`, com `id_caixa_ftth` e `ftth_porta`, e a edição de `radpop_radio_cliente_fibra`, com `id_caixa_ftth` e `porta_ftth`. O backend preserva os valores atuais do formulário documentado e muda somente a porta. Quando existe uma ONU única e compatível, o vínculo dela também é atualizado. A manobra não exclui o login, não desautoriza a ONU e não envia comandos de provisionamento à OLT. A mudança física de porta deve acompanhar a revisão dos cadastros.

A leitura direta verifica capacidade, CTO ativa, login/cliente/contrato, ONUs, portas compartilhadas e reservas de rede neutra. Logins inativos continuam ocupando suas portas. ONUs sem vínculo, compartilhadas, duplicadas ou divergentes bloqueiam as portas envolvidas. Cadastros de rede neutra não podem ser manobrados por esta ferramenta. A alteração é restrita à mesma CTO.

O formulário da API pode omitir campos disponíveis no banco, como `onu_compartilhada` e `serial_number`. Campos opcionais só são comparados entre as duas fontes quando presentes na resposta da API. Os vínculos obrigatórios continuam sendo exigidos, e as flags de ONU compartilhada/rede neutra são revalidadas pelo banco antes de cada gravação, inclusive quando omitidas pela API.

## Permissão

São exigidas conjuntamente `network.boxes.view`, `network.logins.view` e `network.ports.manage`, na interface e em todas as rotas. Administradores têm acesso; o novo modelo **Manobra de portas** pode ser aplicado pelo administrador. Perfis personalizados e modelos de consulta existentes não recebem essa escrita automaticamente. A sessão e a permissão são conferidas novamente antes de cada gravação.

## Troca, falhas e recuperação

A troca exige uma porta livre temporária, apresentada na revisão: move o primeiro login e sua ONU para essa porta, grava o segundo na origem e grava o primeiro no destino. A ocupação dessa porta é revalidada antes das gravações. Se não houver uma porta livre, a troca é bloqueada antes de alterar qualquer cadastro. A ONU nunca é enviada para porta `0`. Cada grupo mantém o cadastro da ONU consistente e cada gravação tem leitura de confirmação. Nenhuma exclusão é executada. Uma reserva distribuída de CTO, OLT e logins usa o mesmo coordenador Redis das operações de ONU, com renovação antes das gravações. Não há tarefa em segundo plano.

A restauração ordena os movimentos conforme a ocupação atual, usando uma porta temporária apenas quando existe um ciclo. Assim, o caso antigo de login na porta `0` com ONU ainda na origem é corrigido salvando somente o login na porta original; não há nova tentativa de enviar porta `0` à ONU.

O botão **Mudar porta** nas ações do login abre a edição individual, com a mesma permissão, revisão, confirmação e coordenação. Essa opção grava apenas `ftth_porta` do login na CTO atual e preserva o cadastro da ONU. Permite corrigir porta `0` ou divergências para a porta da própria ONU, mas bloqueia portas de outros logins, outras ONUs, reservas e vínculos incompatíveis. O resultado confirmado atualiza a porta exibida nos detalhes do login.

Antes de executar, o navegador salva em `localStorage` apenas a referência da operação, usuário/CTO, IDs/nome dos logins e portas revisadas. Não salva senhas, MACs ou o formulário completo. O plano validado fica no servidor, associado ao usuário: o conteúdo local nunca é usado como instrução de gravação. A revisão dura cinco minutos; uma operação iniciada mantém seu resultado por uma hora no Redis. Reabrir o modal consulta a operação salva e não reenvia comandos.

Uma rejeição antes de qualquer gravação permite nova revisão. Uma falha após uma gravação interrompe a sequência e oferece **Restaurar portas originais**, que primeiro consulta os cadastros e apresenta outra revisão/confirmação. Uma resposta incerta nunca é reenviada automaticamente. **Consultar resultado** confere os vínculos finais novamente; se estiverem completos e consistentes, confirma a conclusão sem novos PUTs. Caso contrário, a recuperação exige que as reservas anteriores tenham expirado, os mesmos vínculos permaneçam e as portas originais estejam disponíveis. Mudanças externas ou revisões expiradas exigem conferência no IXC; o lembrete local só é removido manualmente após essa conferência.

O IXC não oferece uma transação atômica entre os dois logins e ONUs. As reservas evitam concorrência entre operações deste aplicativo; edições feitas diretamente no IXC são detectadas nas revalidações, mas não participam dessas reservas. Por isso, falhas parciais são apresentadas explicitamente e a recuperação é revisada.

## Validação

A CTO #4654 foi consultada por leitura na API e no banco: capacidade 8, uma porta ocupada e sete livres; login #17365 e ONU #28951 concordam em CTO/porta. Nenhum PUT foi enviado a clientes reais nessa validação. Os testes simulam movimentação livre, troca, ONU ausente, espelhamento automático, duplicidades/reservas, mudança de ocupação, permissões revogadas, rejeições, resultado incerto, recuperação e isolamento do lembrete local.

Na CTO #4663, a API omite `onu_compartilhada`, enquanto o banco retorna `N` para a ONU #35295. Após corrigir essa comparação, a revisão do login #27547 da porta 1 para a porta 2 foi validada com leituras reais e gravações desativadas. Os testes de regressão cobrem omissões da API, divergências explícitas e mudança dessas flags antes ou durante a execução.

Na falha da CTO #4667, consultas de leitura confirmaram login #26930 na porta `0` e ONU #35524 na porta `1`, com o segundo login/ONU ainda na porta `8`. A sequência anterior tentava usar porta `0` também na ONU, uso não garantido pelo formulário documentado do IXC. Os testes agora recusam ONU na porta `0` e colisões, exercitam a troca temporária, a falta ou reserva da porta temporária, a recuperação do caso antigo e a edição individual sem gravação da ONU. Uma revisão individual foi validada na CTO real com gravações desativadas; nesse momento o login já havia sido restaurado externamente para a porta `1`.

## Transferência entre caixas

**Manobra de caixa** no modal da CTO e **Mudar caixa** nas ações do login abrem a transferência para uma porta livre de outra CTO ativa da mesma OLT. O destino pode ser buscado por nome ou ID. A mesma numeração de porta é permitida em CTOs diferentes. A permissão `network.ports.manage`, junto das permissões de visualizar caixas e logins, continua obrigatória em todas as rotas.

O servidor relê ambas as caixas, capacidade, ocupação (incluindo cadastros inativos), reservas, contrato, cliente e vínculos da ONU antes de revisar e antes de cada gravação. A revisão apresenta caixa/porta de origem e destino. A execução reserva ambas as CTOs, a OLT e o login; grava `id_caixa_ftth`/`ftth_porta` do login e `id_caixa_ftth`/`porta_ftth`/`id_projeto` da ONU, preservando os demais campos permitidos. OLT, PON, VLAN, perfis e credenciais não são modificados. Transferências entre OLTs são recusadas, pois precisam de reautorização do equipamento. O cadastro não executa a mudança física do cabo.

Não libera a origem em porta zero, não troca automaticamente ocupantes de caixas diferentes e não faz exclusões. O resultado só é sucesso após leitura dos vínculos finais; falhas parciais mantêm referência local das duas caixas e recuperação revisada, que pode restaurar caixa, porta e projeto originais se ainda estiverem disponíveis. Respostas perdidas são consultadas sem repetir PUT. Testes simulam as gravações; nenhum equipamento real é movido durante a validação.
