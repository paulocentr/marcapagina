/**
 * O `fetch` injetável. Existe para que os provedores sejam testáveis sem
 * rede: um teste que depende de rede é um teste que falha na sexta-feira
 * por motivo alheio ao código.
 *
 * Este é um dos poucos arquivos onde `fetch` aparece — a Global Constraint
 * 14 confina a rede a `src/infra/`, e há gate no CI.
 */
export type Buscar = (url: string, init?: RequestInit) => Promise<Response>

export interface OpcoesDeProvedorHttp {
  buscar?: Buscar
}

export function buscarPadrao(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init)
}

/**
 * Faz a requisição e devolve o JSON, ou `null` em qualquer problema.
 *
 * Erro de rede e status ruim viram `null`, nunca exceção: quem chama é a
 * cascata, e para ela "este provedor não serviu" é a mesma coisa tanto
 * faz o motivo. O erro vai para o log do servidor, onde dá para ver que a
 * API está ruim antes de alguém reclamar.
 */
export async function pegarJson<T>(
  buscar: Buscar,
  url: string,
  sinal: AbortSignal | undefined,
  ondeFalhou: string,
): Promise<T | null> {
  try {
    const resposta = await buscar(url, {
      signal: sinal,
      headers: { accept: 'application/json' },
    })
    if (!resposta.ok) {
      console.error('[metadados] resposta não-ok', { provedor: ondeFalhou, status: resposta.status })
      return null
    }
    return (await resposta.json()) as T
  } catch (erro) {
    console.error('[metadados] falha de rede', { provedor: ondeFalhou, erro })
    return null
  }
}

/**
 * Extrai o ano de um campo de data que cada API formata do seu jeito:
 * "2016", "2016-03-14" e "March 14, 2016" convivem no mesmo catálogo.
 *
 * Devolve `undefined` quando não há ano reconhecível — nunca 0, nunca o
 * ano corrente. Um ano inventado vira ficha errada que ninguém revisa.
 */
export function extrairAno(valor: unknown): number | undefined {
  if (typeof valor !== 'string') return undefined
  const encontrado = valor.match(/\b(1[4-9]\d{2}|20\d{2}|21\d{2})\b/)
  if (!encontrado) return undefined
  return Number(encontrado[1])
}

/**
 * Promove http para https.
 *
 * O Google Books devolve capa em http. A página é https, e o navegador
 * bloqueia a imagem sem dizer nada: a ficha fica sem capa e ninguém
 * entende por quê.
 */
export function emHttps(url: unknown): string | undefined {
  if (typeof url !== 'string' || url.length === 0) return undefined
  if (url.startsWith('https://')) return url
  if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`
  return undefined
}

/** Número positivo ou `undefined`. Nunca 0 por omissão. */
export function numeroPositivo(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : undefined
}

/** Texto não vazio ou `undefined`. Nunca string vazia por omissão. */
export function textoOuIndefinido(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined
  const limpo = valor.trim()
  return limpo.length > 0 ? limpo : undefined
}
