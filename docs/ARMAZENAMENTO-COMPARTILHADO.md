# Base em arquivo e configuração por computador

Implementado em 26/10/2026: o sistema pode usar PostgreSQL ou uma base Mini ERP em arquivo Access (`.mdb`/`.accdb`). A escolha acontece antes do login e fica salva neste computador. Os dados existentes continuam no PostgreSQL até o operador selecionar explicitamente outra base.

## Abrir o programa

Com Node.js, dependências e frontend compilado disponíveis, execute `Iniciar-MiniERP.cmd`. Ele abre o navegador em **http://127.0.0.1:3401**, mantém a API somente no próprio computador e não instala serviço nem altera firewall. Mantenha a janela do iniciador aberta. Cada pessoa executa sua cópia local do programa; somente o arquivo de dados fica no servidor.

Na primeira abertura:

1. Escolha **Abrir base existente**.
2. Digite o caminho completo, por exemplo `\\servidor\RH\MiniERP\base.mdb`, ou use **Procurar…**. O seletor abre dentro da página, aproveita o caminho digitado e permite entrar em pastas, voltar à pasta anterior e escolher o arquivo. Não depende de janela externa do Windows.
3. Use **Testar acesso** para conferir leitura, estrutura, quantidade de pessoas e identificação da base.
4. Clique **Salvar e continuar** e entre com o usuário daquela base.

O segundo computador deve selecionar o **mesmo arquivo**, com a mesma identificação. Não crie uma base para cada pessoa. Nas aberturas seguintes, o caminho válido é reutilizado. **Alterar base de dados**, no login, permite trocar o caminho. Uma base indisponível exibe a configuração com opção de tentar novamente; o sistema não cria outra nem muda para dados locais automaticamente.

**Criar base vazia** é uma opção separada: exige caminho de um arquivo novo e usuário/senha do primeiro administrador. Inicializa empresa e opções auxiliares, sem funcionários ou contratos. Arquivos existentes são recusados. Não é a opção para levar os dados da demonstração.

## Preparar uma cópia para outro PC

