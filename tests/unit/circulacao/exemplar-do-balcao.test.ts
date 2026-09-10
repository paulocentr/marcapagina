import { describe, it, expect, beforeEach } from 'vitest'
import {
  conferirExemplarNoBalcao,
  ExemplarNaoEncontradoError,
  type CabecaDaFila,
  type ExemplarBipado,
  type RepositorioDeExemplarDoBalcao,
} from '@/modules/circulacao/exemplar-do-balcao.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'

const BALCAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['obra:ver', 'emprestimo:criar'],
}

const SEM_NADA: Principal = { ...BALCAO, permissoes: [] }

const EXEMPLAR: ExemplarBipado = {
  id: 'exe_1',
  tombo: '000412',
  situacao: 'DISPONIVEL',
  obraId: 'obr_1',
  tituloDaObra: 'O Cortiço',
  autores: ['Aluísio Azevedo'],
  localizacao: { nome: 'Estante 3', corredor: 'B', estante: '3', prateleira: '2' },
}

function criarFake() {
  let exemplar: ExemplarBipado | null = EXEMPLAR
  let cabecaDaFila: CabecaDaFila | null = null
  const tombosConsultados: string[] = []

  return {
    definirExemplar: (e: ExemplarBipado | null) => {
      exemplar = e
    },
    definirCabecaDaFila: (c: CabecaDaFila | null) => {
      cabecaDaFila = c
    },
    tombosConsultados: () => tombosConsultados,

    async conferirTombo(tombo: string) {
      tombosConsultados.push(tombo)
      if (!exemplar || exemplar.tombo !== tombo) return null
      return { exemplar, cabecaDaFila }
    },
  } satisfies RepositorioDeExemplarDoBalcao & Record<string, unknown>
}

let deps: { exemplarDoBalcao: ReturnType<typeof criarFake> }

beforeEach(() => {
  deps = { exemplarDoBalcao: criarFake() }
})

describe('o exemplar que a operadora acabou de bipar', () => {
  it('diz título, autor e estante ao lado do tombo', async () => {
    // O tombo sozinho não confirma nada: a operadora precisa ler o
    // título e ver se é o livro que está na mão dela. Bipar o exemplar
    // errado e só descobrir na devolução é o erro que isto evita.
    const conferencia = await conferirExemplarNoBalcao(BALCAO, '000412', deps)

    expect(conferencia.exemplar.tituloDaObra).toBe('O Cortiço')
    expect(conferencia.exemplar.autores).toEqual(['Aluísio Azevedo'])
    expect(conferencia.exemplar.localizacao?.estante).toBe('3')
    expect(conferencia.exemplar.situacao).toBe('DISPONIVEL')
  })

  it('tombo com espaço em volta ainda acha', async () => {
    // Mesma razão da matrícula: o leitor de código de barras às vezes
    // entrega espaço ou um Enter junto do número.
    const conferencia = await conferirExemplarNoBalcao(BALCAO, '  000412 \n', deps)

    expect(conferencia.exemplar.id).toBe('exe_1')
    expect(deps.exemplarDoBalcao.tombosConsultados()).toEqual(['000412'])
  })

  it('tombo inexistente é erro próprio, não nulo', async () => {
    await expect(conferirExemplarNoBalcao(BALCAO, '999999', deps)).rejects.toBeInstanceOf(
      ExemplarNaoEncontradoError,
    )
  })

  it('o erro diz o tombo que não achou', async () => {
    const erro = await conferirExemplarNoBalcao(BALCAO, '999999', deps).then(
      () => null,
      (e: unknown) => e as Error,
    )

    expect(erro?.message).toContain('999999')
  })

  it('o exemplar sem localização cadastrada não quebra a conferência', async () => {
    deps.exemplarDoBalcao.definirExemplar({ ...EXEMPLAR, localizacao: null })

    const conferencia = await conferirExemplarNoBalcao(BALCAO, '000412', deps)

    expect(conferencia.exemplar.localizacao).toBeNull()
  })

  it('recusa sem permissão de ver acervo', async () => {
    await expect(conferirExemplarNoBalcao(SEM_NADA, '000412', deps)).rejects.toBeInstanceOf(
      SemPermissaoError,
    )
  })
})

