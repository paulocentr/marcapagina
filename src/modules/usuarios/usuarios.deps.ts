import { registrarAuditoria } from '@/core/audit/audit.service'
import { executarEmTransacao } from '@/core/db/tenant-extension'
import { gestaoDeUsuariosRepository } from '@/modules/usuarios/gestao-de-usuarios.repository'
import type { DependenciasDeUsuarios } from '@/modules/usuarios/usuarios.service'

/**
 * Ponto de composição da gestão de contas.
 *
 * Existe para que a tela nunca importe um `*.repository.ts` — a Global
 * Constraint 1 proíbe e há gate no CI. A Server Action pede o pacote
 * pronto e passa adiante; quem sabe montar é este módulo.
 *
 * Um único pacote porque há um único dono: toda operação daqui é uma
 * requisição de gente logada com permissão de administrar a escola. Não
 * há job de cron nem caminho anônimo na gestão de contas.
 */
export function dependenciasDeUsuarios(): DependenciasDeUsuarios {
  return {
    gestaoDeUsuarios: gestaoDeUsuariosRepository,
    emTransacao: executarEmTransacao,
    registrarAuditoria,
  }
}
