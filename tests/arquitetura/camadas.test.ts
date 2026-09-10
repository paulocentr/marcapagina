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

describe('Global Constraint 13: serviço não lê sessão', () => {
  const servicos = listarArquivos(RAIZ).filter((a) => a.endsWith('.service.ts'))

  it.each(servicos)('%s não importa guards nem sessao', (arquivo) => {
    const imports = linhasDeImport(readFileSync(arquivo, 'utf8'))
    const proibidos = imports.filter((l) => /@\/core\/auth\/(guards|sessao)/.test(l))

    expect(
      proibidos,
      `${path.relative(RAIZ, arquivo)} lê a sessão. O serviço recebe Principal por ` +
        `parâmetro e chama exigirPermissao — é o que o mantém testável sem HTTP.\n${proibidos.join('\n')}`,
    ).toEqual([])
  })
})

describe('Global Constraint 14: fetch só em src/infra', () => {
  const foraDeInfra = listarArquivos(RAIZ).filter((a) => !a.startsWith(path.join(RAIZ, 'infra')))

  it.each(foraDeInfra)('%s não chama fetch direto', (arquivo) => {
    const conteudo = readFileSync(arquivo, 'utf8')
    expect(
      /(^|[^.\w])fetch\s*\(/.test(conteudo),
      `${path.relative(RAIZ, arquivo)} chama fetch. Provedores externos moram em ` +
        `src/infra e chegam ao serviço por injeção — senão testar o fallback exige rede.`,
    ).toBe(false)
  })
})

describe('nenhum <Link> aponta para um Route Handler', () => {
  // Por que isto é um gate e não uma revisão de código: o App Router
  // PREFETCHA todo <Link> que entra na viewport, disparando um GET no href
  // sem que ninguém clique. Se o href é um Route Handler, o handler
  // EXECUTA — e `/sair` apaga o cookie de sessão. O sintoma não aparece na
  // tela que tem o link: ela renderiza bem, a sessão morre em silêncio, e
  // a próxima Server Action recusa com "É preciso entrar para continuar".
  //
  // Foi exatamente isso que deixou o E2E do acervo vermelho e intermitente:
  // o `<Link href="/sair">` que existia em src/app/painel/page.tsx derrubava
  // a sessão logo depois do login, e o prefetch é agendado por ociosidade —
  // daí um conjunto diferente de testes falhar em cada rodada.
  //
  // Rota de servidor se alcança com `<a href>`, que o navegador não
  // prefetcha, ou com POST quando a ação tem efeito colateral.
  const arquivosDeRota = listarArquivos(path.join(RAIZ, 'app'))

  function caminhoDoRouteHandler(arquivo: string): string {
    const relativo = path.relative(path.join(RAIZ, 'app'), path.dirname(arquivo))
    const segmentos = relativo
      .split(path.sep)
      // Grupos de rota — (marketing) — não entram na URL.
      .filter((s) => s.length > 0 && !s.startsWith('('))
    return '/' + segmentos.join('/')
  }

  const rotasDeServidor = arquivosDeRota
    .filter((a) => path.basename(a) === 'route.ts' || path.basename(a) === 'route.tsx')
    .map(caminhoDoRouteHandler)

  it('encontra Route Handlers para verificar', () => {
    // Guarda contra falso verde: sem rota nenhuma na lista, o gate abaixo
    // passaria vazio e a invariante estaria desprotegida sem ninguém ver.
    expect(rotasDeServidor.length).toBeGreaterThan(0)
  })

  /** O href literal de cada `<Link>` do arquivo, sem a query string. */
  function hrefsDeLink(conteudo: string): string[] {
    const encontrados: string[] = []
    for (const abertura of conteudo.matchAll(/<Link\b/g)) {
      const fim = conteudo.indexOf('>', abertura.index)
      const tag = conteudo.slice(abertura.index, fim === -1 ? undefined : fim)
      const href = tag.match(/href=\{?[`'"]([^`'"]*)[`'"]/)
      if (href?.[1]) encontrados.push(href[1].split('?')[0]!)
    }
    return encontrados
  }

  /** `/api/cron/[job]` casa com `/api/cron/qualquer-coisa`. */
  function casaComRota(href: string, rota: string): boolean {
    const partesHref = href.replace(/\/+$/, '').split('/')
    const partesRota = rota.replace(/\/+$/, '').split('/')
    if (partesHref.length !== partesRota.length) return false
    return partesRota.every((p, i) => p.startsWith('[') || p === partesHref[i])
  }

  const componentes = listarArquivos(RAIZ).filter((a) => a.endsWith('.tsx'))

  it.each(componentes)('%s não usa <Link> para uma rota de servidor', (arquivo) => {
    const proibidos = hrefsDeLink(readFileSync(arquivo, 'utf8')).filter((href) =>
      rotasDeServidor.some((rota) => casaComRota(href, rota)),
    )

    expect(
      proibidos,
      `${path.relative(RAIZ, arquivo)} usa <Link> para um Route Handler: ${proibidos.join(', ')}. ` +
        `O App Router prefetcha o href sem clique, então o handler roda só porque o link ` +
        `apareceu na tela — e no caso de /sair isso apaga o cookie de sessão. ` +
        `Use <a href> (o navegador não prefetcha) ou um POST.`,
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
