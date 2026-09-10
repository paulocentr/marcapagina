import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/core/db/client'
import { executarComTenant } from '@/core/tenant/context'
import { registrarAuditoria } from '@/core/audit/audit.service'

let escolaId = ''

beforeEach(async () => {
  const escola = await prisma.escola.create({ data: { slug: 'escola-a', nome: 'A' } })
  escolaId = escola.id
})

describe('auditoria', () => {
  it('grava o evento no tenant corrente', async () => {
    await executarComTenant(escolaId, () =>
      registrarAuditoria({
        autor: { reino: 'STAFF', id: 'usr_1', escolaId, nome: 'Coordenação', permissoes: [] },
        acao: 'emprestimo.forcar',
        entidade: 'Emprestimo',
        entidadeId: 'emp_1',
        dadosDepois: { justificativa: 'aluno com atraso, liberado pela coordenação' },
        ip: '10.0.0.1',
      }),
    )

    const logs = await prisma.logAuditoria.findMany()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      escolaId,
      autorTipo: 'STAFF',
      autorId: 'usr_1',
      autorNome: 'Coordenação',
      acao: 'emprestimo.forcar',
      entidade: 'Emprestimo',
      entidadeId: 'emp_1',
    })
  })

  it('registra ação de aluno', async () => {
    await executarComTenant(escolaId, () =>
      registrarAuditoria({
        autor: { reino: 'ALUNO', id: 'alu_1', escolaId, nome: 'Ana Souza', matricula: '2024001' },
        acao: 'reserva.criar',
        entidade: 'Reserva',
        entidadeId: 'res_1',
      }),
    )

    const log = await prisma.logAuditoria.findFirst()
    expect(log?.autorTipo).toBe('ALUNO')
  })

  it('registra ação do sistema, sem autor humano', async () => {
    await executarComTenant(escolaId, () =>
      registrarAuditoria({
        autor: 'SISTEMA',
        acao: 'notificacao.atraso.enviar',
        entidade: 'Notificacao',
      }),
    )

    const log = await prisma.logAuditoria.findFirst()
    expect(log?.autorTipo).toBe('SISTEMA')
    expect(log?.autorId).toBeNull()
    expect(log?.autorNome).toBe('Sistema')
  })

  it('falha de auditoria NÃO derruba a operação de negócio', async () => {
    // Auditar é importante, mas se o log falhar o empréstimo já aconteceu.
    // Lançar aqui desfaria uma operação legítima por causa do registro.
    await executarComTenant(escolaId, async () => {
      await expect(
        registrarAuditoria({
          autor: 'SISTEMA',
          acao: 'x',
          entidade: 'Y',
          // Json inválido: BigInt não é serializável.
          dadosDepois: { valor: BigInt(1) } as unknown as Record<string, unknown>,
        }),
      ).resolves.toBeUndefined()
    })
  })
})
