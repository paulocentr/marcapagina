'use server'

import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { ErroDeDominio } from '@/core/errors'
import { dependenciasDoCarrinho } from '@/modules/carrinho/carrinho.deps'
import {
  listarRodadasPlanejadas,
  listarTurmasDoCarrinho,
} from '@/modules/carrinho/carrinho-consulta.service'
import { idadeTipicaDaSerie } from '@/modules/carrinho/faixa-etaria'
import {
  emprestarEmLote,
  planejarRodada,
  relatorioDeSugestaoDeCompra,
  sugerirExemplares,
  LoteInterrompidoError,
  type ItemDoLote,
} from '@/modules/carrinho/carrinho.service'
import { buscarLeitorParaBalcao } from '@/modules/circulacao/balcao.service'

/**
 * As Server Actions da tela do Carrinho da Leitura.
 *
 * Quem lê a sessão é esta camada, com `comStaffNoTenant`, e quem autoriza
 * é o serviço, que recebe o `Principal` por parâmetro (decisão 13). A
 * tela nunca vê repositório, `@prisma/client` nem `@/core/db` — há gate
 * no CI para isso.
 */

export interface TurmaNaTela {
  id: string
  nome: string
  serie: string
  /**
   * A idade típica da série, ou `null` quando a série não diz uma
   * (multisseriada, EJA). `null` significa "não sei" e o filtro de faixa
   * etária deixa tudo passar — a tela precisa dizer isso, senão a
   * operadora acha que o filtro rodou.
   */
  idadeTipica: number | null
}

export interface LivroDaRodada {
  exemplarId: string
  tombo: string
  titulo: string
}

/** Uma rodada planejada: o carrinho que está na rua, ou pronto para sair. */
export interface RodadaNaTela {
  id: string
  turmaId: string
  turmaNome: string
  /** dd/mm/aaaa, como a escola escreve. */
  data: string
  responsavelNome: string
  observacao: string | null
  livros: LivroDaRodada[]
}

export type RespostaDaAbertura =
  | { ok: true; turmas: TurmaNaTela[]; rodadas: RodadaNaTela[] }
  | { ok: false; erro: string }

/** Turmas e rodadas em aberto, na abertura da tela. */
export async function abrirCarrinhoAction(): Promise<RespostaDaAbertura> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const deps = dependenciasDoCarrinho()

      const [turmas, rodadas] = await Promise.all([
        listarTurmasDoCarrinho(principal, deps),
        listarRodadasPlanejadas(principal, deps),
      ])

      return {
        ok: true as const,
        turmas: turmas.map((turma) => ({
          id: turma.id,
          nome: turma.nome,
          serie: turma.serie,
          idadeTipica: idadeTipicaDaSerie(turma.serie),
        })),
        rodadas: rodadas.map(paraATela),
      }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

export interface SugestaoNaTela {
  exemplarId: string
  tombo: string
  titulo: string
  /** Alunos DISTINTOS da turma que pediram esta obra e ainda esperam. */
  pedidos: number
}

export type RespostaDaSugestao =
  | { ok: true; sugestoes: SugestaoNaTela[] }
  | { ok: false; erro: string }

/**
 * O que levar nesta rodada.
 *
 * É sugestão, não decisão: quem monta o carrinho é a operadora, e a tela
 * deixa desmarcar tudo o que ela não vai levar.
 */
export async function sugerirAction(turmaId: string): Promise<RespostaDaSugestao> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const sugestoes = await sugerirExemplares(
        principal,
        { turmaId },
        dependenciasDoCarrinho(),
      )

      return {
        ok: true as const,
        sugestoes: sugestoes.map((s) => ({
          exemplarId: s.exemplarId,
          tombo: s.tombo,
          titulo: s.titulo,
          pedidos: s.pedidos,
        })),
      }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

export type RespostaDoPlanejamento =
  | { ok: true; rodada: RodadaNaTela }
  | { ok: false; erro: string }

