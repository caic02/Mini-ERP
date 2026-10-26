# Evidências de validação

## Máscara para valores monetários

Componente compartilhado aplicado à nova medição, fatura existente, linhas monetárias (incluindo ajustes negativos), preço unitário de contrato e custo de benefício. Usa ponto para milhares e vírgula para centavos, completando duas casas ao sair do campo. Aceita colagem no formato brasileiro ou decimal da API e preserva strings decimais, sem conversão de moeda para Number. Percentuais, quantidades e dias conservam seus campos numéricos. Validados 26 testes de domínio/conversão, TypeScript, build Vite e 2 fluxos Chromium com digitação de 19680, colagem de R$ 19.680,50, edição filtrada, salvamento/conferência de medição e preço de contrato.

## Pesquisa na distribuição da medição

Adicionada busca por nome do titular ou dependente, desconsiderando maiúsculas e acentos, com contador, limpeza e estado sem resultados. O filtro conserva os índices originais das linhas e afeta somente a apresentação: cálculo, resumo e salvamento continuam usando toda a distribuição. Adicionar ajuste/centro limpa a pesquisa para mostrar a nova linha. Verificações: TypeScript, build e fluxo Chromium de medição com filtro por dependente, edição da linha correta, preservação das outras linhas e limpeza da busca antes da conferência.

## Correção do botão Procurar

O seletor nativo sem janela proprietária foi substituído por um diálogo dentro da página. A rota local protegida de navegação retorna somente pastas e nomes de bases .mdb/.accdb; não abre nem modifica o conteúdo. Um caminho de arquivo abre sua pasta, erros de acesso ficam no diálogo, e selecionar uma base preenche o campo original. A automação cobre abertura pelo botão, navegação, erro/recuperação e seleção. A reconciliação deixa de registrar indisponibilidade enquanto a primeira escolha da base está pendente.

Validação da correção: TypeScript, build Vite, 6 testes de armazenamento (incluindo listagem real e rota de navegação) e 2 fluxos de configuração no Chromium. O seletor também foi conferido a 390 px e pelo fechamento com Escape. Não houve alteração dos dados atuais.

## Base em arquivo e configuração inicial — 26/10/2026

Entregues adaptador transacional Access com controle de revisão, perfil local por computador, configuração antes do login (caminho manual, seleção pelo Windows, teste de leitura, base nova e recuperação), iniciador local e exportação consistente de PostgreSQL ou de arquivo. O PostgreSQL e `.env` atuais foram preservados. A exportação `.tools/base-portatil-20261026.mdb` passou pela comparação integral após releitura: 30 pessoas/vínculos, 15 dependentes, 180 coberturas, 103 períodos, 10 contratos, 9 medições e todos os demais cadastros/históricos. Sessões não são copiadas.

Resultados: 25 testes de domínio; 28 testes de integração no adaptador de arquivo, em uma base descartável vazia; 5 testes próprios do armazenamento/configuração; 7 fluxos Chromium no modo arquivo; 28 testes de regressão em PostgreSQL descartável na porta 55432, encerrado após a execução. TypeScript estrito e build Vite aprovados. Nenhum componente instalado ou firewall alterado.

Dois processos independentes, no mesmo PC, partiram da mesma revisão: uma alteração e seu histórico confirmaram, a outra recebeu P2034. Alterações em registros diferentes persistiram com novas tentativas. Violação de unicidade ao fim da transação reverteu cadastro e auditoria; FK inválida e exclusão referenciada foram recusadas sem mudar a revisão. Arquivo ausente não foi recriado; identidade diferente foi recusada. API de configuração validou origem/token, criação, recusa de sobrescrita, perfil local sem senha, login e retorno de indisponibilidade. Interface com caminho manual, erro de acesso, confirmação de senha, troca de base e layout a 390 px. Capturas `configuracao-base-desktop.png` e `configuracao-base-mobile.png`.

O ensaio inicial executando três suítes inteiras simultaneamente contra o mesmo retrato provocou esgotamento das tentativas (409), sem perda de dados. O adaptador limita as tentativas e ordena gravações dentro do processo; há espera com variação entre disputas. As suítes funcionais usam um arquivo isolado com execução sequencial entre arquivos de teste; a disputa entre dois processos tem teste separado. A adaptação também revelou uma corrida na interface financeira: o diálogo fechava antes da atualização dos cadastros, permitindo abrir o próximo formulário com opções antigas. O salvamento agora aguarda a atualização, preservando o estado ocupado e a seleção recém-cadastrada.

