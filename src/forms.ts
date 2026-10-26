export type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[];
  resource?: string;
  kind?: string;
  multiple?: boolean;
  hint?: string;
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
  resource: string,
  kind?: string,
  required = true,
): Field => ({ key, label, type: "select", resource, kind, required });
const choice = (key: string, label: string, options: string[]): Field => ({
  key,
  label,
  type: "select",
  options,
  required: true,
});
const active = f("active", "Cadastro ativo", "checkbox");
export const forms: Record<string, { title: string; fields: Field[] }> = {
  people: {
    title: "Pessoa",
    fields: [
      f("name", "Nome completo", "text", true),
      f("socialName", "Nome social"),
      f("cpf", "CPF", "text", true),
      f("birthDate", "Nascimento", "date", true),
      f("phone", "Telefone"),
      f("email", "E-mail pessoal", "email"),
      f("address", "Endereço"),
      f("emergencyName", "Contato de emergência"),
      f("emergencyPhone", "Telefone de emergência"),
      f("emergencyRelation", "Relação do contato"),
      f("notes", "Observações restritas ao RH", "textarea"),
      f("archived", "Arquivado", "checkbox"),
    ],
  },
  employments: {
    title: "Vínculo profissional",
    fields: [
      ref("personId", "Pessoa", "people"),
      f("registration", "Matrícula", "text", true),
      ref("unitId", "Unidade", "units"),
      ref("costCenterId", "Centro de custos", "cost-centers"),
      ref("departmentId", "Departamento", "lookups", "DEPARTAMENTO"),
      ref("jobId", "Cargo", "lookups", "CARGO"),
      ref("managerId", "Gestor", "employments", undefined, false),
      choice("kind", "Tipo de vínculo", [
        "CLT",
        "ESTAGIO",
        "APRENDIZ",
        "TEMPORARIO",
        "OUTRO",
      ]),
      f("admission", "Admissão", "date", true),
      f("termination", "Desligamento", "date"),
      choice("status", "Situação contratual", [
        "ATIVO",
        "INATIVO",
        "DESLIGADO",
      ]),
      f("reason", "Motivo da inativação/desligamento"),
      f("corporateEmail", "E-mail corporativo", "email"),
      f("weeklyHours", "Jornada semanal", "number"),
      f("effective", "Vigência da mudança", "date"),
      f("changeReason", "Justificativa da mudança"),
    ],
  },
  units: {
    title: "Unidade",
    fields: [
      f("code", "Código", "text", true),
      f("name", "Nome", "text", true),
      choice("kind", "Tipo", ["MATRIZ", "FILIAL"]),
      f("cnpj", "CNPJ"),
      f("address", "Endereço"),
      f("city", "Cidade"),
      f("state", "UF"),
      active,
    ],
  },
  "cost-centers": {
    title: "Centro de custos",
    fields: [
      f("code", "Código", "text", true),
      f("name", "Descrição", "text", true),
      { ...ref("unitIds", "Unidades permitidas", "units"), multiple: true },
      active,
    ],
  },
  lookups: {
    title: "Cadastro auxiliar",
    fields: [
      choice("kind", "Categoria", [
        "DEPARTAMENTO",
        "CARGO",
        "AFASTAMENTO",
        "BENEFICIO",
        "PARENTESCO",
      ]),
      f("name", "Nome", "text", true),
      {
        ...f("tag", "Identificador"),
        hint: "Afastamento: MATERNIDADE ou LICENCA; parentesco: OUTRO. Identificador imutável.",
      },
      active,
    ],
  },
  dependents: {
    title: "Dependente",
    fields: [
      ref("personId", "Colaborador titular", "people"),
      f("name", "Nome completo", "text", true),
      f("cpf", "CPF opcional"),
      f("birthDate", "Nascimento", "date", true),
      ref("relationshipId", "Parentesco", "lookups", "PARENTESCO"),
      f("relationshipDescription", "Descrição do parentesco Outro"),
      f("phone", "Telefone"),
      f("notes", "Observações", "textarea"),
      f("incomeTax", "Dependência para IR informada pelo RH", "checkbox"),
      active,
    ],
  },
  benefits: {
    title: "Benefício",
    fields: [
      f("code", "Código", "text", true),
      f("name", "Nome", "text", true),
      choice("kind", "Tipo", [
        "SAUDE",
        "ODONTO",
        "VIDA",
        "VR",
        "VA",
        "VT",
        "OUTRO",
      ]),
      f("provider", "Operadora/fornecedor"),
      f("plan", "Plano"),
      f("contract", "Contrato"),
      f("notes", "Observações", "textarea"),
      active,
    ],
  },
  enrollments: {
    title: "Inclusão em benefício",
    fields: [
      ref("benefitId", "Benefício", "benefits"),
      f("plan", "Tipo de plano de saúde"),
      ref("employmentId", "Vínculo titular", "employments"),
      {
        ...ref(
          "dependentId",
          "Dependente coberto",
          "dependents",
          undefined,
          false,
        ),
        hint: "Vazio: cobertura do titular. ",
      },
      f("card", "Carteirinha"),
      f("start", "Inclusão", "date", true),
      f("end", "Exclusão", "date"),
      f("companyCost", "Custo empresa (R$)", "number"),
      f("notes", "Observações", "textarea"),
      active,
    ],
  },
  leaves: {
    title: "Afastamento ou licença",
    fields: [
      ref("employmentId", "Vínculo", "employments"),
      ref("typeId", "Tipo", "lookups", "AFASTAMENTO"),
      f("start", "Início", "date", true),
      f("expectedEnd", "Fim previsto", "date"),
      f("actualEnd", "Fim efetivo", "date"),
      f(
        "notes",
        "Observações administrativas (sem dados clínicos)",
        "textarea",
      ),
      f("review", "Requer revisão do RH", "checkbox"),
    ],
  },
  periods: {
    title: "Período aquisitivo / histórico",
    fields: [
      ref("employmentId", "Vínculo CLT", "employments"),
      f("start", "Início aquisitivo", "date", true),
      f("end", "Fim aquisitivo", "date", true),
      f("concessionStart", "Início concessivo", "date", true),
      f("concessionEnd", "Fim concessivo", "date", true),
      {
        ...f("target", "Data limite", "date", true),
        hint: "Data definida pela empresa para concluir o gozo das férias.",
      },
      f("entitlement", "Direito padrão (dias)", "number", true),
      f("review", "Revisão necessária", "checkbox"),
      f("notes", "Justificativa / origem do histórico", "textarea", true),
    ],
  },
  bookings: {
    title: "Programação / gozo de férias",
    fields: [
      ref("periodId", "Período aquisitivo", "periods"),
      f("start", "Início", "date", true),
      f("days", "Dias corridos", "number", true),
      choice("status", "Situação", [
        "RASCUNHO",
        "PROGRAMADA",
        "APROVADA",
        "EM_ANDAMENTO",
        "CONCLUIDA",
        "CANCELADA",
      ]),
      {
        ...f(
          "reviewConfirmed",
          "RH revisou feriados, repousos e exceções",
          "checkbox",
        ),
        hint: "A validação da data de início é incompleta sem calendário de feriados e repousos.",
      },
      f("consent", "Concordância do colaborador registrada", "checkbox"),
      f("notes", "Observações / justificativa", "textarea"),
    ],
  },
  adjustments: {
    title: "Abono ou ajuste de saldo",
    fields: [
      ref("periodId", "Período", "periods"),
      choice("kind", "Tipo", ["AJUSTE", "ABONO"]),
      f("days", "Dias (+ ou − para ajuste)", "number", true),
      f("reason", "Justificativa obrigatória", "textarea", true),
    ],
  },
};
export const labels: Record<string, string> = {
  CLT: "CLT",
  ESTAGIO: "Estágio",
  APRENDIZ: "Aprendiz",
  TEMPORARIO: "Temporário",
  OUTRO: "Outro",
  ATIVO: "Ativo",
  INATIVO: "Inativo",
  DESLIGADO: "Desligado",
  MATRIZ: "Matriz",
  FILIAL: "Filial",
  DEPARTAMENTO: "Departamento",
  CARGO: "Cargo",
  AFASTAMENTO: "Afastamento",
  BENEFICIO: "Tipo de benefício",
  PARENTESCO: "Parentesco",
  SAUDE: "Saúde",
  ODONTO: "Odontológico",
  VIDA: "Seguro de vida",
  VR: "Vale-refeição",
  VA: "Vale-alimentação",
  VT: "Vale-transporte",
  RASCUNHO: "Rascunho",
  PROGRAMADA: "Programada",
  APROVADA: "Aprovada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
  AJUSTE: "Ajuste",
  ABONO: "Abono",
};
