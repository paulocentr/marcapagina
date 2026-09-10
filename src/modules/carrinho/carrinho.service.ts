import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import { normalizarParaBusca } from '@/core/texto/normalizar'
import { obraCabeNaTurma } from '@/modules/carrinho/faixa-etaria'
import { emprestar, type DependenciasDoBalcao } from '@/modules/circulacao/emprestar.service'
import type { Principal } from '@/core/auth/principal'

/**
 * Carrinho da Leitura.
 *
 * É um carrinho FÍSICO ITINERANTE que circula pelas salas de aula, não
 * uma wishlist (decisão 1 do projeto, spec §2.1 e §5.6). A coordenação
 * planeja a rodada de uma turma, o sistema sugere o que levar a partir
 * dos pedidos pendentes daquela turma, o carrinho vai à sala, e na volta
 * os empréstimos entram EM LOTE — uma tela para 30 alunos, não 30 telas.
 *
 * O pedido também aceita título que a biblioteca não tem. Esses viram
 * lista de sugestão de compra com contagem de demanda: o argumento que a
 * coordenação leva à direção para pedir verba.
 */

export type StatusDaRodada = 'PLANEJADA' | 'REALIZADA' | 'CANCELADA'
export type StatusDoPedido = 'PENDENTE' | 'ATENDIDO' | 'RECUSADO' | 'SUGERIDO_COMPRA'

export interface RodadaRegistrada {
  id: string
  turmaId: string
  data: Date
  responsavelId: string
  responsavelNome: string
  observacao: string | null
  status: StatusDaRodada
  exemplaresIds: string[]
}

export interface PedidoRegistrado {
  id: string
  alunoId: string
  obraId: string | null
  tituloLivre: string | null
  tituloLivreNormalizado: string | null
  status: StatusDoPedido
}

/** Uma obra que alunos da turma pediram, já com o que há em estante. */
export interface ObraPedidaPelaTurma {
  obraId: string
  titulo: string
  faixaEtaria: string | null
  /** Alunos DISTINTOS da turma que a pediram e ainda esperam. */
  pedidos: number
  exemplaresDisponiveis: { id: string; tombo: string }[]
}

export interface ExemplarSugerido {
  exemplarId: string
  tombo: string
  obraId: string
  titulo: string
  pedidos: number
}

export interface PedidoDeTituloLivre {
  alunoId: string
  titulo: string
  tituloNormalizado: string
}

export interface LinhaDeSugestaoDeCompra {
  tituloNormalizado: string
  /** A grafia como o primeiro aluno escreveu — é o que a lista mostra. */
  titulo: string
  pedidos: number
  /** Alunos distintos. É ESTE o número que vai à direção. */
  alunos: number
}

export interface ItemDoLote {
  alunoId: string
  tombo: string
}

export interface EmprestimoDoLote {
  alunoId: string
  tombo: string
  emprestimoId: string
  previstaPara: Date
}

export interface RecusaDoLote {
  alunoId: string
  tombo: string
  codigo: string
  motivo: string
}

export interface ResultadoDoLote {
  rodadaId: string
  emprestados: EmprestimoDoLote[]
  recusados: RecusaDoLote[]
}

export interface RepositorioDoCarrinho {
  obterTurma(turmaId: string): Promise<{ id: string; serie: string } | null>
  obterAluno(alunoId: string): Promise<{ id: string; nome: string } | null>
  obraExiste(obraId: string): Promise<boolean>
  obraPorTituloNormalizado(tituloNormalizado: string): Promise<{ id: string } | null>
  pedidoPendenteIgual(chave: {
    alunoId: string
    obraId: string | null
    tituloLivreNormalizado: string | null
  }): Promise<PedidoRegistrado | null>
  criarPedido(dados: {
    alunoId: string
    obraId: string | null
    tituloLivre: string | null
    tituloLivreNormalizado: string | null
  }): Promise<PedidoRegistrado>
  criarRodada(dados: {
    turmaId: string
    data: Date
    responsavelId: string
    responsavelNome: string
    observacao: string | null
    exemplaresIds: string[]
  }): Promise<RodadaRegistrada>
  obterRodada(rodadaId: string): Promise<RodadaRegistrada | null>
  marcarRodadaRealizada(rodadaId: string): Promise<void>
  obrasPedidasPelaTurma(turmaId: string): Promise<ObraPedidaPelaTurma[]>
  /**
   * Fecha o pedido pendente daquele aluno para a obra DESTE exemplar.
   * Recebe o exemplar, e não a obra, porque quem chama acabou de gravar
   * um empréstimo e é o exemplar que ele tem em mãos — resolver a obra no
   * serviço obrigaria a uma consulta a mais e a um `if` sobre um caso
   * impossível.
   */
  atenderPedidoPendente(alunoId: string, exemplarId: string): Promise<void>
  /** Pedidos de título fora do acervo que ainda esperam decisão de compra. */
  pedidosDeTituloLivreEmAberto(): Promise<PedidoDeTituloLivre[]>
}

