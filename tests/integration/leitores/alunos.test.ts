import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { executarEmTransacao } from '@/core/db/tenant-extension'
import { alunosRepository } from '@/modules/leitores/alunos.repository'
import { turmasRepository } from '@/modules/leitores/turmas.repository'
import { anosLetivosRepository } from '@/modules/leitores/anos-letivos.repository'
import {
  AlunoComLivrosEmMaosError,
  MatriculaEmUsoError,
  criarAluno,
  desativarAluno,
  editarAluno,
  listarAlunos,
  obterFichaDoAluno,
} from '@/modules/leitores/alunos.service'
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
let turmaA = ''
let obraA = ''
let contadorDeTombos = 0

async function montarEscola(slug: string) {
  const escola = await prisma.escola.create({ data: { slug, nome: slug } })
  const anoLetivo = await prisma.anoLetivo.create({
    data: {
      escolaId: escola.id,
      ano: 2026,
      dataInicio: new Date('2026-02-01T00:00:00.000Z'),
      dataFim: new Date('2026-12-15T00:00:00.000Z'),
      ativo: true,
    },
  })
  const turma = await prisma.turma.create({
    data: {
      escolaId: escola.id,
      anoLetivoId: anoLetivo.id,
      nome: '5º A',
      serie: '5',
      turno: 'MANHA',
    },
  })
  const obra = await prisma.obra.create({
    data: { escolaId: escola.id, titulo: 'O Cortiço', tituloNormalizado: 'o cortico' },
  })

  return { escolaId: escola.id, turmaId: turma.id, obraId: obra.id }
}

/** Um empréstimo em aberto para o aluno, com exemplar de tombo novo. */
async function emprestar(escolaId: string, obraId: string, alunoId: string) {
  contadorDeTombos += 1
  const exemplar = await prisma.exemplar.create({
    data: {
      escolaId,
      obraId,
      tombo: String(contadorDeTombos).padStart(6, '0'),
      situacao: 'EMPRESTADO',
    },
  })

  return prisma.emprestimo.create({
    data: {
      escolaId,
      exemplarId: exemplar.id,
      alunoId,
      previstaPara: new Date('2026-09-24T00:00:00.000Z'),
      operadorRetiradaId: 'usr_1',
    },
  })
}

beforeEach(async () => {
  const a = await montarEscola('escola-a')
  const b = await montarEscola('escola-b')
  escolaA = a.escolaId
  escolaB = b.escolaId
  turmaA = a.turmaId
  obraA = a.obraId
})

function naEscolaA<T>(fn: (principal: Principal) => Promise<T>): Promise<T> {
  return executarComTenant(escolaA, () => fn(principalDe(escolaA)))
}

const ANA = { matricula: '2024001', nome: 'Ana Souza', dataNascimento: '2012-03-15' }

