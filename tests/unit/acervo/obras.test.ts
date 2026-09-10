import { describe, it, expect, beforeEach } from 'vitest'
import {
  criarObra,
  editarObra,
  excluirObra,
  ObraComExemplaresError,
  ObraInexistenteError,
} from '@/modules/acervo/obras.service'
import { SemPermissaoError } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'
import { criarFakeDeAutores, criarFakeDeObras } from '../../apoio/fakes/acervo.fake'

const BIBLIOTECARIO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Bibliotecária',
  permissoes: ['obra:ver', 'obra:criar', 'obra:editar', 'obra:excluir'],
}

const SO_EDITA: Principal = {
  reino: 'STAFF',
  id: 'usr_3',
  escolaId: 'esc_1',
  nome: 'Auxiliar',
  permissoes: ['obra:ver', 'obra:editar'],
}

const MONITOR: Principal = {
  reino: 'STAFF',
  id: 'usr_2',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['obra:ver'],
}

let deps: {
  obras: ReturnType<typeof criarFakeDeObras>
  autores: ReturnType<typeof criarFakeDeAutores>
}

beforeEach(() => {
  deps = { obras: criarFakeDeObras(), autores: criarFakeDeAutores() }
})

describe('criarObra', () => {
  it('cria a obra com os autores na ordem informada', async () => {
    const obra = await criarObra(
      BIBLIOTECARIO,
      { titulo: 'Dom Casmurro', autores: ['Machado de Assis', 'Outro Alguém'] },
      deps,
    )

    expect(obra.titulo).toBe('Dom Casmurro')
    // A ordem dos autores na capa não é decorativa.
    expect(deps.obras.autoresDe(obra.id)).toEqual([
      { autorId: 'aut_1', ordem: 0 },
      { autorId: 'aut_2', ordem: 1 },
    ])
  })

  it('grava o título normalizado para a busca', async () => {
    const obra = await criarObra(BIBLIOTECARIO, { titulo: '  Memórias   PÓSTUMAS ' }, deps)

    expect(deps.obras.bruta(obra.id)?.tituloNormalizado).toBe('memorias postumas')
    // O título exibido preserva o que a operadora digitou, só aparado.
    expect(obra.titulo).toBe('Memórias PÓSTUMAS')
  })

  it('recusa título vazio ou só espaço', async () => {
    await expect(criarObra(BIBLIOTECARIO, { titulo: '   ' }, deps)).rejects.toThrow()
  })

  it('aceita obra sem ISBN', async () => {
    // Didático nacional e apostila frequentemente não têm ISBN. Exigir
    // ISBN barraria justamente o que a escola mais tem na estante.
    const obra = await criarObra(BIBLIOTECARIO, { titulo: 'Apostila de Matemática' }, deps)
    expect(obra.isbn).toBeNull()
  })

  it('aceita obra sem autor conhecido', async () => {
    const obra = await criarObra(BIBLIOTECARIO, { titulo: 'Cancioneiro Popular' }, deps)
    expect(deps.obras.autoresDe(obra.id)).toEqual([])
  })

  it('guarda a capa como URL https', async () => {
    const obra = await criarObra(
      BIBLIOTECARIO,
      { titulo: 'Dom Casmurro', capaUrl: 'https://exemplo.org/capa.jpg' },
      deps,
    )
    expect(obra.capaUrl).toBe('https://exemplo.org/capa.jpg')
  })

  it('recusa capa em data URI', async () => {
    // Binário no banco é proibido (0,5 GB no Neon). Uma data URI é
    // binário disfarçado de texto e passaria despercebida.
    await expect(
      criarObra(
        BIBLIOTECARIO,
        { titulo: 'X', capaUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' },
        deps,
      ),
    ).rejects.toThrow()
  })

  it('recusa capa com esquema perigoso', async () => {
    await expect(
      criarObra(BIBLIOTECARIO, { titulo: 'X', capaUrl: 'javascript:alert(1)' }, deps),
    ).rejects.toThrow()
  })

  it('recusa ano de publicação absurdo', async () => {
    // Um ano com um dígito a mais vira ficha errada que ninguém revisa.
    await expect(
      criarObra(BIBLIOTECARIO, { titulo: 'X', anoPublicacao: 20256 }, deps),
    ).rejects.toThrow()
  })

  it('recusa sem permissão obra:criar', async () => {
    await expect(criarObra(MONITOR, { titulo: 'Dom Casmurro' }, deps)).rejects.toBeInstanceOf(
      SemPermissaoError,
    )
  })

  it('não escreve nada quando a permissão falta', async () => {
    await criarObra(MONITOR, { titulo: 'Dom Casmurro' }, deps).catch(() => undefined)
    expect(deps.obras.todas()).toHaveLength(0)
    expect(deps.autores.todos()).toHaveLength(0)
  })
})

describe('editarObra', () => {
  it('altera o título e o normalizado junto', async () => {
    const obra = await criarObra(BIBLIOTECARIO, { titulo: 'Dom Casmurro' }, deps)
    await editarObra(BIBLIOTECARIO, obra.id, { titulo: 'Dom Casmurro (anotado)' }, deps)

    expect(deps.obras.bruta(obra.id)?.tituloNormalizado).toBe('dom casmurro (anotado)')
  })

  it('quem só tem obra:editar consegue corrigir a autoria', async () => {
    // Cadastrar autor é passo interno da edição; exigir obra:criar aqui
    // seria uma recusa que ninguém entenderia.
    const obra = await criarObra(BIBLIOTECARIO, { titulo: 'Dom Casmurro' }, deps)

    await editarObra(SO_EDITA, obra.id, { autores: ['Machado de Assis'] }, deps)

    expect(deps.obras.autoresDe(obra.id)).toHaveLength(1)
  })

  it('recusa obra inexistente com erro próprio', async () => {
    await expect(
      editarObra(BIBLIOTECARIO, 'nao_existe', { titulo: 'X' }, deps),
    ).rejects.toBeInstanceOf(ObraInexistenteError)
  })

  it('recusa sem permissão obra:editar', async () => {
    const obra = await criarObra(BIBLIOTECARIO, { titulo: 'Dom Casmurro' }, deps)
    await expect(editarObra(MONITOR, obra.id, { titulo: 'X' }, deps)).rejects.toBeInstanceOf(
      SemPermissaoError,
    )
  })

  it('não mexe nos autores quando a edição não os menciona', async () => {
    // Editar só a editora não pode apagar a autoria por omissão.
    const obra = await criarObra(
      BIBLIOTECARIO,
      { titulo: 'Dom Casmurro', autores: ['Machado de Assis'] },
      deps,
    )

    await editarObra(BIBLIOTECARIO, obra.id, { editora: 'Nova Editora' }, deps)

    expect(deps.obras.autoresDe(obra.id)).toHaveLength(1)
  })

  it('lista de autores vazia informada explicitamente apaga a autoria', async () => {
    const obra = await criarObra(
      BIBLIOTECARIO,
      { titulo: 'Dom Casmurro', autores: ['Machado de Assis'] },
      deps,
    )

    await editarObra(BIBLIOTECARIO, obra.id, { autores: [] }, deps)

    expect(deps.obras.autoresDe(obra.id)).toEqual([])
  })
})

describe('excluirObra', () => {
  it('exclui obra sem exemplar', async () => {
    const obra = await criarObra(BIBLIOTECARIO, { titulo: 'Dom Casmurro' }, deps)
    await excluirObra(BIBLIOTECARIO, obra.id, deps)

    expect(deps.obras.todas()).toHaveLength(0)
  })

  it('recusa quando a obra tem exemplar', async () => {
    const obra = await criarObra(BIBLIOTECARIO, { titulo: 'Dom Casmurro' }, deps)
    deps.obras.definirContagemDeExemplares(obra.id, 3)

    await expect(excluirObra(BIBLIOTECARIO, obra.id, deps)).rejects.toBeInstanceOf(
      ObraComExemplaresError,
    )
  })

  it('a recusa diz QUANTOS exemplares impedem', async () => {
    // "Não é possível excluir" sem número manda a operadora caçar no escuro.
    const obra = await criarObra(BIBLIOTECARIO, { titulo: 'Dom Casmurro' }, deps)
    deps.obras.definirContagemDeExemplares(obra.id, 3)

    const erro = await excluirObra(BIBLIOTECARIO, obra.id, deps).catch((e: unknown) => e)

    expect((erro as ObraComExemplaresError).message).toContain('3')
  })

  it('recusa sem permissão obra:excluir', async () => {
    const obra = await criarObra(BIBLIOTECARIO, { titulo: 'Dom Casmurro' }, deps)
    await expect(excluirObra(SO_EDITA, obra.id, deps)).rejects.toBeInstanceOf(SemPermissaoError)
  })
})
