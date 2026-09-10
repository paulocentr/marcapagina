import { describe, it, expect } from 'vitest'
import { verificarBloqueio, registrarTentativa } from '@/core/auth/tentativas'
import { BloqueadoPorTentativasError } from '@/core/errors'

const BASE = { identificador: '2024001', reino: 'ALUNO' as const, ip: '10.0.0.1' }

async function falharVezes(n: number) {
  for (let i = 0; i < n; i++) {
    await registrarTentativa({ ...BASE, sucesso: false })
  }
}

describe('bloqueio por tentativas', () => {
  it('deixa passar quando não há histórico', async () => {
    await expect(verificarBloqueio(BASE)).resolves.toBeUndefined()
  })

  it('deixa passar abaixo do limite', async () => {
    await falharVezes(4)
    await expect(verificarBloqueio(BASE)).resolves.toBeUndefined()
  })

  it('bloqueia ao atingir o limite', async () => {
    await falharVezes(5)
    await expect(verificarBloqueio(BASE)).rejects.toBeInstanceOf(BloqueadoPorTentativasError)
  })

  it('bloqueio é progressivo: mais falhas, espera maior', async () => {
    await falharVezes(5)
    const primeiro = await capturarEspera(BASE)

    await falharVezes(5)
    const segundo = await capturarEspera(BASE)

    expect(segundo).toBeGreaterThan(primeiro)
  })

  it('sucesso zera o histórico do identificador', async () => {
    await falharVezes(5)
    await registrarTentativa({ ...BASE, sucesso: true })

    await expect(verificarBloqueio(BASE)).resolves.toBeUndefined()
  })

  it('bloqueia o IP mesmo variando a matrícula (varredura)', async () => {
    // Ataque real: tentar muitas matrículas do mesmo IP. O limite por
    // identificador não pega isso; o limite por IP pega.
    for (let i = 0; i < 30; i++) {
      await registrarTentativa({ identificador: `20240${i}`, reino: 'ALUNO', ip: '10.0.0.9', sucesso: false })
    }

    await expect(
      verificarBloqueio({ identificador: 'nova-matricula', reino: 'ALUNO', ip: '10.0.0.9' }),
    ).rejects.toBeInstanceOf(BloqueadoPorTentativasError)
  })

  it('não confunde reinos: falha de aluno não bloqueia staff', async () => {
    await falharVezes(5)
    await expect(
      verificarBloqueio({ identificador: '2024001', reino: 'STAFF', ip: '10.0.0.2' }),
    ).resolves.toBeUndefined()
  })
})

async function capturarEspera(p: typeof BASE): Promise<number> {
  try {
    await verificarBloqueio(p)
    throw new Error('deveria ter bloqueado')
  } catch (erro) {
    if (erro instanceof BloqueadoPorTentativasError) return erro.segundosRestantes
    throw erro
  }
}
