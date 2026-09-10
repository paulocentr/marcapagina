import type { RepositorioDeAutores, AutorRegistrado } from '@/modules/acervo/autores.service'
import type {
  RepositorioDeObras,
  ObraRegistrada,
  ObraComDetalhes,
  DadosDeObraParaGravar,
  FiltroDeBusca,
  PaginaDeObras,
} from '@/modules/acervo/obras.service'
import type {
  RepositorioDeExemplares,
  ExemplarRegistrado,
  DadosParaCriarExemplares,
  SituacaoDoExemplar,
} from '@/modules/acervo/exemplares.service'

// Fake em memória do repositório de autores. Conta as chamadas porque
// "não faz N+1" é uma regra que o serviço promete e que só um contador
// consegue provar.
export function criarFakeDeAutores() {
  const porNormalizado = new Map<string, AutorRegistrado>()
  let proximoId = 1

  const fake = {
    chamadasDeBusca: 0,
    chamadasDeCriacao: 0,

    todos(): AutorRegistrado[] {
      return [...porNormalizado.values()]
    },
    zerarContadores() {
      fake.chamadasDeBusca = 0
      fake.chamadasDeCriacao = 0
    },

    async buscarPorNormalizados(normalizados: string[]): Promise<AutorRegistrado[]> {
      fake.chamadasDeBusca += 1
      return normalizados.map((n) => porNormalizado.get(n)).filter((a): a is AutorRegistrado => !!a)
    },

    async criarMuitos(
      novos: { nome: string; nomeNormalizado: string }[],
    ): Promise<AutorRegistrado[]> {
      fake.chamadasDeCriacao += 1
      return novos.map((novo) => {
        const registrado: AutorRegistrado = { id: `aut_${proximoId++}`, ...novo }
        porNormalizado.set(novo.nomeNormalizado, registrado)
        return registrado
      })
    },
  }

  return fake satisfies RepositorioDeAutores & Record<string, unknown>
}

// Fake em memória do repositório de obras. Guarda a linha "bruta" — com
// tituloNormalizado — porque parte do contrato do serviço é manter esse
// campo em sincronia com o título, e só dá para verificar olhando.
export function criarFakeDeObras() {
  const porId = new Map<string, DadosDeObraParaGravar & { id: string }>()
  const autoresPorObra = new Map<string, { autorId: string; ordem: number }[]>()
  const exemplaresPorObra = new Map<string, number>()
  let proximoId = 1

  // O tituloNormalizado é coluna interna: o serviço o mantém, mas ele não
  // faz parte do que o repositório devolve. `bruta()` existe justamente
  // para o teste conseguir espiá-lo.
  function exposta(linha: DadosDeObraParaGravar & { id: string }): ObraRegistrada {
    const resto: Record<string, unknown> = { ...linha }
    delete resto.tituloNormalizado
    return resto as unknown as ObraRegistrada
  }

  const fake = {
    todas: () => [...porId.values()].map(exposta),
    bruta: (id: string) => porId.get(id) ?? null,
    autoresDe: (id: string) => autoresPorObra.get(id) ?? [],
    definirContagemDeExemplares(id: string, n: number) {
      exemplaresPorObra.set(id, n)
    },

    async criar(dados: DadosDeObraParaGravar): Promise<ObraRegistrada> {
      const linha = { id: `obr_${proximoId++}`, ...dados }
      porId.set(linha.id, linha)
      return exposta(linha)
    },

    async atualizar(
      id: string,
      dados: Partial<DadosDeObraParaGravar>,
    ): Promise<ObraRegistrada | null> {
      const linha = porId.get(id)
      if (!linha) return null
      const atualizada = { ...linha, ...dados }
      porId.set(id, atualizada)
      return exposta(atualizada)
    },

    async obter(id: string): Promise<ObraComDetalhes | null> {
      const linha = porId.get(id)
      if (!linha) return null
      const total = exemplaresPorObra.get(id) ?? 0
      return {
        ...exposta(linha),
        autores: (autoresPorObra.get(id) ?? []).map((a) => ({ id: a.autorId, nome: a.autorId })),
        totalDeExemplares: total,
        exemplaresDisponiveis: total,
      }
    },

    async buscar(
      filtro: FiltroDeBusca & { termoNormalizado?: string },
    ): Promise<PaginaDeObras> {
      const todas = [...porId.values()].filter((linha) => {
        if (filtro.termoNormalizado && !linha.tituloNormalizado.includes(filtro.termoNormalizado)) {
          return false
        }
        if (filtro.isbn && linha.isbn !== filtro.isbn) return false
        if (filtro.categoriaId && linha.categoriaId !== filtro.categoriaId) return false
        return true
      })

      const pagina = filtro.pagina ?? 1
      const porPagina = filtro.porPagina ?? 20
      const recorte = todas.slice((pagina - 1) * porPagina, pagina * porPagina)

      return {
        itens: recorte.map((linha) => ({
          ...exposta(linha),
          autores: [],
          totalDeExemplares: exemplaresPorObra.get(linha.id) ?? 0,
          exemplaresDisponiveis: exemplaresPorObra.get(linha.id) ?? 0,
        })),
        total: todas.length,
        pagina,
        porPagina,
      }
    },

    async definirAutores(obraId: string, autorIds: string[]): Promise<void> {
      autoresPorObra.set(
        obraId,
        autorIds.map((autorId, ordem) => ({ autorId, ordem })),
      )
    },

    async contarExemplares(obraId: string): Promise<number> {
      return exemplaresPorObra.get(obraId) ?? 0
    },

    async excluir(id: string): Promise<void> {
      porId.delete(id)
      autoresPorObra.delete(id)
    },
  }

  return fake satisfies RepositorioDeObras & Record<string, unknown>
}

