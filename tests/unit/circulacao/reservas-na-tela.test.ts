import { describe, it, expect } from 'vitest'
import {
  avaliarRenovacao,
  classificarRetirada,
  montarPrateleira,
  proximoDaFila,
} from '@/app/painel/reservas/reservas-na-tela'
import type { ExemplarSeparado } from '@/modules/circulacao/painel-do-balcao.service'
import type { FilaDaObra, PessoaNaFila } from '@/modules/circulacao/fila-de-reservas.service'

function dia(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

/**
 * Um item da prateleira como `listarPrateleiraDeSeparados` o devolve —
 * com os três julgamentos já feitos pelo serviço.
 */
function naPrateleira(parcial: {
  reservaId: string
  retirarAte: string
  diasParaRetirar: number
  tituloDaObra?: string
  nomeDoLeitor?: string
}): ExemplarSeparado {
  return {
    reservaId: parcial.reservaId,
    exemplarId: `exe_${parcial.reservaId}`,
    tombo: '000412',
    tituloDaObra: parcial.tituloDaObra ?? 'O Cortiço',
    nomeDoLeitor: parcial.nomeDoLeitor ?? 'Júlia Nogueira',
    turma: '7º A',
    localizacao: 'Estante 3',
    retirarAte: dia(parcial.retirarAte),
    diasParaRetirar: parcial.diasParaRetirar,
    venceHoje: parcial.diasParaRetirar === 0,
    vencido: parcial.diasParaRetirar < 0,
  }
}

function esperando(reservaId: string, nome: string, posicao: number): PessoaNaFila {
  return {
    reservaId,
    posicao,
    status: 'AGUARDANDO',
    alunoId: `alu_${reservaId}`,
    nomeDoLeitor: nome,
    matricula: '2024001',
    turma: '7º A',
  }
}

function separada(reservaId: string, nome: string, posicao: number, retirarAte: string): PessoaNaFila {
  return {
    reservaId,
    posicao,
    status: 'DISPONIVEL',
    alunoId: `alu_${reservaId}`,
    nomeDoLeitor: nome,
    matricula: '2024001',
    turma: '7º A',
    tomboSeparado: '000412',
    retirarAte: dia(retirarAte),
  }
}

function fila(parcial: {
  obraId?: string
  tituloDaObra?: string
  pessoas: PessoaNaFila[]
}): FilaDaObra {
  const pessoas = parcial.pessoas
  return {
    obraId: parcial.obraId ?? 'obr_1',
    tituloDaObra: parcial.tituloDaObra ?? 'O Cortiço',
    esperando: pessoas.filter((p) => p.status === 'AGUARDANDO').length,
    separados: pessoas.filter((p) => p.status === 'DISPONIVEL').length,
    pessoas,
  }
}

describe('classificar o prazo de retirada', () => {
  it('o prazo que já passou é VENCIDO, com quantos dias', () => {
    expect(classificarRetirada(naPrateleira({ reservaId: 'res_1', retirarAte: '2026-09-08', diasParaRetirar: -2 }))).toEqual(
      { tipo: 'VENCIDO', diasVencidos: 2 },
    )
  })

  it('vencer hoje NÃO é vencido: quem vence hoje tem o dia inteiro', () => {
    // Mesma fronteira de `listarComRetiradaVencida`, que é quem o cron
    // usa. Chamar de vencido o que ainda dá tempo tiraria a vez de quem
    // ia buscar depois da aula.
    expect(classificarRetirada(naPrateleira({ reservaId: 'res_1', retirarAte: '2026-09-10', diasParaRetirar: 0 }))).toEqual(
      { tipo: 'VENCE_HOJE' },
    )
  })

  it('ainda no prazo diz quantos dias restam', () => {
    expect(classificarRetirada(naPrateleira({ reservaId: 'res_1', retirarAte: '2026-09-13', diasParaRetirar: 3 }))).toEqual(
      { tipo: 'NO_PRAZO', diasRestantes: 3 },
    )
  })

  it('recusa item cujo sinalizador contradiz a contagem de dias', () => {
    // Os três campos vêm do MESMO cálculo no serviço. Divergirem só
    // acontece se alguém montar o objeto à mão — e aí a tela diria "ainda
    // dá tempo" de um exemplar que o cron já devolveu à estante.
    expect(() =>
      classificarRetirada({
        ...naPrateleira({ reservaId: 'res_9', retirarAte: '2026-09-01', diasParaRetirar: -5 }),
        vencido: false,
      }),
    ).toThrow(/res_9/)
  })

  it('recusa item que diz vencer hoje com dias ainda por vencer', () => {
    // Este cobre o OUTRO sinalizador. Sem ele a guarda de `venceHoje`
    // ficaria morta e ninguém veria — a de `vencido` continuaria verde.
    expect(() =>
      classificarRetirada({
        ...naPrateleira({ reservaId: 'res_7', retirarAte: '2026-09-13', diasParaRetirar: 3 }),
        venceHoje: true,
      }),
    ).toThrow(/res_7/)
  })

  it('recusa item marcado como vencido e vencendo hoje ao mesmo tempo', () => {
    expect(() =>
      classificarRetirada({
        ...naPrateleira({ reservaId: 'res_8', retirarAte: '2026-09-10', diasParaRetirar: 0 }),
        vencido: true,
      }),
    ).toThrow(/res_8/)
  })
})

describe('montar a prateleira para a tela', () => {
  it('separa o que venceu, o que vence hoje e o que ainda tem prazo', () => {
    const prateleira = montarPrateleira(
      [
        naPrateleira({ reservaId: 'res_1', retirarAte: '2026-09-08', diasParaRetirar: -2 }),
        naPrateleira({ reservaId: 'res_2', retirarAte: '2026-09-10', diasParaRetirar: 0 }),
        naPrateleira({ reservaId: 'res_3', retirarAte: '2026-09-13', diasParaRetirar: 3 }),
      ],
      [],
    )

    expect(prateleira.vencidas.map((l) => l.item.reservaId)).toEqual(['res_1'])
    expect(prateleira.vencemHoje.map((l) => l.item.reservaId)).toEqual(['res_2'])
    expect(prateleira.noPrazo.map((l) => l.item.reservaId)).toEqual(['res_3'])
    expect(prateleira.total).toBe(3)
  })

  it('mantém, dentro de cada grupo, a ordem do prazo mais curto que o serviço deu', () => {
    const prateleira = montarPrateleira(
      [
        naPrateleira({ reservaId: 'res_1', retirarAte: '2026-09-12', diasParaRetirar: 2 }),
        naPrateleira({ reservaId: 'res_2', retirarAte: '2026-09-15', diasParaRetirar: 5 }),
      ],
      [],
    )

    expect(prateleira.noPrazo.map((l) => l.item.reservaId)).toEqual(['res_1', 'res_2'])
  })

  it('diz para QUEM a vez passa quando alguém ainda espera pela obra', () => {
    const prateleira = montarPrateleira(
      [naPrateleira({ reservaId: 'res_1', retirarAte: '2026-09-08', diasParaRetirar: -2 })],
      [
        fila({
          pessoas: [
            separada('res_1', 'Júlia Nogueira', 1, '2026-09-08'),
            esperando('res_2', 'Rafael Menezes', 2),
          ],
        }),
      ],
    )

    expect(prateleira.vencidas[0]?.destino).toEqual({
      tipo: 'PASSA_ADIANTE',
      nome: 'Rafael Menezes',
    })
  })

  it('sem ninguém esperando, o exemplar volta à estante', () => {
    const prateleira = montarPrateleira(
      [naPrateleira({ reservaId: 'res_1', retirarAte: '2026-09-08', diasParaRetirar: -2 })],
      [fila({ pessoas: [separada('res_1', 'Júlia Nogueira', 1, '2026-09-08')] })],
    )

    expect(prateleira.vencidas[0]?.destino).toEqual({ tipo: 'VOLTA_A_ESTANTE' })
  })

  it('duas cópias vencidas da mesma obra vão para DUAS pessoas diferentes', () => {
    // É o que o cron faz: uma reserva por vez, na ordem do prazo, e cada
    // uma pega o próximo da fila. Nomear a mesma pessoa nas duas linhas
    // faria a operadora avisar um aluno duas vezes e esquecer o outro.
    const prateleira = montarPrateleira(
      [
        naPrateleira({ reservaId: 'res_1', retirarAte: '2026-09-07', diasParaRetirar: -3 }),
        naPrateleira({ reservaId: 'res_2', retirarAte: '2026-09-08', diasParaRetirar: -2 }),
      ],
      [
        fila({
          pessoas: [
            separada('res_1', 'Júlia Nogueira', 1, '2026-09-07'),
            separada('res_2', 'Bruno Tavares', 2, '2026-09-08'),
            esperando('res_3', 'Rafael Menezes', 3),
            esperando('res_4', 'Sofia Alves', 4),
          ],
        }),
      ],
    )

    expect(prateleira.vencidas.map((l) => l.destino)).toEqual([
      { tipo: 'PASSA_ADIANTE', nome: 'Rafael Menezes' },
      { tipo: 'PASSA_ADIANTE', nome: 'Sofia Alves' },
    ])
  })

  it('reserva que não apareceu em nenhuma fila fica INDETERMINADA, sem chute', () => {
    // Acontece se a fila e a prateleira forem lidas em momentos
    // diferentes. Chutar "volta à estante" faria a tela afirmar o
    // contrário do que o cron vai fazer.
    const prateleira = montarPrateleira(
      [naPrateleira({ reservaId: 'res_sumida', retirarAte: '2026-09-08', diasParaRetirar: -2 })],
      [fila({ pessoas: [esperando('res_outra', 'Rafael Menezes', 1)] })],
    )

    expect(prateleira.vencidas[0]?.destino).toEqual({ tipo: 'INDETERMINADO' })
  })

  it('prateleira vazia não é erro: é a prateleira vazia', () => {
    expect(montarPrateleira([], []).total).toBe(0)
  })
})

describe('quem é o próximo da fila', () => {
  it('é o primeiro que ESPERA, não o primeiro da lista', () => {
    // Quem já tem exemplar separado está com o livro guardado no balcão:
    // ele não é "o próximo", já é a vez dele. Apontá-lo faria a operadora
    // avisar quem não precisa de aviso.
    const proximo = proximoDaFila(
      fila({
        pessoas: [
          separada('res_1', 'Júlia Nogueira', 1, '2026-09-13'),
          esperando('res_2', 'Rafael Menezes', 2),
          esperando('res_3', 'Sofia Alves', 3),
        ],
      }),
    )

    expect(proximo?.nomeDoLeitor).toBe('Rafael Menezes')
  })

  it('não há próximo quando todos já têm exemplar separado', () => {
    expect(proximoDaFila(fila({ pessoas: [separada('res_1', 'Júlia', 1, '2026-09-13')] }))).toBeNull()
  })
})

describe('avaliar se ainda pode renovar', () => {
  it('pode, e diz quantas renovações restam', () => {
    expect(avaliarRenovacao(0, 2)).toEqual({ pode: true, restantes: 2 })
    expect(avaliarRenovacao(1, 2)).toEqual({ pode: true, restantes: 1 })
  })

  it('no máximo da série, não pode — e a frase diz o número', () => {
    expect(avaliarRenovacao(2, 2)).toEqual({
      pode: false,
      motivo: 'Já renovado 2 vez(es), que é o máximo desta série.',
    })
  })

  it('máximo zero é a coordenação tendo desligado a renovação da série', () => {
    // Não é "acabaram as renovações": nunca houve nenhuma. Dizer a frase
    // errada mandaria a operadora procurar um limite que não existe.
    expect(avaliarRenovacao(0, 0)).toEqual({
      pode: false,
      motivo: 'A coordenação não permite renovação para esta série.',
    })
  })

  it('acima do máximo continua sendo não, sem restante negativo', () => {
    expect(avaliarRenovacao(3, 2).pode).toBe(false)
  })

  it('recusa máximo que não é inteiro não negativo', () => {
    // O máximo vem da configuração da escola. Um `Number()` sobre campo
    // vazio chegaria aqui como NaN, e `0 >= NaN` é falso: a tela liberaria
    // renovação infinita justamente onde a configuração está quebrada.
    expect(() => avaliarRenovacao(0, Number.NaN)).toThrow(/máximo de renovações/i)
    expect(() => avaliarRenovacao(0, -1)).toThrow(/máximo de renovações/i)
    expect(() => avaliarRenovacao(0, 1.5)).toThrow(/máximo de renovações/i)
  })

  it('recusa contagem de renovações que não é inteiro não negativo', () => {
    expect(() => avaliarRenovacao(-1, 2)).toThrow(/renovações já feitas/i)
  })
})
