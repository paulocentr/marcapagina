'use server'

import { revalidatePath } from 'next/cache'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { ErroDeDominio } from '@/core/errors'
import { dependenciasDeLeitores } from '@/modules/leitores/leitores.deps'
import {
  criarAluno,
  desativarAluno,
  editarAluno,
  reativarAluno,
} from '@/modules/leitores/alunos.service'
import { criarTurma, editarTurma } from '@/modules/leitores/turmas.service'
import { criarAnoLetivo, definirAnoLetivoAtivo } from '@/modules/leitores/anos-letivos.service'

/**
 * As Server Actions do cadastro de leitores.
 *
 * Quem lê a sessão é esta camada, com `comStaffNoTenant`; quem autoriza é
 * o serviço, que recebe o `Principal` por parâmetro (decisão 13). A tela
 * nunca vê repositório, `@prisma/client` nem `@/core/db` — há gate no CI.
 *
 * Todo retorno é `{ ok }` em vez de exceção que sobe: `ErroDeDominio`
 * carrega frase em pt-BR escrita para a operadora ler, e transformá-la em
 * erro 500 trocaria "a matrícula 2024001 já é de Ana Souza" por uma tela
 * de erro genérica. O que NÃO é `ErroDeDominio` continua subindo — bug é
 * para aparecer.
 */

const ROTA_DE_ALUNOS = '/painel/alunos'
const ROTA_DE_TURMAS = '/painel/alunos/turmas'

export type RespostaSimples = { ok: true } | { ok: false; erro: string }

export interface EntradaDeAlunoNaTela {
  matricula: string
  nome: string
  dataNascimento: string
  turmaId: string
  responsavelNome: string
  responsavelEmail: string
  responsavelTelefone: string
}

export type RespostaDoAluno =
  | { ok: true; alunoId: string; nome: string }
  | { ok: false; erro: string }

export async function criarAlunoAction(
  entrada: EntradaDeAlunoNaTela,
): Promise<RespostaDoAluno> {
  try {
    const aluno = await comStaffNoTenant((principal) =>
      criarAluno(
        principal,
        {
          matricula: entrada.matricula,
          nome: entrada.nome,
          dataNascimento: entrada.dataNascimento,
          turmaId: vazioViraIndefinido(entrada.turmaId),
          responsavelNome: vazioViraIndefinido(entrada.responsavelNome),
          responsavelEmail: vazioViraIndefinido(entrada.responsavelEmail),
          responsavelTelefone: vazioViraIndefinido(entrada.responsavelTelefone),
        },
        dependenciasDeLeitores(),
      ),
    )

    revalidatePath(ROTA_DE_ALUNOS)
    // A lista de turmas mostra a contagem de alunos, e ela acabou de mudar.
    revalidatePath(ROTA_DE_TURMAS)
    return { ok: true, alunoId: aluno.id, nome: aluno.nome }
  } catch (erro) {
    return comoRecusa(erro)
  }
}

/**
 * A edição de aluno.
 *
 * `dataNascimento` em BRANCO significa "não mexa", e é o padrão do
 * formulário. A data é a metade secreta do login do aluno (decisão 3):
 * mandá-la ao navegador só para preencher um campo que talvez nem seja
 * editado seria expor a credencial de graça, em toda abertura da tela.
 *
 * `turmaId` em branco significa "sem turma" nesta ação, e não "não mexa":
 * o `select` da tela tem a opção "— sem turma —", então o branco é uma
 * escolha explícita da operadora.
 */
export async function editarAlunoAction(
  alunoId: string,
  entrada: EntradaDeAlunoNaTela,
): Promise<RespostaDoAluno> {
  try {
    const aluno = await comStaffNoTenant((principal) =>
      editarAluno(
        principal,
        alunoId,
        {
          matricula: entrada.matricula,
          nome: entrada.nome,
          dataNascimento: vazioViraIndefinido(entrada.dataNascimento),
          turmaId: vazioViraNulo(entrada.turmaId),
          responsavelNome: vazioViraNulo(entrada.responsavelNome),
          responsavelEmail: vazioViraNulo(entrada.responsavelEmail),
          responsavelTelefone: vazioViraNulo(entrada.responsavelTelefone),
        },
        dependenciasDeLeitores(),
      ),
    )

    revalidatePath(ROTA_DE_ALUNOS)
    revalidatePath(`${ROTA_DE_ALUNOS}/${alunoId}`)
    revalidatePath(ROTA_DE_TURMAS)
    return { ok: true, alunoId: aluno.id, nome: aluno.nome }
  } catch (erro) {
    return comoRecusa(erro)
  }
}

export type RespostaDaDesativacao =
  | { ok: true; livrosEmMaos: number }
  | { ok: false; erro: string }

/**
 * Desativa o aluno.
 *
 * `confirmado` é a segunda passada: sem ele, o serviço RECUSA quando o
 * aluno está com livro em mãos e devolve a frase com o número. É a tela
 * que decide mostrar aquela frase e oferecer o botão de confirmar — e é
 * de propósito que o padrão seja recusar, porque desativar quem está com
 * livro tira do balcão o caminho de devolução.
 */
