import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import {
  planejarRodada,
  registrarPedido,
  relatorioDeSugestaoDeCompra,
  sugerirExemplares,
  PedidoDuplicadoError,
  TurmaInexistenteError,
} from '@/modules/carrinho/carrinho.service'
import { coordenacao, deps, HOJE, naEscola, semearEscola } from './apoio'
import type { CenarioDaEscola } from './apoio'

let a: CenarioDaEscola
let b: CenarioDaEscola

beforeEach(async () => {
  a = await semearEscola('a')
  b = await semearEscola('b')
})

describe('rodada contra banco', () => {
  it('grava a rodada com turma, responsável e exemplares levados', async () => {
    const rodada = await naEscola(a.escolaId, () =>
      planejarRodada(
        coordenacao(a.escolaId),
        {
          turmaId: a.turmaId,
          data: HOJE,
          observacao: '  visita da manhã  ',
          exemplaresIds: [a.exemplares[0]!, a.exemplares[1]!],
        },
        deps,
      ),
    )

    const gravada = await prisma.rodadaCarrinho.findUniqueOrThrow({
      where: { id: rodada.id },
      include: { exemplares: true },
    })

    expect(gravada.escolaId).toBe(a.escolaId)
    expect(gravada.turmaId).toBe(a.turmaId)
    expect(gravada.responsavelNome).toBe('Coordenação')
    expect(gravada.status).toBe('PLANEJADA')
    expect(gravada.observacao).toBe('visita da manhã')
    expect(gravada.exemplares.map((e) => e.exemplarId).sort()).toEqual(
      [a.exemplares[0]!, a.exemplares[1]!].sort(),
    )
  })

  it('a data fica no dia certo, sem deslocar por fuso', async () => {
    // Retirada às 12h em São Paulo não pode virar outro dia em UTC: a
    // rodada é agendada pela coordenação num dia de aula específico.
    const rodada = await naEscola(a.escolaId, () =>
      planejarRodada(coordenacao(a.escolaId), { turmaId: a.turmaId, data: HOJE }, deps),
    )

    const gravada = await prisma.rodadaCarrinho.findUniqueOrThrow({ where: { id: rodada.id } })
    expect(gravada.data.toISOString().slice(0, 10)).toBe('2026-09-10')
  })

  it('não planeja rodada para turma da escola vizinha', async () => {
    await expect(
      naEscola(a.escolaId, () =>
        planejarRodada(coordenacao(a.escolaId), { turmaId: b.turmaId, data: HOJE }, deps),
      ),
    ).rejects.toBeInstanceOf(TurmaInexistenteError)

    expect(await prisma.rodadaCarrinho.count()).toBe(0)
  })
})

describe('sugestão contra banco', () => {
  it('sugere o exemplar disponível da obra que a turma pediu', async () => {
    await prisma.pedidoCarrinho.create({
      data: { escolaId: a.escolaId, alunoId: a.alunos[0]!, obraId: a.obraId },
    })

    const sugestoes = await naEscola(a.escolaId, () =>
      sugerirExemplares(coordenacao(a.escolaId), { turmaId: a.turmaId }, deps),
    )

    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0]!.obraId).toBe(a.obraId)
    expect(sugestoes[0]!.titulo).toBe('Dom Casmurro')
  })

  it('não sugere exemplar indisponível', async () => {
    await prisma.exemplar.updateMany({
      where: { escolaId: a.escolaId },
      data: { situacao: 'EMPRESTADO' },
    })
    await prisma.pedidoCarrinho.create({
      data: { escolaId: a.escolaId, alunoId: a.alunos[0]!, obraId: a.obraId },
    })

    const sugestoes = await naEscola(a.escolaId, () =>
      sugerirExemplares(coordenacao(a.escolaId), { turmaId: a.turmaId }, deps),
    )

    expect(sugestoes).toEqual([])
  })

  it('a sugestão respeita a faixa etária da turma', async () => {
    await prisma.obra.update({ where: { id: a.obraId }, data: { faixaEtaria: '16+' } })
    await prisma.pedidoCarrinho.create({
      data: { escolaId: a.escolaId, alunoId: a.alunos[0]!, obraId: a.obraId },
    })

    const paraOQuinto = await naEscola(a.escolaId, () =>
      sugerirExemplares(coordenacao(a.escolaId), { turmaId: a.turmaId }, deps),
    )
    expect(paraOQuinto).toEqual([])

    // O mesmo pedido, lido pela turma do 3º do Médio, passa. O filtro é
    // da IDADE, não do livro.
    await prisma.aluno.update({
      where: { id: a.alunos[0]! },
      data: { turmaId: a.turmaMedioId },
    })
    const paraOMedio = await naEscola(a.escolaId, () =>
      sugerirExemplares(coordenacao(a.escolaId), { turmaId: a.turmaMedioId }, deps),
    )
    expect(paraOMedio).toHaveLength(1)
  })

  it('o pedido da escola vizinha não vaza para esta sugestão', async () => {
    await prisma.pedidoCarrinho.create({
      data: { escolaId: b.escolaId, alunoId: b.alunos[0]!, obraId: b.obraId },
    })

    const sugestoes = await naEscola(a.escolaId, () =>
      sugerirExemplares(coordenacao(a.escolaId), { turmaId: a.turmaId }, deps),
    )

    expect(sugestoes).toEqual([])
  })

  it('leva uma cópia por aluno que pediu', async () => {
    await prisma.pedidoCarrinho.createMany({
      data: [
        { escolaId: a.escolaId, alunoId: a.alunos[0]!, obraId: a.obraId },
        { escolaId: a.escolaId, alunoId: a.alunos[1]!, obraId: a.obraId },
      ],
    })

    const sugestoes = await naEscola(a.escolaId, () =>
      sugerirExemplares(coordenacao(a.escolaId), { turmaId: a.turmaId }, deps),
    )

    expect(sugestoes).toHaveLength(2)
    expect(new Set(sugestoes.map((s) => s.exemplarId)).size).toBe(2)
  })
})

