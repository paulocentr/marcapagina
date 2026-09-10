import { describe, it, expect } from 'vitest'
import { avaliarRenovacao, resumirEstante } from '@/modules/portal/estante'
import type { MeuLivroComFila } from '@/modules/portal/portal.tipos'
import type { ConfiguracaoDaEscola } from '@/modules/circulacao/configuracao'

const CONFIG: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 1,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

const HOJE = new Date('2026-09-10T03:00:00.000Z')

const LEITOR_EM_DIA = { ativo: true, suspensaoAte: null }

function livro(sobrepor: Partial<MeuLivroComFila> = {}): MeuLivroComFila {
  return {
    emprestimoId: 'emp_1',
    alunoId: 'aluno_ana',
    obraId: 'obra_1',
    titulo: 'Vidas Secas',
    autor: 'Graciliano Ramos',
    // @db.Date: meia-noite UTC.
    previstaPara: new Date('2026-09-19T00:00:00.000Z'),
    renovacoes: 0,
    naFila: 0,
    ...sobrepor,
  }
}

describe('atraso é derivado da data, nunca de um campo', () => {
  it('livro que vence depois de hoje está em dia', () => {
    const estante = resumirEstante({
      livros: [livro()],
      leitor: LEITOR_EM_DIA,
      reservaPronta: null,
      config: CONFIG,
      hoje: HOJE,
    })

    expect(estante.livros[0]!.atrasado).toBe(false)
    expect(estante.livros[0]!.diasDeAtraso).toBe(0)
  })

  it('livro vencido diz há quantos dias', () => {
    const estante = resumirEstante({
      livros: [livro({ previstaPara: new Date('2026-09-02T00:00:00.000Z') })],
      leitor: LEITOR_EM_DIA,
      reservaPronta: null,
      config: CONFIG,
      hoje: HOJE,
    })

    expect(estante.livros[0]!.atrasado).toBe(true)
    expect(estante.livros[0]!.diasDeAtraso).toBe(8)
  })

  it('livro que vence HOJE não está atrasado', () => {
    // A fronteira: devolver no dia previsto cumpre o prazo. Errar aqui
    // acusa de atraso quem entregou em dia — e o aluno perde a confiança
    // na tela inteira.
    const estante = resumirEstante({
      livros: [livro({ previstaPara: new Date('2026-09-10T00:00:00.000Z') })],
      leitor: LEITOR_EM_DIA,
      reservaPronta: null,
      config: CONFIG,
      hoje: HOJE,
    })

    expect(estante.livros[0]!.atrasado).toBe(false)
  })
})

describe('quantos ainda posso levar', () => {
  it('mostra o limite da série e o que ainda cabe', () => {
    const estante = resumirEstante({
      livros: [livro(), livro({ emprestimoId: 'emp_2', obraId: 'obra_2' })],
      leitor: LEITOR_EM_DIA,
      reservaPronta: null,
      config: CONFIG,
      hoje: HOJE,
    })

    expect(estante.limiteDaMinhaSerie).toBe(3)
    expect(estante.quantosAindaPodeLevar).toBe(1)
    expect(estante.porqueNaoPodeLevar).toBeNull()
  })

  it('no limite, zero — e diz por quê', () => {
    const estante = resumirEstante({
      livros: [
        livro(),
        livro({ emprestimoId: 'emp_2', obraId: 'obra_2' }),
        livro({ emprestimoId: 'emp_3', obraId: 'obra_3' }),
      ],
      leitor: LEITOR_EM_DIA,
      reservaPronta: null,
      config: CONFIG,
      hoje: HOJE,
    })

    expect(estante.quantosAindaPodeLevar).toBe(0)
    expect(estante.porqueNaoPodeLevar).toContain('limite')
  })

  it('com livro atrasado, zero — mesmo abaixo do limite', () => {
    // O balcão recusa por COM_ATRASO (bloqueios.ts). Dizer "ainda pode
    // levar 2" no celular e o aluno ouvir "não pode" no balcão é a tela
    // mentindo — e ela não tem como se desculpar depois.
    const estante = resumirEstante({
      livros: [livro({ previstaPara: new Date('2026-09-02T00:00:00.000Z') })],
      leitor: LEITOR_EM_DIA,
      reservaPronta: null,
      config: CONFIG,
      hoje: HOJE,
    })

    expect(estante.quantosAindaPodeLevar).toBe(0)
    expect(estante.porqueNaoPodeLevar).toContain('atraso')
  })

  it('suspenso, zero — e a data em que a suspensão termina é dado do próprio aluno', () => {
    const estante = resumirEstante({
      livros: [],
      leitor: { ativo: true, suspensaoAte: new Date('2026-09-20T00:00:00.000Z') },
      reservaPronta: null,
      config: CONFIG,
      hoje: HOJE,
    })

    expect(estante.quantosAindaPodeLevar).toBe(0)
    expect(estante.suspensoAte).toEqual(new Date('2026-09-20T00:00:00.000Z'))
    expect(estante.porqueNaoPodeLevar).toContain('20/09/2026')
  })

  it('a suspensão vale o dia inteiro em que termina', () => {
    const estante = resumirEstante({
      livros: [],
      leitor: { ativo: true, suspensaoAte: new Date('2026-09-10T00:00:00.000Z') },
      reservaPronta: null,
      config: CONFIG,
      hoje: HOJE,
    })

    expect(estante.quantosAindaPodeLevar).toBe(0)
  })

  it('suspensão terminada não bloqueia mais', () => {
    const estante = resumirEstante({
      livros: [],
      leitor: { ativo: true, suspensaoAte: new Date('2026-09-09T00:00:00.000Z') },
      reservaPronta: null,
      config: CONFIG,
      hoje: HOJE,
    })

    expect(estante.quantosAindaPodeLevar).toBe(3)
    expect(estante.suspensoAte).toBeNull()
  })

  it('nunca devolve número negativo', () => {
    // Empréstimo forçado no balcão passa do limite de propósito. A tela
    // não pode responder "-1".
    const estante = resumirEstante({
      livros: [
        livro(),
        livro({ emprestimoId: 'emp_2', obraId: 'obra_2' }),
        livro({ emprestimoId: 'emp_3', obraId: 'obra_3' }),
        livro({ emprestimoId: 'emp_4', obraId: 'obra_4' }),
      ],
      leitor: LEITOR_EM_DIA,
      reservaPronta: null,
      config: CONFIG,
      hoje: HOJE,
    })

    expect(estante.quantosAindaPodeLevar).toBe(0)
  })
})

