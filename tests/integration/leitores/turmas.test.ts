import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { executarEmTransacao } from '@/core/db/tenant-extension'
import { alunosRepository } from '@/modules/leitores/alunos.repository'
import { turmasRepository } from '@/modules/leitores/turmas.repository'
import { anosLetivosRepository } from '@/modules/leitores/anos-letivos.repository'
import { criarAluno, desativarAluno } from '@/modules/leitores/alunos.service'
import {
  TurmaJaExisteError,
  criarTurma,
  editarTurma,
  listarTurmas,
} from '@/modules/leitores/turmas.service'
import {
  AnoLetivoJaExisteError,
  criarAnoLetivo,
  definirAnoLetivoAtivo,
  listarAnosLetivos,
} from '@/modules/leitores/anos-letivos.service'
import type { Principal } from '@/core/auth/principal'

const deps = {
  alunos: alunosRepository,
  turmas: turmasRepository,
  anosLetivos: anosLetivosRepository,
  emTransacao: executarEmTransacao,
}

const principalDe = (escolaId: string): Principal => ({
  reino: 'STAFF',
  id: 'usr_1',
  escolaId,
  nome: 'Coordenação',
  permissoes: ['aluno:ver', 'aluno:criar', 'aluno:editar', 'turma:gerenciar'],
})

let escolaA = ''
let escolaB = ''

beforeEach(async () => {
  const a = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  const b = await prisma.escola.create({ data: { slug: 'escola-b', nome: 'B' } })
  escolaA = a.id
  escolaB = b.id
})

function naEscolaA<T>(fn: (principal: Principal) => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, () => fn(principalDe(escolaA)))
}

const ANO_2026 = { ano: 2026, dataInicio: '2026-02-01', dataFim: '2026-12-15' }

