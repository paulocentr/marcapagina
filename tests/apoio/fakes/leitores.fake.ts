import type {
  AlunoRegistrado,
  DadosDeAlunoParaGravar,
  FichaDoAluno,
  FiltroDeAlunos,
  PaginaDeAlunos,
  RepositorioDeAlunos,
} from '@/modules/leitores/alunos.service'
import type {
  DadosDeTurmaParaGravar,
  RepositorioDeTurmas,
  TurmaNaLista,
  TurmaRegistrada,
} from '@/modules/leitores/turmas.service'
import type {
  AnoLetivoRegistrado,
  DadosDeAnoLetivoParaGravar,
  RepositorioDeAnosLetivos,
} from '@/modules/leitores/anos-letivos.service'

/**
 * Fakes em memória dos repositórios de leitores.
 *
 * Guardam a linha BRUTA — inclusive `dataNascimento`, que nenhum tipo de
 * saída do serviço expõe. É o que permite ao teste provar as duas metades
 * da regra da credencial: que a data foi gravada, e que ela NÃO sai em
 * nenhum retorno.
 */

export function criarFakeDeAnosLetivos(anos: AnoLetivoRegistrado[] = []) {
  const porId = new Map<string, AnoLetivoRegistrado>(anos.map((a) => [a.id, a]))
  let proximoId = porId.size + 1

  const fake = {
    /** Quantas vezes o "apague todos os ativos" rodou. */
    desativacoesEmMassa: 0,

    todos(): AnoLetivoRegistrado[] {
      return [...porId.values()]
    },

    async listar(): Promise<AnoLetivoRegistrado[]> {
      return [...porId.values()].sort((a, b) => b.ano - a.ano)
    },

    async obter(id: string): Promise<AnoLetivoRegistrado | null> {
      return porId.get(id) ?? null
    },

    async obterPorAno(ano: number): Promise<AnoLetivoRegistrado | null> {
      return [...porId.values()].find((a) => a.ano === ano) ?? null
    },

    async criar(dados: DadosDeAnoLetivoParaGravar): Promise<AnoLetivoRegistrado> {
      const registrado: AnoLetivoRegistrado = { id: `anl_${proximoId++}`, ...dados }
      porId.set(registrado.id, registrado)
      return registrado
    },

    async desativarTodos(): Promise<void> {
      fake.desativacoesEmMassa += 1
      for (const [id, ano] of porId) porId.set(id, { ...ano, ativo: false })
    },

    async definirAtivo(id: string): Promise<AnoLetivoRegistrado | null> {
      const ano = porId.get(id)
      if (!ano) return null
      const ativo = { ...ano, ativo: true }
      porId.set(id, ativo)
      return ativo
    },
  }

  return fake satisfies RepositorioDeAnosLetivos & Record<string, unknown>
}

export function criarFakeDeTurmas(anosLetivos?: ReturnType<typeof criarFakeDeAnosLetivos>) {
  const porId = new Map<string, DadosDeTurmaParaGravar & { id: string }>()
  const alunosPorTurma = new Map<string, number>()
  let proximoId = 1

  const fake = {
    definirAlunos(turmaId: string, quantos: number) {
      alunosPorTurma.set(turmaId, quantos)
    },

    semear(turma: DadosDeTurmaParaGravar & { id: string }) {
      porId.set(turma.id, turma)
      return turma
    },

    async listar(filtro: { anoLetivoId?: string } = {}): Promise<TurmaNaLista[]> {
      const anos = anosLetivos ? await anosLetivos.listar() : []
      return [...porId.values()]
        .filter((t) => filtro.anoLetivoId === undefined || t.anoLetivoId === filtro.anoLetivoId)
        .map((t) => {
          const anoLetivo = anos.find((a) => a.id === t.anoLetivoId)
          return {
            ...t,
            // Zero é contagem legítima de turma recém-criada; a ausência
            // no mapa é a mesma coisa aqui, e por isso o fake decide o
            // padrão explicitamente em vez de deixar um `?? 0` solto.
            alunos: alunosPorTurma.has(t.id) ? alunosPorTurma.get(t.id)! : 0,
            ano: anoLetivo ? anoLetivo.ano : 0,
            anoLetivoAtivo: anoLetivo ? anoLetivo.ativo : false,
          }
        })
    },

    async obter(id: string): Promise<TurmaRegistrada | null> {
      return porId.get(id) ?? null
    },

    async obterPorNome(anoLetivoId: string, nome: string): Promise<TurmaRegistrada | null> {
      return (
        [...porId.values()].find((t) => t.anoLetivoId === anoLetivoId && t.nome === nome) ?? null
      )
    },

    async criar(dados: DadosDeTurmaParaGravar): Promise<TurmaRegistrada> {
      const registrada = { id: `tur_${proximoId++}`, ...dados }
      porId.set(registrada.id, registrada)
      return registrada
    },

    async atualizar(
      id: string,
      dados: Partial<DadosDeTurmaParaGravar>,
    ): Promise<TurmaRegistrada | null> {
      const atual = porId.get(id)
      if (!atual) return null
      const nova = { ...atual, ...dados }
      porId.set(id, nova)
      return nova
    },

    async contarAlunos(id: string): Promise<number> {
      return alunosPorTurma.has(id) ? alunosPorTurma.get(id)! : 0
    },
  }

  return fake satisfies RepositorioDeTurmas & Record<string, unknown>
}