describe('cadastro de aluno contra banco', () => {
  it('cria o aluno com a turma resolvida', async () => {
    const aluno = await naEscolaA((p) => criarAluno(p, { ...ANA, turmaId: turmaA }, deps))

    expect(aluno.matricula).toBe('2024001')
    expect(aluno.turma).toEqual({ id: turmaA, nome: '5º A', serie: '5' })
    expect(aluno.ativo).toBe(true)
  })

  it('a data de nascimento NÃO desloca por causa de fuso', async () => {
    // A coluna é @db.Date e o servidor pode estar em São Paulo ou em UTC.
    // Um dia a menos aqui faz o aluno não conseguir entrar no portal com
    // a data que ele sabe de cor — que é a senha dele (decisão 3).
    await naEscolaA((p) => criarAluno(p, ANA, deps))

    const gravado = await prisma.aluno.findFirstOrThrow({ where: { escolaId: escolaA } })
    expect(gravado.dataNascimento.toISOString().slice(0, 10)).toBe('2012-03-15')
  })

  it('grava a mesma data que o importador grava, para o formato brasileiro', async () => {
    // O importador aceita dd/mm/aaaa (é o que o Excel pt-BR produz). Se
    // esta tela gravasse outra data para a mesma entrada, o mesmo aluno
    // entraria no portal ou não dependendo de por onde foi cadastrado.
    await naEscolaA((p) =>
      criarAluno(p, { ...ANA, matricula: '2024077', dataNascimento: '15/07/2011' }, deps),
    )

    const gravado = await prisma.aluno.findFirstOrThrow({ where: { matricula: '2024077' } })
    expect(gravado.dataNascimento.toISOString().slice(0, 10)).toBe('2011-07-15')
  })

  it('a matrícula é única POR ESCOLA — a vizinha não bloqueia esta', async () => {
    await prisma.aluno.create({
      data: {
        escolaId: escolaB,
        matricula: '2024001',
        nome: 'Homônimo da vizinha',
        dataNascimento: new Date('2012-03-15T00:00:00.000Z'),
      },
    })

    const aluno = await naEscolaA((p) => criarAluno(p, ANA, deps))

    expect(aluno.matricula).toBe('2024001')
    expect(await prisma.aluno.count({ where: { escolaId: escolaA } })).toBe(1)
  })

  it('a matrícula repetida na MESMA escola sai como recusa em pt-BR', async () => {
    await naEscolaA((p) => criarAluno(p, ANA, deps))

    const repetida = naEscolaA((p) => criarAluno(p, { ...ANA, nome: 'Bruno Lima' }, deps))

    await expect(repetida).rejects.toBeInstanceOf(MatriculaEmUsoError)
    await expect(repetida).rejects.toThrow('2024001')
  })

  it('o índice único do banco também sai em pt-BR, sem P2002 na tela', async () => {
    // Esta é a corrida que a checagem prévia do serviço não cobre: duas
    // operadoras cadastrando a mesma matrícula ao mesmo tempo passam as
    // duas pela checagem, e o índice único `escolaId_matricula` é o único
    // guarda. Aqui o repositório é chamado DIRETO, por baixo do serviço,
    // que é exatamente o que a corrida produz.
    await naEscolaA((p) => criarAluno(p, ANA, deps))

    const direto = executarComTenant(escolaA, () =>
      alunosRepository.criar({
        matricula: '2024001',
        nome: 'Bruno Lima',
        dataNascimento: '2011-07-15',
        turmaId: null,
        responsavelNome: null,
        responsavelEmail: null,
        responsavelTelefone: null,
      }),
    )

    await expect(direto).rejects.toBeInstanceOf(MatriculaEmUsoError)
    // O erro cru do Prisma não pode chegar à operadora.
    await expect(direto).rejects.not.toThrow(/P2002|Unique constraint/)
  })

  it('o aluno da escola vizinha NÃO aparece na lista desta', async () => {
    await naEscolaA((p) => criarAluno(p, ANA, deps))
    await executarComTenant(escolaB, () =>
      criarAluno(principalDe(escolaB), { ...ANA, nome: 'Aluno da B' }, deps),
    )

    const pagina = await naEscolaA((p) => listarAlunos(p, {}, deps))

    expect(pagina.total).toBe(1)
    expect(pagina.itens[0]!.nome).toBe('Ana Souza')
  })

  it('turma da escola vizinha não serve para o aluno desta', async () => {
    // O escopo de tenant é o que faz a turma da B não ser achada, e a
    // recusa sai em pt-BR em vez de a chave estrangeira estourar.
    const turmaDaB = await prisma.turma.findFirstOrThrow({ where: { escolaId: escolaB } })

    await expect(
      naEscolaA((p) => criarAluno(p, { ...ANA, turmaId: turmaDaB.id }, deps)),
    ).rejects.toThrow(/turma/i)
  })
})

describe('a data de nascimento não sai do banco sem necessidade', () => {
  it('a lista NÃO traz a data de nascimento de ninguém', async () => {
    // A regra da credencial vale contra o banco, não só contra o fake: o
    // `select` do repositório não pede a coluna, então ela não trafega.
    await naEscolaA((p) => criarAluno(p, { ...ANA, turmaId: turmaA }, deps))

    const pagina = await naEscolaA((p) => listarAlunos(p, {}, deps))

    expect(JSON.stringify(pagina)).not.toContain('2012')
    expect(Object.keys(pagina.itens[0]!)).not.toContain('dataNascimento')
  })

  it('a ficha NÃO traz a data de nascimento', async () => {
    const aluno = await naEscolaA((p) => criarAluno(p, ANA, deps))

    const ficha = await naEscolaA((p) => obterFichaDoAluno(p, aluno.id, deps))

    expect(Object.keys(ficha)).not.toContain('dataNascimento')
    expect(JSON.stringify(ficha)).not.toContain('2012')
  })
})

