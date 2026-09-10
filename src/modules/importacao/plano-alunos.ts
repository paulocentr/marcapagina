import type { PlanoDeImportacao, ResultadoDaLinha } from '@/modules/importacao/importacao.service'

export interface AlunoParaImportar {
  matricula: string
  nome: string
  /** Sempre em ISO curta (aaaa-mm-dd), qualquer que seja o formato de origem. */
  dataNascimento: string
  responsavelNome?: string
  responsavelEmail?: string
  responsavelTelefone?: string
}

export interface RepositorioDeAlunosParaImportacao {
  matriculasExistentes(matriculas: string[]): Promise<Set<string>>
  gravarMuitos(alunos: AlunoParaImportar[]): Promise<void>
}

interface DepsComAlunos {
  alunosParaImportacao: RepositorioDeAlunosParaImportacao
}

/**
 * Uso PRIMÁRIO do importador (spec §2.6): o acervo será catalogado do
 * zero por ISBN, mas a lista de alunos já existe na secretaria e ninguém
 * vai redigitá-la.
 */
export const planoDeAlunos: PlanoDeImportacao<AlunoParaImportar> = {
  nome: 'alunos',
  permissao: 'aluno:importar',

  campos: [
    { chave: 'matricula', rotulo: 'Matrícula', obrigatorio: true },
    { chave: 'nome', rotulo: 'Nome', obrigatorio: true },
    { chave: 'dataNascimento', rotulo: 'Data de nascimento', obrigatorio: true },
    { chave: 'responsavelNome', rotulo: 'Nome do responsável', obrigatorio: false },
    { chave: 'responsavelEmail', rotulo: 'E-mail do responsável', obrigatorio: false },
    { chave: 'responsavelTelefone', rotulo: 'Telefone do responsável', obrigatorio: false },
  ],

  validarLinha(obter): ResultadoDaLinha<AlunoParaImportar> {
    const matricula = obter('matricula')
    if (!matricula) return { erro: 'Informe a matrícula.' }

    const nome = obter('nome')
    if (!nome) return { erro: 'Informe o nome do aluno.' }

    const dataNascimento = normalizarData(obter('dataNascimento'))
    if (!dataNascimento) {
      return {
        erro: 'Data de nascimento inválida. Use aaaa-mm-dd ou dd/mm/aaaa.',
      }
    }

    return {
      valor: {
        matricula,
        nome,
        dataNascimento,
        responsavelNome: opcional(obter('responsavelNome')),
        responsavelEmail: opcional(obter('responsavelEmail')),
        responsavelTelefone: opcional(obter('responsavelTelefone')),
      },
    }
  },

  chaveDeDeduplicacao: (aluno) => aluno.matricula,

  async jaExistentes(matriculas, deps) {
    return (deps as DepsComAlunos).alunosParaImportacao.matriculasExistentes(matriculas)
  },

  async gravar(alunos, deps) {
    await (deps as DepsComAlunos).alunosParaImportacao.gravarMuitos(alunos)
  },
}

/**
 * Aceita `aaaa-mm-dd` e `dd/mm/aaaa` — o segundo é o que o Excel pt-BR
 * produz, e recusá-lo reprovaria a planilha que a secretaria realmente
 * tem.
 *
 * Valida os componentes um a um em vez de entregar a string a `new Date()`:
 * 31/02/2012 vira 2 de março num Date ingênuo, e o aluno passaria a não
 * conseguir entrar no portal com a data que sabe de cor.
 */
function normalizarData(bruto: string): string | null {
  const texto = bruto.trim()

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const brasileira = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)

  const partes = iso
    ? { ano: iso[1]!, mes: iso[2]!, dia: iso[3]! }
    : brasileira
      ? { ano: brasileira[3]!, mes: brasileira[2]!, dia: brasileira[1]! }
      : null

  if (!partes) return null

  const ano = Number(partes.ano)
  const mes = Number(partes.mes)
  const dia = Number(partes.dia)

  if (mes < 1 || mes > 12) return null
  if (dia < 1 || dia > diasNoMes(ano, mes)) return null
  // Aluno de escola não nasceu antes de 1900 nem no futuro.
  if (ano < 1900 || ano > new Date().getUTCFullYear()) return null

  return `${partes.ano}-${partes.mes}-${partes.dia}`
}

function diasNoMes(ano: number, mes: number): number {
  // Dia 0 do mês seguinte é o último dia deste mês; o próprio Date cuida
  // do ano bissexto, sem tabela mantida à mão.
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

function opcional(valor: string): string | undefined {
  return valor.length > 0 ? valor : undefined
}
