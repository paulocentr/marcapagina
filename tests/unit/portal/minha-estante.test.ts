import { describe, it, expect } from 'vitest'
import { verMinhaEstante } from '@/modules/portal/minha-estante.service'
import {
  DadoDeOutroLeitorError,
  SessaoNaoEhDeAlunoError,
} from '@/modules/portal/autorizacao-do-aluno'
import { NaoAutenticadoError } from '@/core/errors'
import {
  AGORA,
  ANA,
  BRUNO_ID,
  COORD,
  livroDoBanco,
  montarFake,
  reservaDoBanco,
} from './apoio'

describe('verMinhaEstante — o que o aluno vê de si', () => {
  it('lista os livros em mãos com prazo e autor', async () => {
    const { deps } = montarFake({ livros: [livroDoBanco()] })

    const estante = await verMinhaEstante(ANA, { agora: AGORA }, deps)

    expect(estante.livros).toHaveLength(1)
    expect(estante.livros[0]!.titulo).toBe('Vidas Secas')
    expect(estante.livros[0]!.autor).toBe('Graciliano Ramos')
    expect(estante.livros[0]!.previstaPara).toEqual(new Date('2026-09-24T00:00:00.000Z'))
  })

  it('diz o limite da série e quantos ainda cabem', async () => {
    const { deps } = montarFake({ livros: [livroDoBanco()] })

    const estante = await verMinhaEstante(ANA, { agora: AGORA }, deps)

    expect(estante.limiteDaMinhaSerie).toBe(3)
    expect(estante.quantosAindaPodeLevar).toBe(2)
  })

  it('a fila de cada obra vem da MESMA contagem que o balcão usa', async () => {
    const { deps } = montarFake({
      livros: [livroDoBanco()],
      filaPorObra: { obra_1: 2 },
    })

    const estante = await verMinhaEstante(ANA, { agora: AGORA }, deps)
    const renovacao = estante.livros[0]!.renovacao

    expect(renovacao.pode).toBe(false)
    if (renovacao.pode) return
    expect(renovacao.motivo).toBe('OBRA_COM_FILA')
  })

  it('a reserva pronta sai com o prazo de retirada', async () => {
    const { deps } = montarFake({ reservaPronta: reservaDoBanco() })

    const estante = await verMinhaEstante(ANA, { agora: AGORA }, deps)

    expect(estante.reservaPronta).toEqual({
      titulo: 'O Ateneu',
      retirarAte: new Date('2026-09-13T00:00:00.000Z'),
    })
  })

  it('sem reserva pronta, null — e não um objeto vazio', async () => {
    const { deps } = montarFake()
    const estante = await verMinhaEstante(ANA, { agora: AGORA }, deps)
    expect(estante.reservaPronta).toBeNull()
  })
})

