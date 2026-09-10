import { normalizarIsbn } from '@/infra/metadados/isbn'
import type { MetadadosDeObra, ProvedorDeMetadados } from '@/infra/metadados/provedor'

export interface OpcoesDaCascata {
  /**
   * Teto por provedor. Sem ele, uma API pendurada trava a catalogação
   * inteira e a operadora não sabe por quê — pior que a API estar fora,
   * porque ao menos "fora" cai para a próxima na hora.
   */
  tempoLimiteMs?: number
}

const TEMPO_LIMITE_PADRAO_MS = 8_000

/**
 * Tenta os provedores em ordem e devolve o primeiro que achar.
 *
 * Nenhuma das duas APIs cobre o catálogo brasileiro sozinha, especialmente
 * didático e infantojuvenil nacional (spec §2.6) — a cascata não é
 * redundância de luxo, é o que faz a catalogação por ISBN valer a pena
 * aqui. E nunca lança: quando todos falham, devolve `null` e a tela abre
 * o formulário manual, em vez de interromper a sessão com um erro.
 */
export function emCascata(
  ...argumentos: [...ProvedorDeMetadados[], OpcoesDaCascata] | ProvedorDeMetadados[]
): ProvedorDeMetadados {
  const ultimo = argumentos[argumentos.length - 1]
  const temOpcoes = ultimo !== undefined && !('buscarPorIsbn' in ultimo)

  const opcoes = (temOpcoes ? ultimo : {}) as OpcoesDaCascata
  const provedores = (temOpcoes ? argumentos.slice(0, -1) : argumentos) as ProvedorDeMetadados[]

  const tempoLimiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PADRAO_MS

  return {
    nome: `cascata(${provedores.map((p) => p.nome).join(' → ')})`,

    async buscarPorIsbn(bruto: string): Promise<MetadadosDeObra | null> {
      // Recusar aqui poupa a rede e devolve a recusa na hora, em vez de
      // esperar duas APIs dizerem que não acharam algo que não existe.
      const isbn = normalizarIsbn(bruto)
      if (!isbn) return null

      for (const provedor of provedores) {
        const achado = await tentar(provedor, isbn, tempoLimiteMs)
        if (achado) return { ...achado, fonte: achado.fonte ?? provedor.nome }
      }

      return null
    },
  }
}

async function tentar(
  provedor: ProvedorDeMetadados,
  isbn: string,
  tempoLimiteMs: number,
): Promise<MetadadosDeObra | null> {
  const controlador = new AbortController()
  const alarme = setTimeout(() => controlador.abort(), tempoLimiteMs)

  try {
    // Race explícita: o AbortSignal só ajuda se o provedor o respeitar, e
    // um provedor mal-comportado não pode segurar a sessão mesmo assim.
    return await Promise.race([
      provedor.buscarPorIsbn(isbn, controlador.signal),
      esperarEDesistir(tempoLimiteMs),
    ])
  } catch (erro) {
    // Falha de um provedor NUNCA sobe: é o próximo da fila que importa.
    // O erro vai para o log do servidor, onde dá para ver que a API está
    // ruim antes de alguém reclamar.
    console.error('[metadados] provedor falhou', { provedor: provedor.nome, isbn, erro })
    return null
  } finally {
    clearTimeout(alarme)
  }
}

function esperarEDesistir(tempoLimiteMs: number): Promise<null> {
  return new Promise((resolver) => {
    setTimeout(() => resolver(null), tempoLimiteMs)
  })
}
