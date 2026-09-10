import { intervaloDoDiaDaEscola } from '@/modules/circulacao/prazo'

/**
 * "Hoje", do ponto de vista de quem está NA ESCOLA.
 *
 * Passar `new Date()` cru para o cálculo de atraso erraria por um dia
 * todas as noites: 21h em São Paulo já é o dia seguinte em UTC, e um
 * livro que vence hoje apareceria no celular do aluno como "atrasado há
 * 1 dia". Prazo errado no portal faz o aluno devolver atrasado confiando
 * na tela — e a culpa vira dele.
 *
 * O fuso da escola NÃO é redeclarado aqui de propósito: ele mora em
 * `prazo.ts` e é uma constante única para todo o sistema. Uma segunda
 * cópia faria o portal e o balcão discordarem sobre que dia é hoje, cada
 * um no seu arquivo.
 *
 * O que volta é o INSTANTE em que a meia-noite da escola aconteceu
 * (03h00 UTC, com o deslocamento -03:00). O dia UTC desse instante é o
 * dia da escola — e é assim que as regras o comparam, porque todas elas
 * (`diasDeAtraso`, `avaliarBloqueios`, `calcularDataDeDevolucao`) leem
 * data por componente UTC.
 */
export function diaDeHojeNaEscola(agora: Date): Date {
  return intervaloDoDiaDaEscola(agora).inicio
}