Limites: retrato JSON completo em uma linha Memo, máximo de 16 MB, operações Prisma limitadas ao subconjunto usado no projeto, dependência de componente OLE DB Windows e desempenho inferior ao PostgreSQL. Validado Jet 4 x86/.mdb neste PC; não homologado ACE/.accdb, pasta SMB da empresa, duas estações reais, queda de rede, desligamento durante commit ou restauração operacional. Falta a homologação na rede real; a simulação de arquivo ausente e os testes locais não a substituem. As etapas marcadas pendentes na prova de 25/10 abaixo são o registro histórico daquela data; adaptador e tela foram implementados nesta atualização.

## Prova de banco em arquivo — 25/10/2026

Adicionado `npm.cmd run storage:check`, com auxiliar .NET compilado para 32/64 bits e verificação de ACE 16/12 e Jet 4 disponíveis. Execução independente de Prisma/.env/PostgreSQL, em uma pasta descartável exclusiva. Não houve instalação de componente, alteração de firewall ou migração dos dados atuais.

TypeScript aprovado. Diagnóstico completo aprovado localmente com **Jet 4, 32 bits, `.mdb` legado**; ACE não disponível neste PC. Dois processos no mesmo registro produziram uma gravação e um conflito. Em registros diferentes, ambos salvaram, com três históricos no total. Reversão após violação de unicidade, chave estrangeira e texto com acentos/apóstrofo/travessão aprovados; valores monetários preservados. Relatório: `.tools/file-storage-probe/runs/MiniERP-diagnostico-c4baa4d5-dc22-44ae-89de-2b911c20db34/diagnostico.json`.

Não validado: pasta da empresa, duas máquinas reais, queda de conexão, compatibilidade dos computadores da empresa e migração das regras do Mini ERP. A configuração manual antes do login e o adaptador de armazenamento permanecem pendentes; requisitos e critérios foram registrados em `ARMAZENAMENTO-COMPARTILHADO.md`.

## Tela de acesso — 25/10/2026

Apresentação da marca e formulário reunidos em um cartão central com largura máxima de 1040 px. Espaçamentos fixos dentro do cartão substituem a separação proporcional à tela; em tablet e celular, os dois painéis ficam empilhados. Logo, cores, campos e autenticação existentes foram preservados.

TypeScript e compilação Vite aprovados. Prévia da aplicação no Chromium conferida em 2518×980, 1920×1080, 1366×768, 1024×768, 768×1024, 390×844, 320×568 e 1366×600: cartão centralizado, sem overflow horizontal, logo carregado e ordem de foco Usuário → Senha → Entrar. Interação do formulário verificada com respostas simuladas da API, incluindo erro visível e passagem à seleção de módulos; não houve autenticação real nem acesso ao banco nessa prévia. Sem erros de JavaScript. Capturas `login-ultrawide.png`, `login-desktop.png`, `login-tablet.png` e `login-mobile.png`.

## Padronização dos indicadores do módulo

Contratos, previsões, medições, itens e cadastros de Contratos e Medições agora compartilham `StatusBadge`. Vigente/Ativo e Conferida usam verde; elaboração, preenchimento e suspensão usam âmbar com ícones distintos; encerramento/inativação usam cinza; cancelamento usa vermelho; Prevista usa azul. Altura, fonte, peso e espaçamentos são comuns nas listagens e fichas.

TypeScript e compilação Vite aprovados. Prévia dos componentes reais revisada em Chromium a 1440, 768 e 390 px: 11 indicadores com mesma altura, fonte de 12 px em negrito e ícone, sem overflow da prévia. Capturas `situacoes-modulo-desktop.png` e `situacoes-modulo-mobile.png`. Não houve alterações de regras ou dados.

## Dashboard de Contratos e Medições