describe('ano letivo contra banco', () => {
  it('cria com as datas certas, sem deslocar o dia', async () => {
    // As colunas são de data e o servidor pode estar em São Paulo ou em
    // UTC. Um dia a menos faz o ano letivo aparecer começando em 31/01.
    const ano = await naEscolaA((p) => criarAnoLetivo(p, ANO_2026, deps))

    const gravado = await prisma.anoLetivo.findUniqueOrThrow({ where: { id: ano.id } })
    expect(gravado.dataInicio.toISOString().slice(0, 10)).toBe('2026-02-01')
    expect(gravado.dataFim.toISOString().slice(0, 10)).toBe('2026-12-15')
  })

  it('o ano é único POR ESCOLA — a vizinha não bloqueia esta', async () => {
    await executarComTenant(escolaB, () => criarAnoLetivo(principalDe(escolaB), ANO_2026, deps))

    const ano = await naEscolaA((p) => criarAnoLetivo(p, ANO_2026, deps))

    expect(ano.ano).toBe(2026)
    expect(await prisma.anoLetivo.count()).toBe(2)
  })

  it('o ano repetido na mesma escola sai como recusa em pt-BR', async () => {
    await naEscolaA((p) => criarAnoLetivo(p, ANO_2026, deps))

    const repetido = naEscolaA((p) => criarAnoLetivo(p, ANO_2026, deps))

    await expect(repetido).rejects.toBeInstanceOf(AnoLetivoJaExisteError)
    await expect(repetido).rejects.toThrow('2026')
  })

  it('trocar o ano ativo deixa exatamente UM ativo, no banco', async () => {
    const dois026 = await naEscolaA((p) => criarAnoLetivo(p, { ...ANO_2026, ativo: true }, deps))
    const dois027 = await naEscolaA((p) =>
      criarAnoLetivo(p, { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' }, deps),
    )

    await naEscolaA((p) => definirAnoLetivoAtivo(p, dois027.id, deps))

    const ativos = await prisma.anoLetivo.findMany({
      where: { escolaId: escolaA, ativo: true },
      select: { id: true },
    })
    expect(ativos.map((a) => a.id)).toEqual([dois027.id])
    const antigo = await prisma.anoLetivo.findUniqueOrThrow({ where: { id: dois026.id } })
    expect(antigo.ativo).toBe(false)
  })

  it('trocar o ano ativo NÃO mexe no ano ativo da escola vizinha', async () => {
    // `desativarTodos` é um updateMany sem filtro próprio: sem o escopo
    // de tenant da extensão, ele apagaria o ano ativo de TODAS as
    // escolas — o vazamento mais silencioso possível.
    const daB = await executarComTenant(escolaB, () =>
      criarAnoLetivo(principalDe(escolaB), { ...ANO_2026, ativo: true }, deps),
    )
    const daA = await naEscolaA((p) => criarAnoLetivo(p, ANO_2026, deps))

    await naEscolaA((p) => definirAnoLetivoAtivo(p, daA.id, deps))

    const vizinha = await prisma.anoLetivo.findUniqueOrThrow({ where: { id: daB.id } })
    expect(vizinha.ativo).toBe(true)
  })

  it('ano letivo da vizinha não é ativável daqui', async () => {
    const daB = await executarComTenant(escolaB, () =>
      criarAnoLetivo(principalDe(escolaB), ANO_2026, deps),
    )

    await expect(naEscolaA((p) => definirAnoLetivoAtivo(p, daB.id, deps))).rejects.toThrow(
      /não existe/i,
    )
  })

  it('lista só os anos da própria escola, do mais novo para o mais velho', async () => {
    await executarComTenant(escolaB, () => criarAnoLetivo(principalDe(escolaB), ANO_2026, deps))
    await naEscolaA((p) => criarAnoLetivo(p, ANO_2026, deps))
    await naEscolaA((p) =>
      criarAnoLetivo(p, { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' }, deps),
    )

    const lista = await naEscolaA((p) => listarAnosLetivos(p, deps))

    expect(lista.map((a) => a.ano)).toEqual([2027, 2026])
  })
})

describe('turma contra banco', () => {
  let anoLetivoA = ''

  beforeEach(async () => {
    const ano = await naEscolaA((p) => criarAnoLetivo(p, { ...ANO_2026, ativo: true }, deps))
    anoLetivoA = ano.id
  })

  it('cria a turma com a série canônica gravada', async () => {
    // O que vai para a coluna é o que o Carrinho e a configuração por
    // série vão ler. "1º EM" cru quebraria os dois em silêncio.
    const turma = await naEscolaA((p) =>
      criarTurma(p, { nome: '1º EM A', serie: '1º EM', turno: 'Manhã', anoLetivoId: anoLetivoA }, deps),
    )

    const gravada = await prisma.turma.findUniqueOrThrow({ where: { id: turma.id } })
    expect(gravada.serie).toBe('1EM')
    expect(gravada.turno).toBe('MANHA')
  })

  it('o nome é único por ANO LETIVO, e a recusa sai em pt-BR', async () => {
    const entrada = { nome: '5º A', serie: '5', turno: 'MANHA', anoLetivoId: anoLetivoA }
    await naEscolaA((p) => criarTurma(p, entrada, deps))

    const repetida = naEscolaA((p) => criarTurma(p, entrada, deps))

    await expect(repetida).rejects.toBeInstanceOf(TurmaJaExisteError)
    await expect(repetida).rejects.toThrow('5º A')
  })

  it('o mesmo nome em outro ano letivo é aceito', async () => {
    // "5º A" existe todo ano. Travar por nome só impediria a escola de
    // abrir o ano seguinte.
    await naEscolaA((p) =>
      criarTurma(p, { nome: '5º A', serie: '5', turno: 'MANHA', anoLetivoId: anoLetivoA }, deps),
    )
    const dois027 = await naEscolaA((p) =>
      criarAnoLetivo(p, { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' }, deps),
    )

    const turma = await naEscolaA((p) =>
      criarTurma(p, { nome: '5º A', serie: '5', turno: 'MANHA', anoLetivoId: dois027.id }, deps),
    )

    expect(turma.nome).toBe('5º A')
    expect(await prisma.turma.count({ where: { escolaId: escolaA } })).toBe(2)
  })

  it('o mesmo nome na escola vizinha não bloqueia esta', async () => {
    const anoDaB = await executarComTenant(escolaB, () =>
      criarAnoLetivo(principalDe(escolaB), ANO_2026, deps),
    )
    await executarComTenant(escolaB, () =>
      criarTurma(
        principalDe(escolaB),
        { nome: '5º A', serie: '5', turno: 'MANHA', anoLetivoId: anoDaB.id },
        deps,
      ),
    )

    const turma = await naEscolaA((p) =>
      criarTurma(p, { nome: '5º A', serie: '5', turno: 'MANHA', anoLetivoId: anoLetivoA }, deps),
    )

    expect(turma.nome).toBe('5º A')
  })

  it('a lista conta os alunos ATIVOS de cada turma', async () => {
    // Contado, nunca digitado — o mesmo princípio do estoque do acervo.
    const turma = await naEscolaA((p) =>
      criarTurma(p, { nome: '5º A', serie: '5', turno: 'MANHA', anoLetivoId: anoLetivoA }, deps),
    )
    await naEscolaA((p) =>
      criarAluno(
        p,
        { matricula: '1', nome: 'Ana', dataNascimento: '2012-03-15', turmaId: turma.id },
        deps,
      ),
    )
    const bruno = await naEscolaA((p) =>
      criarAluno(
        p,
        { matricula: '2', nome: 'Bruno', dataNascimento: '2012-04-15', turmaId: turma.id },
        deps,
      ),
    )

    const antes = await naEscolaA((p) => listarTurmas(p, {}, deps))
    expect(antes[0]!.alunos).toBe(2)

    // Aluno desativado sai da contagem: "27 alunos" ao lado de uma turma
    // com 3 evadidos faria a coordenação planejar rodada de carrinho para
    // gente que não está lá.
    await naEscolaA((p) => desativarAluno(p, { alunoId: bruno.id }, deps))

    const depois = await naEscolaA((p) => listarTurmas(p, {}, deps))
    expect(depois[0]!.alunos).toBe(1)
  })

  it('a lista traz o ano e se ele é o ativo', async () => {
    await naEscolaA((p) =>
      criarTurma(p, { nome: '5º A', serie: '5', turno: 'MANHA', anoLetivoId: anoLetivoA }, deps),
    )

    const lista = await naEscolaA((p) => listarTurmas(p, {}, deps))

    expect(lista[0]!.ano).toBe(2026)
    expect(lista[0]!.anoLetivoAtivo).toBe(true)
  })

  it('a lista NÃO traz turma da escola vizinha', async () => {
    const anoDaB = await executarComTenant(escolaB, () =>
      criarAnoLetivo(principalDe(escolaB), ANO_2026, deps),
    )
    await executarComTenant(escolaB, () =>
      criarTurma(
        principalDe(escolaB),
        { nome: 'Turma da B', serie: '5', turno: 'MANHA', anoLetivoId: anoDaB.id },
        deps,
      ),
    )
    await naEscolaA((p) =>
      criarTurma(p, { nome: '5º A', serie: '5', turno: 'MANHA', anoLetivoId: anoLetivoA }, deps),
    )

    const lista = await naEscolaA((p) => listarTurmas(p, {}, deps))

    expect(lista.map((t) => t.nome)).toEqual(['5º A'])
  })

  it('filtra a lista por ano letivo', async () => {
    await naEscolaA((p) =>
      criarTurma(p, { nome: '5º A', serie: '5', turno: 'MANHA', anoLetivoId: anoLetivoA }, deps),
    )
    const dois027 = await naEscolaA((p) =>
      criarAnoLetivo(p, { ano: 2027, dataInicio: '2027-02-01', dataFim: '2027-12-15' }, deps),
    )
    await naEscolaA((p) =>
      criarTurma(p, { nome: '6º A', serie: '6', turno: 'MANHA', anoLetivoId: dois027.id }, deps),
    )

    const lista = await naEscolaA((p) => listarTurmas(p, { anoLetivoId: dois027.id }, deps))

    expect(lista.map((t) => t.nome)).toEqual(['6º A'])
  })

  it('editar a série grava a forma canônica', async () => {
    const turma = await naEscolaA((p) =>
      criarTurma(p, { nome: '5º A', serie: '5', turno: 'MANHA', anoLetivoId: anoLetivoA }, deps),
    )

    await naEscolaA((p) => editarTurma(p, turma.id, { serie: '2º em' }, deps))

    const gravada = await prisma.turma.findUniqueOrThrow({ where: { id: turma.id } })
    expect(gravada.serie).toBe('2EM')
  })

  it('turma da escola vizinha não é editável daqui', async () => {
    const anoDaB = await executarComTenant(escolaB, () =>
      criarAnoLetivo(principalDe(escolaB), ANO_2026, deps),
    )
    const daB = await executarComTenant(escolaB, () =>
      criarTurma(
        principalDe(escolaB),
        { nome: 'Turma da B', serie: '5', turno: 'MANHA', anoLetivoId: anoDaB.id },
        deps,
      ),
    )

    await expect(
      naEscolaA((p) => editarTurma(p, daB.id, { nome: 'Invadida' }, deps)),
    ).rejects.toThrow(/não existe/i)

    const intacta = await prisma.turma.findUniqueOrThrow({ where: { id: daB.id } })
    expect(intacta.nome).toBe('Turma da B')
  })
})
