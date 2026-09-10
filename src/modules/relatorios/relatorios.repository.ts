import { dbDoTenant } from '@/core/db/tenant-extension'
import type {
  AlunosPorTurma,
  EmprestimosPorLeitor,
  LeitorComTurma,
  ObraContada,
  ObraParada,
  RepositorioDeRelatorios,
  TurmaDaEscola,
} from '@/modules/relatorios/painel-do-leitor.service'

/**
 * As consultas do Painel do Leitor.
 *
 * Relatório é CONSULTA, nunca tabela materializada (spec §5.9): um
 * resumo gravado por cron fica errado no primeiro dia em que o cron
 * falhar, e fica errado dizendo que está tudo em ordem.
 *
 * Nada aqui usa SQL cru, e é decisão de segurança e não de estilo:
 * `$queryRaw` passa POR FORA da extensão de tenant, então uma agregação
 * escrita à mão traria o empréstimo da escola vizinha para dentro deste
 * gráfico sem nenhum aviso. É por isso que o agrupamento por semana e a
 * soma por obra acontecem em memória, sobre linhas já escopadas — o
 * `date_trunc` e o `GROUP BY` com join que o Postgres faria melhor só
 * chegariam aqui por SQL cru.
 *
 * ─── O CUSTO DE CADA CONSULTA ─────────────────────────────────────────
 *
 * Todas com `escolaId` na frente do filtro, que é o primeiro campo dos
 * índices de `Emprestimo`, `Exemplar` e `Aluno`. As três que merecem
 * atenção, e o motivo de cada uma ser aceitável hoje:
 *
 * - `diasDeRetiradaEntre` lê UMA coluna de cada empréstimo das 12
 *   semanas da tendência. Numa escola com 325 empréstimos por mês são
 *   ~900 linhas de um `timestamp`. É a consulta mais pesada do painel e
 *   continua barata; se a escola crescer dez vezes, ela é a primeira a
 *   virar agregação por semana no banco.
 *
 * - `maisEmprestadasEntre` são TRÊS idas ao banco em vez de um join:
 *   agrupa por exemplar, resolve a obra de cada exemplar e busca o
 *   título das que ficaram no topo. O `IN` do meio é limitado pelo
 *   número de exemplares distintos que circularam no período (centenas),
 *   e não pelo tamanho do acervo.
 *
 * - `obrasNuncaEmprestadas` é a única VARREDURA do painel: dois
 *   subselects de existência sobre a tabela de obras, sem índice que os
 *   sirva. Num acervo de alguns milhares de obras é rápido; num acervo
 *   grande é o primeiro lugar a doer, e é por isso que a LISTA tem
 *   limite obrigatório. O total continua sendo contado inteiro, porque
 *   um número grande cortado pela metade seria pior que a consulta lenta.
 *
 * Nenhuma faz N+1: onde havia risco (a turma de cada leitor, a obra de
 * cada exemplar) a segunda consulta é UMA, com `IN`.
 */

/**
 * O filtro de "saiu no período".
 *
 * Pela RETIRADA e não pela devolução: "empréstimos em setembro" é quanto
 * a biblioteca emprestou em setembro, e um livro levado em setembro
 * continua sendo de setembro depois de voltar. `gte`/`lt` porque a
 * janela é meia-aberta — a meia-noite pertence a um período só, e `lte`
 * somaria o primeiro empréstimo de outubro nos dois meses.
 */
function saidoEntre(inicio: Date, fim: Date) {
  return { retiradaEm: { gte: inicio, lt: fim } }
}

/**
 * A meia-noite UTC do dia de um instante.
 *
 * `previstaPara`, `inicio` e `fim` de penalidade são `@db.Date`: o
 * Postgres as devolve como meia-noite UTC, e comparar contra um instante
 * com hora deixaria o vencimento de hoje cair do lado errado da
 * fronteira. Quem resolve QUAL dia é este — o da escola, não o do
 * processo — é o serviço, que já entrega o instante normalizado.
 */
function meiaNoiteUtc(instante: Date): Date {
  return new Date(
    Date.UTC(instante.getUTCFullYear(), instante.getUTCMonth(), instante.getUTCDate()),
  )
}

/** O primeiro autor de uma obra, como o `select` aninhado o devolve. */
function primeiroAutor(autores: { autor: { nome: string } }[]): string | null {
  // `null` explícito e não string vazia: a obra catalogada sem autoria é
  // um caso real (apostila, material da escola), e "" na tela pareceria
  // um campo que não carregou.
  return autores[0]?.autor.nome ?? null
}

const AUTOR_PRINCIPAL = {
  // Um autor, o de ordem zero: a ficha da obra mostra todos, o ranking
  // mostra um. "Machado de Assis; Alfredo Bosi; …" numa linha de 344px
  // empurra o título para fora do cartão.
  orderBy: { ordem: 'asc' },
  take: 1,
  select: { autor: { select: { nome: true } } },
} as const

