import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { portalRepository } from '@/modules/portal/portal.repository'
import { dependenciasDoPortal } from '@/modules/portal/portal.deps'
import { verMinhaEstante } from '@/modules/portal/minha-estante.service'
import { renovarMeuLivro } from '@/modules/portal/minha-renovacao.service'
import { LivroNaoEstaComVoceError } from '@/modules/portal/portal.tipos'
import { DadoDeOutroLeitorError } from '@/modules/portal/autorizacao-do-aluno'
import type { PrincipalAluno } from '@/core/auth/principal'

/** 10/09/2026, 15h em São Paulo. */
const AGORA = new Date('2026-09-10T18:00:00.000Z')

let contadorDeTombos = 0

interface EscolaMontada {
  escolaId: string
  anaId: string
  brunoId: string
  usuarioId: string
}

async function montarEscola(slug: string): Promise<EscolaMontada> {
  const escola = await prisma.escola.create({ data: { slug, nome: slug } })
  const anoLetivo = await prisma.anoLetivo.create({
    data: {
      escolaId: escola.id,
      ano: 2026,
      dataInicio: new Date('2026-02-01'),
      dataFim: new Date('2026-12-15'),
      ativo: true,
    },
  })
  const turma = await prisma.turma.create({
    data: {
      escolaId: escola.id,
      anoLetivoId: anoLetivo.id,
      nome: '8º A',
      serie: '8',
      turno: 'MANHA',
    },
  })
  const ana = await prisma.aluno.create({
    data: {
      escolaId: escola.id,
      matricula: '2024001',
      nome: 'Ana Souza',
      dataNascimento: new Date('2012-03-15'),
      turmaId: turma.id,
    },
  })
  const bruno = await prisma.aluno.create({
    data: {
      escolaId: escola.id,
      matricula: '2024002',
      nome: 'Bruno Lima',
      dataNascimento: new Date('2012-07-02'),
      turmaId: turma.id,
    },
  })
  const usuario = await prisma.usuario.create({
    data: {
      escolaId: escola.id,
      nome: 'Coordenação',
      email: `coord@${slug}.br`,
      senhaHash: 'x',
    },
  })

  return { escolaId: escola.id, anaId: ana.id, brunoId: bruno.id, usuarioId: usuario.id }
}

async function criarObra(
  escolaId: string,
  titulo: string,
  autor: string | null,
): Promise<string> {
  const obra = await prisma.obra.create({
    data: { escolaId, titulo, tituloNormalizado: titulo.toLowerCase() },
  })

  if (autor !== null) {
    const criado = await prisma.autor.create({
      data: { escolaId, nome: autor, nomeNormalizado: autor.toLowerCase() },
    })
    await prisma.obraAutor.create({
      data: { obraId: obra.id, autorId: criado.id, ordem: 0 },
    })
  }

  return obra.id
}

async function emprestar(dados: {
  escolaId: string
  obraId: string
  alunoId?: string
  usuarioId?: string
  previstaPara: string
  devolvidaEm?: string
  renovacoes?: number
}): Promise<string> {
  contadorDeTombos += 1
  const exemplar = await prisma.exemplar.create({
    data: {
      escolaId: dados.escolaId,
      obraId: dados.obraId,
      tombo: String(contadorDeTombos).padStart(6, '0'),
      situacao: 'EMPRESTADO',
    },
  })

  const criado = await prisma.emprestimo.create({
    data: {
      escolaId: dados.escolaId,
      exemplarId: exemplar.id,
      alunoId: dados.alunoId === undefined ? null : dados.alunoId,
      usuarioId: dados.usuarioId === undefined ? null : dados.usuarioId,
      previstaPara: new Date(`${dados.previstaPara}T00:00:00.000Z`),
      devolvidaEm:
        dados.devolvidaEm === undefined ? null : new Date(`${dados.devolvidaEm}T12:00:00.000Z`),
      renovacoes: dados.renovacoes === undefined ? 0 : dados.renovacoes,
      operadorRetiradaId: 'usr_1',
    },
  })

  return criado.id
}

async function reservarPronta(dados: {
  escolaId: string
  obraId: string
  alunoId: string
  retirarAte: string
}): Promise<string> {
  contadorDeTombos += 1
  const exemplar = await prisma.exemplar.create({
    data: {
      escolaId: dados.escolaId,
      obraId: dados.obraId,
      tombo: String(contadorDeTombos).padStart(6, '0'),
      situacao: 'RESERVADO',
    },
  })

  const criada = await prisma.reserva.create({
    data: {
      escolaId: dados.escolaId,
      obraId: dados.obraId,
      alunoId: dados.alunoId,
      posicao: 1,
      status: 'DISPONIVEL',
      exemplarSeparadoId: exemplar.id,
      retirarAte: new Date(`${dados.retirarAte}T00:00:00.000Z`),
    },
  })

  return criada.id
}