export interface DependenciasDoCarrinho {
  carrinho: RepositorioDoCarrinho
}

/** O lote reusa `emprestar`, então carrega também as do balcão. */
export type DependenciasDoLote = DependenciasDoCarrinho & DependenciasDoBalcao

export class TurmaInexistenteError extends ErroDeDominio {
  constructor() {
    super('Esta turma não existe nesta escola.', 'TURMA_INEXISTENTE')
  }
}

export class AlunoInexistenteError extends ErroDeDominio {
  constructor() {
    super('Este aluno não existe nesta escola.', 'ALUNO_INEXISTENTE')
  }
}

export class ObraInexistenteError extends ErroDeDominio {
  constructor() {
    super('Esta obra não existe no acervo desta escola.', 'OBRA_INEXISTENTE')
  }
}

export class PedidoSemAlvoError extends ErroDeDominio {
  constructor() {
    super(
      'Informe a obra do acervo ou escreva o título que o aluno pediu — o pedido precisa de um dos dois.',
      'PEDIDO_SEM_ALVO',
    )
  }
}

export class PedidoComDoisAlvosError extends ErroDeDominio {
  constructor() {
    super(
      'Um pedido é de uma obra do acervo OU de um título de fora dele, nunca dos dois ao mesmo tempo.',
      'PEDIDO_COM_DOIS_ALVOS',
    )
  }
}

export class PedidoDuplicadoError extends ErroDeDominio {
  constructor() {
    super('Este aluno já tem um pedido em aberto para este título.', 'PEDIDO_DUPLICADO')
  }
}

export class RodadaInexistenteError extends ErroDeDominio {
  constructor() {
    super('Esta rodada do carrinho não existe nesta escola.', 'RODADA_INEXISTENTE')
  }
}

export class RodadaCanceladaError extends ErroDeDominio {
  constructor() {
    super(
      'Esta rodada foi cancelada. Planeje outra antes de lançar os empréstimos.',
      'RODADA_CANCELADA',
    )
  }
}

export class LoteVazioError extends ErroDeDominio {
  constructor() {
    super('Não há nenhum empréstimo para lançar nesta rodada.', 'LOTE_VAZIO')
  }
}

export class TomboRepetidoNoLoteError extends ErroDeDominio {
  constructor(readonly tombo: string) {
    super(
      `O tombo ${tombo} aparece duas vezes neste lote, e existe só um exemplar dele no carrinho. ` +
        'Confira a quem ele foi entregue.',
      'TOMBO_REPETIDO_NO_LOTE',
    )
  }
}

/**
 * O lote parou por falha que NÃO é regra de negócio — banco fora do ar,
 * por exemplo.
 *
 * Carrega o que já entrou porque aqueles livros saíram fisicamente com os
 * alunos: sem essa lista a operadora relançaria o lote inteiro às cegas
 * quando o sistema voltasse.
 *
 * Não herda `ErroDeDominio` de propósito. `ErroDeDominio` é o que a rota
 * traduz em recusa esperada e mostra em pt-BR; isto aqui é defeito, e
 * apresentá-lo como recusa esconderia uma falha de infraestrutura atrás
 * de uma mensagem tranquila.
 */
