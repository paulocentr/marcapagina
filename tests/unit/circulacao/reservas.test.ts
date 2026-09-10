import { describe, it, expect, beforeEach } from 'vitest'
import {
  reservar,
  cancelarReserva,
  expirarReservasVencidas,
  filaDaObra,
  LeitorJaEstaComAObraError,
  LeitorInativoError,
  ReservaNaoCancelavelError,
} from '@/modules/circulacao/reservas.service'
import {
  JaEstaNaFilaError,
  ReservaInexistenteError,
  ReservaNaoPermitidaError,
} from '@/modules/circulacao/reservas.tipos'
import { LeitorInexistenteError } from '@/modules/circulacao/emprestar.service'
import { ObraInexistenteError } from '@/modules/acervo/obras.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'
import { criarFakeDeReservas } from '../../apoio/fakes/reservas.fake'

const BALCAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Monitor do balcão',
  permissoes: ['reserva:criar', 'reserva:gerenciar'],
}

const SEM_NADA: Principal = {
  reino: 'STAFF',
  id: 'usr_3',
  escolaId: 'esc_1',
  nome: 'Visitante',
  permissoes: ['obra:ver'],
}

// Quinta-feira.
const HOJE = new Date('2026-09-10T12:00:00-03:00')

let deps: ReturnType<typeof criarFakeDeReservas>

beforeEach(() => {
  deps = criarFakeDeReservas()
})

describe('reservar', () => {
  it('a reserva é da OBRA, não do exemplar', async () => {
    // O aluno quer o LIVRO, e qualquer cópia serve. Nascer amarrada a um
    // exemplar faria a fila parar porque justamente aquela cópia está com
    // alguém.
    const reserva = await reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps)

    expect(reserva.obraId).toBe('obr_1')
    expect(reserva.exemplarSeparadoId).toBeNull()
    expect(reserva.status).toBe('AGUARDANDO')
  })

  it('entra na fila na ordem de chegada', async () => {
    const primeira = await reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps)
    const segunda = await reservar(BALCAO, { alunoId: 'alu_2', obraId: 'obr_1' }, deps)
    const terceira = await reservar(BALCAO, { alunoId: 'alu_3', obraId: 'obr_1' }, deps)

    expect([primeira.posicao, segunda.posicao, terceira.posicao]).toEqual([1, 2, 3])
  })

  it('a fila de uma obra não empurra a posição da outra', async () => {
    await reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps)
    const outra = await reservar(BALCAO, { alunoId: 'alu_2', obraId: 'obr_2' }, deps)

    expect(outra.posicao).toBe(1)
  })

  it('o mesmo aluno não entra duas vezes na mesma fila', async () => {
    await reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps)

    const erro = await reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps).catch(
      (e: unknown) => e,
    )

    expect(erro).toBeInstanceOf(JaEstaNaFilaError)
    // A posição vem no erro para a tela dizer "você é o 1º da fila" em
    // vez de "erro" — o aluno pergunta exatamente isso.
    expect((erro as JaEstaNaFilaError).posicao).toBe(1)
    expect(deps.reservasDaObra('obr_1')).toHaveLength(1)
  })

  it('recusa reserva de quem já está com a obra em mãos', async () => {
    deps.definirExemplarEmMaosDe('alu_1', 'obr_1')

    await expect(
      reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps),
    ).rejects.toBeInstanceOf(LeitorJaEstaComAObraError)
  })

  it('estar com OUTRA obra em mãos não impede reservar esta', async () => {
    deps.definirExemplarEmMaosDe('alu_1', 'obr_2')

    await expect(
      reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps),
    ).resolves.toBeDefined()
  })

  it('respeita a configuração "aluno pode reservar"', async () => {
    deps.definirConfiguracao({ alunoPodeReservar: false })

    await expect(
      reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps),
    ).rejects.toBeInstanceOf(ReservaNaoPermitidaError)
  })

  it('a configuração vale por SÉRIE: o 9º ano reserva, o 2º não', async () => {
    deps.definirConfiguracao({ alunoPodeReservar: false })
    deps.definirSerieDoAluno('alu_1', '9')
    deps.definirOverride({ serie: '9', alunoPodeReservar: true })

    await expect(
      reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps),
    ).resolves.toBeDefined()

    deps.definirSerieDoAluno('alu_2', '2')
    await expect(
      reservar(BALCAO, { alunoId: 'alu_2', obraId: 'obr_1' }, deps),
    ).rejects.toBeInstanceOf(ReservaNaoPermitidaError)
  })

  it('recusa leitor que não existe', async () => {
    await expect(
      reservar(BALCAO, { alunoId: 'nao_existe', obraId: 'obr_1' }, deps),
    ).rejects.toBeInstanceOf(LeitorInexistenteError)
  })

  it('recusa leitor desativado', async () => {
    // Quem saiu da escola segurando lugar na fila atrasa quem ficou, e o
    // lugar só vencaria no prazo de retirada — que ele nunca vem cumprir.
    deps.desativarLeitor('alu_1')

    await expect(
      reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps),
    ).rejects.toBeInstanceOf(LeitorInativoError)
  })

  it('recusa obra que não existe no acervo desta escola', async () => {
    // O obraId vem do cliente. Gravar a fila sem conferir deixaria o
    // aluno esperando por um livro que esta escola não tem.
    await expect(
      reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_de_outra_escola' }, deps),
    ).rejects.toBeInstanceOf(ObraInexistenteError)
  })

  it('recusa sem a permissão reserva:criar', async () => {
    await expect(
      reservar(SEM_NADA, { alunoId: 'alu_1', obraId: 'obr_1' }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })

  it('a posição e a gravação saem na MESMA transação', async () => {
    // Ler a última posição fora da transação em que se grava deixa duas
    // reservas simultâneas nascerem na mesma posição, e a fila deixa de
    // ter ordem.
    await reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps)

    expect(deps.criouReservaDentroDaTransacao()).toEqual([true])
  })
})

