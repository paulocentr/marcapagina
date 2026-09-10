import { describe, it, expect } from 'vitest'
import {
  agruparFilasPorObra,
  listarFilasDeReserva,
  type ReservaVivaBruta,
  type RepositorioDaFilaDeReservas,
} from '@/modules/circulacao/fila-de-reservas.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'

const BALCAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['reserva:criar', 'reserva:gerenciar'],
}

const SO_INFORMA: Principal = { ...BALCAO, permissoes: ['reserva:criar'] }
const SEM_NADA: Principal = { ...BALCAO, permissoes: [] }

function dia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function aguardando(parcial: Partial<ReservaVivaBruta> & { reservaId: string }): ReservaVivaBruta {
  return {
    reservaId: parcial.reservaId,
    obraId: parcial.obraId ?? 'obr_1',
    tituloDaObra: parcial.tituloDaObra ?? 'O Cortiço',
    posicao: parcial.posicao ?? 1,
    status: 'AGUARDANDO',
    alunoId: parcial.alunoId ?? 'alu_1',
    nomeDoLeitor: parcial.nomeDoLeitor ?? 'Júlia Nogueira',
    matricula: parcial.matricula ?? '2024001',
    turma: parcial.turma === undefined ? '7º A' : parcial.turma,
    tomboSeparado: null,
    retirarAte: null,
  }
}

function separada(
  parcial: Omit<Partial<ReservaVivaBruta>, 'retirarAte'> & {
    reservaId: string
    retirarAte: string
  },
): ReservaVivaBruta {
  const { retirarAte: _prazo, ...semPrazo } = parcial
  return {
    ...aguardando(semPrazo),
    status: 'DISPONIVEL',
    tomboSeparado: parcial.tomboSeparado ?? '000412',
    retirarAte: dia(parcial.retirarAte),
  }
}

function fakeCom(vivas: ReservaVivaBruta[]): RepositorioDaFilaDeReservas {
  return {
    reservasVivas: () => Promise.resolve(vivas),
  }
}

describe('agrupar a fila viva por obra', () => {
  it('junta as reservas da mesma obra numa fila só, em ordem de chegada', () => {
    const filas = agruparFilasPorObra([
      aguardando({ reservaId: 'res_3', posicao: 3, nomeDoLeitor: 'Sofia Alves' }),
      aguardando({ reservaId: 'res_1', posicao: 1, nomeDoLeitor: 'Júlia Nogueira' }),
      aguardando({ reservaId: 'res_2', posicao: 2, nomeDoLeitor: 'Rafael Menezes' }),
    ])

    expect(filas).toHaveLength(1)
    expect(filas[0]?.tituloDaObra).toBe('O Cortiço')
    // A ordem é a promessa da fila: quem esperou mais leva primeiro.
    expect(filas[0]?.pessoas.map((p) => p.nomeDoLeitor)).toEqual([
      'Júlia Nogueira',
      'Rafael Menezes',
      'Sofia Alves',
    ])
  })

  it('separa obras diferentes em filas diferentes', () => {
    const filas = agruparFilasPorObra([
      aguardando({ reservaId: 'res_1', obraId: 'obr_1', tituloDaObra: 'O Cortiço' }),
      aguardando({ reservaId: 'res_2', obraId: 'obr_2', tituloDaObra: 'O Ateneu' }),
    ])

    expect(filas.map((f) => f.obraId).sort()).toEqual(['obr_1', 'obr_2'])
  })

  it('conta quem ESPERA e quem já tem exemplar separado em números diferentes', () => {
    // São dois trabalhos distintos: quem espera precisa de uma cópia que
    // volte; quem tem separado precisa aparecer no balcão. Um número só
    // faria a operadora prometer livro para quem ainda não tem nenhum.
    const filas = agruparFilasPorObra([
      separada({ reservaId: 'res_1', posicao: 1, retirarAte: '2026-09-13' }),
      aguardando({ reservaId: 'res_2', posicao: 2, alunoId: 'alu_2' }),
      aguardando({ reservaId: 'res_3', posicao: 3, alunoId: 'alu_3' }),
    ])

    expect(filas[0]?.esperando).toBe(2)
    expect(filas[0]?.separados).toBe(1)
    expect(filas[0]?.pessoas).toHaveLength(3)
  })

  it('a reserva separada carrega tombo e prazo pelo TIPO, não por campo opcional', () => {
    const filas = agruparFilasPorObra([
      separada({ reservaId: 'res_1', retirarAte: '2026-09-13', tomboSeparado: '000418' }),
    ])

    const pessoa = filas[0]?.pessoas[0]
    // A união discriminada é o que impede a tela de escrever
    // "reservado até —": no ramo DISPONIVEL os dois campos existem.
    if (pessoa?.status !== 'DISPONIVEL') throw new Error('esperava a reserva separada')
    expect(pessoa.tomboSeparado).toBe('000418')
    expect(pessoa.retirarAte).toEqual(dia('2026-09-13'))
  })

  it('a fila maior vem primeiro, com desempate por título', () => {
    const filas = agruparFilasPorObra([
      aguardando({ reservaId: 'res_1', obraId: 'obr_z', tituloDaObra: 'Vidas Secas' }),
      aguardando({ reservaId: 'res_2', obraId: 'obr_a', tituloDaObra: 'A Hora da Estrela' }),
      aguardando({ reservaId: 'res_3', obraId: 'obr_m', tituloDaObra: 'O Cortiço' }),
      aguardando({ reservaId: 'res_4', obraId: 'obr_m', tituloDaObra: 'O Cortiço', posicao: 2 }),
    ])

    expect(filas.map((f) => f.tituloDaObra)).toEqual([
      'O Cortiço',
      'A Hora da Estrela',
      'Vidas Secas',
    ])
  })

  it('recusa a reserva separada que chegou sem prazo de retirada', () => {
    // Uma reserva DISPONIVEL sem prazo é uma que o cron nunca vai expirar:
    // o exemplar fica preso à reserva para sempre. Mostrá-la como se
    // estivesse em ordem esconderia o defeito justamente de quem poderia
    // avisar.
    expect(() =>
      agruparFilasPorObra([
        {
          ...aguardando({ reservaId: 'res_1' }),
          status: 'DISPONIVEL',
          tomboSeparado: '000412',
          retirarAte: null,
        },
      ]),
    ).toThrow(/res_1/)
  })

  it('não inventa fila quando não há reserva viva nenhuma', () => {
    expect(agruparFilasPorObra([])).toEqual([])
  })
})

describe('listar as filas de reserva', () => {
  it('devolve as filas agrupadas para quem gerencia a fila', async () => {
    const filas = await listarFilasDeReserva(BALCAO, {
      filaDeReservas: fakeCom([aguardando({ reservaId: 'res_1' })]),
    })

    expect(filas).toHaveLength(1)
  })

  it('quem só cria reserva também consulta: é a pergunta do aluno no balcão', async () => {
    // "Sou o quantos?" é respondida na frente do aluno pelo monitor, que
    // alimenta a fila. Exigir `reserva:gerenciar` o deixaria sem conseguir
    // informar a fila que ele mesmo criou.
    const filas = await listarFilasDeReserva(SO_INFORMA, {
      filaDeReservas: fakeCom([aguardando({ reservaId: 'res_1' })]),
    })

    expect(filas).toHaveLength(1)
  })

  it('recusa quem não tem permissão nenhuma de reserva', async () => {
    await expect(
      listarFilasDeReserva(SEM_NADA, {
        filaDeReservas: fakeCom([aguardando({ reservaId: 'res_1' })]),
      }),
    ).rejects.toThrow(SemPermissaoError)
  })
})
