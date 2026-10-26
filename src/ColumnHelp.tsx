import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const columnHelp: Record<string, string> = {
  Colaborador: "Pessoa à qual este registro está vinculado.",
  Aquisitivo:
    "Intervalo em que o colaborador acumula o direito às férias. O período seguinte começa no aniversário da admissão.",
  "Fim concessivo":
    "Último dia do período concessivo. O gozo deve terminar dentro desse prazo; o último início possível depende da duração das férias.",
  "Data limite":
    "Data definida pela empresa para que as férias estejam concluídas. É um prazo interno, separado do fim concessivo.",
  Direito:
    "Dias de direito reconhecidos para este período. No padrão, são 30 dias após completar a aquisição. Ajustes aparecem separadamente.",
  Gozados:
    "Dias registrados como férias concluídas. Férias apenas programadas ou aprovadas não entram nesta coluna.",
  Reservados:
    "Dias de férias aprovadas ou em andamento. Estão reservados e não podem ser usados em outra aprovação; ainda não constam como gozados.",
  Abono:
    "Dias de férias registrados como conversão em abono. São retirados do saldo de dias para descanso; esta tela não calcula valores financeiros.",
  Ajustes:
    "Correções justificadas do saldo feitas pelo RH. Valores positivos acrescentam dias; negativos reduzem o saldo.",
  Disponível:
    "Dias que podem ser usados em uma nova aprovação: direito + ajustes − abono − gozados − reservados. Exemplo: 30 de direito, 10 gozados e 5 reservados deixam 15 disponíveis.",
  "Não usufruído":
    "Dias de descanso ainda não registrados como gozados, incluindo os já reservados: direito + ajustes − abono − gozados. No exemplo de 30 de direito e 10 gozados, são 20 dias, mesmo com 5 reservados.",
  Condição:
    "Indicador de acompanhamento do período de férias, considerando aquisição, saldo, prazos e necessidade de revisão pelo RH.",
  "Condição atual":
    "Condição administrativa calculada para hoje a partir do vínculo, férias e afastamentos. Não representa presença nem controle de ponto.",
  Titular:
    "Colaborador responsável pela inclusão no benefício. Também aparece nas linhas de cobertura de seus dependentes.",
  "Pessoa coberta":
    "Quem está incluído no benefício: o próprio titular ou o dependente identificado nesta linha.",
  Benefício: "Benefício do catálogo ao qual esta cobertura está vinculada.",
  Plano:
    "Na saúde, é a escolha individual da pessoa: Básico, Apartamento ou Especial. Não informado significa que o plano ainda não foi escolhido. Nos demais benefícios, mostra o plano cadastrado no catálogo.",
  Inclusão: "Data inicial da cobertura da pessoa no benefício.",
  Exclusão:
    "Data final da cobertura. Sem data informada, a cobertura não tem encerramento definido.",
  "Custo da empresa (R$)":
    "Valor informado pelo RH como custo desta cobertura para a empresa. O traço indica valor não informado, não custo zero.",
  "IR informado":
    "Indicação de dependência para Imposto de Renda informada pelo RH. Não é determinada automaticamente pelo parentesco nem pela participação em benefício.",
  "Dias corridos":
    "Quantidade de dias do lançamento, incluindo sábados, domingos e feriados.",
  "Fim inclusivo":
    "Último dia incluído no gozo: início + quantidade de dias − 1.",
  "Retorno (previsão)":
    "Dia seguinte ao fim do gozo. É uma previsão por calendário, sem considerar a escala de trabalho.",
  Situação:
    "Estado do cadastro ou lançamento, conforme a tela. Em férias, aprovação reserva saldo, conclusão registra gozo e cancelamento libera a reserva correspondente.",
  Revisão: "Indica se o registro precisa de conferência administrativa do RH.",
  Início: "Primeiro dia do intervalo registrado.",
  Fim: "Último dia do intervalo registrado.",
  "Fim previsto": "Data estimada para encerrar o afastamento ou licença.",
  "Fim efetivo":
    "Data de encerramento registrada pelo RH. Quando preenchida, prevalece sobre o fim previsto.",
  Admissão:
    "Data de início deste vínculo de trabalho. Uma readmissão possui um novo vínculo e sua própria data.",
  Matrícula: "Identificador único do vínculo de trabalho dentro da empresa.",
  Unidade: "Estabelecimento ao qual o vínculo está associado.",
  "Centro de custos":
    "Centro organizacional associado ao vínculo para identificação e acompanhamento.",
  "Unidades permitidas":
    "Quantidade de unidades nas quais este centro de custos pode ser utilizado.",
  Vigência: "Data a partir da qual a alteração profissional passa a valer.",
  Justificativa: "Motivo registrado pelo RH para a alteração ou ajuste.",
  Dependente:
    "Pessoa do cadastro familiar. Seu cadastro não cria automaticamente direito fiscal nem inclusão em benefícios.",
  Nascimento: "Data de nascimento cadastrada.",
  CPF: "Identificador pessoal cadastrado, com validação dos dígitos verificadores.",
  Parentesco: "Relação familiar informada no cadastro do dependente.",
  Fornecedor: "Operadora ou fornecedor cadastrado para o benefício.",
  Código: "Identificador interno do cadastro.",
  Descrição: "Descrição cadastrada para identificar o registro.",
  Cargo: "Cargo associado ao vínculo de trabalho.",
  Departamento: "Departamento associado ao vínculo de trabalho.",
  Equipe: "Departamento usado para acompanhar o planejamento de ausências.",
  Dias: "Quantidade de dias deste registro.",
  Autor: "Usuário responsável pela alteração registrada.",
  "Campos alterados":
    "Nomes dos campos envolvidos na alteração; os valores pessoais não são copiados para este registro de auditoria.",
  Ações:
    "Operações disponíveis para o registro, de acordo com seu perfil de acesso.",
};

export function ColumnHelp({ label, text }: { label: string; text: string }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pinned = useRef(false);
  function show() {
    clearTimeout(hideTimer.current);
    setOpen(true);
  }
  function close() {
    clearTimeout(hideTimer.current);
    pinned.current = false;
    setOpen(false);
  }
  function leave() {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!pinned.current && document.activeElement !== button.current)
        setOpen(false);
    }, 150);
  }
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const r = button.current?.getBoundingClientRect();
      const el = bubble.current;
      if (!r || !el) return;
      const width = el.offsetWidth,
        height = el.offsetHeight;
      const left = Math.max(
        12,
        Math.min(
          r.left + r.width / 2 - width / 2,
          window.innerWidth - width - 12,
        ),
      );
      const top =
        r.bottom + 8 + height <= window.innerHeight - 12
          ? r.bottom + 8
          : Math.max(12, r.top - height - 8);
      setPosition({ left, top });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function outside(e: PointerEvent) {
      if (
        !button.current?.contains(e.target as Node) &&
        !bubble.current?.contains(e.target as Node)
      )
        close();
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="column-help-button"
        aria-label={"Ajuda sobre " + label}
        aria-describedby={open ? id : undefined}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") show();
        }}
        onPointerLeave={leave}
        onFocus={show}
        onBlur={() => {
          pinned.current = false;
          leave();
        }}
        onClick={() => {
          pinned.current = true;
          show();
        }}
      >
        ?
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            ref={bubble}
            role="tooltip"
            className="column-help-bubble"
            style={position}
            onPointerEnter={show}
            onPointerLeave={leave}
          >
            <strong>{label}</strong>
            <p>{text}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