describe('o portal não alcança dado de outro aluno', () => {
  it('só consulta pelo id da SESSÃO — nunca por um id recebido de fora', async () => {
    // A garantia estrutural: não existe parâmetro de alunoId na função.
    // Este teste anota todo alunoId que o serviço passou ao repositório e
    // exige que todos sejam o da sessão. Se um dia alguém acrescentar um
    // parâmetro "de quem", este teste é o que reprova.
    const { deps, espiao } = montarFake({
      livros: [livroDoBanco()],
      reservaPronta: reservaDoBanco(),
    })

    await verMinhaEstante(ANA, { agora: AGORA }, deps)

    expect(espiao.lidos.length).toBeGreaterThan(0)
    expect(espiao.lidos.every((id) => id === ANA.id)).toBe(true)
    expect(espiao.lidos).not.toContain(BRUNO_ID)
  })

  it('RECUSA quando o repositório devolve empréstimo de outro aluno', async () => {
    // O fake ignora o filtro de propósito: é o repositório que um dia
    // esqueça o `alunoId` no WHERE, ou o método novo que nasça sem ele.
    // O serviço não pode confiar nele — se confiasse, a tela do aluno
    // desenharia o livro do colega e ninguém veria.
    const { deps } = montarFake({ livros: [livroDoBanco({ alunoId: BRUNO_ID })] })

    await expect(verMinhaEstante(ANA, { agora: AGORA }, deps)).rejects.toThrow(
      DadoDeOutroLeitorError,
    )
  })

  it('RECUSA quando um dos empréstimos da lista é de outro aluno', async () => {
    const { deps } = montarFake({
      livros: [livroDoBanco(), livroDoBanco({ emprestimoId: 'emp_2', alunoId: BRUNO_ID })],
    })

    await expect(verMinhaEstante(ANA, { agora: AGORA }, deps)).rejects.toThrow(
      DadoDeOutroLeitorError,
    )
  })

  it('RECUSA quando o repositório devolve reserva de outro aluno', async () => {
    const { deps } = montarFake({ reservaPronta: reservaDoBanco({ alunoId: BRUNO_ID }) })

    await expect(verMinhaEstante(ANA, { agora: AGORA }, deps)).rejects.toThrow(
      DadoDeOutroLeitorError,
    )
  })

  it('RECUSA quando o cadastro devolvido é de outro aluno', async () => {
    const { deps } = montarFake({
      leitor: { id: BRUNO_ID, nome: 'Bruno', ativo: true, serie: '8', suspensaoAte: null },
    })

    await expect(verMinhaEstante(ANA, { agora: AGORA }, deps)).rejects.toThrow(
      DadoDeOutroLeitorError,
    )
  })

  it('RECUSA o empréstimo da EQUIPE, que não tem aluno', async () => {
    const { deps } = montarFake({ livros: [livroDoBanco({ alunoId: null })] })

    await expect(verMinhaEstante(ANA, { agora: AGORA }, deps)).rejects.toThrow(
      DadoDeOutroLeitorError,
    )
  })

  it('a recusa não conta de quem era o dado', async () => {
    const { deps } = montarFake({ livros: [livroDoBanco({ alunoId: BRUNO_ID })] })

    await expect(verMinhaEstante(ANA, { agora: AGORA }, deps)).rejects.toThrow(/^Este dado não é seu\.$/)
  })
})

describe('quem entra no portal', () => {
  it('sessão de equipe não abre o portal, nem com todas as permissões', async () => {
    const { deps } = montarFake({ livros: [livroDoBanco()] })

    await expect(verMinhaEstante(COORD, { agora: AGORA }, deps)).rejects.toThrow(
      SessaoNaoEhDeAlunoError,
    )
  })

  it('sem sessão, pede login', async () => {
    const { deps } = montarFake()

    await expect(verMinhaEstante(null, { agora: AGORA }, deps)).rejects.toThrow(
      NaoAutenticadoError,
    )
  })

  it('sessão apontando para cadastro que não existe nesta escola pede login de novo', async () => {
    // O repositório é escopado por tenant: cadastro nulo significa que a
    // sessão fala de um aluno que não é desta escola. Desenhar a tela
    // vazia seria dizer "você não tem livro nenhum" a quem talvez tenha.
    const { deps } = montarFake({ leitor: null })

    await expect(verMinhaEstante(ANA, { agora: AGORA }, deps)).rejects.toThrow(
      NaoAutenticadoError,
    )
  })
})

describe('o dia da escola manda no atraso', () => {
  it('às 23h de São Paulo, livro que vence hoje não aparece atrasado', async () => {
    const { deps } = montarFake({
      livros: [livroDoBanco({ previstaPara: new Date('2026-09-10T00:00:00.000Z') })],
    })

    // Já é 11/09 em UTC. Com `new Date()` cru, o portal acusaria atraso.
    const estante = await verMinhaEstante(
      ANA,
      { agora: new Date('2026-09-11T02:00:00.000Z') },
      deps,
    )

    expect(estante.livros[0]!.atrasado).toBe(false)
  })

  it('atrasado diz há quantos dias', async () => {
    const { deps } = montarFake({
      livros: [livroDoBanco({ previstaPara: new Date('2026-09-02T00:00:00.000Z') })],
    })

    const estante = await verMinhaEstante(ANA, { agora: AGORA }, deps)

    expect(estante.livros[0]!.atrasado).toBe(true)
    expect(estante.livros[0]!.diasDeAtraso).toBe(8)
    expect(estante.quantosAindaPodeLevar).toBe(0)
  })
})