describe('o próximo da fila, na faixa de separar exemplar', () => {
  it('sem fila não há próximo', async () => {
    const conferencia = await conferirExemplarNoBalcao(BALCAO, '000412', deps)

    expect(conferencia.proximoDaFila).toBeNull()
  })

  it('diz o NOME e a TURMA de quem leva em seguida', async () => {
    // A faixa manda separar o exemplar. Sem nome e turma a operadora
    // escreve o quê no papelzinho que vai dentro do livro?
    deps.exemplarDoBalcao.definirCabecaDaFila({
      reservaId: 'res_1',
      posicao: 1,
      nomeDoLeitor: 'Júlia Nogueira',
      turma: '7º A',
      status: 'AGUARDANDO',
      exemplarSeparadoId: null,
    })

    const conferencia = await conferirExemplarNoBalcao(BALCAO, '000412', deps)

    expect(conferencia.proximoDaFila?.nomeDoLeitor).toBe('Júlia Nogueira')
    expect(conferencia.proximoDaFila?.turma).toBe('7º A')
    expect(conferencia.proximoDaFila?.posicao).toBe(1)
  })

  it('quem está esperando ainda NÃO tem este exemplar separado', async () => {
    deps.exemplarDoBalcao.definirCabecaDaFila({
      reservaId: 'res_1',
      posicao: 1,
      nomeDoLeitor: 'Júlia Nogueira',
      turma: '7º A',
      status: 'AGUARDANDO',
      exemplarSeparadoId: null,
    })

    const conferencia = await conferirExemplarNoBalcao(BALCAO, '000412', deps)

    expect(conferencia.proximoDaFila?.jaSeparadoParaEle).toBe(false)
  })

  it('reconhece que ESTE exemplar já está separado para ele', async () => {
    // A operadora bipou um exemplar RESERVADO. Ela precisa saber que a
    // reserva é deste exemplar e desta pessoa — senão separa duas vezes,
    // ou tira da prateleira o livro que já era de alguém.
    deps.exemplarDoBalcao.definirExemplar({ ...EXEMPLAR, situacao: 'RESERVADO' })
    deps.exemplarDoBalcao.definirCabecaDaFila({
      reservaId: 'res_1',
      posicao: 1,
      nomeDoLeitor: 'Júlia Nogueira',
      turma: '7º A',
      status: 'DISPONIVEL',
      exemplarSeparadoId: 'exe_1',
    })

    const conferencia = await conferirExemplarNoBalcao(BALCAO, '000412', deps)

    expect(conferencia.proximoDaFila?.jaSeparadoParaEle).toBe(true)
  })

  it('a reserva separada em OUTRO exemplar não conta como este', async () => {
    // A obra tem duas cópias e a primeira já foi separada para ela. Dizer
    // "já separado" do exemplar na mão faria a operadora devolvê-lo à
    // estante achando que a fila já estava atendida.
    deps.exemplarDoBalcao.definirCabecaDaFila({
      reservaId: 'res_1',
      posicao: 1,
      nomeDoLeitor: 'Júlia Nogueira',
      turma: '7º A',
      status: 'DISPONIVEL',
      exemplarSeparadoId: 'exe_OUTRO',
    })

    const conferencia = await conferirExemplarNoBalcao(BALCAO, '000412', deps)

    expect(conferencia.proximoDaFila?.jaSeparadoParaEle).toBe(false)
  })

  it('o leitor sem turma cadastrada não quebra a faixa', async () => {
    deps.exemplarDoBalcao.definirCabecaDaFila({
      reservaId: 'res_1',
      posicao: 3,
      nomeDoLeitor: 'Júlia Nogueira',
      turma: null,
      status: 'AGUARDANDO',
      exemplarSeparadoId: null,
    })

    const conferencia = await conferirExemplarNoBalcao(BALCAO, '000412', deps)

    expect(conferencia.proximoDaFila?.turma).toBeNull()
  })
})
