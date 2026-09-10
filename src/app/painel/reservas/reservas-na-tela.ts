import type { ExemplarSeparado } from '@/modules/circulacao/painel-do-balcao.service'
import type { FilaDaObra, PessoaNaFila } from '@/modules/circulacao/fila-de-reservas.service'

/**
 * A lógica da tela de reservas, em módulo puro — sem React e sem
 * servidor.
 *
 * Existe separado porque as três decisões daqui são as que a operadora
 * age em cima, e provar cada uma custa milissegundos:
 *
 *  1. **o que vence hoje** — a fronteira é a MESMA do cron, senão a tela
 *     promete um exemplar que já voltou para a estante;
 *  2. **para quem a vez passa** — quando o prazo vence, o cron leva o
 *     exemplar ao próximo da fila; a tela tem de dizer quem é ANTES,
 *     porque é a operadora que avisa o aluno;
 *  3. **se ainda pode renovar** — quem decide de verdade é
 *     `renovar.service.ts`; aqui é só para o botão não convidar a
 *     operadora a tentar o que a série já não permite.
 */

export type SituacaoDaRetirada =
  | { tipo: 'VENCIDO'; diasVencidos: number }
  | { tipo: 'VENCE_HOJE' }
  | { tipo: 'NO_PRAZO'; diasRestantes: number }

/**
 * Traduz o item da prateleira em uma das TRÊS situações possíveis.
 *
 * Os três campos (`vencido`, `venceHoje`, `diasParaRetirar`) saem do
 * mesmo cálculo em `listarPrateleiraDeSeparados`. Conferir se eles
 * concordam parece redundante e não é: é o que garante que a tela nunca
 * escreva "ainda dá tempo" ao lado de um prazo que o cron já expirou.
 */
export function classificarRetirada(item: ExemplarSeparado): SituacaoDaRetirada {
  if (item.vencido && item.venceHoje) {
    throw new Error(
      `Reserva ${item.reservaId} veio marcada como vencida E vencendo hoje. ` +
        'São situações excludentes: uma manda avisar o próximo da fila, a outra ' +
        'manda esperar o aluno até o fim do dia.',
    )
  }

  // Parênteses obrigatórios: `a !== b === c` associa à esquerda e viraria
  // `(a !== b) === c`, comparando booleano com número — condição sempre
  // falsa, guarda morta, e ninguém veria porque o teste do outro
  // sinalizador continuaria verde.
  if (
    item.vencido !== item.diasParaRetirar < 0 ||
    item.venceHoje !== (item.diasParaRetirar === 0)
  ) {
    throw new Error(
      `Reserva ${item.reservaId} tem sinalizador de prazo divergente da contagem de dias ` +
        `(${item.diasParaRetirar} dia(s), vencido=${item.vencido}, venceHoje=${item.venceHoje}).`,
    )
  }

  if (item.vencido) return { tipo: 'VENCIDO', diasVencidos: -item.diasParaRetirar }
  if (item.venceHoje) return { tipo: 'VENCE_HOJE' }
  return { tipo: 'NO_PRAZO', diasRestantes: item.diasParaRetirar }
}

/**
 * O que acontece com o exemplar se quem reservou não vier buscar.
 *
 * `INDETERMINADO` não é "não sei e tanto faz": é a tela se recusando a
 * afirmar. Acontece quando a reserva da prateleira não aparece em fila
 * nenhuma — as duas consultas leram momentos diferentes — e chutar
 * "volta à estante" faria a tela contradizer o que o cron vai fazer.
 */
export type DestinoDoExemplar =
  | { tipo: 'PASSA_ADIANTE'; nome: string }
  | { tipo: 'VOLTA_A_ESTANTE' }
  | { tipo: 'INDETERMINADO' }

export interface LinhaDaPrateleira {
  item: ExemplarSeparado
  situacao: SituacaoDaRetirada
  destino: DestinoDoExemplar
}

export interface PrateleiraNaTela {
  /** Prazo já passado. Continuam na prateleira: o livro está lá. */
  vencidas: LinhaDaPrateleira[]
  vencemHoje: LinhaDaPrateleira[]
  noPrazo: LinhaDaPrateleira[]
  /** Quantos livros estão fisicamente guardados atrás do balcão. */
  total: number
}

/**
 * A prateleira em três grupos, cada linha sabendo para quem a vez passa.
 *
 * A ordem dentro de cada grupo é a que veio do serviço — prazo mais curto
 * em cima —, e não uma segunda ordenação aqui.
 *
 * O destino é atribuído CONSUMINDO a fila, cópia por cópia, na ordem da
 * prateleira: é o que o cron faz quando dois prazos vencem na mesma
 * noite (uma transação por reserva, na ordem do prazo, cada uma pegando
 * o próximo que espera). Nomear o mesmo aluno em duas linhas faria a
 * operadora avisar um duas vezes e esquecer o outro.
 */