describe('busca de alunos contra banco', () => {
  beforeEach(async () => {
    await naEscolaA((p) => criarAluno(p, { ...ANA, turmaId: turmaA }, deps))
    await naEscolaA((p) =>
      criarAluno(p, { matricula: '2024002', nome: 'Bruno Lima', dataNascimento: '2011-07-15' }, deps),
    )
    await naEscolaA((p) =>
      criarAluno(
        p,
        { matricula: '2024003', nome: 'Carla Nunes', dataNascimento: '2011-09-02' },
        deps,
      ),
    )
  })

  it('acha por parte do nome ignorando a caixa', async () => {
    const pagina = await naEscolaA((p) => listarAlunos(p, { termo: 'bruno' }, deps))
    expect(pagina.itens.map((a) => a.nome)).toEqual(['Bruno Lima'])
  })

  it('acha por parte da matrícula', async () => {
    const pagina = await naEscolaA((p) => listarAlunos(p, { termo: '4003' }, deps))
    expect(pagina.itens.map((a) => a.nome)).toEqual(['Carla Nunes'])
  })

  it('lista em ordem de nome', async () => {
    // A operadora procura com o dedo na tela; ordem de inserção faria a
    // lista mudar de forma a cada cadastro.
    const pagina = await naEscolaA((p) => listarAlunos(p, {}, deps))
    expect(pagina.itens.map((a) => a.nome)).toEqual(['Ana Souza', 'Bruno Lima', 'Carla Nunes'])
  })

  it('filtra por turma', async () => {
    const pagina = await naEscolaA((p) => listarAlunos(p, { turmaId: turmaA }, deps))
    expect(pagina.itens.map((a) => a.nome)).toEqual(['Ana Souza'])
  })

  it('filtra os que estão SEM turma', async () => {
    // É a lista que a coordenação precisa no começo do ano: quem entrou
    // pela planilha e ainda não foi para uma turma.
    const pagina = await naEscolaA((p) => listarAlunos(p, { semTurma: true }, deps))
    expect(pagina.itens.map((a) => a.nome)).toEqual(['Bruno Lima', 'Carla Nunes'])
  })

  it('pagina, e o total é o total e não o tamanho da página', async () => {
    const pagina = await naEscolaA((p) => listarAlunos(p, { porPagina: 2, pagina: 2 }, deps))

    expect(pagina.total).toBe(3)
    expect(pagina.itens.map((a) => a.nome)).toEqual(['Carla Nunes'])
  })

  it('filtra por ativos', async () => {
    const bruno = await prisma.aluno.findFirstOrThrow({ where: { matricula: '2024002' } })
    await naEscolaA((p) => desativarAluno(p, { alunoId: bruno.id }, deps))

    const pagina = await naEscolaA((p) => listarAlunos(p, { apenasAtivos: true }, deps))

    expect(pagina.itens.map((a) => a.nome)).toEqual(['Ana Souza', 'Carla Nunes'])
  })
})

describe('edição de aluno contra banco', () => {
  it('editar o nome NÃO apaga a data de nascimento', async () => {
    // Zerar a credencial numa edição de nome trancaria o aluno fora do
    // portal, e nada na tela diria isso.
    const aluno = await naEscolaA((p) => criarAluno(p, ANA, deps))

    await naEscolaA((p) => editarAluno(p, aluno.id, { nome: 'Ana Souza Lima' }, deps))

    const gravado = await prisma.aluno.findUniqueOrThrow({ where: { id: aluno.id } })
    expect(gravado.nome).toBe('Ana Souza Lima')
    expect(gravado.dataNascimento.toISOString().slice(0, 10)).toBe('2012-03-15')
  })

  it('troca a turma do aluno', async () => {
    const aluno = await naEscolaA((p) => criarAluno(p, ANA, deps))

    const editado = await naEscolaA((p) => editarAluno(p, aluno.id, { turmaId: turmaA }, deps))

    expect(editado.turma).toEqual({ id: turmaA, nome: '5º A', serie: '5' })
  })

  it('tira o aluno da turma quando turmaId vem nulo', async () => {
    const aluno = await naEscolaA((p) => criarAluno(p, { ...ANA, turmaId: turmaA }, deps))

    const editado = await naEscolaA((p) => editarAluno(p, aluno.id, { turmaId: null }, deps))

    expect(editado.turma).toBeNull()
    const gravado = await prisma.aluno.findUniqueOrThrow({ where: { id: aluno.id } })
    expect(gravado.turmaId).toBeNull()
  })

  it('aluno da escola vizinha não é editável daqui', async () => {
    const daB = await executarComTenant(escolaB, () =>
      criarAluno(principalDe(escolaB), { ...ANA, nome: 'Aluno da B' }, deps),
    )

    await expect(
      naEscolaA((p) => editarAluno(p, daB.id, { nome: 'Invadido' }, deps)),
    ).rejects.toThrow(/não existe/i)

    const intacto = await prisma.aluno.findUniqueOrThrow({ where: { id: daB.id } })
    expect(intacto.nome).toBe('Aluno da B')
  })
})

