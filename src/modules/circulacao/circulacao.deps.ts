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
import { emprestimosEmCursoRepository } from '@/modules/circulacao/emprestimos-em-curso.repository'
import { obrasDaFilaRepository } from '@/modules/circulacao/obras-da-fila.repository'
import type { DependenciasDoBalcao } from '@/modules/circulacao/emprestar.service'
import type { DependenciasDeDevolucao } from '@/modules/circulacao/devolver.service'
import type { DependenciasDeEmprestimos } from '@/modules/circulacao/emprestimos.service'
import type { DependenciasDeConfiguracao } from '@/modules/circulacao/configuracao.service'
import type { DependenciasDoCalendario } from '@/modules/circulacao/calendario.service'
import type { DependenciasDeConsultaDoBalcao } from '@/modules/circulacao/balcao.service'
import type { DependenciasDeReserva } from '@/modules/circulacao/reservas.service'
import type { DependenciasDeRenovacao } from '@/modules/circulacao/renovar.service'

/**
 * Ponto de composição da circulação.
 *
 * Existe para que as rotas nunca importem um `*.repository.ts` — a
 * Global Constraint 1 proíbe, e há gate no CI. A rota pede o pacote
 * pronto e passa adiante; quem sabe montar é este módulo.
 *
 * São TRÊS funções e não uma porque os pacotes têm donos diferentes: o do
 * balcão é montado por uma requisição de gente logada, e o da reserva
 * também é montado pelo job de cron, que roda sem usuário e sem
 * auditoria. Fundir tudo num pacote só obrigaria o job a arrastar
 * `registrarAuditoria` e o repositório de penalidades para dentro de uma
 * execução que não usa nenhum dos dois — e cada dependência a mais aí é
 * uma a mais para quebrar de madrugada, sem ninguém olhando.
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
