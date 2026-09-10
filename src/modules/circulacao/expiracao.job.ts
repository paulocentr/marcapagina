import { executarComTenant } from '@/core/tenant/context'
import { listarEscolasAtivas } from '@/modules/escolas/escolas.service'
import { dependenciasDeReserva } from '@/modules/circulacao/circulacao.deps'
import {
  expirarReservasVencidas,
  type ResultadoDaExpiracao,
} from '@/modules/circulacao/reservas.service'

export interface DependenciasDoJobDeExpiracao {
  listarEscolasAtivas(): Promise<{ id: string; slug: string }[]>
  expirarNaEscola(escolaId: string, hoje: Date): Promise<ResultadoDaExpiracao>
}

export interface RelatorioDaExpiracao {
  /** Escolas que rodaram até o fim. Falhas NÃO entram nesta conta. */
  escolasProcessadas: number
  expiradas: number
  passadasAdiante: number
  exemplaresLiberados: number
  /** Nomeadas pelo slug: "1 falha" sem dizer onde não ajuda ninguém. */
  falhas: { escola: string; motivo: string }[]
}

/**
 * O job de expiração de reservas, escola por escola.
 *
 * Iterar tenants é responsabilidade DELE: não existe requisição de
 * usuário aqui, então não há host de onde resolver a escola — o cron
 * acorda uma vez e precisa passar por todas.
 *
 * A regra que molda este arquivo: **um erro numa escola não pode impedir
 * as outras**. Um `Promise.all` que rejeita, ou um `for` sem try, deixaria
 * todas as escolas seguintes com exemplares presos numa reserva vencida
 * por causa de uma linha estranha na primeira.
 */
export async function expirarReservasDeTodasAsEscolas(
  hoje: Date,
  deps: DependenciasDoJobDeExpiracao = dependenciasDoJobDeExpiracao(),
): Promise<RelatorioDaExpiracao> {
  const escolas = await deps.listarEscolasAtivas()

  const relatorio: RelatorioDaExpiracao = {
    escolasProcessadas: 0,
    expiradas: 0,
    passadasAdiante: 0,
    exemplaresLiberados: 0,
    falhas: [],
  }

  for (const escola of escolas) {
    try {
      const resultado = await deps.expirarNaEscola(escola.id, hoje)

      relatorio.escolasProcessadas += 1
      relatorio.expiradas += resultado.expiradas
      relatorio.passadasAdiante += resultado.passadasAdiante
      relatorio.exemplaresLiberados += resultado.exemplaresLiberados

      // A escola rodou, mas alguma reserva lá dentro não passou. Sobe
      // para o relatório do job: devolver só o que deu certo esconderia
      // exatamente o que precisa de gente olhando.
      for (const falha of resultado.falhas) {
        relatorio.falhas.push({
          escola: escola.slug,
          motivo: `reserva ${falha.reservaId}: ${falha.motivo}`,
        })
      }
    } catch (erro) {
      relatorio.falhas.push({
        escola: escola.slug,
        motivo: erro instanceof Error ? erro.message : String(erro),
      })
    }
  }

  return relatorio
}

/**
 * A composição real: cada escola roda dentro do próprio contexto de
 * tenant, e a autorização é `'SISTEMA'` — quem autenticou foi o segredo
 * do endpoint de cron, não um usuário.
 */
export function dependenciasDoJobDeExpiracao(): DependenciasDoJobDeExpiracao {
  return {
    listarEscolasAtivas,
    expirarNaEscola: (escolaId, hoje) =>
      executarComTenant(escolaId, () =>
        expirarReservasVencidas('SISTEMA', hoje, dependenciasDeReserva()),
      ),
  }
}