export class LoteInterrompidoError extends Error {
  constructor(
    readonly parcial: ResultadoDoLote,
    readonly causa: unknown,
  ) {
    super(
      `O lote parou depois de ${parcial.emprestados.length} empréstimo(s). ` +
        'Os que já entraram estão gravados; confira antes de lançar o resto.',
    )
    this.name = 'LoteInterrompidoError'
  }
}

export async function planejarRodada(
  principal: Principal,
  entrada: { turmaId: string; data: Date; observacao?: string; exemplaresIds?: string[] },
  deps: DependenciasDoCarrinho,
): Promise<RodadaRegistrada> {
  exigirPermissao(principal, 'carrinho:gerenciar')

  const turma = await deps.carrinho.obterTurma(entrada.turmaId)
  if (!turma) throw new TurmaInexistenteError()

  const observacao = entrada.observacao?.trim() ?? ''

  return deps.carrinho.criarRodada({
    turmaId: turma.id,
    data: entrada.data,
    // O responsável é quem está logado, nunca um nome digitado: é este
    // nome que a coordenação procura quando um livro do carrinho não
    // volta, e um campo livre permitiria assiná-lo com o de outra pessoa.
    responsavelId: principal.id,
    responsavelNome: principal.nome,
    observacao: observacao.length > 0 ? observacao : null,
    // O mesmo exemplar listado duas vezes é o duplo clique na tela de
    // montagem. Deixar passar faria a chave composta da rodada estourar
    // no banco com um erro que não diz nada à operadora.
    exemplaresIds: [...new Set(entrada.exemplaresIds ?? [])],
  })
}

/**
 * O que levar no carrinho desta rodada (spec §5.6, passo 2).
 *
 * Sai dos pedidos PENDENTES da turma, filtrado pela faixa etária e pelo
 * que existe disponível em estante. É sugestão, não decisão: a operadora
 * pode acrescentar ou tirar o que quiser antes de empurrar o carrinho.
 */
export async function sugerirExemplares(
  principal: Principal,
  entrada: { turmaId: string },
  deps: DependenciasDoCarrinho,
): Promise<ExemplarSugerido[]> {
  exigirPermissao(principal, 'carrinho:gerenciar')

  const turma = await deps.carrinho.obterTurma(entrada.turmaId)
  if (!turma) throw new TurmaInexistenteError()

  const pedidas = await deps.carrinho.obrasPedidasPelaTurma(turma.id)
  const sugestoes: ExemplarSugerido[] = []

  for (const obra of pedidas) {
    // O carrinho entra na sala e a professora entrega o que está nele.
    // Um título acima da idade chegando à mão da criança é o tipo de erro
    // que a escola não consegue explicar ao responsável.
    if (!obraCabeNaTurma(obra.faixaEtaria, turma.serie)) continue

    // Uma cópia por aluno que pediu, até onde o acervo alcança. Levar UMA
    // quando cinco pediram garante quatro decepcionados numa visita que
    // acontece uma vez por mês.
    const quantas = Math.min(obra.pedidos, obra.exemplaresDisponiveis.length)

    for (const exemplar of obra.exemplaresDisponiveis.slice(0, quantas)) {
      sugestoes.push({
        exemplarId: exemplar.id,
        tombo: exemplar.tombo,
        obraId: obra.obraId,
        titulo: obra.titulo,
        pedidos: obra.pedidos,
      })
    }
  }

  // O carrinho é pequeno e a operadora corta pelo fim da lista: o mais
  // pedido tem de estar no topo, senão o corte derruba justamente o que
  // mais gente esperava.
  sugestoes.sort((a, b) => b.pedidos - a.pedidos || a.tombo.localeCompare(b.tombo))

  return sugestoes
}

