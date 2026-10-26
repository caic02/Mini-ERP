# Middleby do Brasil — Mini ERP local

Protótipo funcional em React + TypeScript e Express, com PostgreSQL/Prisma ou base Mini ERP em arquivo Access (`.mdb`/`.accdb`). A escolha da base acontece antes do login e fica salva por computador. Não há CDN, telemetria, armazenamento principal no navegador ou serviços de nuvem. Depois da preparação, frontend compilado e API operam sem internet. Não utiliza Docker.

Para usar uma base na pasta compartilhada do servidor, abra **Iniciar-MiniERP.cmd** e informe o caminho na tela inicial. Esse modo dispensa PostgreSQL nas estações e mantém o programa no próprio PC. Preparação, exportação dos dados e limites estão em [Base em arquivo compartilhado](docs/ARMAZENAMENTO-COMPARTILHADO.md). O iniciador requer Node.js e a cópia preparada do aplicativo; não é um instalador independente.

## Instalação no Windows com PostgreSQL

### Baixar do GitHub e usar a base em arquivo

1. No repositório, clique **Code → Download ZIP** e extraia todo o ZIP para uma pasta local onde seu usuário possa gravar.
2. Com **Node.js 22 ou superior e npm** disponíveis, feche o programa e execute **Preparar-MiniERP.cmd**. Ele baixa as dependências, gera o cliente e compila a interface; precisa de internet nessa primeira preparação. Não instala PostgreSQL, não cria banco e não muda firewall.
3. Abra **Iniciar-MiniERP.cmd** e selecione a base `.mdb` da pasta compartilhada. Se for começar sem cadastros, a tela oferece **Criar base vazia**.

O ZIP inclui uma cópia pública dos dados fictícios em **demo/base-demonstracao.mdb**. Selecione esse arquivo na abertura e use **usuário `demo` / senha `DemoMiniERP2026!`**. As credenciais originais e sessões foram substituídas somente nessa cópia; detalhes em [Base de demonstração](demo/README.md).

Dependências, interface compilada, `.env`, bases de uso e capturas dos cadastros não são publicados. A única base permitida no Git é essa cópia específica de demonstração. Para usar os dados da sua cópia local com as credenciais atuais, continue levando `base-portatil-20261026.mdb` separadamente. Não publique futuras bases com dados reais.

### Preparação do modo PostgreSQL

Pré-requisitos: Node.js 22 LTS com npm, PostgreSQL 17 (ou compatível 15+) e VS Code. Inclua a pasta `bin` do PostgreSQL no PATH ou informe seu caminho nos scripts. Instalar dependências exige internet uma vez. Abra PowerShell na raiz deste repositório.

1. Pelo SQL Shell (psql) ou pgAdmin, entre como administrador local do PostgreSQL. Crie uma função exclusiva, solicitando a senha interativamente; nunca coloque senha em comando, captura de tela ou histórico:

   ```sql
   CREATE ROLE middleby_rh LOGIN;
   ```

   No psql, execute `\password middleby_rh` e depois:

   ```sql
   CREATE DATABASE middleby_rh OWNER middleby_rh;
   ```

2. Configure `listen_addresses = 'localhost'` no PostgreSQL e autenticação `scram-sha-256` no `pg_hba.conf`. Mantenha o banco restrito ao computador local.

3. Configure e instale:

   ```powershell
   Copy-Item .env.example .env
   # Edite .env no VS Code: senha e nome do banco, sem publicar o arquivo.
   npm.cmd ci
   npm.cmd run db:migrate
   npm.cmd run db:generate
   npm.cmd run admin
   ```

   A senha na URL do `.env` deve ter caracteres especiais codificados para URL. Proteja o arquivo pelas permissões do Windows. O procedimento `admin` pede usuário, perfil e senha oculta; não existe senha padrão. Execute novamente para redefinir senha/perfil e revogar sessões existentes. Perfis: `RH` e `CONSULTA`. Usuários de consulta não recebem CPF, contatos pessoais, dependentes, custos, histórico administrativo ou notas restritas pela API.