describe('a reserva pronta atravessa com o prazo de retirada', () => {
  it('passa título e prazo adiante', () => {
    const estante = resumirEstante({
      livros: [],
      leitor: LEITOR_EM_DIA,
      reservaPronta: { titulo: 'O Ateneu', retirarAte: new Date('2026-09-13T00:00:00.000Z') },
      config: CONFIG,
      hoje: HOJE,
    })

    expect(estante.reservaPronta).toEqual({
      titulo: 'O Ateneu',
      retirarAte: new Date('2026-09-13T00:00:00.000Z'),
    })
  })
})

describe('avaliarRenovacao', () => {
  it('deixa renovar o livro em dia, e diz por quantos dias', () => {
    expect(avaliarRenovacao(livro(), LEITOR_EM_DIA, CONFIG, HOJE)).toEqual({
      pode: true,
      porDias: 14,
    })
  })

  it('recusa quando já bateu o máximo de renovações da série', () => {
    const possibilidade = avaliarRenovacao(livro({ renovacoes: 1 }), LEITOR_EM_DIA, CONFIG, HOJE)

    expect(possibilidade.pode).toBe(false)
    if (possibilidade.pode) return
    expect(possibilidade.motivo).toBe('MAXIMO_DE_RENOVACOES')
  })

  it('recusa quando a série não permite renovação nenhuma', () => {
    const possibilidade = avaliarRenovacao(
      livro(),
      LEITOR_EM_DIA,
      { ...CONFIG, maximoDeRenovacoes: 0 },
      HOJE,
    )

    expect(possibilidade.pode).toBe(false)
    if (possibilidade.pode) return
    expect(possibilidade.motivo).toBe('MAXIMO_DE_RENOVACOES')
    // Máximo zero é decisão da coordenação, não engano do aluno: a frase
    // não pode acusá-lo de já ter renovado.
    expect(possibilidade.explicacao).not.toContain('já renovou')
  })

  it('recusa quando alguém espera na fila', () => {
    const possibilidade = avaliarRenovacao(livro({ naFila: 2 }), LEITOR_EM_DIA, CONFIG, HOJE)

    expect(possibilidade.pode).toBe(false)
    if (possibilidade.pode) return
    expect(possibilidade.motivo).toBe('OBRA_COM_FILA')
    expect(possibilidade.explicacao).toContain('2')
  })

  it('recusa renovar livro ATRASADO', () => {
    // Narrowing deliberado sobre a regra do balcão: renovar move
    // `previstaPara` para frente, e a penalidade é derivada de
    // `previstaPara` na devolução. Auto-atendimento renovando livro
    // atrasado seria o aluno apagando a própria suspensão com um toque.
    const possibilidade = avaliarRenovacao(
      livro({ previstaPara: new Date('2026-09-02T00:00:00.000Z') }),
      LEITOR_EM_DIA,
      CONFIG,
      HOJE,
    )

    expect(possibilidade.pode).toBe(false)
    if (possibilidade.pode) return
    expect(possibilidade.motivo).toBe('LIVRO_ATRASADO')
  })

  it('recusa quando o leitor está suspenso', () => {
    const possibilidade = avaliarRenovacao(
      livro(),
      { ativo: true, suspensaoAte: new Date('2026-09-20T00:00:00.000Z') },
      CONFIG,
      HOJE,
    )

    expect(possibilidade.pode).toBe(false)
    if (possibilidade.pode) return
    expect(possibilidade.motivo).toBe('LEITOR_SUSPENSO')
  })

  it('recusa quando o cadastro está inativo', () => {
    const possibilidade = avaliarRenovacao(livro(), { ativo: false, suspensaoAte: null }, CONFIG, HOJE)

    expect(possibilidade.pode).toBe(false)
    if (possibilidade.pode) return
    expect(possibilidade.motivo).toBe('CADASTRO_INATIVO')
  })

  it('a estante usa a MESMA avaliação que o botão', () => {
    // A garantia importa: se a tela decidisse por conta própria, o botão
    // apareceria para uma renovação que o serviço recusa — e o aluno
    // levaria a culpa por um botão que não devia estar ali.
    const emFila = livro({ naFila: 1 })
    const estante = resumirEstante({
      livros: [emFila],
      leitor: LEITOR_EM_DIA,
      reservaPronta: null,
      config: CONFIG,
      hoje: HOJE,
    })

    expect(estante.livros[0]!.renovacao).toEqual(
      avaliarRenovacao(emFila, LEITOR_EM_DIA, CONFIG, HOJE),
    )
  })
})