export async function registrarPedido(
  principal: Principal,
  entrada: { alunoId: string; obraId?: string; tituloLivre?: string },
  deps: DependenciasDoCarrinho,
): Promise<PedidoRegistrado> {
  exigirPermissao(principal, 'carrinho:gerenciar')

  const tituloLivre = entrada.tituloLivre?.trim() ?? ''
  const obraPedida = entrada.obraId?.trim() ?? ''

  if (obraPedida.length > 0 && tituloLivre.length > 0) throw new PedidoComDoisAlvosError()
  if (obraPedida.length === 0 && tituloLivre.length === 0) throw new PedidoSemAlvoError()

  const aluno = await deps.carrinho.obterAluno(entrada.alunoId)
  if (!aluno) throw new AlunoInexistenteError()

  let obraId: string | null = null
  let titulo: string | null = null
  let tituloNormalizado: string | null = null

  if (obraPedida.length > 0) {
    if (!(await deps.carrinho.obraExiste(obraPedida))) throw new ObraInexistenteError()
    obraId = obraPedida
  } else {
    const normalizado = normalizarParaBusca(tituloLivre)

    // Um título livre que a biblioteca JÁ TEM não pode virar sugestão de
    // compra: a coordenação pediria verba à direção por um livro que está
    // na estante, e a lista inteira perderia a credibilidade na primeira
    // conferência. Quando o texto casa com o acervo, o pedido vira pedido
    // da obra — que é o que o aluno quis dizer.
    const noAcervo = await deps.carrinho.obraPorTituloNormalizado(normalizado)

    if (noAcervo) {
      obraId = noAcervo.id
    } else {
      titulo = tituloLivre
      tituloNormalizado = normalizado
    }
  }

  // O duplo clique é o que infla a contagem de demanda — justamente o
  // número que a coordenação leva à direção para pedir dinheiro.
  const jaPedido = await deps.carrinho.pedidoPendenteIgual({
    alunoId: aluno.id,
    obraId,
    tituloLivreNormalizado: tituloNormalizado,
  })
  if (jaPedido) throw new PedidoDuplicadoError()

  return deps.carrinho.criarPedido({
    alunoId: aluno.id,
    obraId,
    tituloLivre: titulo,
    tituloLivreNormalizado: tituloNormalizado,
  })
}

/**
 * Empréstimo em LOTE da rodada (spec §5.6, passo 3).
 *
 * Uma tela para 30 alunos, não 30 telas — e, principalmente, **um aluno
 * bloqueado não derruba o lote inteiro**. Derrubar tudo por causa de um
 * faria a operadora desistir do lote e voltar a lançar um por um, que é
 * exatamente o que o carrinho existe para evitar.
 *
 * Por isso a transação é POR ALUNO, nunca uma global: o empréstimo de
 * cada leitor é um fato independente, e uma transação envolvendo os 30
 * desfaria 29 empréstimos bons por causa do 30º.
 */
