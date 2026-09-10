import { vi } from 'vitest'
import { normalizarParaBusca } from '@/core/texto/normalizar'
import type {
  DependenciasDoLote,
  ObraPedidaPelaTurma,
  PedidoDeTituloLivre,
  PedidoRegistrado,
  RepositorioDoCarrinho,
  RodadaRegistrada,
  StatusDoPedido,
} from '@/modules/carrinho/carrinho.service'
import type {
  EmprestimoCriado,
  ExemplarDoBalcao,
  LeitorDoBalcao,
  RepositorioDoBalcao,
} from '@/modules/circulacao/emprestar.service'
import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'
import type { SituacaoDoExemplar } from '@/modules/acervo/exemplares.service'

const CONFIG_PADRAO: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 2,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

interface ObraFake {
  id: string
  titulo: string
  tituloNormalizado: string
  faixaEtaria: string | null
}

interface AlunoFake extends LeitorDoBalcao {
  turmaId: string | null
}

/**
 * Fake do carrinho INTEIRO — repositório do carrinho e repositório do
 * balcão no mesmo objeto, porque o empréstimo em lote reusa `emprestar`
 * e precisa dos dois.
 *
 * Duas coisas que este fake deliberadamente NÃO faz, para não prometer
 * garantia que não tem:
 *
 * - Não desfaz escritas quando a transação lança. O que ele prova é
 *   QUANTAS transações foram abertas — a asserção que separa "uma por
 *   aluno" de "uma global", e que nenhuma inspeção do estado final
 *   consegue fazer. Que o rollback de verdade funciona é provado em
 *   `tests/integration/carrinho/lote.test.ts`, contra o Postgres.
 * - Não valida FK. Um id inventado devolve `null` como no banco, e é o
 *   serviço que tem de transformar isso em recusa em pt-BR.
 */
