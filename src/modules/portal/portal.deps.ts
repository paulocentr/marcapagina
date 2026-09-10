import { balcaoRepository } from '@/modules/circulacao/balcao.repository'
import { reservasRepository } from '@/modules/circulacao/reservas.repository'
import { portalRepository } from '@/modules/portal/portal.repository'
import type { DependenciasDoPortal } from '@/modules/portal/portal.tipos'

/**
 * Ponto de composição do portal do aluno.
 *
 * Existe para que a tela nunca importe um `*.repository.ts` — a Global
 * Constraint 1 proíbe, e há gate no CI. A rota pede o pacote pronto e
 * passa adiante; quem sabe montar é este módulo.
 *
 * Dois dos três repositórios vêm da CIRCULAÇÃO, de propósito:
 *
 * - `balcaoRepository` responde o cadastro do leitor, a configuração da
 *   escola, os overrides por série e o calendário. Ele é dono do padrão
 *   de configuração usado enquanto a coordenação não configurou nada
 *   (`PADRAO`). Um repositório próprio do portal traria uma segunda cópia
 *   desses números e, no primeiro dia de uso, o celular do aluno
 *   anunciaria um prazo que o balcão não pratica.
 * - `reservasRepository.contarAguardando` é a MESMA contagem que a tela
 *   de reservas mostra. Dois caminhos para "quantos esperam" deixariam a
 *   tela do aluno discordar da tela da operadora na frente do aluno.
 *
 * O que é só do portal é `portalRepository`, e o que o define é o escopo:
 * todo método dele filtra pelo aluno.
 *
 * Sem `emTransacao` e sem `registrarAuditoria`: a renovação pelo portal é
 * UMA escrita — um `updateMany` condicional, atômico por si. Arrastar uma
 * transação para envolver uma única instrução seria cerimônia sem
 * garantia nova. A auditoria fica de fora porque `registrarAuditoria`
 * pede autor de STAFF; auditar a ação do aluno é trabalho de m-3 e
 * precisa da decisão de como o autor ALUNO entra no log.
 */
export function dependenciasDoPortal(): DependenciasDoPortal {
  return {
    portal: portalRepository,
    leitor: balcaoRepository,
    reservas: reservasRepository,
  }
}
