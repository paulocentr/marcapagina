'use server'

import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { dependenciasDaCirculacao } from '@/modules/circulacao/circulacao.deps'
import { buscarLeitorParaBalcao } from '@/modules/circulacao/balcao.service'
import { emprestar, BloqueiosDoLeitorError } from '@/modules/circulacao/emprestar.service'
import { devolver } from '@/modules/circulacao/devolver.service'
import { ErroDeDominio } from '@/core/errors'
import type { Bloqueio } from '@/modules/circulacao/bloqueios'
import type { EstadoDeConservacao } from '@/modules/acervo/exemplares.service'

export interface LeitorDaTela {
  id: string
  nome: string
  matricula: string
  turma: string | null
  bloqueios: Bloqueio[]
  emprestimosAtivos: number
  limiteDaSerie: number
}

export type RespostaDoLeitor = { ok: true; leitor: LeitorDaTela } | { ok: false; erro: string }

/**
 * Busca o leitor e JÁ traz os bloqueios (spec §5.1).
 *
 * Achar o livro e só então descobrir que o aluno está suspenso é trabalho
 * desfeito na frente dele, e a fila do balcão para duas vezes.
 */
export async function buscarLeitorAction(matricula: string): Promise<RespostaDoLeitor> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const leitor = await buscarLeitorParaBalcao(
        principal,
        matricula,
        new Date(),
        dependenciasDaCirculacao(),
      )

      return {
        ok: true as const,
        leitor: {
          id: leitor.id,
          nome: leitor.nome,
          matricula: leitor.matricula,
          turma: leitor.turma,
          bloqueios: leitor.bloqueios,
          emprestimosAtivos: leitor.emprestimosAtivos,
          limiteDaSerie: leitor.limiteDaSerie,
        },
      }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

export type RespostaDoEmprestimo =
  | { ok: true; tombo: string; previstaPara: string; forcado: boolean }
  | { ok: false; erro: string; bloqueios?: Bloqueio[] }

export async function emprestarAction(entrada: {
  alunoId: string
  tombo: string
  justificativa?: string
}): Promise<RespostaDoEmprestimo> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const justificativa = entrada.justificativa?.trim()
      const tombo = entrada.tombo.trim()

      const emprestimo = await emprestar(
        principal,
        {
          alunoId: entrada.alunoId,
          tombo,
          hoje: new Date(),
          // A liberação forçada é pedida pela PRESENÇA da justificativa.
          // Um checkbox separado permitiria marcar "forçar" e deixar o
          // texto em branco — e a recusa viria só depois do envio.
          liberacaoForcada: Boolean(justificativa),
          justificativa,
        },
        dependenciasDaCirculacao(),
      )

      // O tombo, não o título: é o que a operadora tem na mão e o que ela
      // confere contra a etiqueta antes de entregar o livro. Buscar o
      // título custaria mais uma consulta para exibir algo que ela já
      // está lendo na capa.
      return {
        ok: true as const,
        tombo,
        previstaPara: formatarData(emprestimo.previstaPara),
        forcado: emprestimo.liberacaoForcada,
      }
    })
  } catch (erro) {
    // Os bloqueios sobem estruturados, não só como texto: a tela precisa
    // deles para oferecer a liberação com justificativa em vez de apenas
    // dizer não e empurrar a coordenação a contornar o sistema.
    if (erro instanceof BloqueiosDoLeitorError) {
      return { ok: false, erro: erro.message, bloqueios: erro.bloqueios }
    }
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

export type RespostaDaDevolucao =
  | {
      ok: true
      titulo: string
      leitor: string
      diasDeAtraso: number
      suspensaoAte: string | null
      /** Prazo de retirada, quando o exemplar saiu separado para a fila. */
      separadoAte: string | null
    }
  | { ok: false; erro: string }

export async function devolverAction(entrada: {
  tombo: string
  estado: EstadoDeConservacao
  observacao?: string
}): Promise<RespostaDaDevolucao> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const resultado = await devolver(
        principal,
        {
          tombo: entrada.tombo.trim(),
          hoje: new Date(),
          estado: entrada.estado,
          observacao: entrada.observacao,
        },
        dependenciasDaCirculacao(),
      )

      return {
        ok: true as const,
        titulo: resultado.tituloDaObra,
        leitor: resultado.nomeDoLeitor,
        diasDeAtraso: resultado.diasDeAtraso,
        suspensaoAte: resultado.suspensaoAplicada
          ? formatarData(resultado.suspensaoAplicada.ate)
          : null,
        // A tela avisa que o exemplar foi separado e até quando o próximo
        // da fila tem para buscá-lo. Sem esse aviso a operadora devolve o
        // livro à estante e a fila nunca anda.
        separadoAte: resultado.reservaSeparada
          ? formatarData(resultado.reservaSeparada.retirarAte)
          : null,
      }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

/** dd/mm/aaaa — como a escola escreve, não como o ISO escreve. */
function formatarData(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, '0')
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getUTCFullYear()}`
}