export function criarFakeDoCarrinho() {
  const turmas = new Map<string, { id: string; serie: string }>()
  const alunos = new Map<string, AlunoFake>()
  const obras = new Map<string, ObraFake>()
  /** Chaveado por TOMBO, que é como o balcão e o carrinho pedem. */
  const exemplares = new Map<string, ExemplarDoBalcao>()
  const pedidos: PedidoRegistrado[] = []
  const rodadas = new Map<string, RodadaRegistrada>()
  const emprestimos: EmprestimoCriado[] = []
  const ativosPorAluno = new Map<string, number>()
  const atrasadosPorAluno = new Map<string, number>()
  const diasNaoLetivos = new Set<string>()
  const overrides: OverrideDeSerie[] = []

  let config = { ...CONFIG_PADRAO }
  let proximoId = 1
  let gravacoesTentadas = 0
  let gravacaoQueQuebra: { numero: number; erro: Error } | null = null
  // Reentrante como `executarEmTransacao`: só a mais externa conta. Sem
  // isso, a transação que o lote abre por aluno e a que `emprestar` abre
  // lá dentro contariam duas, e o teste de "uma por aluno" mediria o
  // aninhamento em vez da regra.
  let profundidade = 0

  function idDe(prefixo: string): string {
    return `${prefixo}_${proximoId++}`
  }

  function obraDoTombo(tombo: string): ObraFake | null {
    const exemplar = exemplares.get(tombo)
    if (!exemplar) return null
    return obras.get(exemplar.obraId) ?? null
  }

  const carrinho: RepositorioDoCarrinho = {
    async obterTurma(turmaId: string) {
      return turmas.get(turmaId) ?? null
    },

    async obterAluno(alunoId: string) {
      const aluno = alunos.get(alunoId)
      return aluno ? { id: aluno.id, nome: aluno.nome } : null
    },

    async obraExiste(obraId: string) {
      return obras.has(obraId)
    },

    async obraPorTituloNormalizado(tituloNormalizado: string) {
      for (const obra of obras.values()) {
        if (obra.tituloNormalizado === tituloNormalizado) return { id: obra.id }
      }
      return null
    },

    async pedidoPendenteIgual(chave) {
      return (
        pedidos.find(
          (p) =>
            p.status === 'PENDENTE' &&
            p.alunoId === chave.alunoId &&
            p.obraId === chave.obraId &&
            p.tituloLivreNormalizado === chave.tituloLivreNormalizado,
        ) ?? null
      )
    },

    async criarPedido(dados) {
      const pedido: PedidoRegistrado = {
        id: idDe('ped'),
        alunoId: dados.alunoId,
        obraId: dados.obraId,
        tituloLivre: dados.tituloLivre,
        tituloLivreNormalizado: dados.tituloLivreNormalizado,
        status: 'PENDENTE',
      }
      pedidos.push(pedido)
      return pedido
    },

    async criarRodada(dados) {
      const rodada: RodadaRegistrada = {
        id: idDe('rod'),
        turmaId: dados.turmaId,
        data: dados.data,
        responsavelId: dados.responsavelId,
        responsavelNome: dados.responsavelNome,
        observacao: dados.observacao,
        status: 'PLANEJADA',
        exemplaresIds: dados.exemplaresIds,
      }
      rodadas.set(rodada.id, rodada)
      return rodada
    },

    async obterRodada(rodadaId: string) {
      return rodadas.get(rodadaId) ?? null
    },

    async marcarRodadaRealizada(rodadaId: string) {
      const rodada = rodadas.get(rodadaId)
      if (rodada) rodadas.set(rodadaId, { ...rodada, status: 'REALIZADA' })
    },

    async obrasPedidasPelaTurma(turmaId: string): Promise<ObraPedidaPelaTurma[]> {
      const porObra = new Map<string, Set<string>>()

      for (const pedido of pedidos) {
        if (pedido.status !== 'PENDENTE' || pedido.obraId === null) continue
        if (alunos.get(pedido.alunoId)?.turmaId !== turmaId) continue
        const alunosDaObra = porObra.get(pedido.obraId) ?? new Set<string>()
        alunosDaObra.add(pedido.alunoId)
        porObra.set(pedido.obraId, alunosDaObra)
      }

      const linhas: ObraPedidaPelaTurma[] = []
      for (const [obraId, quemPediu] of porObra) {
        const obra = obras.get(obraId)
        if (!obra) continue
        linhas.push({
          obraId,
          titulo: obra.titulo,
          faixaEtaria: obra.faixaEtaria,
          pedidos: quemPediu.size,
          exemplaresDisponiveis: [...exemplares.values()]
            .filter((e) => e.obraId === obraId && e.situacao === 'DISPONIVEL')
            .map((e) => ({ id: e.id, tombo: e.tombo })),
        })
      }
      return linhas
    },

    async atenderPedidoPendente(alunoId: string, exemplarId: string) {
      const exemplar = [...exemplares.values()].find((e) => e.id === exemplarId)
      if (!exemplar) return
      for (const pedido of pedidos) {
        if (pedido.alunoId === alunoId && pedido.obraId === exemplar.obraId) {
          if (pedido.status === 'PENDENTE') pedido.status = 'ATENDIDO'
        }
      }
    },

    async pedidosDeTituloLivreEmAberto(): Promise<PedidoDeTituloLivre[]> {
      const emAberto: StatusDoPedido[] = ['PENDENTE', 'SUGERIDO_COMPRA']
      return pedidos
        .filter((p) => p.tituloLivreNormalizado !== null && emAberto.includes(p.status))
        .map((p) => ({
          alunoId: p.alunoId,
          titulo: p.tituloLivre!,
          tituloNormalizado: p.tituloLivreNormalizado!,
        }))
    },
  }

  const balcao: RepositorioDoBalcao = {
    async obterLeitor(alunoId: string) {
      const aluno = alunos.get(alunoId)
      if (!aluno) return null
      return {
        id: aluno.id,
        nome: aluno.nome,
        ativo: aluno.ativo,
        serie: aluno.serie,
        suspensaoAte: aluno.suspensaoAte,
      }
    },
    async obterExemplarPorTombo(tombo: string) {
      return exemplares.get(tombo) ?? null
    },
    async configuracaoDaEscola() {
      return config
    },
    async overridesPorSerie() {
      return overrides
    },
    async diasNaoLetivos() {
      return diasNaoLetivos
    },
    async contarAtivosDoAluno(alunoId: string) {
      const definido = ativosPorAluno.get(alunoId)
      if (definido !== undefined) return definido
      return emprestimos.filter((e) => e.alunoId === alunoId).length
    },
    async contarAtrasadosDoAluno(alunoId: string) {
      return atrasadosPorAluno.get(alunoId) ?? 0
    },
    async reservaQueSeparou() {
      return null
    },
    async atenderReserva() {
      // Reserva não faz parte do carrinho: o livro vai na rodada, não na fila.
    },
    async gravarEmprestimo(dados) {
      gravacoesTentadas += 1
      if (gravacaoQueQuebra?.numero === gravacoesTentadas) throw gravacaoQueQuebra.erro
      const criado: EmprestimoCriado = {
        id: idDe('emp'),
        exemplarId: dados.exemplarId,
        alunoId: dados.alunoId,
        previstaPara: dados.previstaPara,
        liberacaoForcada: dados.liberacaoForcada,
      }
      emprestimos.push(criado)
      return criado
    },
    async marcarExemplar(exemplarId: string, situacao: SituacaoDoExemplar) {
      for (const [tombo, exemplar] of exemplares) {
        if (exemplar.id === exemplarId) exemplares.set(tombo, { ...exemplar, situacao })
      }
    },
  }

  const fake = {
    transacoesAbertas: 0,
    registrarAuditoria: vi.fn().mockResolvedValue(undefined),
    carrinho,
    balcao,

    async emTransacao<T>(fn: () => Promise<T>): Promise<T> {
      if (profundidade > 0) return fn()
      profundidade += 1
      fake.transacoesAbertas += 1
      try {
        return await fn()
      } finally {
        profundidade -= 1
      }
    },

    // ─── controles do teste ───────────────────────────────────────────
    adicionarTurma(id: string, serie: string) {
      turmas.set(id, { id, serie })
    },
    adicionarAluno(id: string, turmaId: string | null, serie: string | null = null) {
      alunos.set(id, {
        id,
        nome: `Aluno ${id}`,
        ativo: true,
        serie,
        suspensaoAte: null,
        turmaId,
      })
    },
    suspender(alunoId: string, ate: Date) {
      const aluno = alunos.get(alunoId)
      if (aluno) alunos.set(alunoId, { ...aluno, suspensaoAte: ate })
    },
    definirAtivosDoAluno(alunoId: string, quantos: number) {
      ativosPorAluno.set(alunoId, quantos)
    },
    /**
     * Faz a N-ésima gravação de empréstimo estourar como falha de
     * INFRAESTRUTURA — banco fora do ar, não regra de negócio. É o que
     * separa "este aluno foi recusado" de "o sistema quebrou".
     */
    quebrarGravacaoNumero(numero: number, erro: Error) {
      gravacaoQueQuebra = { numero, erro }
    },
    definirConfiguracao(parcial: Partial<ConfiguracaoDaEscola>) {
      config = { ...config, ...parcial }
    },
    adicionarObra(id: string, titulo: string, faixaEtaria: string | null = null) {
      obras.set(id, { id, titulo, tituloNormalizado: normalizarParaBusca(titulo), faixaEtaria })
    },
    adicionarExemplar(
      tombo: string,
      obraId: string,
      situacao: SituacaoDoExemplar = 'DISPONIVEL',
    ) {
      exemplares.set(tombo, { id: `exe_${tombo}`, tombo, obraId, situacao })
    },
    async adicionarPedido(alunoId: string, obraId: string) {
      await carrinho.criarPedido({
        alunoId,
        obraId,
        tituloLivre: null,
        tituloLivreNormalizado: null,
      })
    },
    async adicionarPedidoDeTituloLivre(alunoId: string, titulo: string) {
      await carrinho.criarPedido({
        alunoId,
        obraId: null,
        tituloLivre: titulo,
        tituloLivreNormalizado: normalizarParaBusca(titulo),
      })
    },

    // ─── inspeção ─────────────────────────────────────────────────────
    emprestimosGravados: () => emprestimos,
    pedidosGravados: () => pedidos,
    rodada: (id: string) => rodadas.get(id),
    situacaoDoExemplar: (tombo: string) => exemplares.get(tombo)?.situacao,
    obraDoTombo,
  }

  return fake satisfies DependenciasDoLote & Record<string, unknown>
}