Visão geral substituída por um painel analítico com filtros de competência, unidade faturada, fornecedor e categoria; atalhos de período; cartões de valores; evolução mensal; fechamento; desvio comparável; rankings; distribuição histórica; alertas e pendências com acesso aos registros. Filtros gerais são preservados ao abrir registros e voltar. A lista de pendências mostra oito registros por página; as outras tabelas mantêm a paginação anterior.

- **25 testes de domínio aprovados**, incluindo 6 novos testes de dashboard. Cobertos: competência equivalente na comparação; principal, complementos e avulsas sem dupla contagem; exclusão de rascunhos/canceladas; previsões em elaboração separadas; filtros de faturamento; nomes e lotações históricos; um centro em duas unidades; meses sem conferência como ausência de dado; centavos exatos; base prevista zerada; distribuição histórica ausente; encerramento antecipado; alertas inclusivos; virada de ano e validação do intervalo.
- **5 fluxos Chromium aprovados**, incluindo o novo teste de dashboard e os fluxos existentes de RH, Consulta, medição e contratos. Verificados totais, filtros cruzados, ajuda por teclado, seleção do mês no gráfico, detalhamento por competência, lançamento iniciado pela pendência, período inválido, recorte vazio e larguras 1440/768/390 px. Após ajuste final de vigência efetiva, o teste específico do dashboard foi repetido e aprovado. TypeScript, formatação dos arquivos alterados e compilação Vite aprovados.
- Revisão visual com leitura dos dados atuais, sem gravações nesse banco. Capturas: `dashboard-contratos-desktop.png`, `dashboard-contratos-tablet.png` e `dashboard-contratos-mobile.png`. Sem erros de JavaScript ou overflow horizontal da página. No recorte maio–outubro/2026: previsto de contratos ativados **R$ 306.858,00**, conferido **R$ 40.441,01**, em preenchimento **R$ 11.260,00** e previsões sem lançamento **R$ 257.305,00**. Há 4 de 42 competências conferidas; nas 4 comparáveis, o desvio é **R$ 8,00 acima do previsto**. Avulsas ficam fora dessa comparação.
- Não foram acrescentadas dependências, migrações ou permissões. O painel usa o bootstrap já autorizado ao RH administrador. Somas e diferenças usam centavos inteiros; proporções servem à apresentação dos gráficos. Rateios e nomes consolidados vêm das fotografias de conferência. Consulta continua sem acesso financeiro. Exportação e relatórios para impressão permanecem pendentes.

## Conferida como etapa final

Removidos o estado Enviada ao Financeiro, a ação de envio, a opção de filtro, o indicador azul e os avisos de envio. A ficha mostra a data de conferência. O fluxo atual usa Em preenchimento, Conferida e Cancelada; reabertura de Conferida exige motivo e nova conferência.

- Migração `202610240008_measurement_confirmation_final` validada primeiro no banco isolado e aplicada ao banco atual. As 3 medições enviadas do banco atual passaram para Conferida, com incremento de versão, histórico automático e auditoria. Os 9 registros permaneceram, com valores, linhas, fotografias de conferência e histórico anterior preservados; os demais registros foram comparados antes/depois e permaneceram iguais. Metadados antigos de envio permanecem apenas para histórico.
- TypeScript, compilação Vite e **28 testes de integração** aprovados. A validação rejeita o comando antigo ENVIAR; restrição no PostgreSQL rejeita o estado ENVIADA. A rejeição preserva versão, fotografia e histórico da medição.
- **1 fluxo Chromium** aprovado: conferência final, ausência do botão/campo/filtro de envio, reabertura justificada, correção, nova conferência e complemento. Capturas desktop e celular atualizadas em `medicao-conferida-desktop.png`, `medicao-desktop.png` e `medicao-mobile.png`. Os registros abaixo documentam versões anteriores do fluxo.

## Medições, distribuição e destaque da conferência

Medições habilitadas para RH administrador, com principal por contrato/competência, avulsa, complemento, distribuição por pessoas/valores/percentuais, ajustes, conferência, registro de envio externo e reabertura justificada. O indicador **Conferida** usa fundo verde, texto branco em negrito e símbolo de confirmação; **Enviada ao Financeiro** usa azul e marcador de envio. Os indicadores são compartilhados pelas listagens, ficha e previsões.