let a: EscolaMontada
let b: EscolaMontada
let obraDaAna = ''
let obraDoBruno = ''
let emprestimoDaAna = ''
let emprestimoDoBruno = ''

function comoAna(escola: EscolaMontada): PrincipalAluno {
  return {
    reino: 'ALUNO',
    id: escola.anaId,
    escolaId: escola.escolaId,
    nome: 'Ana Souza',
    matricula: '2024001',
  }
}

function naEscola<T>(escola: EscolaMontada, fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escola.escolaId, fn)
}

beforeEach(async () => {
  contadorDeTombos = 0
  a = await montarEscola('escola-a')
  b = await montarEscola('escola-b')

  obraDaAna = await criarObra(a.escolaId, 'Vidas Secas', 'Graciliano Ramos')
  obraDoBruno = await criarObra(a.escolaId, 'O Cortiço', 'Aluísio Azevedo')

  emprestimoDaAna = await emprestar({
    escolaId: a.escolaId,
    obraId: obraDaAna,
    alunoId: a.anaId,
    previstaPara: '2026-09-24',
  })
  emprestimoDoBruno = await emprestar({
    escolaId: a.escolaId,
    obraId: obraDoBruno,
    alunoId: a.brunoId,
    previstaPara: '2026-09-18',
  })
})

describe('o repositório do portal filtra por aluno na LEITURA', () => {
  it('devolve só os livros do aluno pedido', async () => {
    const livros = await naEscola(a, () => portalRepository.meusLivrosEmMaos(a.anaId))

    expect(livros).toHaveLength(1)
    expect(livros[0]!.titulo).toBe('Vidas Secas')
    expect(livros[0]!.autor).toBe('Graciliano Ramos')
    expect(livros[0]!.alunoId).toBe(a.anaId)
  })

  it('não devolve livro já devolvido — em mãos é devolvidaEm IS NULL', async () => {
    await emprestar({
      escolaId: a.escolaId,
      obraId: obraDaAna,
      alunoId: a.anaId,
      previstaPara: '2026-08-01',
      devolvidaEm: '2026-08-10',
    })

    const livros = await naEscola(a, () => portalRepository.meusLivrosEmMaos(a.anaId))
    expect(livros).toHaveLength(1)
  })

  it('não devolve o empréstimo da EQUIPE', async () => {
    await emprestar({
      escolaId: a.escolaId,
      obraId: obraDaAna,
      usuarioId: a.usuarioId,
      previstaPara: '2026-09-30',
    })

    const livros = await naEscola(a, () => portalRepository.meusLivrosEmMaos(a.anaId))
    expect(livros.map((l) => l.alunoId)).toEqual([a.anaId])
  })

  it('obra sem autor devolve autor null, não string vazia', async () => {
    const semAutor = await criarObra(a.escolaId, 'Cartilha da Escola', null)
    await emprestar({
      escolaId: a.escolaId,
      obraId: semAutor,
      alunoId: a.brunoId,
      previstaPara: '2026-09-30',
    })

    const livros = await naEscola(a, () => portalRepository.meusLivrosEmMaos(a.brunoId))
    const cartilha = livros.find((l) => l.titulo === 'Cartilha da Escola')
    expect(cartilha?.autor).toBeNull()
  })

  it('o empréstimo do colega NÃO é alcançável nem com o id na mão', async () => {
    // É o caminho do formulário: o id chega de fora. Sem o `alunoId` no
    // WHERE, este método devolveria o empréstimo do Bruno para a Ana.
    const alcancado = await naEscola(a, () =>
      portalRepository.meuEmprestimo(a.anaId, emprestimoDoBruno),
    )

    expect(alcancado).toBeNull()
  })

  it('o próprio empréstimo é alcançável', async () => {
    const meu = await naEscola(a, () => portalRepository.meuEmprestimo(a.anaId, emprestimoDaAna))

    expect(meu?.emprestimoId).toBe(emprestimoDaAna)
    expect(meu?.alunoId).toBe(a.anaId)
    expect(meu?.devolvidaEm).toBeNull()
  })

  it('devolve só a reserva pronta do aluno pedido', async () => {
    const obra = await criarObra(a.escolaId, 'O Ateneu', 'Raul Pompeia')
    await reservarPronta({
      escolaId: a.escolaId,
      obraId: obra,
      alunoId: a.brunoId,
      retirarAte: '2026-09-13',
    })

    expect(await naEscola(a, () => portalRepository.minhaReservaPronta(a.anaId))).toBeNull()

    const doBruno = await naEscola(a, () => portalRepository.minhaReservaPronta(a.brunoId))
    expect(doBruno?.titulo).toBe('O Ateneu')
    expect(doBruno?.alunoId).toBe(a.brunoId)
  })

  it('reserva que só ESPERA na fila não é reserva pronta', async () => {
    // AGUARDANDO não tem exemplar separado: anunciar "sua reserva chegou"
    // mandaria o aluno ao balcão buscar um livro que não está lá.
    const obra = await criarObra(a.escolaId, 'Dom Casmurro', 'Machado de Assis')
    await prisma.reserva.create({
      data: {
        escolaId: a.escolaId,
        obraId: obra,
        alunoId: a.anaId,
        posicao: 1,
        status: 'AGUARDANDO',
      },
    })

    expect(await naEscola(a, () => portalRepository.minhaReservaPronta(a.anaId))).toBeNull()
  })
})