export function montarPrateleira(
  prateleira: ExemplarSeparado[],
  filas: FilaDaObra[],
): PrateleiraNaTela {
  const obraPorReserva = new Map<string, string>()
  const esperandoPorObra = new Map<string, string[]>()

  for (const fila of filas) {
    for (const pessoa of fila.pessoas) {
      obraPorReserva.set(pessoa.reservaId, fila.obraId)
    }
    esperandoPorObra.set(
      fila.obraId,
      fila.pessoas.filter((p) => p.status === 'AGUARDANDO').map((p) => p.nomeDoLeitor),
    )
  }

  const linhas = prateleira.map((item): LinhaDaPrateleira => {
    const situacao = classificarRetirada(item)
    return { item, situacao, destino: destinoDoExemplar(item, obraPorReserva, esperandoPorObra) }
  })

  return {
    vencidas: linhas.filter((l) => l.situacao.tipo === 'VENCIDO'),
    vencemHoje: linhas.filter((l) => l.situacao.tipo === 'VENCE_HOJE'),
    noPrazo: linhas.filter((l) => l.situacao.tipo === 'NO_PRAZO'),
    total: linhas.length,
  }
}

function destinoDoExemplar(
  item: ExemplarSeparado,
  obraPorReserva: Map<string, string>,
  esperandoPorObra: Map<string, string[]>,
): DestinoDoExemplar {
  const obraId = obraPorReserva.get(item.reservaId)
  if (obraId === undefined) return { tipo: 'INDETERMINADO' }

  const naFila = esperandoPorObra.get(obraId)
  if (naFila === undefined) return { tipo: 'INDETERMINADO' }

  // `shift` de propósito: a fila é consumida. A segunda cópia vencida da
  // mesma obra vai para a segunda pessoa que espera.
  const proximo = naFila.shift()
  if (proximo === undefined) return { tipo: 'VOLTA_A_ESTANTE' }

  return { tipo: 'PASSA_ADIANTE', nome: proximo }
}

/**
 * Quem leva a próxima cópia que voltar — o primeiro que ainda ESPERA.
 *
 * Não é `pessoas[0]`: quem está no topo da fila costuma ser justamente
 * quem já tem exemplar separado no balcão, e a vez dele já chegou.
 * Apontá-lo como "o próximo" faria a operadora avisar quem não precisa
 * de aviso e deixar sem aviso quem precisa.
 */
export function proximoDaFila(fila: FilaDaObra): PessoaNaFila | null {
  const esperando = fila.pessoas.find((pessoa) => pessoa.status === 'AGUARDANDO')
  return esperando === undefined ? null : esperando
}

export type SituacaoDaRenovacao =
  | { pode: true; restantes: number }
  | { pode: false; motivo: string }

/**
 * Se a série ainda permite renovar este empréstimo.
 *
 * **Não é autorização.** Quem decide é `renovar`, no serviço, que checa
 * também a fila da obra, a suspensão do leitor e a corrida com a
 * devolução no balcão. Isto aqui existe para o botão não convidar a
 * operadora a tentar na frente do aluno o que a série já não permite —
 * e, quando pode, para dizer quantas sobram.
 */
export function avaliarRenovacao(
  renovacoesJaFeitas: number,
  maximoDeRenovacoes: number,
): SituacaoDaRenovacao {
  // A configuração vem do banco e pode chegar quebrada. Sem esta guarda,
  // um NaN passaria por aqui em silêncio: `0 >= NaN` é falso, e a tela
  // liberaria renovação sem limite justamente onde o limite se perdeu.
  if (!Number.isInteger(maximoDeRenovacoes) || maximoDeRenovacoes < 0) {
    throw new Error(
      `Máximo de renovações inválido: ${maximoDeRenovacoes}. ` +
        'Só inteiro não negativo limita renovação.',
    )
  }
  if (!Number.isInteger(renovacoesJaFeitas) || renovacoesJaFeitas < 0) {
    throw new Error(
      `Renovações já feitas inválidas: ${renovacoesJaFeitas}. ` +
        'A contagem vem do empréstimo e é sempre inteira e não negativa.',
    )
  }

  // Zero não é "acabaram as renovações": nunca houve nenhuma. A frase
  // errada mandaria a operadora procurar um limite que não existe.
  if (maximoDeRenovacoes === 0) {
    return { pode: false, motivo: 'A coordenação não permite renovação para esta série.' }
  }

  if (renovacoesJaFeitas >= maximoDeRenovacoes) {
    return {
      pode: false,
      motivo: `Já renovado ${maximoDeRenovacoes} vez(es), que é o máximo desta série.`,
    }
  }

  return { pode: true, restantes: maximoDeRenovacoes - renovacoesJaFeitas }
}
