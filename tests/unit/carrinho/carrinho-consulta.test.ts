import { describe, it, expect } from 'vitest'
import { SemPermissaoError } from '@/core/errors'
import {
  listarTurmasDoCarrinho,
  listarRodadasPlanejadas,
  type DependenciasDeConsultaDoCarrinho,
  type RodadaEmAberto,
  type TurmaDoCarrinho,
} from '@/modules/carrinho/carrinho-consulta.service'
import type { Principal } from '@/core/auth/principal'

const COORDENACAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Coordenação',
  permissoes: ['carrinho:gerenciar'],
}

const SEM_CARRINHO: Principal = { ...COORDENACAO, permissoes: ['aluno:ver'] }

const TURMAS: TurmaDoCarrinho[] = [
  { id: 'tur_5A', nome: '5º A', serie: '5' },
  { id: 'tur_7B', nome: '7º B', serie: '7' },
]

const RODADAS: RodadaEmAberto[] = [
  {
    id: 'rod_1',
    turmaId: 'tur_7B',
    turmaNome: '7º B',
    turmaSerie: '7',
    data: new Date('2026-09-12T00:00:00.000Z'),
    responsavelNome: 'Coordenação',
    observacao: '3ª aula',
    livros: [{ exemplarId: 'exe_1', tombo: '000388', titulo: 'Extraordinário' }],
  },
]

function deps(): DependenciasDeConsultaDoCarrinho {
  return {
    consultaDoCarrinho: {
      turmasDoAnoLetivoAtivo: async () => TURMAS,
      rodadasPlanejadas: async () => RODADAS,
    },
  }
}

describe('listarTurmasDoCarrinho', () => {
  it('devolve as turmas que a tela oferece para planejar a rodada', async () => {
    expect(await listarTurmasDoCarrinho(COORDENACAO, deps())).toEqual(TURMAS)
  })

  it('exige carrinho:gerenciar', async () => {
    // A autorização mora no serviço: esconder o seletor de turma na tela
    // não impede ninguém de chamar a Server Action direto.
    await expect(listarTurmasDoCarrinho(SEM_CARRINHO, deps())).rejects.toThrow(SemPermissaoError)
  })
})

describe('listarRodadasPlanejadas', () => {
  it('devolve as rodadas ainda abertas, com os livros que foram no carrinho', async () => {
    const rodadas = await listarRodadasPlanejadas(COORDENACAO, deps())

    expect(rodadas).toHaveLength(1)
    expect(rodadas[0]!.turmaNome).toBe('7º B')
    expect(rodadas[0]!.livros.map((l) => l.tombo)).toEqual(['000388'])
  })

  it('exige carrinho:gerenciar', async () => {
    await expect(listarRodadasPlanejadas(SEM_CARRINHO, deps())).rejects.toThrow(SemPermissaoError)
  })
})
