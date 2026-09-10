import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import {
  emprestarEmLote,
  planejarRodada,
  LoteInterrompidoError,
  RodadaInexistenteError,
} from '@/modules/carrinho/carrinho.service'
import { coordenacao, deps, HOJE, naEscola, semearEscola } from './apoio'
import type { CenarioDaEscola } from './apoio'

let a: CenarioDaEscola
let b: CenarioDaEscola

async function rodadaDe(cenario: CenarioDaEscola): Promise<string> {
  const rodada = await naEscola(cenario.escolaId, () =>
    planejarRodada(
      coordenacao(cenario.escolaId),
      { turmaId: cenario.turmaId, data: HOJE, exemplaresIds: cenario.exemplares },
      deps,
    ),
  )
  return rodada.id
}

beforeEach(async () => {
  a = await semearEscola('a')
  b = await semearEscola('b')
})

describe('empréstimo em lote contra banco', () => {
  it('lança a turma inteira numa chamada e grava tudo', async () => {
    const rodadaId = await rodadaDe(a)

    const resultado = await naEscola(a.escolaId, () =>
      emprestarEmLote(
        coordenacao(a.escolaId),
        {
          rodadaId,
          itens: [
            { alunoId: a.alunos[0]!, tombo: 'a1' },
            { alunoId: a.alunos[1]!, tombo: 'a2' },
            { alunoId: a.alunos[2]!, tombo: 'a3' },
          ],
          hoje: HOJE,
        },
        deps,
      ),
    )

    expect(resultado.emprestados).toHaveLength(3)
    expect(resultado.recusados).toEqual([])
    expect(await prisma.emprestimo.count()).toBe(3)

    const exemplares = await prisma.exemplar.findMany({ where: { escolaId: a.escolaId } })
    expect(exemplares.every((e) => e.situacao === 'EMPRESTADO')).toBe(true)

    const rodada = await prisma.rodadaCarrinho.findUniqueOrThrow({ where: { id: rodadaId } })
    expect(rodada.status).toBe('REALIZADA')
  })

  it('um aluno suspenso não derruba o lote — os outros ficam GRAVADOS', async () => {
    // O ponto desta asserção é o banco, não o objeto devolvido: com uma
    // transação global, os dois empréstimos bons sumiriam no rollback e a
    // contagem viria 0.
    await prisma.penalidade.create({
      data: {
        escolaId: a.escolaId,
        alunoId: a.alunos[1]!,
        inicio: new Date('2026-09-01'),
        fim: new Date('2099-01-01'),
        motivo: 'Atraso',
      },
    })

    const rodadaId = await rodadaDe(a)

    const resultado = await naEscola(a.escolaId, () =>
      emprestarEmLote(
        coordenacao(a.escolaId),
        {
          rodadaId,
          itens: [
            { alunoId: a.alunos[0]!, tombo: 'a1' },
            { alunoId: a.alunos[1]!, tombo: 'a2' },
            { alunoId: a.alunos[2]!, tombo: 'a3' },
          ],
          hoje: HOJE,
        },
        deps,
      ),
    )

    expect(resultado.emprestados.map((e) => e.alunoId)).toEqual([a.alunos[0], a.alunos[2]])
    expect(resultado.recusados).toHaveLength(1)
    expect(resultado.recusados[0]!.codigo).toBe('LEITOR_BLOQUEADO')

    expect(await prisma.emprestimo.count()).toBe(2)
    // O exemplar do recusado continua na estante, disponível para o
    // próximo — nada ficou meio emprestado.
    const doRecusado = await prisma.exemplar.findFirstOrThrow({
      where: { escolaId: a.escolaId, tombo: 'a2' },
    })
    expect(doRecusado.situacao).toBe('DISPONIVEL')
  })

  it('a data prevista sai calculada pela configuração da série', async () => {
    await prisma.configuracaoDeCirculacao.create({
      data: { escolaId: a.escolaId, prazoEmDias: 14, limiteSimultaneo: 3, maximoDeRenovacoes: 2 },
    })
    await prisma.configuracaoPorSerie.create({
      data: { escolaId: a.escolaId, serie: '5', prazoEmDias: 7 },
    })

    const rodadaId = await rodadaDe(a)
    const resultado = await naEscola(a.escolaId, () =>
      emprestarEmLote(
        coordenacao(a.escolaId),
        { rodadaId, itens: [{ alunoId: a.alunos[0]!, tombo: 'a1' }], hoje: HOJE },
        deps,
      ),
    )

    expect(resultado.emprestados[0]!.previstaPara.toISOString().slice(0, 10)).toBe('2026-09-17')
  })

  it('o pedido atendido pelo lote sai de PENDENTE', async () => {
    await prisma.pedidoCarrinho.create({
      data: { escolaId: a.escolaId, alunoId: a.alunos[0]!, obraId: a.obraId },
    })

    const rodadaId = await rodadaDe(a)
    await naEscola(a.escolaId, () =>
      emprestarEmLote(
        coordenacao(a.escolaId),
        { rodadaId, itens: [{ alunoId: a.alunos[0]!, tombo: 'a1' }], hoje: HOJE },
        deps,
      ),
    )

    const pedido = await prisma.pedidoCarrinho.findFirstOrThrow({
      where: { escolaId: a.escolaId },
    })
    expect(pedido.status).toBe('ATENDIDO')

    // O pedido de OUTRO aluno para a mesma obra continua esperando: quem
    // não recebeu o livro não teve o pedido atendido.
    expect(
      await prisma.pedidoCarrinho.count({
        where: { escolaId: a.escolaId, status: 'PENDENTE' },
      }),
    ).toBe(0)
  })

  it('não lança sobre rodada da escola vizinha', async () => {
    const rodadaDaVizinha = await rodadaDe(b)

    await expect(
      naEscola(a.escolaId, () =>
        emprestarEmLote(
          coordenacao(a.escolaId),
          {
            rodadaId: rodadaDaVizinha,
            itens: [{ alunoId: a.alunos[0]!, tombo: 'a1' }],
            hoje: HOJE,
          },
          deps,
        ),
      ),
    ).rejects.toBeInstanceOf(RodadaInexistenteError)

    expect(await prisma.emprestimo.count()).toBe(0)
  })

  it('o tombo da escola vizinha é recusado, não emprestado', async () => {
    const rodadaId = await rodadaDe(a)

    const resultado = await naEscola(a.escolaId, () =>
      emprestarEmLote(
        coordenacao(a.escolaId),
        {
          rodadaId,
          itens: [
            { alunoId: a.alunos[0]!, tombo: 'a1' },
            { alunoId: a.alunos[1]!, tombo: 'b1' },
          ],
          hoje: HOJE,
        },
        deps,
      ),
    )

    expect(resultado.emprestados).toHaveLength(1)
    expect(resultado.recusados[0]!.codigo).toBe('EXEMPLAR_INDISPONIVEL')
    expect(await prisma.emprestimo.count()).toBe(1)
  })

  it('o rollback é POR ALUNO: o que já entrou sobrevive à falha do seguinte', async () => {
    // Estado divergente que o índice único parcial existe para pegar: um
    // empréstimo ATIVO sobre um exemplar que consta DISPONIVEL. A regra
    // deixa passar (a situação diz que está livre) e o banco recusa no
    // INSERT — falha que NÃO é regra de negócio.
    //
    // Se a transação fosse global, o empréstimo do primeiro aluno voltaria
    // atrás junto. Ele não volta: cada aluno é uma transação.
    await prisma.emprestimo.create({
      data: {
        escolaId: a.escolaId,
        exemplarId: a.exemplares[1]!,
        alunoId: a.alunos[2]!,
        previstaPara: new Date('2026-09-30'),
        operadorRetiradaId: 'usr_1',
      },
    })

    const rodadaId = await rodadaDe(a)

    const interrompido = await naEscola(a.escolaId, () =>
      emprestarEmLote(
        coordenacao(a.escolaId),
        {
          rodadaId,
          itens: [
            { alunoId: a.alunos[0]!, tombo: 'a1' },
            { alunoId: a.alunos[1]!, tombo: 'a2' },
          ],
          hoje: HOJE,
        },
        deps,
      ),
    ).catch((erro: unknown) => erro)

    expect(interrompido).toBeInstanceOf(LoteInterrompidoError)
    expect((interrompido as LoteInterrompidoError).parcial.emprestados).toHaveLength(1)

    // Um pré-existente + o do primeiro aluno. O segundo caiu inteiro.
    expect(await prisma.emprestimo.count()).toBe(2)
    expect(
      await prisma.emprestimo.count({ where: { alunoId: a.alunos[0]!, devolvidaEm: null } }),
    ).toBe(1)
    expect(
      await prisma.emprestimo.count({ where: { alunoId: a.alunos[1]!, devolvidaEm: null } }),
    ).toBe(0)
  })
})