describe('filaDaObra', () => {
  it('devolve a fila em ordem de posição', async () => {
    await reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps)
    await reservar(BALCAO, { alunoId: 'alu_2', obraId: 'obr_1' }, deps)

    const fila = await filaDaObra(BALCAO, 'obr_1', deps)

    expect(fila.map((r) => r.alunoId)).toEqual(['alu_1', 'alu_2'])
  })

  it('exige permissão de balcão', async () => {
    await expect(filaDaObra(SEM_NADA, 'obr_1', deps)).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('cancelarReserva', () => {
  it('cancela quem estava só aguardando', async () => {
    const reserva = await reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps)

    await cancelarReserva(BALCAO, { reservaId: reserva.id, hoje: HOJE }, deps)

    expect(deps.reserva(reserva.id)?.status).toBe('CANCELADA')
  })

  it('cancelar quem tinha exemplar separado passa a vez ao próximo', async () => {
    const primeira = deps.inserirReserva({
      obraId: 'obr_1',
      alunoId: 'alu_1',
      posicao: 1,
      status: 'DISPONIVEL',
      exemplarSeparadoId: 'exe_1',
      retirarAte: new Date(Date.UTC(2026, 8, 14)),
    })
    const segunda = deps.inserirReserva({ obraId: 'obr_1', alunoId: 'alu_2', posicao: 2 })
    deps.definirSituacaoDoExemplar('exe_1', 'RESERVADO')

    await cancelarReserva(BALCAO, { reservaId: primeira.id, hoje: HOJE }, deps)

    expect(deps.reserva(segunda.id)?.exemplarSeparadoId).toBe('exe_1')
    expect(deps.reserva(segunda.id)?.status).toBe('DISPONIVEL')
    // O exemplar continua separado: soltá-lo para DISPONIVEL enquanto há
    // fila deixaria o primeiro que aparecesse no balcão levar o livro de
    // quem esperou.
    expect(deps.situacaoDoExemplar('exe_1')).toBe('RESERVADO')
  })

  it('cancelar sem ninguém depois devolve o exemplar para DISPONIVEL', async () => {
    const reserva = deps.inserirReserva({
      obraId: 'obr_1',
      alunoId: 'alu_1',
      posicao: 1,
      status: 'DISPONIVEL',
      exemplarSeparadoId: 'exe_1',
      retirarAte: new Date(Date.UTC(2026, 8, 14)),
    })
    deps.definirSituacaoDoExemplar('exe_1', 'RESERVADO')

    await cancelarReserva(BALCAO, { reservaId: reserva.id, hoje: HOJE }, deps)

    expect(deps.situacaoDoExemplar('exe_1')).toBe('DISPONIVEL')
  })

  it('recusa cancelar reserva já atendida', async () => {
    const reserva = deps.inserirReserva({ obraId: 'obr_1', alunoId: 'alu_1', status: 'ATENDIDA' })

    await expect(
      cancelarReserva(BALCAO, { reservaId: reserva.id, hoje: HOJE }, deps),
    ).rejects.toBeInstanceOf(ReservaNaoCancelavelError)
  })

  it('recusa reserva que não existe', async () => {
    await expect(
      cancelarReserva(BALCAO, { reservaId: 'res_999', hoje: HOJE }, deps),
    ).rejects.toBeInstanceOf(ReservaInexistenteError)
  })

  it('exige a permissão reserva:gerenciar', async () => {
    const reserva = await reservar(BALCAO, { alunoId: 'alu_1', obraId: 'obr_1' }, deps)

    await expect(
      cancelarReserva(SEM_NADA, { reservaId: reserva.id, hoje: HOJE }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('expirarReservasVencidas', () => {
  function separadaVencida(alunoId: string, exemplarId: string) {
    deps.definirSituacaoDoExemplar(exemplarId, 'RESERVADO')
    return deps.inserirReserva({
      obraId: 'obr_1',
      alunoId,
      posicao: 1,
      status: 'DISPONIVEL',
      exemplarSeparadoId: exemplarId,
      // Venceu ontem.
      retirarAte: new Date(Date.UTC(2026, 8, 9)),
    })
  }

  it('passa a vez ao próximo quando o prazo de retirada vence', async () => {
    const vencida = separadaVencida('alu_1', 'exe_1')
    const proxima = deps.inserirReserva({ obraId: 'obr_1', alunoId: 'alu_2', posicao: 2 })

    const resultado = await expirarReservasVencidas('SISTEMA', HOJE, deps)

    expect(deps.reserva(vencida.id)?.status).toBe('EXPIRADA')
    expect(deps.reserva(proxima.id)?.status).toBe('DISPONIVEL')
    expect(resultado).toMatchObject({ expiradas: 1, passadasAdiante: 1, exemplaresLiberados: 0 })
  })

  it('o exemplar separado vai para o PRÓXIMO, não para DISPONIVEL', async () => {
    separadaVencida('alu_1', 'exe_1')
    const proxima = deps.inserirReserva({ obraId: 'obr_1', alunoId: 'alu_2', posicao: 2 })

    await expirarReservasVencidas('SISTEMA', HOJE, deps)

    expect(deps.reserva(proxima.id)?.exemplarSeparadoId).toBe('exe_1')
    expect(deps.situacaoDoExemplar('exe_1')).toBe('RESERVADO')
  })

  it('o próximo ganha um novo prazo de retirada, que pula dia não letivo', async () => {
    // Vencer com a escola fechada tira a vez de quem não tinha como vir
    // buscar — é o mesmo erro que o prazo de empréstimo evita.
    deps.definirConfiguracao({ prazoDeRetiradaEmDias: 2 })
    // 10/09 é quinta: +2 cai no sábado 12/09, que o fim de semana já
    // empurra para segunda 14/09. Marcar a SEGUNDA como não letiva é o
    // que prova que o feriado conta além do fim de semana.
    deps.definirDiaNaoLetivo('2026-09-14')
    separadaVencida('alu_1', 'exe_1')
    const proxima = deps.inserirReserva({ obraId: 'obr_1', alunoId: 'alu_2', posicao: 2 })

    await expirarReservasVencidas('SISTEMA', HOJE, deps)

    expect(deps.reserva(proxima.id)?.retirarAte?.toISOString().slice(0, 10)).toBe('2026-09-15')
  })

  it('o prazo de retirada sai da configuração da SÉRIE do próximo', async () => {
    // Sem o override o prazo padrão (2 dias) daria 14/09; com ele, 15/09.
    // São datas diferentes de propósito — se fossem a mesma, o teste
    // passaria mesmo com o override sendo ignorado.
    deps.definirSerieDoAluno('alu_2', '9')
    deps.definirOverride({ serie: '9', prazoDeRetiradaEmDias: 5 })
    separadaVencida('alu_1', 'exe_1')
    const proxima = deps.inserirReserva({ obraId: 'obr_1', alunoId: 'alu_2', posicao: 2 })

    await expirarReservasVencidas('SISTEMA', HOJE, deps)

    expect(deps.reserva(proxima.id)?.retirarAte?.toISOString().slice(0, 10)).toBe('2026-09-15')
  })

  it('sem próximo na fila, o exemplar volta para DISPONIVEL', async () => {
    const vencida = separadaVencida('alu_1', 'exe_1')

    const resultado = await expirarReservasVencidas('SISTEMA', HOJE, deps)

    expect(deps.reserva(vencida.id)?.status).toBe('EXPIRADA')
    expect(deps.situacaoDoExemplar('exe_1')).toBe('DISPONIVEL')
    expect(resultado).toMatchObject({ expiradas: 1, passadasAdiante: 0, exemplaresLiberados: 1 })
  })

  it('não expira reserva dentro do prazo', async () => {
    const emDia = deps.inserirReserva({
      obraId: 'obr_1',
      alunoId: 'alu_1',
      posicao: 1,
      status: 'DISPONIVEL',
      exemplarSeparadoId: 'exe_1',
      // Vence HOJE: ainda tem o dia inteiro para buscar.
      retirarAte: new Date(Date.UTC(2026, 8, 10)),
    })
    deps.definirSituacaoDoExemplar('exe_1', 'RESERVADO')

    const resultado = await expirarReservasVencidas('SISTEMA', HOJE, deps)

    expect(deps.reserva(emDia.id)?.status).toBe('DISPONIVEL')
    expect(resultado.expiradas).toBe(0)
  })

  it('uma reserva que falha não impede as outras', async () => {
    // O job roda sozinho de madrugada. Parar tudo na primeira linha ruim
    // deixaria o acervo inteiro travado até alguém olhar o log.
    const ruim = separadaVencida('alu_1', 'exe_1')
    deps.inserirReserva({
      obraId: 'obr_2',
      alunoId: 'alu_2',
      posicao: 1,
      status: 'DISPONIVEL',
      exemplarSeparadoId: 'exe_2',
      retirarAte: new Date(Date.UTC(2026, 8, 9)),
    })
    deps.definirSituacaoDoExemplar('exe_2', 'RESERVADO')
    deps.fazerFalharAoExpirar(ruim.id)

    const resultado = await expirarReservasVencidas('SISTEMA', HOJE, deps)

    expect(resultado.expiradas).toBe(1)
    expect(deps.situacaoDoExemplar('exe_2')).toBe('DISPONIVEL')
    // A falha é RELATADA, nunca engolida: um job que devolve sucesso
    // escondendo o que não fez é pior que um job que quebra.
    expect(resultado.falhas).toEqual([{ reservaId: ruim.id, motivo: expect.any(String) }])
  })

  it('cada reserva sai numa transação própria', async () => {
    separadaVencida('alu_1', 'exe_1')
    deps.inserirReserva({
      obraId: 'obr_2',
      alunoId: 'alu_2',
      posicao: 1,
      status: 'DISPONIVEL',
      exemplarSeparadoId: 'exe_2',
      retirarAte: new Date(Date.UTC(2026, 8, 9)),
    })

    await expirarReservasVencidas('SISTEMA', HOJE, deps)

    expect(deps.transacoesAbertas).toBe(2)
  })

  it('um humano só expira com a permissão reserva:gerenciar', async () => {
    separadaVencida('alu_1', 'exe_1')

    await expect(expirarReservasVencidas(SEM_NADA, HOJE, deps)).rejects.toBeInstanceOf(
      SemPermissaoError,
    )
  })

  it('o balcão pode disparar a expiração à mão', async () => {
    separadaVencida('alu_1', 'exe_1')

    await expect(expirarReservasVencidas(BALCAO, HOJE, deps)).resolves.toMatchObject({
      expiradas: 1,
    })
  })
})