- Migração `202610240007_measurements` aplicada ao banco configurado e ao isolado, com relações, unicidade parcial de principal, validação de estados e valores. Conferência congela dados; transições preservam a versão anterior com autor e motivo.
- **19 testes de domínio, 27 de integração PostgreSQL e 4 fluxos Chromium aprovados**, além de TypeScript, compilação Vite e formatação dos arquivos alterados. A geração Prisma atualizou os artefatos do cliente, mas a substituição da DLL da mesma versão foi bloqueada pelo servidor em execução; o motor existente foi exercitado nos testes sem encerrar a aplicação do usuário.
- Casos de integração incluem concorrência entre principais, herança da unidade faturada, pessoa e dependente com plano individual, lotação por vigência, cobertura histórica, VR/VA durante afastamento, proteção de previsões utilizadas, centavos exatos, validação de centro/unidade, confirmação de divergência, imutabilidade após conferência, reabertura e preservação de versão, complementos e ordem de cancelamento. Erros de serialização SQL `40001`/`40P01` em bloqueios explícitos também entram na repetição da transação.
- Fluxo Chromium de medição: contrato de saúde com titular e dependente, revisão de alertas, conferência, registro de envio, reabertura com motivo, correção de valores, nova conferência e complemento manual por centro. Conferido o fundo verde do indicador e revisadas capturas em desktop 1440 px e celular 390 px, sem erro de JavaScript ou overflow horizontal da página: `medicao-conferida-desktop.png`, `medicao-desktop.png` e `medicao-mobile.png`. Formulário novo usa rótulos associados aos campos, inclusive no seletor de contrato.
- Conferência somente de leitura no banco atual: 30 pessoas, 30 vínculos, 15 dependentes, 5 benefícios, 180 inclusões, 103 períodos de férias, 10 fornecedores, 10 contratos, 96 previsões e 1 medição. Os testes de criação e transição foram executados no banco `_test`, sem inserir essas massas no banco atual.

Revisões contratuais, anexos, relatórios e exportações financeiras continuam fora desta entrega. Registrar envio não envia mensagens nem representa pagamento. Competências históricas e alterações de plano anteriores à primeira fotografia exigem revisão documental do RH.

Categoria padrão do fornecedor: migração `202610240006_supplier_category` aplicada ao banco configurado e ao isolado, sem alterar contratos existentes. Cadastro e listagem de fornecedor agora exibem categoria padrão; contrato novo sugere categoria e condição quando os campos estão vazios. API valida referências e preserva vínculo com cadastro posteriormente inativado. TypeScript, Vite, 20 testes de integração e 3 fluxos Chromium aprovados. No banco atual foram cadastradas 10 categorias e 5 condições de pagamento fictícias e associados os 10 fornecedores, com auditoria e conferência posterior.

## Contratos e Medições — primeira etapa

Implementados fornecedores, categorias, condições de pagamento, contratos, itens, associação a benefícios e previsões mensais, com API autorizada para RH administrador. Módulo habilitado no seletor; Consulta não tem acesso financeiro, inclusive por chamadas diretas. Medições, rateios e revisões não foram habilitados nesta etapa.

- Migrações `202610240004_contracts_foundation` e `202610240005_contract_constraints` aplicadas ao banco configurado e ao banco isolado. As migrações acrescentam entidades e restrições; não substituem os dados de RH.
- TypeScript estrito, compilação Vite e checagem Prettier aprovados. A tentativa inicial de `prisma generate` atualizou os artefatos do cliente, mas reportou DLL em uso ao substituir o motor da mesma versão; cliente e motor existentes foram exercitados com sucesso nos testes. Não foi encerrado o servidor do usuário para liberar essa DLL.
- **15 testes de domínio, 19 de integração PostgreSQL e 3 fluxos Chromium aprovados (37 no total).**
- Novas verificações: centavos/quantidades, fevereiro bissexto, mês parcial, contrato sem fim, eventual sem mensalidades, uma previsão por competência em concorrência, códigos automáticos, cancelamento preservado, alterações em elaboração, bloqueio após ativação, controle concorrente de versão, atualização de condição sem afetar contratos ativados, cancelamento anterior ao início, autorização e auditoria.
- Fluxo de interface executado: criar condição/fornecedor/categoria, criar contrato, adicionar item de 2,5 × R$ 100,10, conferir três previsões de R$ 250,25, ativar, cancelar uma previsão, voltar à seleção. Desktop 1440 px e celular 390 px, sem overflow horizontal da página e sem erros de JavaScript. Capturas revisadas: `contratos-desktop.png` e `contratos-mobile.png`.
- Conferência do banco atual: 30 pessoas, 30 vínculos, 15 dependentes, 5 benefícios, 180 inclusões e 103 períodos de férias. Nenhum fornecedor, contrato ou previsão fictícia foi inserido nesse banco durante os testes do novo módulo.