export function criarFakeDeAlunos() {
  const porId = new Map<string, DadosDeAlunoParaGravar & { id: string; ativo: boolean }>()
  const livrosPorAluno = new Map<string, number>()
  const turmas = new Map<string, { id: string; nome: string; serie: string }>()
  let proximoId = 1

  /**
   * O que o repositório de verdade devolve: a linha SEM a data de
   * nascimento, que é a metade secreta do login do aluno (decisão 3).
   */
  function exposto(linha: DadosDeAlunoParaGravar & { id: string; ativo: boolean }): AlunoRegistrado {
    const turma = linha.turmaId === null ? null : (turmas.get(linha.turmaId) ?? null)
    return {
      id: linha.id,
      matricula: linha.matricula,
      nome: linha.nome,
      ativo: linha.ativo,
      turma,
    }
  }

  const fake = {
    /** Espia a linha inteira, inclusive a data que o serviço nunca devolve. */
    bruta(id: string) {
      return porId.get(id) ?? null
    },
    definirLivrosEmMaos(alunoId: string, quantos: number) {
      livrosPorAluno.set(alunoId, quantos)
    },
    registrarTurma(turma: { id: string; nome: string; serie: string }) {
      turmas.set(turma.id, turma)
    },

    async buscar(filtro: FiltroDeAlunos): Promise<PaginaDeAlunos> {
      const termo = filtro.termo?.toLowerCase()
      const todos = [...porId.values()].filter((a) => {
        if (filtro.apenasAtivos === true && !a.ativo) return false
        if (filtro.turmaId !== undefined && a.turmaId !== filtro.turmaId) return false
        if (termo === undefined) return true
        return a.nome.toLowerCase().includes(termo) || a.matricula.includes(termo)
      })

      const porPagina = filtro.porPagina === undefined ? 20 : filtro.porPagina
      const pagina = filtro.pagina === undefined ? 1 : filtro.pagina
      const inicio = (pagina - 1) * porPagina

      return {
        itens: todos.slice(inicio, inicio + porPagina).map(exposto),
        total: todos.length,
        pagina,
        porPagina,
      }
    },

    async obter(id: string): Promise<FichaDoAluno | null> {
      const linha = porId.get(id)
      if (!linha) return null
      return {
        ...exposto(linha),
        responsavelNome: linha.responsavelNome,
        responsavelEmail: linha.responsavelEmail,
        responsavelTelefone: linha.responsavelTelefone,
        livrosEmMaos: livrosPorAluno.has(id) ? livrosPorAluno.get(id)! : 0,
      }
    },

    async obterPorMatricula(matricula: string): Promise<{ id: string; nome: string } | null> {
      const achado = [...porId.values()].find((a) => a.matricula === matricula)
      return achado ? { id: achado.id, nome: achado.nome } : null
    },

    async criar(dados: DadosDeAlunoParaGravar): Promise<AlunoRegistrado> {
      const jaExiste = [...porId.values()].some((a) => a.matricula === dados.matricula)
      if (jaExiste) {
        // O fake imita o índice único do banco: é assim que o teste
        // exercita a corrida entre a checagem e a gravação.
        const erro = new Error('Unique constraint failed') as Error & { code: string }
        erro.code = 'P2002'
        throw erro
      }

      const linha = { id: `alu_${proximoId++}`, ativo: true, ...dados }
      porId.set(linha.id, linha)
      return exposto(linha)
    },

    async atualizar(
      id: string,
      dados: Partial<DadosDeAlunoParaGravar>,
    ): Promise<AlunoRegistrado | null> {
      const atual = porId.get(id)
      if (!atual) return null
      const nova = { ...atual, ...dados }
      porId.set(id, nova)
      return exposto(nova)
    },

    async definirAtivo(id: string, ativo: boolean): Promise<AlunoRegistrado | null> {
      const atual = porId.get(id)
      if (!atual) return null
      const nova = { ...atual, ativo }
      porId.set(id, nova)
      return exposto(nova)
    },

    async contarLivrosEmMaos(id: string): Promise<number> {
      return livrosPorAluno.has(id) ? livrosPorAluno.get(id)! : 0
    },
  }

  return fake satisfies RepositorioDeAlunos & Record<string, unknown>
}

/**
 * A transação dos testes de unidade: chama o que recebeu e conta as
 * aberturas. O contador é o que permite provar "isto roda sob transação"
 * — uma asserção sobre o estado final passaria mesmo sem transação
 * nenhuma.
 */
export function criarFakeDeTransacao() {
  const estado = { aberturas: 0, dentro: false }

  return {
    estado,
    async emTransacao<T>(fn: () => Promise<T>): Promise<T> {
      estado.aberturas += 1
      estado.dentro = true
      try {
        return await fn()
      } finally {
        estado.dentro = false
      }
    },
  }
}
