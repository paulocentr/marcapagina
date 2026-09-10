import { executarEmTransacao } from '@/core/db/tenant-extension'
import { registrarAuditoria } from '@/core/audit/audit.service'
import { balcaoRepository } from '@/modules/circulacao/balcao.repository'
import { devolucaoRepository } from '@/modules/circulacao/devolucao.repository'
import { penalidadesRepository } from '@/modules/circulacao/penalidades.repository'
import { reservasRepository } from '@/modules/circulacao/reservas.repository'
import { emprestimosRepository } from '@/modules/circulacao/emprestimos.repository'
import { configuracaoRepository } from '@/modules/circulacao/configuracao.repository'
import { calendarioRepository } from '@/modules/circulacao/calendario.repository'
import { consultaDoBalcaoRepository } from '@/modules/circulacao/balcao-consulta.repository'
import type { DependenciasDoBalcao } from '@/modules/circulacao/emprestar.service'
import type { DependenciasDeDevolucao } from '@/modules/circulacao/devolver.service'
import type { DependenciasDeEmprestimos } from '@/modules/circulacao/emprestimos.service'
import type { DependenciasDeConfiguracao } from '@/modules/circulacao/configuracao.service'
import type { DependenciasDoCalendario } from '@/modules/circulacao/calendario.service'
import type { DependenciasDeConsultaDoBalcao } from '@/modules/circulacao/balcao.service'

/**
 * Ponto de composição da circulação.
 *
 * Existe para que as rotas nunca importem um `*.repository.ts` — a
 * Global Constraint 1 proíbe, e há gate no CI. A rota pede o pacote
 * pronto e passa adiante; quem sabe montar é este módulo.
 */
export function dependenciasDaCirculacao(): DependenciasDoBalcao &
  DependenciasDeDevolucao &
  DependenciasDeEmprestimos &
  DependenciasDeConfiguracao &
  DependenciasDoCalendario &
  DependenciasDeConsultaDoBalcao {
  return {
    balcao: balcaoRepository,
    consultaDoBalcao: consultaDoBalcaoRepository,
    devolucao: devolucaoRepository,
    penalidades: penalidadesRepository,
    reservas: reservasRepository,
    emprestimos: emprestimosRepository,
    configuracao: configuracaoRepository,
    calendario: calendarioRepository,
    emTransacao: executarEmTransacao,
    registrarAuditoria,
  }
}
