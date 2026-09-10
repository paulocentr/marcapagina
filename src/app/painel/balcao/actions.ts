'use server'

import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { dependenciasDaCirculacao } from '@/modules/circulacao/circulacao.deps'
import { buscarLeitorParaBalcao } from '@/modules/circulacao/balcao.service'
import { emprestar, BloqueiosDoLeitorError } from '@/modules/circulacao/emprestar.service'
import { devolver } from '@/modules/circulacao/devolver.service'
import {
  listarPrateleiraDeSeparados,
  resumoDoDiaNoBalcao,
  type DependenciasDoPainelDoBalcao,
  type TipoDeMovimento,
} from '@/modules/circulacao/painel-do-balcao.service'
import { conferirExemplarNoBalcao } from '@/modules/circulacao/exemplar-do-balcao.service'
import { ErroDeDominio, SemPermissaoError } from '@/core/errors'
import { formatarDataUtc, formatarDiaUtc, formatarHoraDaEscola } from './trilha'
import type { Bloqueio } from '@/modules/circulacao/bloqueios'
import type { LocalizacaoDoExemplar } from '@/modules/circulacao/exemplar-do-balcao.service'
import type { Principal } from '@/core/auth/principal'
import type { EstadoDeConservacao, SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'

/**
 * Quantas linhas do dia a trilha recebe.
 *
 * A tira é um CORTE, e quem diz quantos atendimentos houve são os
 * contadores do resumo — que o serviço tira das listas completas. A tela
 * confessa o corte com `fraseDoCorte`; contar as linhas da tira
 * transformaria "27 devoluções" em "8".
 */
const LINHAS_DA_TIRA = 20

/** Um livro que o leitor está com ele agora, já escrito para a tela. */
export interface LivroNaFichaDaTela {
  emprestimoId: string
  titulo: string
  tombo: string
  /** dd/mm — a data prevista de devolução deste livro. */
  previstaPara: string
  atrasado: boolean
  /** Zero quando está em dia. Nunca negativo. */
  diasDeAtraso: number
}

export interface LeitorDaTela {
  id: string
  nome: string
  matricula: string
  turma: string | null
  bloqueios: Bloqueio[]
  limiteDaSerie: number
  /** Quantos dias a série deste leitor leva o livro. */
  prazoDaSerieEmDias: number
  /** dd/mm/aaaa — a data que a operadora lê em voz alta antes de confirmar. */
  devolucaoPrevistaSeEmprestarHoje: string
  /**
   * Os livros em mãos, do vencimento mais próximo para o mais distante.
   *
   * Repare que NÃO existe um campo com a quantidade ao lado desta lista.
   * O "2 de 3" da ficha e da trilha é `emMaos.length` — a mesma lista que
   * a tela imprime. Um contador vindo por outro campo poderia discordar
   * do que a operadora conta com o dedo, e discordando os dois perdem a
   * credibilidade de uma vez.
   */
  emMaos: LivroNaFichaDaTela[]
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
          limiteDaSerie: leitor.limiteDaSerie,
          prazoDaSerieEmDias: leitor.prazoDaSerieEmDias,
          // A data sai do MESMO cálculo que o empréstimo usa para gravar,
          // calendário de dias não letivos incluído. Uma segunda fórmula
          // na tela faria a operadora prometer uma data e o sistema
          // gravar outra.
          devolucaoPrevistaSeEmprestarHoje: formatarDataUtc(
            leitor.devolucaoPrevistaSeEmprestarHoje,
          ),
          emMaos: leitor.emMaos.map((livro) => ({
            emprestimoId: livro.emprestimoId,
            titulo: livro.tituloDaObra,
            tombo: livro.tombo,
            previstaPara: formatarDiaUtc(livro.previstaPara),
            atrasado: livro.atrasado,
            diasDeAtraso: livro.diasDeAtraso,
          })),
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
        previstaPara: formatarDataUtc(emprestimo.previstaPara),
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
          ? formatarDataUtc(resultado.suspensaoAplicada.ate)
          : null,
        // A tela avisa que o exemplar foi separado e até quando o próximo
        // da fila tem para buscá-lo. Sem esse aviso a operadora devolve o
        // livro à estante e a fila nunca anda.
        separadoAte: resultado.reservaSeparada
          ? formatarDataUtc(resultado.reservaSeparada.retirarAte)
          : null,
      }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

/** Uma linha da tira "Últimos do balcão". */
export interface MovimentoNaTira {
  /** Chave de render: o mesmo empréstimo aparece uma vez por tipo. */
  chave: string
  tipo: TipoDeMovimento
  /** hh:mm no fuso da escola — o relógio que a operadora tem na parede. */
  hora: string
  leitor: string
  turma: string | null
  titulo: string
  tombo: string
  /** `null` na retirada; 0 quando a devolução voltou em dia. */
  diasDeAtraso: number | null
}

/** Um exemplar guardado atrás do balcão, esperando quem reservou. */
export interface SeparadoNaTira {
  reservaId: string
  titulo: string
  tombo: string
  leitor: string
  turma: string | null
  localizacao: string | null
  /** dd/mm — o prazo de retirada. */
  retirarAte: string
  venceHoje: boolean
  vencido: boolean
  diasParaRetirar: number
}

/**
 * A prateleira, ou a recusa explicada.
 *
 * `listarPrateleiraDeSeparados` exige `reserva:gerenciar`, e o resumo do
 * dia exige emprestar OU devolver. Um papel montado à mão com uma
 * permissão e não a outra existe — e nesse caso a trilha inteira ficaria
 * vazia se a recusa derrubasse a consulta do dia junto. Então a recusa
 * vira um caso da tela, com a frase que a operadora entende, em vez de
 * um painel em branco sem motivo.
 */
export type PrateleiraNaTrilha =
  | { permitida: true; itens: SeparadoNaTira[] }
  | { permitida: false; motivo: string }

export interface PainelDoBalcaoNaTela {
  /** Empréstimos entregues hoje. Conta o DIA, não a tira. */
  atendidosHoje: number
  devolvidosHoje: number
  movimentos: MovimentoNaTira[]
  prateleira: PrateleiraNaTrilha
}

export type RespostaDoPainel =
  | { ok: true; painel: PainelDoBalcaoNaTela }
  | { ok: false; erro: string }

/**
 * A trilha lateral inteira, numa chamada só.
 *
 * Uma chamada e um único `hoje`: com dois instantes, o contador poderia
 * dizer "27 devoluções" de um dia e a tira mostrar linhas de outro,
 * exatamente na virada da meia-noite da escola.
 */
export async function carregarPainelAction(): Promise<RespostaDoPainel> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const hoje = new Date()
      const deps = dependenciasDaCirculacao()

      const [resumo, prateleira] = await Promise.all([
        resumoDoDiaNoBalcao(principal, { hoje, limite: LINHAS_DA_TIRA }, deps),
        prateleiraOuRecusa(principal, hoje, deps),
      ])

      return {
        ok: true as const,
        painel: {
          atendidosHoje: resumo.atendidosHoje,
          devolvidosHoje: resumo.devolvidosHoje,
          movimentos: resumo.movimentos.map((movimento) => ({
            chave: `${movimento.emprestimoId}-${movimento.tipo}`,
            tipo: movimento.tipo,
            hora: formatarHoraDaEscola(movimento.quando),
            leitor: movimento.nomeDoLeitor,
            turma: movimento.turma,
            titulo: movimento.tituloDaObra,
            tombo: movimento.tombo,
            diasDeAtraso: movimento.diasDeAtraso,
          })),
          prateleira,
        },
      }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

/**
 * A prateleira, tolerando SÓ a recusa de permissão.
 *
 * O `catch` é estreito de propósito: qualquer outra falha sobe e a trilha
 * mostra o erro. Engolir tudo aqui faria a prateleira parecer vazia — ou
 * seja, "nenhum exemplar separado" — num dia em que o banco caiu, e a
 * operadora devolveria à estante livro que era de quem reservou.
 */
async function prateleiraOuRecusa(
  principal: Principal,
  hoje: Date,
  deps: DependenciasDoPainelDoBalcao,
): Promise<PrateleiraNaTrilha> {
  try {
    const separados = await listarPrateleiraDeSeparados(principal, hoje, deps)

    return {
      permitida: true,
      itens: separados.map((item) => ({
        reservaId: item.reservaId,
        titulo: item.tituloDaObra,
        tombo: item.tombo,
        leitor: item.nomeDoLeitor,
        turma: item.turma,
        localizacao: item.localizacao,
        retirarAte: formatarDiaUtc(item.retirarAte),
        venceHoje: item.venceHoje,
        vencido: item.vencido,
        diasParaRetirar: item.diasParaRetirar,
      })),
    }
  } catch (erro) {
    if (erro instanceof SemPermissaoError) {
      return {
        permitida: false,
        motivo:
          'Seu acesso não inclui a fila de reservas, então a prateleira de separados ' +
          'não aparece aqui. As devoluções do dia continuam abaixo.',
      }
    }
    throw erro
  }
}

/** O exemplar bipado, para a operadora confirmar que pegou o livro certo. */
export interface ExemplarConferido {
  tombo: string
  titulo: string
  /** Na ordem em que foram catalogados. Vazio quando a obra não tem autor. */
  autores: string[]
  situacao: SituacaoDoExemplar
  /**
   * Os quatro campos, não uma frase montada: quem sabe se escreve
   * "estante 3 · prateleira 2" ou só "3" é a tela.
   */
  localizacao: LocalizacaoDoExemplar | null
  proximoDaFila: {
    nome: string
    turma: string | null
    posicao: number
    /** Verdadeiro quando é ESTE exemplar que está guardado para ele. */
    jaSeparadoParaEle: boolean
  } | null
}

export type RespostaDaConferencia =
  | { ok: true; exemplar: ExemplarConferido }
  | { ok: false; erro: string }

/**
 * Confere o tombo bipado ANTES de confirmar o empréstimo.
 *
 * Só leitura, e é por isso que ela pode acontecer enquanto a operadora
 * digita: o tombo sozinho não confirma nada, e bipar o exemplar errado só
 * se descobre na devolução — quando o livro certo já está com outra
 * pessoa.
 */
export async function conferirTomboAction(tombo: string): Promise<RespostaDaConferencia> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const conferencia = await conferirExemplarNoBalcao(
        principal,
        tombo,
        dependenciasDaCirculacao(),
      )

      const { exemplar, proximoDaFila } = conferencia

      return {
        ok: true as const,
        exemplar: {
          tombo: exemplar.tombo,
          titulo: exemplar.tituloDaObra,
          autores: exemplar.autores,
          situacao: exemplar.situacao,
          localizacao: exemplar.localizacao,
          proximoDaFila:
            proximoDaFila === null
              ? null
              : {
                  nome: proximoDaFila.nomeDoLeitor,
                  turma: proximoDaFila.turma,
                  posicao: proximoDaFila.posicao,
                  jaSeparadoParaEle: proximoDaFila.jaSeparadoParaEle,
                },
        },
      }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}