describe('o repositório do portal filtra por aluno na ESCRITA', () => {
  it('não renova o empréstimo do colega, nem com o id na mão', async () => {
    // O teste que importa mais. Escopar só a leitura impediria VER o
    // empréstimo do Bruno e ainda assim permitiria MUDAR o prazo dele.
    const linhas = await naEscola(a, () =>
      portalRepository.registrarMinhaRenovacao(
        a.anaId,
        emprestimoDoBruno,
        new Date('2026-10-30T00:00:00.000Z'),
      ),
    )

    expect(linhas).toBe(0)

    const doBruno = await prisma.emprestimo.findUniqueOrThrow({
      where: { id: emprestimoDoBruno },
    })
    expect(doBruno.previstaPara).toEqual(new Date('2026-09-18T00:00:00.000Z'))
    expect(doBruno.renovacoes).toBe(0)
  })

  it('renova o próprio, incrementando a contagem', async () => {
    const linhas = await naEscola(a, () =>
      portalRepository.registrarMinhaRenovacao(
        a.anaId,
        emprestimoDaAna,
        new Date('2026-10-08T00:00:00.000Z'),
      ),
    )

    expect(linhas).toBe(1)
    const meu = await prisma.emprestimo.findUniqueOrThrow({ where: { id: emprestimoDaAna } })
    expect(meu.previstaPara).toEqual(new Date('2026-10-08T00:00:00.000Z'))
    expect(meu.renovacoes).toBe(1)
  })

  it('não ressuscita empréstimo já devolvido', async () => {
    const devolvido = await emprestar({
      escolaId: a.escolaId,
      obraId: obraDaAna,
      alunoId: a.anaId,
      previstaPara: '2026-08-01',
      devolvidaEm: '2026-08-10',
    })

    const linhas = await naEscola(a, () =>
      portalRepository.registrarMinhaRenovacao(
        a.anaId,
        devolvido,
        new Date('2026-10-08T00:00:00.000Z'),
      ),
    )

    expect(linhas).toBe(0)
  })
})

describe('nada do portal atravessa a fronteira da escola', () => {
  it('o mesmo aluno de outra escola não é alcançável', async () => {
    await emprestar({
      escolaId: b.escolaId,
      obraId: await criarObra(b.escolaId, 'Iracema', 'José de Alencar'),
      alunoId: b.anaId,
      previstaPara: '2026-09-24',
    })

    // Dentro do tenant A, pedindo pelo id da Ana da escola B.
    const livros = await naEscola(a, () => portalRepository.meusLivrosEmMaos(b.anaId))
    expect(livros).toEqual([])
  })

  it('renovação com id de empréstimo de outra escola não muda nada', async () => {
    const daOutraEscola = await emprestar({
      escolaId: b.escolaId,
      obraId: await criarObra(b.escolaId, 'Iracema', 'José de Alencar'),
      alunoId: b.anaId,
      previstaPara: '2026-09-24',
    })

    const linhas = await naEscola(a, () =>
      portalRepository.registrarMinhaRenovacao(
        a.anaId,
        daOutraEscola,
        new Date('2026-10-30T00:00:00.000Z'),
      ),
    )

    expect(linhas).toBe(0)
    const intacto = await prisma.emprestimo.findUniqueOrThrow({ where: { id: daOutraEscola } })
    expect(intacto.previstaPara).toEqual(new Date('2026-09-24T00:00:00.000Z'))
  })
})

