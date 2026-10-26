export type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  source?: string;
  options?: [string, string][];
  hint?: string;
  step?: string;
};
const f = (
  key: string,
  label: string,
  type = "text",
  required = false,
): Field => ({ key, label, type, required });
const ref = (
  key: string,
  label: string,
  source: string,
  required = true,
): Field => ({ key, label, type: "select", source, required });
const active = f("active", "Cadastro ativo", "checkbox");
export const statusLabels: Record<string, string> = {
  PREENCHIMENTO: "Em preenchimento",
  CONFERIDA: "Conferida",
  ELABORACAO: "Em elaboração",
  VIGENTE: "Vigente",
  SUSPENSO: "Suspenso",
  ENCERRADO: "Encerrado",
  CANCELADO: "Cancelado",
  PREVISTA: "Prevista",
  CANCELADA: "Cancelada",
  FIXO: "Fixo recorrente",
  VARIAVEL: "Variável recorrente",
  EVENTUAL: "Eventual",
  VALOR: "Valor",
  PERCENTUAL: "Percentual",
  PESSOAS: "Pessoas cobertas",
  MENSALIDADE: "Mensalidade",
  PESSOA: "Pessoa",
  HORA: "Hora",
  SERVICO: "Serviço",
  OUTRA: "Outra",
};
export const forms: Record<string, { title: string; fields: Field[] }> = {
  suppliers: {
    title: "Fornecedor",
    fields: [
      f("name", "Razão social / nome", "text", true),
      f("tradeName", "Nome fantasia"),
      f("document", "CPF / CNPJ"),
      f("contact", "Contato"),
      f("phone", "Telefone"),
      f("email", "E-mail", "email"),
      ref("categoryId", "Categoria padrão", "categories", false),
      ref(
        "paymentTermId",
        "Condição de pagamento padrão",
        "paymentTerms",
        false,
      ),
      f("notes", "Observações", "textarea"),
      active,
    ],
  },
  categories: {
    title: "Categoria",
    fields: [f("name", "Descrição", "text", true), active],
  },
  "payment-terms": {
    title: "Condição de pagamento",
    fields: [
      f("name", "Descrição", "text", true),
      {
        key: "mode",
        label: "Modalidade",
        type: "select",
        required: true,
        options: [
          ["FIXO", "Dia fixo"],
          ["DIAS", "Prazo em dias"],
        ],
      },
      f("day", "Dia do mês (1 a 31)", "number"),
      f("days", "Prazo em dias corridos", "number"),
      active,
    ],
  },
  contracts: {
    title: "Contrato",
    fields: [
      f("name", "Descrição do contrato", "text", true),
      f("externalNumber", "Número externo / referência"),
      ref("supplierId", "Fornecedor", "suppliers"),
      ref("unitId", "Unidade faturada", "units"),
      ref("categoryId", "Categoria", "categories"),
      ref("paymentTermId", "Condição de pagamento", "paymentTerms"),
      {
        key: "kind",
        label: "Tipo",
        type: "select",
        required: true,
        options: [
          ["FIXO", "Fixo recorrente"],
          ["VARIAVEL", "Variável recorrente"],
          ["EVENTUAL", "Eventual"],
        ],
      },
      f("start", "Início da vigência", "date", true),
      f("end", "Fim da vigência", "date"),
      f("adjustmentDate", "Reajuste previsto", "date"),
      f("alertDays", "Antecedência do alerta (dias)", "number", true),
      f("notes", "Observações", "textarea"),
    ],
  },
  items: {
    title: "Item do contrato",
    fields: [
      f("name", "Descrição do item", "text", true),
      {
        key: "billingUnit",
        label: "Unidade de cobrança",
        type: "select",
        required: true,
        options: ["MENSALIDADE", "PESSOA", "HORA", "SERVICO", "OUTRA"].map(
          (v) => [v, statusLabels[v]],
        ),
      },
      {
        ...f("quantity", "Quantidade de referência", "number", true),
        step: "0.001",
      },
      {
        ...f("unitPrice", "Valor unitário (R$)", "number", true),
        step: "0.01",
      },
      {
        key: "allocationMode",
        label: "Distribuição prevista",
        type: "select",
        required: true,
        options: ["VALOR", "PERCENTUAL", "PESSOAS"].map((v) => [
          v,
          statusLabels[v],
        ]),
      },
      {
        ...ref("benefitId", "Benefício associado", "benefits", false),
        hint: "Usa as coberturas já cadastradas no RH. Não cria outro cadastro de colaboradores ou dependentes.",
      },
      active,
    ],
  },
  status: {
    title: "Alterar situação do contrato",
    fields: [
      {
        key: "status",
        label: "Nova situação",
        type: "select",
        required: true,
        options: [],
      },
      f("closedOn", "Data de encerramento / cancelamento", "date"),
      f("reason", "Motivo", "textarea"),
    ],
  },
  cancel: {
    title: "Cancelar previsão",
    fields: [f("reason", "Motivo do cancelamento", "textarea", true)],
  },
};
