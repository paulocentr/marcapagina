import { describe, it, expect, vi } from 'vitest'
import { emCascata } from '@/infra/metadados/em-cascata'
import type { MetadadosDeObra, ProvedorDeMetadados } from '@/infra/metadados/provedor'

const DOM_CASMURRO: MetadadosDeObra = {
  isbn: '9788535902778',
  titulo: 'Dom Casmurro',
  autores: ['Machado de Assis'],
}

function provedorQueAcha(nome: string, achado = DOM_CASMURRO): ProvedorDeMetadados {
  return { nome, buscarPorIsbn: vi.fn().mockResolvedValue(achado) }
}

function provedorQueNaoAcha(nome: string): ProvedorDeMetadados {
  return { nome, buscarPorIsbn: vi.fn().mockResolvedValue(null) }
}

function provedorQueLanca(nome: string): ProvedorDeMetadados {
  return { nome, buscarPorIsbn: vi.fn().mockRejectedValue(new Error('502 Bad Gateway')) }
}

function provedorQuePendura(nome: string): ProvedorDeMetadados {
  return { nome, buscarPorIsbn: vi.fn().mockImplementation(() => new Promise(() => {})) }
}

describe('emCascata', () => {
  it('usa o primeiro provedor quando ele responde', async () => {
    const primeiro = provedorQueAcha('google')
    const segundo = provedorQueAcha('openlibrary')

    const achado = await emCascata(primeiro, segundo).buscarPorIsbn('9788535902778')

    expect(achado?.titulo).toBe('Dom Casmurro')
    expect(segundo.buscarPorIsbn).not.toHaveBeenCalled()
  })

  it('cai para o segundo quando o primeiro não acha', async () => {
    // Nenhuma das duas cobre o catálogo brasileiro sozinha, especialmente
    // didático e infantojuvenil nacional (spec §2.6).
    const primeiro = provedorQueNaoAcha('google')
    const segundo = provedorQueAcha('openlibrary')

    const achado = await emCascata(primeiro, segundo).buscarPorIsbn('9788535902778')

    expect(achado?.titulo).toBe('Dom Casmurro')
    expect(segundo.buscarPorIsbn).toHaveBeenCalledOnce()
  })

  it('cai para o segundo quando o primeiro LANÇA', async () => {
    // API fora do ar não pode virar tela de erro no meio de uma sessão de
    // catalogação. O fallback existe justamente para o dia ruim.
    const primeiro = provedorQueLanca('google')
    const segundo = provedorQueAcha('openlibrary')

    const achado = await emCascata(primeiro, segundo).buscarPorIsbn('9788535902778')

    expect(achado?.titulo).toBe('Dom Casmurro')
  })

  it('devolve null quando nenhum acha, sem lançar', async () => {
    const cascata = emCascata(provedorQueNaoAcha('a'), provedorQueNaoAcha('b'))

    await expect(cascata.buscarPorIsbn('9788535902778')).resolves.toBeNull()
  })

  it('devolve null quando TODOS lançam, sem lançar', async () => {
    // Duas APIs fora do ar ao mesmo tempo tem que abrir o formulário
    // manual, não uma tela de erro.
    const cascata = emCascata(provedorQueLanca('a'), provedorQueLanca('b'))

    await expect(cascata.buscarPorIsbn('9788535902778')).resolves.toBeNull()
  })

  it('não deixa um provedor pendurado travar a sessão', async () => {
    // Sem timeout, uma API que não responde trava a catalogação inteira e
    // a operadora não sabe por quê.
    vi.useFakeTimers()
    try {
      const cascata = emCascata(provedorQuePendura('lento'), provedorQueAcha('openlibrary'), {
        tempoLimiteMs: 5_000,
      })

      const promessa = cascata.buscarPorIsbn('9788535902778')
      await vi.advanceTimersByTimeAsync(5_001)

      expect((await promessa)?.titulo).toBe('Dom Casmurro')
    } finally {
      vi.useRealTimers()
    }
  })

  it('recusa ISBN inválido antes de consultar qualquer provedor', async () => {
    // Não gastar a rede com um ISBN que já se sabe errado, e devolver a
    // recusa na hora.
    const provedor = provedorQueAcha('google')

    const achado = await emCascata(provedor).buscarPorIsbn('9788535902779')

    expect(achado).toBeNull()
    expect(provedor.buscarPorIsbn).not.toHaveBeenCalled()
  })

  it('consulta os provedores com o ISBN JÁ normalizado', async () => {
    // O provedor recebe a forma canônica de 13 dígitos, não o que a
    // operadora digitou — senão cada um teria que normalizar de novo.
    const provedor = provedorQueAcha('google')

    await emCascata(provedor).buscarPorIsbn('978-85-359-0277-8')

    expect(provedor.buscarPorIsbn).toHaveBeenCalledWith('9788535902778', expect.anything())
  })

  it('carimba no resultado qual provedor respondeu', async () => {
    // Serve para saber, meses depois, de onde veio uma ficha estranha.
    const cascata = emCascata(provedorQueNaoAcha('google'), provedorQueAcha('openlibrary'))

    const achado = await cascata.buscarPorIsbn('9788535902778')

    expect(achado?.fonte).toBe('openlibrary')
  })

  it('sem provedor nenhum devolve null em vez de estourar', async () => {
    await expect(emCascata().buscarPorIsbn('9788535902778')).resolves.toBeNull()
  })
})