describe('pedido contra banco', () => {
  it('grava título livre já normalizado, para agrupar a demanda', async () => {
    const pedido = await naEscola(a.escolaId, () =>
      registrarPedido(
        coordenacao(a.escolaId),
        { alunoId: a.alunos[0]!, tituloLivre: 'O Pequeno Príncipe' },
        deps,
      ),
    )

    const gravado = await prisma.pedidoCarrinho.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(gravado.escolaId).toBe(a.escolaId)
    expect(gravado.obraId).toBeNull()
    expect(gravado.tituloLivre).toBe('O Pequeno Príncipe')
    expect(gravado.tituloLivreNormalizado).toBe('o pequeno principe')
    expect(gravado.status).toBe('PENDENTE')
  })

  it('título livre que a biblioteca JÁ TEM vira pedido da obra', async () => {
    const pedido = await naEscola(a.escolaId, () =>
      registrarPedido(
        coordenacao(a.escolaId),
        { alunoId: a.alunos[0]!, tituloLivre: 'dom casmurro' },
        deps,
      ),
    )

    const gravado = await prisma.pedidoCarrinho.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(gravado.obraId).toBe(a.obraId)
    expect(gravado.tituloLivreNormalizado).toBeNull()
  })

  it('a obra homônima da escola vizinha NÃO absorve o pedido desta', async () => {
    // As duas escolas têm "Dom Casmurro". Casar com a obra errada faria o
    // pedido apontar para um exemplar de outro acervo.
    const pedido = await naEscola(a.escolaId, () =>
      registrarPedido(
        coordenacao(a.escolaId),
        { alunoId: a.alunos[0]!, tituloLivre: 'Dom Casmurro' },
        deps,
      ),
    )

    const gravado = await prisma.pedidoCarrinho.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(gravado.obraId).toBe(a.obraId)
    expect(gravado.obraId).not.toBe(b.obraId)
  })

  it('recusa o mesmo pedido pendente duas vezes', async () => {
    await naEscola(a.escolaId, () =>
      registrarPedido(
        coordenacao(a.escolaId),
        { alunoId: a.alunos[0]!, tituloLivre: 'Percy Jackson' },
        deps,
      ),
    )

    await expect(
      naEscola(a.escolaId, () =>
        registrarPedido(
          coordenacao(a.escolaId),
          { alunoId: a.alunos[0]!, tituloLivre: 'percy   jackson' },
          deps,
        ),
      ),
    ).rejects.toBeInstanceOf(PedidoDuplicadoError)

    expect(await prisma.pedidoCarrinho.count()).toBe(1)
  })
})

describe('sugestão de compra contra banco', () => {
  it('agrupa por título normalizado e conta alunos distintos', async () => {
    await prisma.pedidoCarrinho.createMany({
      data: [
        {
          escolaId: a.escolaId,
          alunoId: a.alunos[0]!,
          tituloLivre: 'O Pequeno Príncipe',
          tituloLivreNormalizado: 'o pequeno principe',
        },
        {
          escolaId: a.escolaId,
          alunoId: a.alunos[1]!,
          tituloLivre: 'o pequeno principe',
          tituloLivreNormalizado: 'o pequeno principe',
        },
        {
          escolaId: a.escolaId,
          alunoId: a.alunos[1]!,
          tituloLivre: 'O PEQUENO PRINCIPE',
          tituloLivreNormalizado: 'o pequeno principe',
          status: 'SUGERIDO_COMPRA',
        },
      ],
    })

    const relatorio = await naEscola(a.escolaId, () =>
      relatorioDeSugestaoDeCompra(coordenacao(a.escolaId), deps),
    )

    expect(relatorio).toHaveLength(1)
    expect(relatorio[0]!.alunos).toBe(2)
    expect(relatorio[0]!.pedidos).toBe(3)
  })

  it('pedido RECUSADO sai da lista de compra', async () => {
    await prisma.pedidoCarrinho.create({
      data: {
        escolaId: a.escolaId,
        alunoId: a.alunos[0]!,
        tituloLivre: 'Livro Vetado',
        tituloLivreNormalizado: 'livro vetado',
        status: 'RECUSADO',
      },
    })

    const relatorio = await naEscola(a.escolaId, () =>
      relatorioDeSugestaoDeCompra(coordenacao(a.escolaId), deps),
    )

    expect(relatorio).toEqual([])
  })

  it('a demanda da escola vizinha não entra nesta lista', async () => {
    // O relatório vai à direção pedir verba. Contar pedido de outra
    // escola é pedir dinheiro com base em demanda que não existe aqui.
    await prisma.pedidoCarrinho.create({
      data: {
        escolaId: b.escolaId,
        alunoId: b.alunos[0]!,
        tituloLivre: 'Percy Jackson',
        tituloLivreNormalizado: 'percy jackson',
      },
    })

    const relatorio = await naEscola(a.escolaId, () =>
      relatorioDeSugestaoDeCompra(coordenacao(a.escolaId), deps),
    )

    expect(relatorio).toEqual([])
  })
})