export async function planejarRodadaAction(entrada: {
  turmaId: string
  /** aaaa-mm-dd, como o `<input type="date">` entrega. */
  data: string
  observacao?: string
  exemplaresIds: string[]
}): Promise<RespostaDoPlanejamento> {
  const data = interpretarDataDoFormulario(entrada.data)
  if (data === null) {
    return { ok: false, erro: 'Escolha a data em que o carrinho vai à sala.' }
  }

  try {
    return await comStaffNoTenant(async (principal) => {
      const deps = dependenciasDoCarrinho()

      const criada = await planejarRodada(
        principal,
        {
          turmaId: entrada.turmaId,
          data,
          observacao: entrada.observacao,
          exemplaresIds: entrada.exemplaresIds,
        },
        deps,
      )

      // A rodada volta pela MESMA consulta que a lista da tela usa, e não
      // montada aqui a partir do que o cliente mandou: é assim que o
      // romaneio na tela é o que está gravado, e não o que a tela achava
      // que ia gravar.
      const emAberto = await listarRodadasPlanejadas(principal, deps)
      const rodada = emAberto.find((candidata) => candidata.id === criada.id)

      if (!rodada) {
        return {
          ok: false as const,
          erro:
            'A rodada foi gravada mas não voltou na lista de planejadas. ' +
            'Recarregue a tela antes de lançar o lote.',
        }
      }

      return { ok: true as const, rodada: paraATela(rodada) }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

export interface AlunoNaTela {
  id: string
  nome: string
  matricula: string
  turma: string | null
  /** As frases dos bloqueios do leitor, se houver. Só aviso: o lote decide. */
  bloqueios: string[]
}

export type RespostaDoAluno = { ok: true; aluno: AlunoNaTela } | { ok: false; erro: string }

/**
 * A matrícula bipada vira o `alunoId` que o lote precisa.
 *
 * Sai pela consulta do BALCÃO, e não por uma segunda busca de leitor: uma
 * consulta própria aqui poderia responder diferente daquela e a mesma
 * carteirinha acharia o aluno numa tela e não na outra.
 */
export async function buscarAlunoAction(matricula: string): Promise<RespostaDoAluno> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const leitor = await buscarLeitorParaBalcao(
        principal,
        matricula,
        new Date(),
        dependenciasDoCarrinho(),
      )

      return {
        ok: true as const,
        aluno: {
          id: leitor.id,
          nome: leitor.nome,
          matricula: leitor.matricula,
          turma: leitor.turma,
          // Os bloqueios aparecem já na montagem do lote para a operadora
          // decidir antes de a fila de 30 alunos ir para o servidor. Não
          // impedem nada aqui: quem recusa é o serviço, aluno por aluno.
          bloqueios: leitor.bloqueios.map((bloqueio) => bloqueio.mensagem),
        },
      }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

export interface EmprestadoNoLote {
  alunoId: string
  tombo: string
  /** dd/mm/aaaa. */
  previstaPara: string
}

export interface RecusadoNoLote {
  alunoId: string
  tombo: string
  motivo: string
}

export interface ParcialDoLote {
  emprestados: EmprestadoNoLote[]
  recusados: RecusadoNoLote[]
}

export type RespostaDoLote =
  | { ok: true; resultado: ParcialDoLote }
  /**
   * `parcial` só vem quando o lote PAROU no meio por falha de
   * infraestrutura. Os empréstimos que ele carrega estão gravados e os
   * livros saíram fisicamente — sem essa lista a operadora relançaria o
   * lote inteiro às cegas.
   */
  | { ok: false; erro: string; parcial: ParcialDoLote | null }

export async function registrarLoteAction(entrada: {
  rodadaId: string
  itens: ItemDoLote[]
}): Promise<RespostaDoLote> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const resultado = await emprestarEmLote(
        principal,
        { rodadaId: entrada.rodadaId, itens: entrada.itens, hoje: new Date() },
        dependenciasDoCarrinho(),
      )

      return { ok: true as const, resultado: paraOResultadoDaTela(resultado) }
    })
  } catch (erro) {
    if (erro instanceof LoteInterrompidoError) {
      // Não é recusa de regra: o banco caiu no meio. Fica no log do
      // servidor porque a tela mostra o parcial em pt-BR e a causa
      // técnica não cabe nela — mas alguém tem de poder achá-la depois.
      console.error('[carrinho] lote interrompido', {
        rodadaId: entrada.rodadaId,
        gravados: erro.parcial.emprestados.length,
        causa: erro.causa,
      })

      return {
        ok: false,
        erro: erro.message,
        parcial: paraOResultadoDaTela(erro.parcial),
      }
    }
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message, parcial: null }
    throw erro
  }
}