4. Desenvolvimento: `npm.cmd run dev` e abra **http://127.0.0.1:5173**. Para uso local com frontend compilado:

   ```powershell
   npm.cmd run build
   # No .env: APP_ORIGIN=http://127.0.0.1:3001
   .\scripts\start.ps1
   ```

   Abra **http://127.0.0.1:3001**. Use exatamente o endereço configurado em `APP_ORIGIN` (localhost e 127.0.0.1 são origens diferentes). O script não abre portas externas nem instala serviço. Pare com Ctrl+C. `npm start` é equivalente ao iniciador.

## Primeiro uso

Os cabeçalhos das tabelas têm ícones **?** com explicações das colunas, incluindo os saldos de férias. Passe o mouse, foque pelo teclado ou clique/toque no ícone para abrir a ajuda; use Esc ou clique fora para fechar.

Após o login, escolha **Recursos Humanos** ou **Contratos e Medições**. O segundo módulo está disponível ao **RH administrador** com cadastros, contratos, itens, previsões e medições com distribuição de custos. O perfil Consulta permanece limitado aos dados profissionais e programação de RH; a API bloqueia os dados financeiros. Use **Trocar módulo** no cabeçalho para voltar à seleção sem encerrar a sessão. Ao recarregar a página, a seleção é exibida novamente.

- Em **Configurações**, confira a empresa. Só o nome fantasia Middleby do Brasil é inicializado; razão social, CNPJ e endereço ficam sem dados inventados.
- Em **Cadastros**, crie unidades, centros habilitados nas unidades, departamentos e cargos. Pode haver somente uma matriz ativa. Inativação mantém vínculos e históricos.
- Cadastre uma pessoa, depois um vínculo com matrícula única. Readmissão seleciona a pessoa existente em um novo vínculo, após encerrar o anterior. O CPF tem dígitos validados. Campos opcionais não impedem cadastro.
- Abra a ficha para dados pessoais/profissionais, dependentes, benefícios, férias, afastamentos e histórico. Mudanças profissionais exigem vigência e justificativa e são ordenadas cronologicamente.
- Crie o catálogo de benefícios antes das inclusões. Dependente familiar, dependência de IR e cobertura são registros distintos. Seguro de vida é administrado como cobertura do colaborador, sem cadastro de beneficiários indicados.
- Em **Benefícios**, cada item do catálogo tem sua própria aba para consultar as coberturas de titulares e dependentes. **Pessoas cobertas** reúne todos os benefícios; **Catálogo** permite manter os planos. O cadastro de inclusão iniciado em uma aba já seleciona o benefício correspondente.
- Nas inclusões de benefícios, registre somente o **Custo da empresa (R$)**. Não há campo de contribuição do colaborador nem processamento de descontos.
- O **Tipo de plano de saúde** é escolhido em **Plano de Saúde → Cadastrar/Editar inclusão**, individualmente para cada titular ou dependente: Básico, Apartamento ou Especial. A coluna **Plano** mostra essa escolha, sem presumir o plano do dependente a partir do titular. Registros sem escolha exibem “Não informado”.
- Em **Férias**, consulte períodos/saldos, registre programação, aprove, conclua ou cancele. Rascunho/programada não consome saldo. Aprovação reserva, conclusão converte reserva em gozo, cancelamento libera apenas sua reserva. Registros concluídos/cancelados e ajustes são imutáveis; use ajuste compensatório justificado.
- O seletor de período em novos lançamentos oculta períodos adquiridos já quitados (saldo não usufruído zerado, considerando gozo, abono e ajustes). Períodos em aquisição continuam disponíveis para planejamento; reservas ainda não são gozo. Ao editar um lançamento existente, seu período permanece selecionável, preservando a consulta do histórico.
- **Períodos e saldos** ordena primeiro prazos ultrapassados com saldo e revisões pendentes, depois prazo concessivo próximo, data limite próxima, dentro do prazo, em aquisição e quitados. Dentro de cada grupo, datas mais próximas vêm primeiro, com desempate pelo nome. A ordenação ocorre antes da paginação e mantém os filtros.
- Depois da aprovação, as situações são automáticas: **Em andamento** no dia inicial (inclusive) e **Concluída** no dia seguinte ao fim. A atualização roda ao iniciar o servidor e a cada minuto; se o sistema ficar fechado, reconcilia os lançamentos vencidos na próxima inicialização, inclusive passando diretamente de Aprovada para Concluída. A conclusão presume o cumprimento das datas aprovadas e converte a reserva em gozo, sem descontar duas vezes. Alterações reais de datas ou cancelamentos devem ser registrados pelo RH. Rascunho, Programada e Cancelada não são promovidas automaticamente. A auditoria identifica ações automáticas pelo usuário técnico desativado `sistema.ferias`, que não permite login nem redefinição pelo procedimento de criação de usuários.
- Afastamentos estão na ficha. Não informe CID, diagnóstico ou dados clínicos.

