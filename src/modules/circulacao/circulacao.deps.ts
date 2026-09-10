import { executarEmTransacao } from '@/core/db/tenant-extension'
import { balcaoRepository } from '@/modules/circulacao/balcao.repository'
import { reservasRepository } from '@/modules/circulacao/reservas.repository'
import { emprestimosEmCursoRepository } from '@/modules/circulacao/emprestimos-em-curso.repository'
import { obrasDaFilaRepository } from '@/modules/circulacao/obras-da-fila.repository'
import type { DependenciasDeReserva } from '@/modules/circulacao/reservas.service'
import type { DependenciasDeRenovacao } from '@/modules/circulacao/renovar.service'

/**
 * Ponto de composição da circulação.
 *
 * Existe para que rota nenhuma importe um `*.repository.ts` — a Global
 * Constraint 1 proíbe e há gate no CI. A rota pede o pacote pronto; quem
 * sabe montar é este módulo.
 */
export function dependenciasDeReserva(): DependenciasDeReserva {
  return {
    reservas: reservasRepository,
    balcao: balcaoRepository,
    acervo: obrasDaFilaRepository,
    emprestimosEmCurso: emprestimosEmCursoRepository,
    emTransacao: executarEmTransacao,
  }
}

export function dependenciasDeRenovacao(): DependenciasDeRenovacao {
  return {
    emprestimosEmCurso: emprestimosEmCursoRepository,
    reservas: reservasRepository,
    balcao: balcaoRepository,
  }
}