As demais entradas abaixo registram validações das etapas anteriores.

Transição imediata na aprovação: ao salvar, o próprio lançamento é reconciliado na mesma transação e a resposta já contém Em andamento/Concluída conforme as datas. Sem varrer outros lançamentos durante o salvamento. Auditoria técnica preservada. TypeScript e Vite aprovados; 12 testes de integração aprovados, incluindo aprovar início hoje, ontem e futuro, reservas, cancelamento e conclusão histórica imediata.

Automação de férias: somente Aprovada/Em andamento avançam pelas datas civis, em transação com bloqueio do período e auditoria técnica. Rotina integrada à inicialização, atualização a cada minuto e reconciliação manual. TypeScript e compilação Vite aprovados; 11 testes de domínio, 11 de integração e 2 fluxos Chromium aprovados. Casos novos incluem início/fim inclusivos, conclusão após aplicativo fechado, reservas convertidas em gozo sem desconto adicional, pendências/cancelamentos preservados, execução simultânea e repetição sem duplicação de auditoria. Executada primeira atualização no banco configurado: zero lançamentos pendentes de transição naquele momento.

Ajuda das colunas: ícones ? nos cabeçalhos com descrições, exemplos e fórmulas dos saldos de férias. Ajuda com portal fora do contêiner de rolagem, posicionamento limitado à janela, abertura por hover/foco/clique e fechamento por Escape/clique externo. TypeScript e Vite aprovados; dois fluxos Chromium aprovados, cobrindo fórmulas, foco de teclado, hover, Escape, clique externo e largura de 390 px com caixa inteiramente dentro da tela. Captura: `ajuda-colunas-mobile.png`.

Correção do plano individual: migração `202610240003_individual_health_plan` aplicada ao banco configurado e ao banco isolado de testes. Adicionado `Enrollment.plan` com restrição às três opções; seleções válidas do catálogo são preservadas nas coberturas existentes, sem preencher dados ausentes. Campo exibido na inclusão de saúde para cada titular/dependente, retirado do formulário do catálogo de saúde e coluna baseada na cobertura individual. TypeScript, compilação Vite, 10 testes de integração e 2 fluxos Chromium aprovados. No navegador, dependente mudou de Especial para Apartamento, persistiu no PostgreSQL e o titular permaneceu em Básico. A geração Prisma atualizou o cliente, mas reportou EPERM ao substituir a DLL da mesma versão em uso pelo servidor; o cliente atualizado e o motor existente foram exercitados com sucesso nos testes, sem interromper a aplicação do usuário.

Abas por benefício: cada plano do catálogo agora possui uma aba de coberturas, com titulares e dependentes filtrados pelo ID do benefício. Mantidas as visões Catálogo e Pessoas cobertas. A aba de Seguro de Vida consulta coberturas, sem reintroduzir indicações de beneficiários. TypeScript e compilação Vite aprovados; dois fluxos Chromium aprovados, incluindo isolamento entre saúde/seguro, exibição de dependente, benefício pré-selecionado no cadastro e retorno à visão geral das coberturas.

Remoção solicitada: cadastro de beneficiários indicados do seguro de vida retirado da interface e da API. Seguro de vida permanece como benefício/cobertura normal. TypeScript e compilação Vite aprovados; 10 testes de integração e 2 fluxos Chromium aprovados, incluindo ausência da aba, rota de consulta antiga retornando 404 e rejeição de novos cadastros pela camada de serviço. A tabela legada `Nomination` foi preservada, sem acesso pela aplicação, para evitar exclusão de histórico e alteração das migrações já aplicadas.

