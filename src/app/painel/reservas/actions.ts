'use server'

import { revalidatePath } from 'next/cache'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { ErroDeDominio } from '@/core/errors'
import {
  dependenciasDaCirculacao,
  dependenciasDeRenovacao,
  dependenciasDeReserva,
} from '@/modules/circulacao/circulacao.deps'
import { buscarLeitorParaBalcao } from '@/modules/circulacao/balcao.service'
import { obterConfiguracaoEfetiva } from '@/modules/circulacao/configuracao.service'
import { cancelarReserva } from '@/modules/circulacao/reservas.service'
import { renovar } from '@/modules/circulacao/renovar.service'
import { formatarData } from './datas'
import { avaliarRenovacao, type SituacaoDaRenovacao } from './reservas-na-tela'

/**
 * As Server Actions da tela de reservas e renovação.
 *
 * Quem lê a sessão é esta camada, com `comStaffNoTenant`; quem autoriza é
 * o serviço, que recebe o `Principal` por parâmetro (decisão 13). A tela
 * nunca vê repositório, `@prisma/client` nem `@/core/db` — há gate no CI.
 *
 * `hoje` é `new Date()` e sai daqui, não do serviço: é o que permite ao
 * teste do serviço rodar em qualquer data sem mexer no relógio da máquina.
 */

/** A rota que se recarrega depois de qualquer escrita desta tela. */
const ROTA = '/painel/reservas'

export type RespostaSimples = { ok: true } | { ok: false; erro: string }

/**
 * Cancela uma reserva.
 *
 * Quando a reserva já tinha exemplar separado, o serviço PASSA A VEZ na
 * mesma transação — o exemplar segue para o próximo da fila, ou volta
 * para a estante se não houver próximo. É por isso que a tela recarrega:
 * uma linha da prateleira desaparece e outra pode aparecer no lugar.
 */
export async function cancelarReservaAction(reservaId: string): Promise<RespostaSimples> {
  try {
    await comStaffNoTenant((principal) =>
      cancelarReserva(principal, { reservaId, hoje: new Date() }, dependenciasDeReserva()),
    )

    revalidatePath(ROTA)
    return { ok: true }
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

export interface LivroParaRenovar {
  emprestimoId: string
  tombo: string
  tituloDaObra: string
  /** dd/mm/aaaa, como a escola escreve. */
  previstaPara: string
  renovacoes: number
  atrasado: boolean
  diasDeAtraso: number
  /**
   * Se a SÉRIE ainda permite renovar. Não é autorização: `renovar`
   * recusa também por fila da obra, suspensão do leitor e devolução
   * concorrente, e nenhuma delas é visível daqui.
   */
  renovacao: SituacaoDaRenovacao
}

export interface LeitorParaRenovar {
  nome: string
  matricula: string
  turma: string | null
  serie: string | null
  maximoDeRenovacoes: number
  emMaos: LivroParaRenovar[]
}

export type RespostaDoLeitor =
  | { ok: true; leitor: LeitorParaRenovar }
  | { ok: false; erro: string }

/**
 * A matrícula bipada vira a lista de livros em mãos, cada um já com o
 * veredito da série sobre renovar.
 *
 * Sai pela consulta do BALCÃO, e não por uma busca própria: uma segunda
 * consulta aqui poderia responder diferente daquela, e a mesma
 * carteirinha acharia o aluno numa tela e não na outra.
 */
export async function buscarLeitorParaRenovarAction(
  matricula: string,
): Promise<RespostaDoLeitor> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const deps = dependenciasDaCirculacao()
      const leitor = await buscarLeitorParaBalcao(principal, matricula, new Date(), deps)

      // O máximo de renovações é da SÉRIE, não da escola: a coordenação
      // pode ter desligado a renovação para o 1º ano e mantido para o 3º.
      // Ler a configuração da escola aqui faria a tela liberar na tela o
      // que o serviço recusa no clique.
      const config = await obterConfiguracaoEfetiva(principal, leitor.serie, deps)

      return {
        ok: true as const,
        leitor: {
          nome: leitor.nome,
          matricula: leitor.matricula,
          turma: leitor.turma,
          serie: leitor.serie,
          maximoDeRenovacoes: config.maximoDeRenovacoes,
          emMaos: leitor.emMaos.map((livro) => ({
            emprestimoId: livro.emprestimoId,
            tombo: livro.tombo,
            tituloDaObra: livro.tituloDaObra,
            previstaPara: formatarData(livro.previstaPara),
            renovacoes: livro.renovacoes,
            atrasado: livro.atrasado,
            diasDeAtraso: livro.diasDeAtraso,
            renovacao: avaliarRenovacao(livro.renovacoes, config.maximoDeRenovacoes),
          })),
        },
      }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

export interface Renovado {
  /** dd/mm/aaaa — a data que a operadora lê em voz alta para o aluno. */
  previstaPara: string
  renovacoes: number
}

export type RespostaDaRenovacao = { ok: true; renovado: Renovado } | { ok: false; erro: string }

/**
 * Renova um empréstimo.
 *
 * A recusa por fila mora no serviço e chega aqui como frase em pt-BR:
 * "Há 2 leitor(es) esperando por este livro". A tela não tenta antecipá-la
 * porque não tem a fila do leitor em mãos — e uma antecipação errada seria
 * pior que a recusa no clique.
 */
export async function renovarAction(emprestimoId: string): Promise<RespostaDaRenovacao> {
  try {
    const renovado = await comStaffNoTenant((principal) =>
      renovar(principal, { emprestimoId, hoje: new Date() }, dependenciasDeRenovacao()),
    )

    // Sem `revalidatePath` aqui, de propósito: a renovação só passa
    // quando NÃO há fila para o título, então nem a prateleira nem as
    // filas desta tela mudam. Recarregar o servidor para nada tiraria o
    // foco do campo de matrícula no meio do atendimento. A ficha do
    // leitor, que sim mudou, é relida pela própria tela.
    return {
      ok: true,
      renovado: {
        previstaPara: formatarData(renovado.previstaPara),
        renovacoes: renovado.renovacoes,
      },
    }
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}