export async function emprestarEmLote(
  principal: Principal,
  entrada: { rodadaId: string; itens: ItemDoLote[]; hoje: Date },
  deps: DependenciasDoLote,
): Promise<ResultadoDoLote> {
  // As duas permissões são checadas ANTES do primeiro empréstimo.
  // `emprestar` também exige `emprestimo:criar`, mas descobrir a falta
  // dela no 15º aluno deixaria 14 empréstimos lançados e a operação pela
  // metade.
  exigirPermissao(principal, 'carrinho:gerenciar')
  exigirPermissao(principal, 'emprestimo:criar')

  if (entrada.itens.length === 0) throw new LoteVazioError()

  const rodada = await deps.carrinho.obterRodada(entrada.rodadaId)
  if (!rodada) throw new RodadaInexistenteError()
  // Empréstimo apontando para uma rodada que "não aconteceu" é um dado
  // que ninguém consegue explicar depois.
  if (rodada.status === 'CANCELADA') throw new RodadaCanceladaError()

  // Há UM exemplar físico de cada tombo no carrinho. Deixar o repetido
  // seguir faria o segundo aluno ser recusado com "exemplar emprestado"
  // um segundo depois de a própria operadora o ter emprestado — uma
  // mensagem que não explica nada. Recusar antes, nomeando o tombo, é o
  // que ela consegue conferir com o carrinho na frente.
  const tombosVistos = new Set<string>()
  for (const item of entrada.itens) {
    if (tombosVistos.has(item.tombo)) throw new TomboRepetidoNoLoteError(item.tombo)
    tombosVistos.add(item.tombo)
  }

  const emprestados: EmprestimoDoLote[] = []
  const recusados: RecusaDoLote[] = []

  for (const item of entrada.itens) {
    try {
      const emprestimo = await deps.emTransacao(async () => {
        // Reusa o empréstimo do balcão inteiro: bloqueios, prazo pela
        // série, reserva e auditoria da liberação forçada. Reimplementar
        // a regra aqui faria o carrinho e o balcão divergirem na primeira
        // mudança de configuração — e o carrinho é o caminho por onde
        // passa uma turma de cada vez.
        const criado = await emprestar(
          principal,
          { alunoId: item.alunoId, tombo: item.tombo, hoje: entrada.hoje },
          deps,
        )

        // Na MESMA transação: o pedido fechado sem o empréstimo gravado
        // faria o aluno perder a vez na fila do carrinho sem ter recebido
        // o livro. E, sem fechá-lo, a próxima rodada levaria o mesmo
        // título de volta para quem já está com ele na mochila.
        await deps.carrinho.atenderPedidoPendente(item.alunoId, criado.exemplarId)

        return criado
      })

      emprestados.push({
        alunoId: item.alunoId,
        tombo: item.tombo,
        emprestimoId: emprestimo.id,
        previstaPara: emprestimo.previstaPara,
      })
    } catch (erro) {
      // Só recusa de REGRA vira linha de recusado. Registrar "banco fora
      // do ar" como recusa diria à operadora que o aluno está bloqueado:
      // ela iria discutir com o aluno em vez de pedir socorro, e o
      // relatório do dia guardaria uma recusa que nunca existiu.
      if (!(erro instanceof ErroDeDominio)) {
        throw new LoteInterrompidoError(
          { rodadaId: rodada.id, emprestados, recusados },
          erro,
        )
      }

      recusados.push({
        alunoId: item.alunoId,
        tombo: item.tombo,
        codigo: erro.codigo,
        motivo: erro.message,
      })
    }
  }

  // Fechar a rodada sem nenhum empréstimo trancaria a operadora fora
  // dela: ela resolveria a suspensão do aluno e não teria mais onde
  // lançar. Com pelo menos um empréstimo, a visita de fato aconteceu.
  if (emprestados.length > 0) await deps.carrinho.marcarRodadaRealizada(rodada.id)

  return { rodadaId: rodada.id, emprestados, recusados }
}

/**
 * Lista de sugestão de compra (spec §5.6, passo 4).
 *
 * Agrupa os pedidos de título fora do acervo pelo título normalizado — "o
 * pequeno principe" e "O Pequeno Príncipe" são o mesmo pedido de compra.
 * É o argumento que a coordenação leva à direção para pedir verba.
 *
 * A contagem é feita em memória, e não por `groupBy`, porque o número que
 * interessa é o de ALUNOS DISTINTOS: um aluno pedindo o mesmo livro em
 * três rodadas não são três pessoas querendo, e contar distinto por grupo
 * no Prisma exigiria SQL cru — que a extensão de tenant não sabe escopar
 * e portanto vazaria entre escolas. São dezenas de linhas por ano.
 */
export async function relatorioDeSugestaoDeCompra(
  principal: Principal,
  deps: DependenciasDoCarrinho,
): Promise<LinhaDeSugestaoDeCompra[]> {
  exigirPermissao(principal, 'carrinho:gerenciar')

  const pedidos = await deps.carrinho.pedidosDeTituloLivreEmAberto()

  const porTitulo = new Map<string, { titulo: string; pedidos: number; alunos: Set<string> }>()

  for (const pedido of pedidos) {
    const linha = porTitulo.get(pedido.tituloNormalizado)
    if (linha) {
      linha.pedidos += 1
      linha.alunos.add(pedido.alunoId)
    } else {
      porTitulo.set(pedido.tituloNormalizado, {
        titulo: pedido.titulo,
        pedidos: 1,
        alunos: new Set([pedido.alunoId]),
      })
    }
  }

  return [...porTitulo.entries()]
    .map(([tituloNormalizado, linha]) => ({
      tituloNormalizado,
      titulo: linha.titulo,
      pedidos: linha.pedidos,
      alunos: linha.alunos.size,
    }))
    .sort(
      (a, b) =>
        b.alunos - a.alunos ||
        b.pedidos - a.pedidos ||
        a.tituloNormalizado.localeCompare(b.tituloNormalizado),
    )
}
