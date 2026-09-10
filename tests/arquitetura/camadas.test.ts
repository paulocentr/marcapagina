import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const AQUI = import.meta.dirname
const RAIZ = path.resolve(AQUI, '../../src')

function listarArquivos(dir: string): string[] {
  const encontrados: string[] = []
  for (const entrada of readdirSync(dir)) {
    const completo = path.join(dir, entrada)
    if (statSync(completo).isDirectory()) {
      encontrados.push(...listarArquivos(completo))
    } else if (/\.(ts|tsx)$/.test(entrada)) {
      encontrados.push(completo)
    }
  }
  return encontrados
}

function linhasDeImport(conteudo: string): string[] {
  return conteudo.split('\n').filter((l) => /^\s*import\b|require\(/.test(l))
}

describe('Global Constraint 1: rotas não tocam a camada de dados', () => {
  const arquivosDeRota = listarArquivos(path.join(RAIZ, 'app'))

  it('encontra arquivos em src/app para verificar', () => {
    // Guarda contra falso verde: se a varredura não achar nada, o teste
    // passaria vazio e a invariante estaria desprotegida sem ninguém ver.
    expect(arquivosDeRota.length).toBeGreaterThan(0)
  })

  it.each(arquivosDeRota)('%s não importa repository, Prisma nem core/db', (arquivo) => {
    const imports = linhasDeImport(readFileSync(arquivo, 'utf8'))

    const proibidos = imports.filter(
      (linha) =>
        /\.repository['"]/.test(linha) ||
        /from\s+['"]@prisma\/client['"]/.test(linha) ||
        /@\/core\/db/.test(linha),
    )

    expect(
      proibidos,
      `${path.relative(RAIZ, arquivo)} fura a camada. Rotas falam com serviços.\n${proibidos.join('\n')}`,
    ).toEqual([])
  })
})

describe('Global Constraint 2: só core/db/client instancia PrismaClient', () => {
  const todos = listarArquivos(RAIZ)
  const permitido = path.join(RAIZ, 'core', 'db', 'client.ts')

  it.each(todos.filter((a) => a !== permitido))('%s não instancia PrismaClient', (arquivo) => {
    const conteudo = readFileSync(arquivo, 'utf8')
    expect(
      /new\s+PrismaClient\s*\(/.test(conteudo),
      `${path.relative(RAIZ, arquivo)} instancia PrismaClient. Use o singleton de @/core/db/client.`,
    ).toBe(false)
  })
})

describe('Global Constraint 4: serviços não conhecem HTTP', () => {
  const servicos = listarArquivos(RAIZ).filter((a) => a.endsWith('.service.ts'))

  it('encontra serviços para verificar', () => {
    expect(servicos.length).toBeGreaterThan(0)
  })

  it.each(servicos)('%s não importa next/headers nem next/navigation', (arquivo) => {
    const imports = linhasDeImport(readFileSync(arquivo, 'utf8'))
    const proibidos = imports.filter((l) =>
      /from\s+['"]next\/(headers|navigation|server)['"]/.test(l),
    )

    expect(
      proibidos,
      `${path.relative(RAIZ, arquivo)} conhece HTTP. Serviços recebem dados já extraídos.\n${proibidos.join('\n')}`,
    ).toEqual([])
  })
})

describe('modelos com escolaId estão declarados como escopados', () => {
  const CAMINHO_SCHEMA = path.resolve(AQUI, '../../prisma/schema.prisma')

  // Toda exceção ao escopo por tenant está listada AQUI, com o porquê, e
  // este teste é o que impede a lista de crescer sem alguém decidir.
  // Sem esta trava, o gate abaixo seria silenciável: bastaria empurrar o
  // modelo novo para MODELOS_FORA_DO_TENANT e o CI voltaria a ficar verde
  // com as queries daquele modelo vazando entre escolas.
  const EXCECOES_JUSTIFICADAS: Record<string, string> = {
    Escola: 'é a raiz do tenant — ela É o escolaId de todo o resto',
    UsuarioPapel: 'tabela de junção, escopada pelas pontas',
    TentativaLogin: 'consultada no login, antes de o tenant existir',
  }

  function modelosComEscolaId(): string[] {
    const schema = readFileSync(CAMINHO_SCHEMA, 'utf8')
    const nomes: string[] = []
    for (const bloco of schema.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)) {
      const corpo = bloco[2]!
      if (/^\s*escolaId\s/m.test(corpo)) nomes.push(bloco[1]!)
    }
    return nomes
  }

  it('todo model do schema com escolaId está em MODELOS_ESCOPADOS ou MODELOS_FORA_DO_TENANT', async () => {
    const { MODELOS_ESCOPADOS_POR_TENANT, MODELOS_FORA_DO_TENANT } = await import(
      '@/core/db/modelos-tenant'
    )

    const naoDeclarados = modelosComEscolaId().filter(
      (nome) => !MODELOS_ESCOPADOS_POR_TENANT.has(nome) && !MODELOS_FORA_DO_TENANT.has(nome),
    )

    expect(
      naoDeclarados,
      `Estes modelos têm escolaId mas não foram declarados em src/core/db/modelos-tenant.ts. ` +
        `Sem a declaração, suas queries NÃO são filtradas por tenant e vazam entre escolas: ${naoDeclarados.join(', ')}`,
    ).toEqual([])
  })

  it('ficar de fora do escopo exige justificativa registrada aqui', async () => {
    const { MODELOS_FORA_DO_TENANT } = await import('@/core/db/modelos-tenant')

    const semJustificativa = [...MODELOS_FORA_DO_TENANT].filter(
      (nome) => !(nome in EXCECOES_JUSTIFICADAS),
    )

    expect(
      semJustificativa,
      `Estes modelos foram declarados FORA do escopo de tenant sem justificativa. ` +
        `Tirar um modelo do escopo é abrir mão do isolamento entre escolas para ele — ` +
        `se é mesmo o que se quer, acrescente o nome e o motivo em EXCECOES_JUSTIFICADAS ` +
        `neste teste: ${semJustificativa.join(', ')}`,
    ).toEqual([])
  })

  it('nenhum modelo está nas duas listas ao mesmo tempo', async () => {
    const { MODELOS_ESCOPADOS_POR_TENANT, MODELOS_FORA_DO_TENANT } = await import(
      '@/core/db/modelos-tenant'
    )

    const nosDois = [...MODELOS_ESCOPADOS_POR_TENANT].filter((n) => MODELOS_FORA_DO_TENANT.has(n))
    expect(nosDois, `Declaração contraditória: ${nosDois.join(', ')}`).toEqual([])
  })
})