describe('desativação de aluno contra banco', () => {
  it('conta os livros em aberto e AVISA antes de desativar', async () => {
    const aluno = await naEscolaA((p) => criarAluno(p, ANA, deps))
    await emprestar(escolaA, obraA, aluno.id)
    await emprestar(escolaA, obraA, aluno.id)

    const recusa = naEscolaA((p) => desativarAluno(p, { alunoId: aluno.id }, deps))

    await expect(recusa).rejects.toBeInstanceOf(AlunoComLivrosEmMaosError)
    await expect(recusa).rejects.toThrow('2')

    const intacto = await prisma.aluno.findUniqueOrThrow({ where: { id: aluno.id } })
    expect(intacto.ativo).toBe(true)
  })

  it('NÃO conta o que já foi devolvido', async () => {
    // "Em mãos" é `devolvidaEm IS NULL`. Contar o histórico faria o aviso
    // aparecer para todo aluno que já leu qualquer coisa na vida.
    const aluno = await naEscolaA((p) => criarAluno(p, ANA, deps))
    const emprestimo = await emprestar(escolaA, obraA, aluno.id)
    await prisma.emprestimo.update({
      where: { id: emprestimo.id },
      data: { devolvidaEm: new Date('2026-09-20T00:00:00.000Z'), operadorDevolucaoId: 'usr_1' },
    })

    const resultado = await naEscolaA((p) => desativarAluno(p, { alunoId: aluno.id }, deps))

    expect(resultado.livrosEmMaos).toBe(0)
    expect(resultado.aluno.ativo).toBe(false)
  })

  it('desativa com confirmação e PRESERVA o histórico de empréstimo', async () => {
    // Desativar é bloqueio, não exclusão. Um caminho de exclusão aqui
    // órfanaria o empréstimo e o relatório de engajamento passaria a
    // contar um ano letivo que não bate com nada.
    const aluno = await naEscolaA((p) => criarAluno(p, ANA, deps))
    await emprestar(escolaA, obraA, aluno.id)

    const resultado = await naEscolaA((p) =>
      desativarAluno(p, { alunoId: aluno.id, confirmado: true }, deps),
    )

    expect(resultado.aluno.ativo).toBe(false)
    expect(resultado.livrosEmMaos).toBe(1)
    // O aluno continua lá, e o empréstimo dele também.
    expect(await prisma.aluno.count({ where: { id: aluno.id } })).toBe(1)
    expect(await prisma.emprestimo.count({ where: { alunoId: aluno.id } })).toBe(1)
  })

  it('não conta empréstimo de aluno homônimo de outra escola', async () => {
    const aluno = await naEscolaA((p) => criarAluno(p, ANA, deps))
    const daB = await executarComTenant(escolaB, () =>
      criarAluno(principalDe(escolaB), { ...ANA, nome: 'Homônimo da B' }, deps),
    )
    const obraB = await prisma.obra.findFirstOrThrow({ where: { escolaId: escolaB } })
    await emprestar(escolaB, obraB.id, daB.id)

    const resultado = await naEscolaA((p) => desativarAluno(p, { alunoId: aluno.id }, deps))

    expect(resultado.livrosEmMaos).toBe(0)
  })
})