Na pasta local do projeto, prepare as dependências, o cliente de dados e a interface:

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run build
```

Cada estação precisa ter Node.js disponível e uma cópia local preparada do aplicativo, incluindo `node_modules`, `dist`, `server`, `scripts` e os arquivos da raiz. Uma cópia preparada no Windows pode ser levada com as dependências; não é preciso instalar PostgreSQL para usar o modo de arquivo. Não transporte `.env`, `.git`, `.tools`, dumps nem pastas do PostgreSQL como parte do programa. Leve a base escolhida separadamente. Este iniciador não é um instalador nem um executável independente de Node.js.

O acesso em arquivo usa o .NET Framework e componentes Access/OLE DB já disponíveis no Windows. O programa compila um auxiliar local em 32/64 bits, sem instalar componentes ou mudar a política de scripts. Neste PC foi validado **Jet 4 em 32 bits para `.mdb`**. `.accdb` exige ACE. Se os componentes ou a execução do auxiliar forem bloqueados nos computadores da empresa, a configuração apresenta erro; isso depende do ambiente corporativo e ainda precisa ser conferido nos dois PCs.

## Levar os dados atuais

Com o PostgreSQL atual acessível pelo `.env`, exporte para um arquivo **novo**:

```powershell
npm.cmd run storage:export -- --out 'C:\DadosMiniERP\base.mdb'
```

A pasta precisa existir. O comando lê todas as tabelas em uma transação consistente, cria a base com identidade própria e compara integralmente os dados relidos, incluindo datas, decimais e fotografias/históricos das medições. Não altera a origem, não troca a configuração do programa e não sobrescreve arquivos. Senhas permanecem em hash; sessões de login não são transportadas, exigindo novo login com os usuários existentes.

Nesta entrega foi gerada a cópia `.tools/base-portatil-20261026.mdb`, preservando 30 pessoas, 30 vínculos, 15 dependentes, 5 benefícios, 180 coberturas, 103 períodos de férias, 10 contratos e 9 medições, além dos demais cadastros e históricos. É uma cópia da demonstração no momento da exportação, sem sincronização posterior com o PostgreSQL. Para testar pessoalmente, selecione esse arquivo pelo caminho completo. Para a empresa, copie **uma vez** essa base para a pasta compartilhada e selecione o arquivo do servidor nos dois computadores.

## Gravações simultâneas e limites

O arquivo contém a identidade, a revisão e um retrato JSON versionado dos registros do aplicativo, em uma linha transacional `MiniERPState`. Não possui uma tabela Access para cada cadastro. O adaptador usa os metadados Prisma para consultar relações e aplica as restrições de integridade do modelo e das migrações antes de confirmar. Datas são reconstituídas como datas; moeda usa `Prisma.Decimal`. Os serviços de férias, contratos e medições continuam aplicando as regras de negócio existentes.

Cada transação lê uma revisão e só salva se ela ainda for atual. Cadastro, saldo e histórico confirmam juntos. Se outro processo tiver gravado, há nova tentativa limitada; esgotadas as tentativas, a API responde **409** e pede atualização. Contratos e medições também conservam a verificação da versão do registro editado. Erros com resultado de confirmação desconhecido não são repetidos automaticamente: confira o registro antes de reenviar.

O adaptador atende às operações usadas por este projeto; não é uma implementação completa de Prisma ou SQL. Novas operações precisam de suporte e testes explícitos. O retrato JSON tem limite de **16 MB**, proporcional à demonstração pequena com duas pessoas. Cada gravação valida e regrava o retrato inteiro; desempenho depende do tamanho da base e da rede. Este desenho não foi homologado para grandes bases ou equipes maiores. O contêiner Access também pode crescer com atualizações: monitore o arquivo e gere uma nova cópia consistente antes de aproximar-se do limite de 2 GB do formato.

As duas pessoas precisam conseguir ler e gravar a base e criar/remover o arquivo de bloqueio na pasta do servidor. Use a pasta de rede existente. **OneDrive fica somente para cópias fechadas de segurança**, não para a base aberta simultaneamente. Caminhos sob raízes OneDrive conhecidas são recusados; o programa não identifica todos os possíveis mapeamentos ou redirecionamentos de pastas sincronizadas.

Permissão de leitura do arquivo permite acessar todo seu conteúdo fora da aplicação. O perfil Consulta continua restringindo a API, mas não protege um arquivo que a pessoa possa abrir diretamente. Restrinja a pasta a quem pode acessar o conteúdo completo.

## Configuração e cópias de segurança

O arquivo `%LOCALAPPDATA%\MiddlebyMiniERP\storage.json` guarda somente modo, caminho, componente e identidade, com versão de configuração. Não guarda senha nem dados pessoais. A configuração fica fora da própria base. Trocas são gravadas por arquivo temporário e renomeação; requisições em andamento mantêm o cliente que capturaram, evitando misturar duas bases numa operação.

Para fazer uma cópia consistente de uma base em arquivo, sem depender de PostgreSQL:

```powershell
npm.cmd run storage:export -- --from-file '\\servidor\RH\MiniERP\base.mdb' --out 'D:\BackupsRH\base-2026-10-26.mdb'
```

Use nomes novos. A cópia tem outra identidade e não leva sessões. Para restaurá-la, feche o sistema nos dois PCs, coloque a cópia no destino escolhido e selecione-a novamente nos dois computadores, conferindo a identificação. Não substitua silenciosamente a base em uso nem mantenha as duas cópias em operação para a mesma equipe. Os backups PostgreSQL continuam documentados no README para o modo anterior.

Variáveis para automação/testes: `MINIERP_STORAGE_CONFIG` troca o caminho do perfil local; `MINIERP_FILE_DATABASE` seleciona explicitamente uma base para o processo; `MINIERP_STORAGE_SETUP=1` impede recorrer ao PostgreSQL por ausência de configuração; `MINIERP_PORT` altera a porta do iniciador. O iniciador já define loopback, origem e modo de configuração.

## Validação e próximo teste na empresa

Validados localmente: exportação com releitura integral; 28 testes de integração em arquivo; 5 testes próprios de persistência, dois processos independentes, reversão, FK, unicidade, identidade, configuração, login e indisponibilidade; interface em desktop e celular. A regressão PostgreSQL permanece separada. Comandos reproduzíveis:

```powershell
npm.cmd test
npm.cmd run test:storage
npm.cmd run test:file -- --browser
```

O diagnóstico independente anterior continua disponível com `npm.cmd run storage:check`, ou `npm.cmd run storage:check -- --folder '\\servidor\RH\MiniERP'`. Ele cria uma subpasta descartável exclusiva e não modifica bases existentes. Seus dois processos executam no mesmo PC; `networkValidated: false` é intencional.

**Pendente:** homologar o componente nos dois PCs, abrir o mesmo arquivo na pasta real da empresa, gravar simultaneamente, conferir conflitos, observar latência e testar desconexão/interrupção real e restauração. A simulação local de arquivo ausente não comprova resistência a queda de rede ou desligamento durante uma gravação. Nenhuma configuração de firewall ou de serviço no servidor foi feita.

Referências: [Microsoft — compartilhamento de bancos Access em rede local](https://support.microsoft.com/en-us/access/ways-to-share-an-access-desktop-database) e [SQLite — limitações do acesso direto por rede](https://www.sqlite.org/useovernet.html).