export interface LinhaDeCompraNaTela {
  tituloNormalizado: string
  titulo: string
  pedidos: number
  /** Alunos distintos. É ESTE o número que vai à direção. */
  alunos: number
}

export type RespostaDaCompra =
  | { ok: true; linhas: LinhaDeCompraNaTela[] }
  | { ok: false; erro: string }

/** Os títulos que os alunos pediram e a biblioteca não tem. */
export async function sugestaoDeCompraAction(): Promise<RespostaDaCompra> {
  try {
    return await comStaffNoTenant(async (principal) => {
      const linhas = await relatorioDeSugestaoDeCompra(principal, dependenciasDoCarrinho())
      return { ok: true as const, linhas }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

function paraATela(rodada: {
  id: string
  turmaId: string
  turmaNome: string
  data: Date
  responsavelNome: string
  observacao: string | null
  livros: LivroDaRodada[]
}): RodadaNaTela {
  return {
    id: rodada.id,
    turmaId: rodada.turmaId,
    turmaNome: rodada.turmaNome,
    data: formatarData(rodada.data),
    responsavelNome: rodada.responsavelNome,
    observacao: rodada.observacao,
    livros: rodada.livros,
  }
}

function paraOResultadoDaTela(resultado: {
  emprestados: { alunoId: string; tombo: string; previstaPara: Date }[]
  recusados: { alunoId: string; tombo: string; motivo: string }[]
}): ParcialDoLote {
  return {
    emprestados: resultado.emprestados.map((e) => ({
      alunoId: e.alunoId,
      tombo: e.tombo,
      previstaPara: formatarData(e.previstaPara),
    })),
    recusados: resultado.recusados.map((r) => ({
      alunoId: r.alunoId,
      tombo: r.tombo,
      motivo: r.motivo,
    })),
  }
}

/**
 * A data do `<input type="date">` em Date de meia-noite UTC.
 *
 * `new Date('2026-09-12')` já daria isso, mas aceita calado coisas que
 * não são data (`'2026-09-31'` viraria 1º de outubro). A rodada é gravada
 * em coluna `@db.Date`, então o dia tem de ser exatamente o que a
 * operadora escolheu — e um dia a mais põe o carrinho na sala errada.
 *
 * Devolve `null` quando não entende. Nunca "hoje" no lugar.
 */
function interpretarDataDoFormulario(valor: string): Date | null {
  const casa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim())
  if (!casa) return null

  // `Number.parseInt` sobre o que o regex já provou ser dígito, nunca
  // sobre a entrada crua.
  const ano = Number.parseInt(casa[1]!, 10)
  const mes = Number.parseInt(casa[2]!, 10)
  const dia = Number.parseInt(casa[3]!, 10)

  const data = new Date(Date.UTC(ano, mes - 1, dia))

  // 31 de fevereiro entra e sai como 3 de março: só a volta prova que o
  // dia existe no calendário.
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null
  }

  return data
}

/** dd/mm/aaaa — como a escola escreve, não como o ISO escreve. */
function formatarData(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, '0')
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getUTCFullYear()}`
}