describe('o serviço contra o banco de verdade', () => {
  it('a estante da Ana tem só o livro da Ana', async () => {
    const estante = await naEscola(a, () =>
      verMinhaEstante(comoAna(a), { agora: AGORA }, dependenciasDoPortal()),
    )

    expect(estante.livros.map((l) => l.titulo)).toEqual(['Vidas Secas'])
    expect(estante.limiteDaMinhaSerie).toBe(2)
    expect(estante.quantosAindaPodeLevar).toBe(1)
  })

  it('usa a configuração da SÉRIE quando existe override', async () => {
    await prisma.configuracaoPorSerie.create({
      data: { escolaId: a.escolaId, serie: '8', limiteSimultaneo: 5, prazoEmDias: 21 },
    })

    const estante = await naEscola(a, () =>
      verMinhaEstante(comoAna(a), { agora: AGORA }, dependenciasDoPortal()),
    )

    expect(estante.limiteDaMinhaSerie).toBe(5)
    expect(estante.quantosAindaPodeLevar).toBe(4)
  })

  it('a fila da obra bloqueia a renovação na estante e no servidor', async () => {
    await prisma.reserva.create({
      data: {
        escolaId: a.escolaId,
        obraId: obraDaAna,
        alunoId: a.brunoId,
        posicao: 1,
        status: 'AGUARDANDO',
      },
    })

    const estante = await naEscola(a, () =>
      verMinhaEstante(comoAna(a), { agora: AGORA }, dependenciasDoPortal()),
    )
    expect(estante.livros[0]!.renovacao.pode).toBe(false)

    await expect(
      naEscola(a, () =>
        renovarMeuLivro(
          comoAna(a),
          { emprestimoId: emprestimoDaAna, agora: AGORA },
          dependenciasDoPortal(),
        ),
      ),
    ).rejects.toThrow(/esperando por este livro/)
  })

  it('a suspensão do próprio aluno aparece e zera o quanto pode levar', async () => {
    await prisma.penalidade.create({
      data: {
        escolaId: a.escolaId,
        alunoId: a.anaId,
        inicio: new Date('2026-09-05T00:00:00.000Z'),
        fim: new Date('2026-09-20T00:00:00.000Z'),
        motivo: 'Devolução com atraso.',
      },
    })

    const estante = await naEscola(a, () =>
      verMinhaEstante(comoAna(a), { agora: AGORA }, dependenciasDoPortal()),
    )

    expect(estante.suspensoAte).toEqual(new Date('2026-09-20T00:00:00.000Z'))
    expect(estante.quantosAindaPodeLevar).toBe(0)
  })

  it('renova de ponta a ponta e o prazo novo fica gravado', async () => {
    const renovado = await naEscola(a, () =>
      renovarMeuLivro(
        comoAna(a),
        { emprestimoId: emprestimoDaAna, agora: AGORA },
        dependenciasDoPortal(),
      ),
    )

    // Padrão da escola sem configuração: 14 dias. Vencia 24/09 (quinta),
    // +14 cai em 08/10, quinta-feira.
    expect(renovado.previstaPara).toEqual(new Date('2026-10-08T00:00:00.000Z'))

    const gravado = await prisma.emprestimo.findUniqueOrThrow({ where: { id: emprestimoDaAna } })
    expect(gravado.previstaPara).toEqual(new Date('2026-10-08T00:00:00.000Z'))
    expect(gravado.renovacoes).toBe(1)
  })

  it('A ANA NÃO RENOVA O LIVRO DO BRUNO, mesmo mandando o id dele', async () => {
    // O entregável desta faixa, provado contra o banco. O id do
    // empréstimo do Bruno é o que um aluno curioso poria no formulário.
    await expect(
      naEscola(a, () =>
        renovarMeuLivro(
          comoAna(a),
          { emprestimoId: emprestimoDoBruno, agora: AGORA },
          dependenciasDoPortal(),
        ),
      ),
    ).rejects.toThrow(LivroNaoEstaComVoceError)

    const doBruno = await prisma.emprestimo.findUniqueOrThrow({
      where: { id: emprestimoDoBruno },
    })
    expect(doBruno.previstaPara).toEqual(new Date('2026-09-18T00:00:00.000Z'))
    expect(doBruno.renovacoes).toBe(0)
  })

  it('sessão de aluno de OUTRA escola não vê nada nesta', async () => {
    // Sessão da Ana da escola B, contexto de tenant da escola A: é o que
    // aconteceria se alguém carimbasse o escolaId errado. O cadastro não
    // existe neste tenant, e o serviço manda entrar de novo em vez de
    // desenhar tela vazia.
    await expect(
      naEscola(a, () => verMinhaEstante(comoAna(b), { agora: AGORA }, dependenciasDoPortal())),
    ).rejects.toThrow()
  })

  it('a segunda barreira pega o repositório que esquece o filtro', async () => {
    // Simula o método que nasce sem o `alunoId` no WHERE: o repositório
    // real, com um `meusLivrosEmMaos` que devolve TODOS os empréstimos da
    // escola. O serviço tem de recusar sozinho.
    const vazando = {
      ...portalRepository,
      async meusLivrosEmMaos() {
        return naEscola(a, () => portalRepository.meusLivrosEmMaos(a.brunoId))
      },
    }

    const deps = dependenciasDoPortal()
    await expect(
      naEscola(a, () =>
        verMinhaEstante(comoAna(a), { agora: AGORA }, { ...deps, portal: vazando }),
      ),
    ).rejects.toThrow(DadoDeOutroLeitorError)
  })
})