export const relatoriosRepository: RepositorioDeRelatorios = {
  contarEmprestimosEntre(inicio: Date, fim: Date): Promise<number> {
    return dbDoTenant().emprestimo.count({ where: saidoEntre(inicio, fim) })
  },

  async emprestimosPorLeitorEntre(inicio: Date, fim: Date): Promise<EmprestimosPorLeitor[]> {
    // Uma linha por leitor: é o que dá, de uma vez, o total do período
    // (a soma), os leitores ativos (a contagem de linhas) e a base do
    // gráfico por turma. Três consultas separadas para isso poderiam
    // discordar entre si na mesma tela.
    const linhas = await dbDoTenant().emprestimo.groupBy({
      by: ['alunoId'],
      where: saidoEntre(inicio, fim),
      _count: { _all: true },
    })

    return linhas.map((linha) => ({
      alunoId: linha.alunoId,
      quantidade: linha._count._all,
    }))
  },

  async turmasDeLeitores(alunoIds: readonly string[]): Promise<LeitorComTurma[]> {
    // Lista vazia sai daqui sem consultar: `IN ()` no Postgres é sempre
    // falso, mas a viagem ao banco aconteceria, e no mês sem empréstimo
    // nenhum ela seria uma viagem para receber nada.
    if (alunoIds.length === 0) return []

    const linhas = await dbDoTenant().aluno.findMany({
      where: { id: { in: [...alunoIds] } },
      select: { id: true, turmaId: true },
    })

    return linhas.map((linha) => ({ alunoId: linha.id, turmaId: linha.turmaId }))
  },

  async listarTurmas(): Promise<TurmaDaEscola[]> {
    // TODAS as turmas da escola, sem filtrar por ano letivo ativo: um
    // `turmaId` de aluno que não tivesse linha aqui faria os empréstimos
    // dele desaparecerem do gráfico em silêncio. Quem tira a turma do
    // ano passado da tela é o serviço, pela regra "sem aluno ativo e sem
    // empréstimo no período" — que nunca some com quem tem dado.
    return dbDoTenant().turma.findMany({
      select: { id: true, nome: true, serie: true },
      orderBy: { nome: 'asc' },
    })
  },

  async alunosAtivosPorTurma(): Promise<AlunosPorTurma[]> {
    const linhas = await dbDoTenant().aluno.groupBy({
      by: ['turmaId'],
      // Só aluno ATIVO: o cadastro de quem já saiu da escola continua no
      // banco, e contá-lo faria "44% dos alunos pegaram ao menos um
      // livro" cair todo ano sem nada ter mudado na leitura.
      where: { ativo: true },
      _count: { _all: true },
    })

    return linhas.map((linha) => ({
      turmaId: linha.turmaId,
      quantidade: linha._count._all,
    }))
  },

  async diasDeRetiradaEntre(inicio: Date, fim: Date): Promise<Date[]> {
    // Só a coluna de data. O agrupamento por semana é feito em memória
    // porque `date_trunc` só chegaria aqui por SQL cru, e SQL cru passa
    // por fora da extensão de tenant.
    const linhas = await dbDoTenant().emprestimo.findMany({
      where: saidoEntre(inicio, fim),
      select: { retiradaEm: true },
      orderBy: { retiradaEm: 'asc' },
    })

    return linhas.map((linha) => linha.retiradaEm)
  },

  contarEmprestimosEmMaos(): Promise<number> {
    // Sem janela de data, de propósito: "livros em mãos agora" inclui o
    // que saiu no semestre passado e não voltou. Recortar por período
    // esconderia justamente o empréstimo esquecido.
    return dbDoTenant().emprestimo.count({ where: { devolvidaEm: null } })
  },

  contarExemplaresNoAcervo(): Promise<number> {
    // Baixado fica na ficha como história do acervo, mas não circula
    // mais. Contá-lo faria "4,5% do acervo circulando" cair a cada baixa,
    // como se a leitura tivesse diminuído.
    return dbDoTenant().exemplar.count({ where: { situacao: { not: 'BAIXADO' } } })
  },

  async contarLeitoresSuspensos(hoje: Date): Promise<number> {
    const dia = meiaNoiteUtc(hoje)

    // Agrupado por aluno para contar LEITORES e não penalidades: dois
    // atrasos do mesmo aluno geram duas suspensões, e "2 leitores
    // suspensos" com um aluno só seria falso na frente da direção.
    //
    // `fim: gte` inclui o dia em que a suspensão termina — a mesma
    // fronteira de `avaliarBloqueios`. Duas fronteiras diferentes fariam
    // o relatório e o balcão discordarem sobre o mesmo aluno.
    const linhas = await dbDoTenant().penalidade.groupBy({
      by: ['alunoId'],
      where: { inicio: { lte: dia }, fim: { gte: dia } },
    })

    return linhas.length
  },

  async maisEmprestadasEntre(inicio: Date, fim: Date, limite: number): Promise<ObraContada[]> {
    conferirLimite(limite, 'maisEmprestadasEntre')

    // Passo 1: agrupa por EXEMPLAR, que é a coluna que o empréstimo tem.
    const porExemplar = await dbDoTenant().emprestimo.groupBy({
      by: ['exemplarId'],
      where: saidoEntre(inicio, fim),
      _count: { _all: true },
    })

    if (porExemplar.length === 0) return []

    // Passo 2: a obra de cada exemplar que circulou. UMA consulta com
    // `IN`, não uma por exemplar.
    const exemplares = await dbDoTenant().exemplar.findMany({
      where: { id: { in: porExemplar.map((linha) => linha.exemplarId) } },
      select: { id: true, obraId: true },
    })

    const obraDoExemplar = new Map(exemplares.map((e) => [e.id, e.obraId]))

    // Duas cópias do mesmo livro são o mesmo livro no relatório: contar
    // por exemplar dividiria a obra em três linhas e nenhuma delas
    // chegaria ao topo do ranking.
    const porObra = new Map<string, number>()
    for (const linha of porExemplar) {
      const obraId = obraDoExemplar.get(linha.exemplarId)
      if (obraId === undefined) {
        // Inalcançável: o empréstimo tem FK `Restrict` para o exemplar.
        // Falhar alto porque somar em silêncio deixaria o ranking com
        // total menor que o número grande da mesma tela.
        throw new Error(`Empréstimo aponta para o exemplar ${linha.exemplarId}, que não existe.`)
      }
      porObra.set(obraId, (porObra.get(obraId) ?? 0) + linha._count._all)
    }

    const topo = [...porObra.entries()]
      // Desempate pelo id da obra: sem ele, duas obras com a mesma
      // contagem trocariam de lugar entre recargas e a coordenação
      // desconfiaria do ranking inteiro.
      .sort(([idA, a], [idB, b]) => b - a || idA.localeCompare(idB))
      .slice(0, limite)

    // Passo 3: título e autor só das que ficaram no topo.
    const obras = await dbDoTenant().obra.findMany({
      where: { id: { in: topo.map(([obraId]) => obraId) } },
      select: { id: true, titulo: true, autores: AUTOR_PRINCIPAL },
    })

    const fichaDaObra = new Map(obras.map((o) => [o.id, o]))

    return topo.map(([obraId, quantidade]) => {
      const ficha = fichaDaObra.get(obraId)
      if (!ficha) {
        throw new Error(`A obra ${obraId} tem empréstimo no período mas não está no acervo.`)
      }
      return {
        obraId,
        titulo: ficha.titulo,
        autor: primeiroAutor(ficha.autores),
        quantidade,
      }
    })
  },

  async obrasNuncaEmprestadas(
    limite: number,
  ): Promise<{ total: number; obras: ObraParada[] }> {
    conferirLimite(limite, 'obrasNuncaEmprestadas')

    // "Nunca emprestada" é história do acervo e não estado de agora: uma
    // obra devolvida ontem já provou que circula, mesmo estando na
    // estante neste instante. Por isso `emprestimos: none` sem filtro de
    // data nem de devolução.
    //
    // E exige ao menos um exemplar VIVO: ficha catalogada sem cópia
    // física é catalogação pela metade, não acervo parado — pô-la nesta
    // lista mandaria a operadora procurar na estante um livro que a
    // escola não tem. Exemplar só baixado também não vale: ele não pode
    // ir no carrinho.
    const where = {
      AND: [
        { exemplares: { some: { situacao: { not: 'BAIXADO' as const } } } },
        { exemplares: { none: { emprestimos: { some: {} } } } },
      ],
    }

    const [total, linhas] = await Promise.all([
      dbDoTenant().obra.count({ where }),
      dbDoTenant().obra.findMany({
        where,
        // O limite corta a LISTA; o total acima é contado inteiro. Um
        // "10 obras paradas" num acervo com trezentas seria pior que
        // uma lista curta.
        take: limite,
        orderBy: { titulo: 'asc' },
        select: {
          id: true,
          titulo: true,
          autores: AUTOR_PRINCIPAL,
          _count: { select: { exemplares: { where: { situacao: { not: 'BAIXADO' } } } } },
        },
      }),
    ])

    return {
      total,
      obras: linhas.map((linha) => ({
        obraId: linha.id,
        titulo: linha.titulo,
        autor: primeiroAutor(linha.autores),
        exemplares: linha._count.exemplares,
      })),
    }
  },
}

/**
 * Limite de lista é obrigatório e conferido.
 *
 * Uma consulta de relatório sem `take` é o caminho mais curto para a
 * tela travar na reunião com o acervo inteiro na memória — e o defeito
 * só aparece na escola que tem acervo grande, que é justamente a que
 * mais precisa do relatório.
 */
function conferirLimite(limite: number, consulta: string): void {
  if (!Number.isInteger(limite) || limite < 1) {
    throw new Error(`${consulta} precisa de um limite inteiro e positivo; recebeu ${limite}.`)
  }
}
