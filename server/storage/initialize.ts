import bcrypt from "bcryptjs";
import { emptyDataset, recordSession, validateDataset } from "./records.js";
export async function initialDataset(username: string, password: string) {
  const data = emptyDataset();
  const { client } = recordSession(data);
  await client.company.create({ data: {} });
  await client.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 12),
      role: "RH",
    },
  });
  for (const [id, kind, name, tag] of [
    ["rel-spouse", "PARENTESCO", "Cônjuge", null],
    ["rel-partner", "PARENTESCO", "Companheiro(a)", null],
    ["rel-child", "PARENTESCO", "Filho(a)", null],
    ["rel-stepchild", "PARENTESCO", "Enteado(a)", null],
    ["rel-father", "PARENTESCO", "Pai", null],
    ["rel-mother", "PARENTESCO", "Mãe", null],
    ["rel-grandfather", "PARENTESCO", "Avô", null],
    ["rel-grandmother", "PARENTESCO", "Avó", null],
    ["rel-other", "PARENTESCO", "Outro", "OUTRO"],
    ["leave-away", "AFASTAMENTO", "Afastamento", null],
    ["leave-maternity", "AFASTAMENTO", "Licença-maternidade", "MATERNIDADE"],
    ["leave-other", "AFASTAMENTO", "Outra licença", "LICENCA"],
    ["benefit-health", "BENEFICIO", "Saúde", "SAUDE"],
    ["benefit-dental", "BENEFICIO", "Odontológico", "ODONTO"],
    ["benefit-life", "BENEFICIO", "Seguro de vida", "VIDA"],
    ["benefit-vr", "BENEFICIO", "Vale-refeição", "VR"],
    ["benefit-va", "BENEFICIO", "Vale-alimentação", "VA"],
    ["benefit-vt", "BENEFICIO", "Vale-transporte", "VT"],
    ["benefit-other", "BENEFICIO", "Outro", "OUTRO"],
  ])
    await client.lookup.create({ data: { id, kind, name, tag } });
  validateDataset(data);
  return data;
}