export async function desativarAlunoAction(
  alunoId: string,
  confirmado = false,
): Promise<RespostaDaDesativacao> {
  try {
    const resultado = await comStaffNoTenant((principal) =>
      desativarAluno(principal, { alunoId, confirmado }, dependenciasDeLeitores()),
    )

    revalidatePath(ROTA_DE_ALUNOS)
    revalidatePath(`${ROTA_DE_ALUNOS}/${alunoId}`)
    revalidatePath(ROTA_DE_TURMAS)
    return { ok: true, livrosEmMaos: resultado.livrosEmMaos }
  } catch (erro) {
    return comoRecusa(erro)
  }
}

export async function reativarAlunoAction(alunoId: string): Promise<RespostaSimples> {
  try {
    await comStaffNoTenant((principal) =>
      reativarAluno(principal, alunoId, dependenciasDeLeitores()),
    )

    revalidatePath(ROTA_DE_ALUNOS)
    revalidatePath(`${ROTA_DE_ALUNOS}/${alunoId}`)
    revalidatePath(ROTA_DE_TURMAS)
    return { ok: true }
  } catch (erro) {
    return comoRecusa(erro)
  }
}

export interface EntradaDeTurmaNaTela {
  nome: string
  serie: string
  turno: string
  anoLetivoId: string
}

export async function criarTurmaAction(
  entrada: EntradaDeTurmaNaTela,
): Promise<RespostaSimples> {
  try {
    await comStaffNoTenant((principal) =>
      criarTurma(principal, entrada, dependenciasDeLeitores()),
    )

    revalidatePath(ROTA_DE_TURMAS)
    // O formulário de aluno lista as turmas; sem isto, a turma nova não
    // apareceria lá até a próxima navegação completa.
    revalidatePath(ROTA_DE_ALUNOS)
    return { ok: true }
  } catch (erro) {
    return comoRecusa(erro)
  }
}

export async function editarTurmaAction(
  turmaId: string,
  entrada: EntradaDeTurmaNaTela,
): Promise<RespostaSimples> {
  try {
    await comStaffNoTenant((principal) =>
      editarTurma(principal, turmaId, entrada, dependenciasDeLeitores()),
    )

    revalidatePath(ROTA_DE_TURMAS)
    revalidatePath(ROTA_DE_ALUNOS)
    return { ok: true }
  } catch (erro) {
    return comoRecusa(erro)
  }
}

export interface EntradaDeAnoLetivoNaTela {
  ano: string
  dataInicio: string
  dataFim: string
  ativo: boolean
}

export async function criarAnoLetivoAction(
  entrada: EntradaDeAnoLetivoNaTela,
): Promise<RespostaSimples> {
  // O ano vem de um campo de texto. `Number()` sobre entrada não validada
  // é proibido (Global Constraint 9): `Number('')` é 0 e passaria como
  // ano letivo do ano zero. Só dígito conta, e o resto é recusa em pt-BR.
  const ano = somenteDigitos(entrada.ano)
  if (ano === null) {
    return { ok: false, erro: 'Informe o ano letivo com quatro dígitos, como 2026.' }
  }

  try {
    await comStaffNoTenant((principal) =>
      criarAnoLetivo(
        principal,
        {
          ano,
          dataInicio: entrada.dataInicio,
          dataFim: entrada.dataFim,
          ativo: entrada.ativo,
        },
        dependenciasDeLeitores(),
      ),
    )

    revalidatePath(ROTA_DE_TURMAS)
    return { ok: true }
  } catch (erro) {
    return comoRecusa(erro)
  }
}

export async function definirAnoLetivoAtivoAction(
  anoLetivoId: string,
): Promise<RespostaSimples> {
  try {
    await comStaffNoTenant((principal) =>
      definirAnoLetivoAtivo(principal, anoLetivoId, dependenciasDeLeitores()),
    )

    revalidatePath(ROTA_DE_TURMAS)
    revalidatePath(ROTA_DE_ALUNOS)
    return { ok: true }
  } catch (erro) {
    return comoRecusa(erro)
  }
}

/**
 * `ErroDeDominio` vira recusa legível; o resto sobe.
 *
 * A distinção importa: a recusa de domínio é uma frase escrita para a
 * operadora agir a respeito, e engoli-la num 500 a esconderia. Um erro
 * que NÃO é de domínio é bug, e engoli-lo faria a tela mentir que a
 * gravação falhou "por causa dos dados".
 */
function comoRecusa(erro: unknown): { ok: false; erro: string } {
  if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }

  // A recusa do Zod também é sobre os dados, e a mensagem dele já está em
  // pt-BR porque os schemas a escrevem. `issues` é a marca do ZodError,
  // lida por forma para não importar o pacote nesta camada.
  if (temIssues(erro)) {
    const primeira = erro.issues[0]
    if (primeira && typeof primeira.message === 'string') {
      return { ok: false, erro: primeira.message }
    }
  }

  throw erro
}

function temIssues(erro: unknown): erro is { issues: { message?: unknown }[] } {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'issues' in erro &&
    Array.isArray((erro as { issues: unknown }).issues)
  )
}

function vazioViraIndefinido(valor: string | undefined): string | undefined {
  const limpo = valor?.trim()
  return limpo ? limpo : undefined
}

/** Branco é escolha explícita "sem isso", e não "não mexa". */
function vazioViraNulo(valor: string | undefined): string | null {
  const limpo = valor?.trim()
  return limpo ? limpo : null
}

function somenteDigitos(bruto: string): number | null {
  const limpo = bruto.trim()
  if (!/^\d{4}$/.test(limpo)) return null
  return Number.parseInt(limpo, 10)
}
