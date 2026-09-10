import { executarEmTransacao } from '@/core/db/tenant-extension'
import { alunosRepository } from '@/modules/leitores/alunos.repository'
import { turmasRepository } from '@/modules/leitores/turmas.repository'
import { anosLetivosRepository } from '@/modules/leitores/anos-letivos.repository'
import type { DependenciasDeAlunos } from '@/modules/leitores/alunos.service'

/**
 * Ponto de composição dos leitores.
 *
 * Existe para que as rotas nunca importem um `*.repository.ts` — a
 * Global Constraint 1 proíbe, e há gate no CI. A rota pede o pacote
 * pronto e passa adiante; quem sabe montar é este módulo.
 *
 * É UMA função só, e não três: aluno, turma e ano letivo são lidos na
 * MESMA requisição em todas as telas deste módulo — o formulário de aluno
 * precisa da lista de turmas, e a lista de turmas precisa do ano letivo
 * ao lado. Três pacotes obrigariam a rota a montar três para desenhar uma
 * tela. `DependenciasDeAlunos` já estende as de turma, que estendem as de
 * ano letivo, então este tipo cobre os três serviços.
 */
export function dependenciasDeLeitores(): DependenciasDeAlunos {
  return {
    alunos: alunosRepository,
    turmas: turmasRepository,
    anosLetivos: anosLetivosRepository,
    emTransacao: executarEmTransacao,
  }
}