// Fake em memória do repositório de exemplares. O tombo aqui é
// simplesmente sequencial: a garantia real, sob concorrência, é do
// repositório de banco e está coberta por teste de integração.
export function criarFakeDeExemplares() {
  const porId = new Map<string, ExemplarRegistrado>()
  let proximo = 1

  const fake = {
    todos: () => [...porId.values()],
    definirSituacao(id: string, situacao: SituacaoDoExemplar) {
      const e = porId.get(id)
      if (e) porId.set(id, { ...e, situacao })
    },

    async criarSequencial(dados: DadosParaCriarExemplares): Promise<ExemplarRegistrado[]> {
      const criados: ExemplarRegistrado[] = []
      for (let i = 0; i < dados.quantidade; i++) {
        const exemplar: ExemplarRegistrado = {
          id: `exe_${proximo}`,
          obraId: dados.obraId,
          tombo: String(proximo).padStart(6, '0'),
          estado: dados.estado ?? 'BOM',
          situacao: 'DISPONIVEL',
          localizacaoId: dados.localizacaoId ?? null,
          origem: dados.origem ?? 'COMPRA',
          observacao: null,
        }
        porId.set(exemplar.id, exemplar)
        criados.push(exemplar)
        proximo += 1
      }
      return criados
    },

    async obter(id: string): Promise<ExemplarRegistrado | null> {
      return porId.get(id) ?? null
    },

    async listarDaObra(obraId: string): Promise<ExemplarRegistrado[]> {
      return [...porId.values()]
        .filter((e) => e.obraId === obraId)
        .sort((a, b) => a.tombo.localeCompare(b.tombo))
    },

    async obterPorTombo(tombo: string): Promise<ExemplarRegistrado | null> {
      return [...porId.values()].find((e) => e.tombo === tombo) ?? null
    },

    async atualizarSituacao(
      id: string,
      situacao: SituacaoDoExemplar,
      observacao: string,
    ): Promise<ExemplarRegistrado | null> {
      const atual = porId.get(id)
      if (!atual) return null
      const atualizado = { ...atual, situacao, observacao }
      porId.set(id, atualizado)
      return atualizado
    },

    async contarPorSituacao(obraId: string): Promise<Record<SituacaoDoExemplar, number>> {
      const zerado = {
        DISPONIVEL: 0,
        EMPRESTADO: 0,
        RESERVADO: 0,
        EM_CARRINHO: 0,
        EM_MANUTENCAO: 0,
        EXTRAVIADO: 0,
        BAIXADO: 0,
      }
      for (const e of porId.values()) {
        if (e.obraId === obraId) zerado[e.situacao] += 1
      }
      return zerado
    },
  }

  return fake satisfies RepositorioDeExemplares & Record<string, unknown>
}