## Datas, férias e regras adotadas

Ao salvar uma aprovação, a situação é reconciliada imediatamente: se hoje está entre início e fim, fica **Em andamento**; se o fim já passou, fica **Concluída**; se o início é futuro, fica **Aprovada**. A rotina a cada minuto continua tratando as viradas de data e a retomada após reiniciar.

Datas civis são `DATE` no PostgreSQL, interpretadas em UTC apenas como representação técnica e formatadas em pt-BR. Auditoria usa `TIMESTAMPTZ`. O dia de negócio é calculado em `America/Sao_Paulo` (`BUSINESS_TIMEZONE`). Condição atual é derivada das datas a cada consulta. Prioridade: desligamento efetivo → inativo → admissão futura → maternidade → outra licença → afastamento → férias → atividade. Conflitos de ausências geram sinalização; férias aprovadas e afastamentos sobrepostos são bloqueados até revisão dos registros. Fim efetivo prevalece sobre previsto; afastamento sem nenhum fim permanece aberto.

Somente CLT recebe períodos automáticos nesta versão. Direito padrão de 30 dias só é reconhecido no dia seguinte ao fim aquisitivo e exige revisão pelo RH quanto a faltas/exceções. O período seguinte começa no aniversário da admissão; férias não suspendem sua geração. Admissão em 29/02 usa 28/02 em anos comuns e retorna a 29/02 nos bissextos, sempre calculado a partir da admissão original. Fim é o dia anterior ao próximo aniversário. Concessivo termina no dia anterior ao aniversário seguinte.

Data limite (prazo interno para concluir o gozo das férias) = data de aquisição + **11 meses civis**, com truncamento ao último dia do mês quando necessário; a própria data é o limite interno de conclusão e o marco do alerta, sem subtrair um dia. O último início para cumprir essa data é `data limite − (dias de gozo − 1)`, mostrado na programação. A data orienta o planejamento e não acrescenta bloqueio automático de aprovação. Não equivale ao prazo concessivo. Alertas inicialmente 90/60/30 dias, editáveis. A última data de início possível é `fim concessivo − (dias de gozo − 1)`; a interface de programação informa o limite conforme duração. Saldo não usufruído = direito + ajustes − abono − gozo; disponível = não usufruído − reservas. Período quitado não é irregular apenas porque o prazo passou.

Fontes oficiais consultadas em 24/10/2026: [CLT, arts. 130, 134 e 143](https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm) e [Perguntas frequentes do MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/perguntas-frequentes). Validações básicas: até três frações, cada uma com ao menos cinco dias e preservação de uma fração de ao menos 14; abono até um terço do direito. A concordância do empregado deve ser registrada. Prazo para requerimento de abono, comunicação prévia, feriados, repousos, acordos coletivos e exceções exigem conferência administrativa; o sistema não atesta conformidade legal automaticamente. Aprovação exige confirmação explícita dessa revisão. Férias fora do concessivo precisam de revisão explícita e permanecem documentadas.

Geração/reconciliação ocorre ao iniciar, a cada minuto enquanto o servidor está aberto e pelo botão de configurações. É idempotente por vínculo/início e não gera períodos que iniciem depois do desligamento. Não cria direito duplicado sobre histórico importado: intervalos conflitantes ficam para revisão.

### Histórico anterior à implantação

Na tela de períodos, edite os períodos automáticos coincidentes para registrar origem e direito correto; não cadastre outro intervalo sobreposto. Para intervalos distintos anteriores, cadastre o período manual, com limites e justificativa. Registre gozo passado como programação `CONCLUIDA`, abono como `ABONO` e diferença de saldo inicial como `AJUSTE` assinado pelo RH. O ajuste pode ser positivo ou negativo e exige justificativa; não pode produzir saldo negativo. Importação é feita por formulários, sem importador de planilha nesta versão. Antes de ajustes, confronte os registros com o histórico de origem. Não há automação jurídica de férias coletivas, mudança de marco aquisitivo ou efeitos de afastamentos.

