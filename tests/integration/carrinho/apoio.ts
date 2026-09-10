import { vi } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { executarEmTransacao } from '@/core/db/tenant-extension'
import { balcaoRepository } from '@/modules/circulacao/balcao.repository'
import { carrinhoRepository } from '@/modules/carrinho/carrinho.repository'
import { normalizarParaBusca } from '@/core/texto/normalizar'
import type { Principal } from '@/core/auth/principal'
import type { DependenciasDoLote } from '@/modules/carrinho/carrinho.service'

export const HOJE = new Date('2026-09-10T12:00:00-03:00')

export const registrarAuditoria = vi.fn().mockResolvedValue(undefined)

export const deps: DependenciasDoLote = {
  carrinho: carrinhoRepository,
  balcao: balcaoRepository,
  emTransacao: executarEmTransacao,
  registrarAuditoria,
}

export function coordenacao(escolaId: string): Principal {
  return {
    reino: 'STAFF',
    id: 'usr_1',
    escolaId,
    nome: 'Coordenação',
    permissoes: ['carrinho:gerenciar', 'emprestimo:criar'],
  }
}

export interface CenarioDaEscola {
  escolaId: string
  turmaId: string
  /** Turma do 3º do Médio, para provar o filtro de faixa etária. */
  turmaMedioId: string
  alunos: string[]
  obraId: string
  exemplares: string[]
}

/**
 * Monta uma escola inteira: ano letivo, duas turmas, alunos, obra e
 * exemplares. Recebe o sufixo para que duas escolas coexistam no mesmo
 * teste — o isolamento entre elas é o que mais precisa ser provado
 * contra o banco de verdade.
 */
export async function semearEscola(
  sufixo: string,
  opcoes: { alunos?: number; exemplares?: number } = {},
): Promise<CenarioDaEscola> {
  const quantosAlunos = opcoes.alunos ?? 3
  const quantosExemplares = opcoes.exemplares ?? 3

  const escola = await prisma.escola.create({
    data: { slug: `escola-${sufixo}`, nome: `Escola ${sufixo}` },
  })

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
      nome: '5º A',
      serie: '5',
      turno: 'MANHA',
    },
  })

  const turmaMedio = await prisma.turma.create({
    data: {
      escolaId: escola.id,
      anoLetivoId: anoLetivo.id,
      nome: '3º EM',
      serie: '3EM',
      turno: 'MANHA',
    },
  })

  const alunos: string[] = []
  for (let i = 1; i <= quantosAlunos; i++) {
    const aluno = await prisma.aluno.create({
      data: {
        escolaId: escola.id,
        matricula: `${sufixo}-${i}`,
        nome: `Aluno ${sufixo} ${i}`,
        dataNascimento: new Date('2015-03-15'),
        turmaId: turma.id,
      },
    })
    alunos.push(aluno.id)
  }

  const obra = await prisma.obra.create({
    data: {
      escolaId: escola.id,
      titulo: 'Dom Casmurro',
      tituloNormalizado: normalizarParaBusca('Dom Casmurro'),
    },
  })

  const exemplares: string[] = []
  for (let i = 1; i <= quantosExemplares; i++) {
    const exemplar = await prisma.exemplar.create({
      data: { escolaId: escola.id, obraId: obra.id, tombo: `${sufixo}${i}` },
    })
    exemplares.push(exemplar.id)
  }

  return {
    escolaId: escola.id,
    turmaId: turma.id,
    turmaMedioId: turmaMedio.id,
    alunos,
    obraId: obra.id,
    exemplares,
  }
}

export function naEscola<T>(escolaId: string, fn: () => Promise<T>): Promise<T> {
  return executarComTenant(escolaId, fn)
}