Seleção de módulos: TypeScript e compilação Vite aprovados; os dois fluxos existentes de Chromium foram atualizados e passaram com a etapa pós-login. Conferidos RH disponível, Contratos e Medições somente como “Em breve”, retorno por “Trocar módulo”, recarregamento com sessão ativa, logout pela seleção e acesso de consulta. Capturas revisadas em 1440 px e 390 px: `modulos-desktop.png` e `modulos-mobile.png`. O build completo não pôde regenerar o Prisma nesta atualização porque sua DLL estava em uso pela aplicação do usuário; schema e migrações permaneceram inalterados. A aplicação do usuário não foi interrompida.

Atualização visual: logo oficial fornecido incorporado como SVG local; azul `#002F49` e vermelho `#DD2234` aplicados aos tokens da interface. Build aprovado novamente. Chromium confirmou carregamento do logo e ausência de overflow horizontal em 1440 px e 390 px na tela de login; capturas `logo-login-desktop.png` e `logo-login-mobile.png`. Esta conferência utilizou prévia estática, sem depender do banco.

Ambiente: Windows, Node.js portátil 22.16.0, PostgreSQL portátil 17.5 em `127.0.0.1:55432`, banco exclusivo `middleby_rh_test`, Chromium via Playwright. Nenhuma instalação de serviço, alteração de banco preexistente ou publicação externa. Todos os dados de testes e capturas são sintéticos.

| Verificação | Resultado |
|---|---|
| Prisma: schema e geração de cliente | Aprovado |
| Aplicação das duas migrações em banco vazio | Aprovado |
| TypeScript estrito e build Vite | Aprovado |
| Testes unitários de domínio | 10 aprovados |
| Integração com PostgreSQL real | 9 aprovados |
| Fluxos no Chromium | 2 aprovados |
| Auditoria npm, incluindo desenvolvimento | Zero vulnerabilidades conhecidas no momento da execução |
| Backup com script PowerShell/pg_dump | Executado, formato custom |
| Restauração com script em banco novo separado | Executada; contagem de pessoas conferida |

Testes de domínio cobrem limites inclusivos, reconhecimento de direito, fim de mês, 29/02 com retorno ao dia original em ano bissexto, término de vínculo, saldo com programação/reserva/gozo/cancelamento/abono/ajuste, fracionamento, CPF, prioridade de condição temporária e ausência de campos restritos na projeção de consulta.

Integração cobre reconciliação repetida após vários anos, edição/importação sem duplicação, duas aprovações concorrentes com saldo insuficiente para ambas, conversão de reserva em gozo, liberação por cancelamento, conflito com afastamento, encerramento/readmissão, unicidade de matriz ativa no banco, autoria da auditoria, dependentes independentes de cobertura, inclusão/exclusão com vigências, indicação de seguro em rascunho/completa, inativação/arquivamento com preservação de vínculos, exclusão de pessoa impedida por FK, autenticação, autorização de consulta na API, CSRF e origem.

No navegador: login, criação real de unidade pela interface, navegação pela ficha e suas abas, formulário de férias com cálculo de fim/retorno/último início possível, fechamento por Escape, calendário, perfil de consulta e verificação de ausência de rolagem horizontal da página a 390 px. Desktop a 1440 px. Capturas revisadas visualmente em `docs/screenshots/`.

Durante o desenvolvimento, o navegador detectou renderização da lista anterior durante troca de tela; a transição foi corrigida e o fluxo repetido com sucesso. Dependências vulneráveis apontadas pela auditoria foram atualizadas e a auditoria repetida. Não são verificações de conformidade WCAG completa, auditoria independente de segurança ou testes com usuários.

Não executado: instalação interativa de um PostgreSQL definitivo, definição de senha do administrador real, agendamento efetivo de backup pelo Windows e configuração real do logo. Dependem da instalação e dos dados fornecidos pelo operador. A senha oculta é implementada no procedimento local, mas não houve criação interativa de usuário real nesta entrega.

Ferramentas temporárias e dados de testes ficam em `.tools/`, fora do Git; não representam o banco de uso real. O PostgreSQL de testes é encerrado após a validação. Instruções reproduzíveis em `README.md`.