## Logo e identidade

O logo fornecido está armazenado em `public/brand/middleby-brasil.svg` e configurado em `branding.logoUrl`, em **src/config.ts**. Origem: [SVG fornecido pelo usuário](https://www.middleby.com.br/wp-content/uploads/2019/04/logo_middlebybrasil_novo.svg). A interface carrega somente a cópia local. As cores oficiais extraídas são azul `#002F49` e vermelho `#DD2234`; o tom mais escuro é uma variação de apoio. O logo original é exibido sobre fundo branco para preservar a legibilidade. Para substituir, coloque outro arquivo em `public/` e altere essa configuração. Reconstrua o frontend. Sem arquivo, ou se ele falhar, o nome da empresa é mostrado. Cores em variáveis no início de `src/style.css`; fonte do sistema operacional, sem downloads.

## Segurança e rede interna

Sessões opacas, token aleatório com hash armazenado no banco, cookie HttpOnly/SameSite Strict, validade de oito horas, proteção de origem e CSRF nas mutações, limite de tentativas de login e hash bcrypt custo 12. API valida e autoriza todas as operações; perfil consulta usa projeção explícita. Credenciais ficam apenas no backend. Auditoria registra autor/data/campos alterados, sem copiar valores pessoais para logs técnicos. Relações históricas usam restrição de exclusão, sem exclusão em cascata. Não há rota de exclusão de pessoas: arquive pelo formulário.

Para uma futura rede interna, configure origem única, proxy HTTPS interno, cookie seguro (`COOKIE_SECURE=true`), firewall, permissões e backup antes de alterar HOST. Não disponibilize diretamente na internet. A versão padrão vincula API e Vite ao loopback. Proteja também a conta Windows e o disco: esta versão não implementa criptografia de disco, MFA ou gerenciamento de usuários pela interface.

## Base em arquivo compartilhado

**Iniciar-MiniERP.cmd** abre a configuração antes do login: informe o caminho, teste a leitura e salve. Os dois computadores devem selecionar o mesmo arquivo do servidor. O caminho é reutilizado e pode ser alterado pelo login. Criar uma base vazia é uma ação separada, com usuário administrador próprio. Arquivos indisponíveis não são recriados automaticamente.

`npm.cmd run storage:export -- --out 'C:\DadosMiniERP\base.mdb'` gera uma cópia consistente dos dados atuais em um arquivo novo, sem alterar o PostgreSQL. Foi preparada `.tools/base-portatil-20261026.mdb` com os dados da demonstração. A versão pública, com acesso próprio, fica em `demo/base-demonstracao.mdb`. Após selecionar o arquivo, os dois modos funcionam de forma independente; não existe sincronização com o PostgreSQL ou GitHub.

`npm.cmd run storage:check` mantém o diagnóstico independente de componentes e concorrência; `--folder` indica uma pasta de teste na hora. O novo adaptador e a configuração foram testados localmente, incluindo dois processos. Ainda falta homologar os dois PCs e o compartilhamento real da empresa. Instruções completas, backup consistente e limites em [ARMAZENAMENTO-COMPARTILHADO.md](docs/ARMAZENAMENTO-COMPARTILHADO.md).

## Backup e restauração locais

Use `pg_dump` completo, não CSV. Crie `%APPDATA%\postgresql\pgpass.conf` (ou caminho dedicado), com uma linha `127.0.0.1:5432:*:middleby_rh:SENHA`. Escape `:` e `\` conforme sintaxe do PostgreSQL. Edite com editor local, sem colocar senha em scripts/comandos. Restrinja ACL desse arquivo à conta Windows que executará o backup e administradores autorizados; restrinja também `.env`, pasta do banco e destino dos backups. Os dumps contêm dados de RH e devem ficar em unidade/pasta corporativa autorizada com proteção adequada.

```powershell
.\scripts\backup.ps1 -Destination 'D:\BackupsRH' -PgBin 'C:\Program Files\PostgreSQL\17\bin'
.\scripts\restore.ps1 -Backup 'D:\BackupsRH\rh-AAAAMMDD-HHMMSS.dump' -TargetDatabase middleby_rh_restore_teste
```

Restauração exige banco novo com prefixo `middleby_rh_restore_`; não limpa nem substitui o original. O usuário de restauração precisa de CREATEDB (conceda apenas a uma conta autorizada ou ajuste `-User` para o operador de restauração). O script falha se o banco já existir. Depois da restauração, aponte temporariamente uma cópia do `.env` para o banco restaurado e valide contagens, histórico e acesso antes de usá-lo. Sessões estão no dump: revogue-as no banco restaurado antes de uso real (`DELETE FROM "Session"`). Dumps não incluem funções globais/senhas do cluster; recrie a função de acesso no novo computador.

Rotina opcional no Agendador de Tarefas: crie tarefa sob conta autorizada, ação `powershell.exe`, argumentos `-NoProfile -File "CAMINHO\scripts\backup.ps1" -Destination "D:\BackupsRH"`, escolha horário e configure execução mesmo sem sessão aberta. Use o `pgpass.conf` da conta da tarefa e informe `-PgBin` se necessário. Verifique código de saída, arquivos produzidos e faça restauração de teste periodicamente. Retenção e cópia para outra unidade são decisões da empresa; nenhum envio à nuvem é configurado.

## Verificação e demonstração

```powershell
npm.cmd run build
npm.cmd test
# Somente contra banco exclusivo descartável, com migrações aplicadas:
$env:DATABASE_URL='postgresql://.../middleby_rh_test'
$env:CONFIRM_TEST_DB='SIM'
npm.cmd run test:integration
# Para os fluxos visuais (instale Chromium antes de trabalhar offline):
npx.cmd playwright install chromium
npm.cmd run test:browser
```

Testes de integração recusam banco sem sufixo `_test` e criam registros sintéticos com identificadores próprios. Não use banco real. Resultado das verificações desta entrega em `docs/VALIDATION.md`.

Dados demonstrativos são opcionais e separados: crie outro banco e aplique migrações; aponte o `.env` para ele, defina `$env:CONFIRM_DEMO='SIM'` e execute `npm.cmd run seed`. Recusa banco com pessoas/vínculos existentes e identifica todos os dados como fictícios. Não há geração silenciosa de empregados reais ou senha padrão.

Se o Windows bloquear arquivos `.ps1`, siga a política da empresa para scripts locais. O iniciador também pode ser substituído por `npm.cmd start`. Nos testes desta entrega, backup e restauração foram executados com `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ...`, liberando somente o processo do script, sem mudar a política permanente. A porta dos scripts é configurável com `-Port` (padrão 5432).

## Limitações deliberadas

- Sem folha, dados bancários, cálculo financeiro, rescisão, rateios, e-mails, integrações ou publicação externa.
- Calendário mensal mostra férias e afastamentos/licenças, com indicação profissional genérica para preservar detalhes restritos. Sobreposição de equipe é apenas alerta.
- Paginação e filtros no cliente; esta primeira versão carrega listas completas e foi dimensionada para uma única empresa, não grande volume.
- Histórico profissional aceita vigências até hoje, em ordem crescente; mudanças futuras e correções retroativas sobre outros eventos exigem revisão fora desse fluxo.
- Tipos de benefício do catálogo são os tipos previstos neste escopo; cadastros auxiliares adicionais ficam disponíveis para futura expansão.
- Exceções legais, direito reduzido, abono e férias coletivas exigem conferência documental do RH. Registros antigos irregulares podem precisar de ajuste administrativo em vez de aprovação automática.
- Login e perfis locais, sem recuperação de senha por e-mail; redefinição pelo terminal. Auditoria geral registra campos e autor; transições das medições também preservam cópias dos dados anteriores. Sem anexos.

## Contratos e Medições

Fluxo de uso:

1. Entre como RH administrador e selecione **Contratos e Medições**.
2. Em **Cadastros**, crie as condições de pagamento, fornecedores e categorias. Unidades e benefícios vêm dos cadastros de RH existentes.
3. Em **Contratos → Novo contrato**, selecione fornecedor, unidade faturada, categoria, condição e vigência. O contrato nasce **Em elaboração**, com código automático `C00001` etc. A referência externa é um campo separado.
4. Na ficha, use **Adicionar item**. Informe quantidade de referência (até três casas) e valor unitário (duas casas), unidade de cobrança e distribuição prevista. Para distribuição por pessoas, associe um benefício já cadastrado; as coberturas desse benefício serão a fonte da medição.
5. A aba **Previsões** mostra as competências geradas automaticamente. Use **Alterar situação → Vigente** depois de conferir os itens. A ativação exige ao menos um item ativo. Suspensão impede novas gerações; encerramento/cancelamento exigem data e motivo. Cancelar uma previsão exige motivo e mantém seu histórico.

Regras:

- Fornecedores, categorias e condições têm códigos automáticos e podem ser inativados, preservando vínculos. Itens também são inativados, sem exclusão de histórico.
- Fornecedores possuem **Categoria padrão** e **Condição de pagamento padrão**, opcionais. São exibidas na listagem e sugeridas no novo contrato quando os respectivos campos estiverem vazios. A sugestão pode ser alterada no contrato em elaboração; mudar o padrão do fornecedor não modifica contratos existentes.
- Tipos: Fixo recorrente, Variável recorrente e Eventual. Ambos os recorrentes usam os itens como referência mensal; o variável não representa valor efetivamente faturado. Eventuais não geram previsões mensais automaticamente.
- Valores usam `Decimal` no PostgreSQL/Prisma. Cada produto quantidade × valor é arredondado a centavos pelo método de metade para cima; o total mensal soma os produtos dos itens ativos. O total previsto não é custo realizado nem pagamento.
- Previsões abrangem todos os meses da vigência, incluindo meses parciais, sem proporcionalidade automática. Sem fim informado, vão até o mês atual (ou até o primeiro mês, se o início for futuro). O servidor reconcilia ao iniciar e a cada minuto; o botão Atualizar previsões também reconcilia. Há unicidade de contrato/competência no banco.
- Vencimento por dia fixo usa o mês da competência e limita ao último dia quando o dia não existe. Prazo em dias corridos usa o primeiro dia da competência como referência. Dias úteis e feriados não são calculados automaticamente.
- Alterações de itens e condições em contratos em elaboração atualizam previsões livres; canceladas são preservadas. Alterar o cadastro da condição de pagamento atualiza contratos em elaboração, mas não substitui regras congeladas após ativação.
- Após ativar, termos financeiros, vigência e itens ficam preservados; somente observações e antecedência de alerta continuam editáveis no contrato. Reajustes, prorrogações, correções e realinhamentos serão tratados pelo fluxo de revisões na próxima etapa. Não existe retorno de Vigente/Suspenso para Em elaboração como atalho para alterar preços.
- Encerramento cancela previsões livres a partir da competência da data de encerramento; cancelamento do contrato cancela todas as previsões livres. Competências com medição não cancelada são preservadas. As linhas são mantidas no banco. Cada previsão conserva uma cópia de referência dos dados contratuais e itens usados na geração.
- Alterações de situação, itens e termos usam transação serializável, bloqueio do contrato e controle de versão; se outra operação alterar o contrato, atualize a tela antes de salvar novamente. A API autoriza e valida os comandos e registra auditoria.

### Visão geral: painel de análise

A Visão geral de Contratos e Medições reúne valores previstos e conferidos, fechamento das competências, fornecedores, categorias, distribuição histórica dos custos e prioridades de revisão. O recorte inicial abrange as últimas seis competências até o mês de negócio atual. Use os atalhos Mês atual/Ano até agora ou informe um intervalo de até 24 competências. Os filtros de unidade faturada, fornecedor e categoria se aplicam ao painel; permanecem selecionados ao abrir um registro e voltar à Visão geral.

- **Previsto no período:** previsões não canceladas de contratos já ativados. Previsões em elaboração aparecem separadas em Como ler os indicadores. A análise segue a competência, não o vencimento.
- **Valor conferido:** somente medições Conferidas, incluindo avulsas e complementos uma vez. Rascunhos e canceladas ficam fora. Reabrir retira o valor até uma nova conferência.
- **Em preenchimento / Sem lançamento:** mostram, respectivamente, medições pendentes de conferência e previsões ainda sem uma principal válida. Clique no cartão para filtrar a lista de pendências e abrir o lançamento. Previsões de contratos vigentes podem iniciar uma nova medição; as demais abrem o contrato para análise.
- **Fechamento:** proporção de previsões com principal conferida. Complementos e avulsas não aumentam esse percentual.
- **Desvio nas competências conferidas:** confronta apenas a previsão com sua principal conferida e os complementos conferidos dessa principal. Competências sem conferência, avulsas e valores sem previsão comparável ficam fora. Uma diferença negativa não comprova economia; meses sem conferência não comprovam custo zero.
- Os rankings de fornecedores e categorias aceitam clique para filtrar o painel. A distribuição por unidades beneficiadas e centros usa os valores e nomes preservados na conferência, inclusive ajustes. O mesmo centro em unidades diferentes continua separado. Falta de distribuição histórica é identificada, sem reconstruir lotações atuais.
- O gráfico permite selecionar uma competência e restringir a análise a ela. Alertas de vigência/reajuste seguem a antecedência de cada contrato e mostram a posição atual; situações contratuais consideram a vigência efetiva no período, incluindo encerramento antecipado. Pendências são ordenadas pelo vencimento registrado.

As somas e diferenças financeiras usam centavos inteiros. O painel reutiliza os dados autorizados do módulo, atualizados a cada minuto, e oferece atualização manual e ajuda nos indicadores. Não acrescenta integração ou controle de pagamentos.

### Medições e distribuição de custos

1. Em **Medições → Nova medição**, selecione um contrato vigente, competência, referência da fatura/NF, emissão, vencimento e valor. Também é possível iniciar pela previsão ou pela ficha do contrato. Fornecedor, unidade faturada e categoria vêm do contrato. Deixe contrato vazio para uma despesa avulsa, informando esses três cadastros manualmente.
2. **Salvar e abrir distribuição** cria a medição em preenchimento. Existe uma principal não cancelada por contrato/competência. Use **Complemento** para um lançamento adicional da mesma competência; ele começa sem repetir a base de pessoas da principal.
3. Confira as linhas por **Pessoas cobertas**, **Valor por unidade / centro** ou **Percentual por unidade / centro**. Ajustes e descontos têm linha própria e justificativa. O resumo agrupa por unidade beneficiada e centro, independentemente da unidade faturada. A diferença precisa fechar em R$ 0,00; no modo percentual, a soma deve ser 100,00%, com resíduos de centavos distribuídos de forma determinística.
4. Na base por pessoas, são consideradas as datas de cobertura e do vínculo dentro do mês, incluindo dependentes cobertos. A lotação e o plano individual são copiados para a medição. O custo individual da inclusão tem preferência; quando ausente, é sugerido o valor unitário do item. A quantidade do item é referência da previsão, não um limite de pessoas. Cobertura parcial, transferências e competências históricas exigem revisão; não há proporcionalidade automática. Mudanças de plano anteriores à primeira fotografia financeira podem não ser reconstituíveis.
5. VR/VA ficam fora da base quando o afastamento cobre todo o intervalo elegível da competência. Afastamento parcial gera alerta para revisão do RH. Saúde, odontológico e seguro de vida permanecem considerados. Confirme os alertas e eventuais diferenças em relação à previsão antes de conferir.
6. **Salvar alterações → Conferir medição** valida a fatura e congela os dados utilizados. **Conferida** é a etapa final e aparece em verde com símbolo de confirmação. As situações disponíveis são **Em preenchimento**, **Conferida** e **Cancelada**.
7. **Reabrir medição** exige motivo, preserva a versão anterior no histórico e devolve a medição para **Em preenchimento**, exigindo nova conferência. O cancelamento exige medição em preenchimento e motivo; cancele os complementos antes da principal.

Medições conferidas não aceitam edição direta. Os comandos usam controle de versão e transações para impedir sobrescritas e principais duplicadas. Previsões vinculadas mostram a situação da medição e não podem ser canceladas enquanto utilizadas. O histórico identifica ação, motivo, autor e data.

A etapa manual de envio ao Financeiro foi retirada. A migração `202610240008_measurement_confirmation_final` converte registros anteriormente enviados para **Conferida**, preservando valores, rateios, fotografias de conferência e histórico. Referências antigas de envio permanecem guardadas para consulta histórica, sem controles ou efeito no fluxo atual.

Ainda não disponíveis: revisões contratuais, anexos e exportação financeira. Não há importação automática do JSON do projeto anterior. Consulte [o mapa de adaptação](docs/CONTRATOS-MEDICOES.md).

As novas migrações são aplicadas com `npm.cmd run db:migrate`. No Windows, pare a API antes de executar `npm.cmd run db:generate` se o Prisma informar que a DLL está em uso; depois reinicie normalmente. A pasta `.tools/` e o banco `_test` são isolados dos seus dados atuais.
