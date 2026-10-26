# Contratos e Medições — análise da base anterior

Análise realizada em 24/10/2026. Origem confirmada pelo usuário: [caic02/RH](https://github.com/caic02/RH), revisão fixa `450bd7381a41a0d3784c0f5e18966a164b01feac`. Os arquivos foram lidos pela conexão GitHub; a cópia de referência está em `.tools/rh-reference/`, fora da aplicação e do Git. Nenhum dado do banco atual foi enviado ao repositório anterior ou substituído.

**Atualização:** cadastros, contratos, itens, associação a benefícios, previsões, medições e distribuição de custos foram implementados no Mini ERP, com API, PostgreSQL, autorização e testes. O fluxo inclui principal, avulsa, complemento, conferência e reabertura com histórico. **Conferida é a etapa final**; o registro manual de envio ao Financeiro foi retirado a pedido do usuário. O módulo é exclusivo do RH administrador. Revisões contratuais, relatórios financeiros e exportações continuam pendentes. O restante deste documento preserva o mapa de referência para a adaptação completa; nenhuma base JSON antiga foi importada.

## Resultado da conferência do código

Não foi examinado apenas o README. Foram lidos `js/core.js`, `js/contracts.js`, `js/measurements.js`, `js/reports.js`, `js/ui.js`, `js/files.js`, `js/demo.js`, `tests/tests.js` e `tests/ui-test.js` na revisão indicada.

A suíte de regras `tests/index.html` foi executada localmente no Chromium, com contexto offline: **49/49 testes aprovados**, sem erros de JavaScript. Resultado detalhado em `.tools/rh-reference/test-results.txt`. A suíte de interface do projeto anterior foi lida, mas não foi executada. Isso confirma a referência original; não significa que as regras já estejam portadas, testadas ou disponíveis no Mini ERP.

## Fluxo adotado na adaptação

1. Manter fornecedores, categorias e condições de pagamento.
2. Criar contrato com fornecedor, unidade faturada, categoria, vigência, condição de pagamento e itens.
3. Gerar previsões por competência a partir dos itens. Eventuais não geram mensalidades automaticamente; contratos sem término avançam conforme o calendário, sem inventar uma vigência final.
4. Criar medição principal de uma competência, a partir do contrato ou da previsão. Permitir despesa avulsa sem contrato e complemento vinculado à principal.
5. Preparar distribuição por pessoas cobertas, percentuais ou valores. Registrar acréscimos/descontos explicitamente e conferir a diferença.
6. Conferir somente quando a distribuição fechar exatamente com a fatura e os dados obrigatórios estiverem completos.
7. Encerrar a medição em **Conferida**. Permitir reabertura justificada, preservando a versão anterior e exigindo nova conferência.

Situações do contrato: Em elaboração, Vigente, Suspenso, Encerrado e Cancelado. Situações da medição: Em preenchimento, Conferida e Cancelada. A situação da previsão é derivada da medição vinculada, evitando manter dois estados contraditórios. A migração `202610240008_measurement_confirmation_final` converte o antigo estado de envio em Conferida com registro de histórico; não altera valores ou distribuições.

## Mapa de reaproveitamento

| Origem | Regra encontrada | Adaptação necessária |
|---|---|---|
| `core.js`: `parseMoney`, `sum`, `quantity`, `itemTotal` | Valores exatos em centavos; quantidade com três casas; produto com arredondamento | Funções TypeScript independentes de DOM, validação no servidor e armazenamento exato; não usar `parseFloat` como cálculo financeiro |
| `core.js`: `allocate` | Percentuais somam 100,00%; resíduos distribuídos por maiores restos, desempate por ID do centro | Manter o algoritmo e adaptar testes para a nova implementação |
| `core.js`: `paymentDue` | Dia fixo ou prazo em dias, com tratamento de dia inexistente | Datas civis `DATE`, seguindo o padrão do backend atual |
| `contracts.js`: `contractVersion`, `previewRevision`, `applyRevision` | Versão por competência; reajuste, realinhamento, prorrogação e correção com motivo e snapshots | Versões persistidas e comandos transacionais; não recalcular medições já conferidas |
| `contracts.js`: `syncContractSchedules` | Previsão única contrato/competência; preserva previsões utilizadas e canceladas | Índice único e reconciliação idempotente no PostgreSQL, inclusive com processos concorrentes |
| `measurements.js`: `inheritContractBilling`, `newMeasurement` | Unidade, fornecedor e categoria herdados do contrato; uma principal por contrato/competência; complemento independente | Revalidar na API, não depender de campos bloqueados no formulário; índices/restrições no banco |
| `measurements.js`: `baseLines`, `location` | Base de pessoas cobertas e lotação copiada para a medição | Usar `Enrollment`, `Employment`, `Dependent` e histórico de `Assignment`; não duplicar pessoas |
| `measurements.js`: `summary`, `allocationRows` | Distribuição por pessoas/valor/percentual, ajustes explícitos e fechamento exato | Manter o cálculo; incluir unidade na chave da distribuição, pois o centro atual pode atender várias unidades |
| `measurements.js`: `confirmMeasurement`, `reopenMeasurement`, `markSent` | Conferência congela dados; reabertura preserva versão; envio não representa pagamento | Comandos autorizados, auditoria e controle concorrente; o comando de envio da referência foi descartado na adaptação |
| `reports.js` | Somente conferidas/enviadas contam como realizado; previsto e preenchimento separados; exportação com snapshots | Na adaptação, somente Conferida conta como realizado; usar consultas autorizadas no PostgreSQL e CSV com proteção contra fórmulas |
| `ui.js` | Cadastro completo de medição, cronograma, conferência e relatórios | Recriar componentes React com o layout atual; não importar o manipulador global de DOM |

## Cadastros compartilhados e novos registros

| Conceito anterior | Base a usar no Mini ERP |
|---|---|
| Empresa e unidades | `Company` e `Unit` existentes |
| Funcionário | `Person` + `Employment`, distinguindo readmissões |
| Dependente | `Dependent` existente, com titular determinado pelo vínculo |
| Lotação | `Assignment` por vigência, com unidade e centro preservados na linha de rateio |
| Vínculo de beneficiário de benefício | `Enrollment`, datas de cobertura e plano individual, associado ao contrato/item pertinente |
| Centros de custo | `CostCenter` + `CostCenterUnit`, sem recriar centros por filial |
| Operadora/fornecedor | Novo cadastro de fornecedor; texto livre em `Benefit.provider` exige associação explícita, sem dedução por nome |
| Número de contrato no benefício | Campo atual de referência não vira uma chave estrangeira automaticamente; associação ao novo contrato deve ser explícita |
| Categorias e condições de pagamento | Cadastros próprios do módulo, com ativação/inativação |
| Contratos e itens | Novas entidades relacionais, sem alterar a estrutura dos vínculos de RH |
| Previsões | Entidade própria por contrato/competência |
| Medições, linhas e distribuições | Entidades próprias com referências e cópias históricas dos dados usados |
| Revisões e reaberturas | Registros imutáveis com motivo, versão, autor e data |

“Pessoa coberta” neste contexto é quem integra o custo do benefício. Não reintroduz o cadastro de indicados para indenização de seguro de vida, que o usuário descartou.

## Diferenças que impedem copiar o código diretamente

- O projeto anterior mantém toda a base como um JSON no navegador e o salva por serviço Python. Sua função `transaction` clona e valida esse objeto; não é uma transação de banco. O novo módulo deve usar a API Node e transações PostgreSQL, compartilhando autenticação, CSRF e auditoria.
- No anterior, cada centro tem uma única unidade. Aqui um centro pode atender várias. O agrupamento precisa ser **unidade + centro**, com lotação explícita; agrupar apenas por `costCenterId` misturaria filiais.
- O anterior guarda a lotação atual no funcionário. Aqui há histórico por vigência. Uma transferência posterior não pode mudar uma medição antiga. Movimentações no meio da competência devem ficar visíveis para revisão; não assumir proporcionalidade automática.
- Inativação não equivale a desligamento. Para histórico, analisar o intervalo efetivo do vínculo e da cobertura; não excluir indiscriminadamente registros que hoje estejam inativos/encerrados.
- O plano de saúde é individual em `Enrollment.plan`. Não copiar o valor global do catálogo nem impor ao dependente o plano do titular. Alterações anteriores à primeira fotografia financeira podem não ser reconstituíveis a partir do cadastro atual; exigem conferência no lançamento histórico.
- A regra informada pelo usuário exclui VR/VA durante afastamento, mantendo saúde, odontológico e vida. No caso de afastamento em parte do mês, não inventar rateio proporcional ou decisão de cobertura: apresentar os intervalos para revisão do RH.
- A unidade faturada pode ser diferente das unidades beneficiadas pela distribuição. Nenhuma delas deve ser deduzida automaticamente da outra.
- O perfil Consulta atual não acessa custos ou dependentes. A adaptação deve manter essa restrição na API. Para a primeira implementação, acesso financeiro restrito ao RH administrador; não ampliar o perfil Consulta implicitamente.
- Revisões de preço/itens precisam de vigência e preservação histórica. Uma alteração no cadastro não pode modificar documentos conferidos/enviados nem recalcular silenciosamente competências anteriores.

## Sequência de implementação preparada

1. **Fluxo contratual — implementado:** cadastros de fornecedores/categorias/condições, contratos, itens, associação a benefícios e previsões, com migrações e testes de idempotência. Contratos ativados preservam os termos até existir revisão formal.
2. **Medição e fechamento — implementado:** principal, avulsa, complemento, base por cobertura/competência, distribuição exata por pessoas/valores/percentuais, ajustes justificados, conferência final e reabertura auditadas. Cópias históricas preservam lotação, plano individual, custos e versões anteriores. Previsões utilizadas são protegidas e mostram a situação da medição.
3. **Operação e análise — parcialmente implementado:** Visão geral com filtros, previsto/conferido, fechamento, comparação de competências equivalentes, rankings, distribuição histórica, alertas e pendências com acesso aos registros. Revisões contratuais, relatórios para exportação e exportações financeiras continuam pendentes. O envio manual foi retirado do fluxo.

Cada etapa deve integrar interface, API e banco antes de habilitar as ações correspondentes. Não utilizar o servidor Python ou JSON como persistência do novo módulo. Não importar automaticamente a base de dados do projeto anterior nem sua demonstração; o usuário já possui a base atual de RH e benefícios.

## Verificações a portar

- Centavos exatos, maiores restos e empate estável; soma de percentuais e diferença de fechamento.
- Mesma unidade/centro em momentos diferentes e mesmo centro em múltiplas unidades.
- Cobertura de titular/dependente, readmissão, desligamento, afastamento e mudança de plano/lotação por competência.
- Previsões repetidas/concorrentes sem duplicação; meses sem abrir o sistema; alteração e prorrogação preservando previsões usadas.
- Principal duplicada bloqueada por restrição no banco; complemento sem repetir a base de pessoas da principal.
- Conferência com campos obrigatórios e saldo exato; fechamento concorrente e edição bloqueada após conferência.
- Reabertura com motivo preservando versão anterior e exigindo nova conferência; rejeição do antigo comando de envio na API e do estado retirado no banco.
- Revisão futura sem alterar custos anteriores; relatórios com limites inclusivos e apenas realizado conferido.
- API de Consulta sem custos, dependentes, notas restritas ou exportações financeiras.

Os 49 testes antigos são referência para esses casos, não substituem os testes de banco, permissões e concorrência exigidos pela nova arquitetura.
