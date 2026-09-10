import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'

export interface RepositorioDoCalendario {
  /** Os dias não letivos, em aaaa-mm-dd, para o cálculo do prazo. */
  listar(): Promise<Set<string>>
  marcar(dataIso: string, motivo: string): Promise<void>
  desmarcar(dataIso: string): Promise<void>
}

export interface DependenciasDoCalendario {
  calendario: RepositorioDoCalendario
}

// Um período de mais de um ano só pode ser engano de digitação, e o
// estrago aparece no balcão: o cálculo do prazo não acha dia letivo e
// falha com o aluno esperando.
const MAXIMO_DE_DIAS_POR_PERIODO = 366

export class DataInvalidaError extends ErroDeDominio {
  constructor(readonly informada: string) {
    super(`"${informada}" não é uma data válida. Use o formato aaaa-mm-dd.`, 'DATA_INVALIDA')
  }
}

export class PeriodoInvalidoError extends ErroDeDominio {
  constructor(mensagem: string) {
    super(mensagem, 'PERIODO_INVALIDO')
  }
}

export async function marcarDiaNaoLetivo(
  principal: Principal,
  entrada: { data: string; motivo: string },
  deps: DependenciasDoCalendario,
): Promise<void> {
  exigirPermissao(principal, 'config:editar')

  const data = exigirDataIso(entrada.data)
  const motivo = entrada.motivo.trim()
  if (!motivo) {
    // Um dia bloqueado sem motivo vira mistério: meses depois ninguém
    // sabe se foi feriado, recesso ou engano — e ninguém ousa apagar.
    throw new ErroDeDominio('Informe o motivo do dia não letivo.', 'MOTIVO_OBRIGATORIO')
  }

  await deps.calendario.marcar(data, motivo)
}

/**
 * Marca um período inteiro.
 *
 * Recesso e férias são digitados como período. Exigir dia a dia faria a
 * coordenação marcar julho em trinta cliques — e desistir no décimo,
 * deixando o calendário pela metade, que é pior que não ter calendário.
 */
export async function marcarPeriodoNaoLetivo(
  principal: Principal,
  entrada: { de: string; ate: string; motivo: string },
  deps: DependenciasDoCalendario,
): Promise<void> {
  exigirPermissao(principal, 'config:editar')

  const de = exigirDataIso(entrada.de)
  const ate = exigirDataIso(entrada.ate)
  const motivo = entrada.motivo.trim()
  if (!motivo) {
    throw new ErroDeDominio('Informe o motivo do período não letivo.', 'MOTIVO_OBRIGATORIO')
  }

  if (ate < de) {
    throw new PeriodoInvalidoError('A data final do período é anterior à inicial.')
  }

  const dias = diasEntre(de, ate)
  if (dias.length > MAXIMO_DE_DIAS_POR_PERIODO) {
    throw new PeriodoInvalidoError(
      `O período tem ${dias.length} dias, o que só pode ser engano. ` +
        `O máximo é ${MAXIMO_DE_DIAS_POR_PERIODO}.`,
    )
  }

  for (const dia of dias) {
    await deps.calendario.marcar(dia, motivo)
  }
}

export async function desmarcarDiaNaoLetivo(
  principal: Principal,
  dataIso: string,
  deps: DependenciasDoCalendario,
): Promise<void> {
  exigirPermissao(principal, 'config:editar')
  // Desmarcar um dia que não estava marcado não é erro: é o resultado
  // que a operadora queria, e recusar seria burocracia sem função.
  await deps.calendario.desmarcar(exigirDataIso(dataIso))
}

export async function listarDiasNaoLetivos(
  principal: Principal,
  deps: DependenciasDoCalendario,
): Promise<Set<string>> {
  exigirPermissao(principal, 'obra:ver')
  return deps.calendario.listar()
}

/**
 * Valida a data COMPONENTE A COMPONENTE.
 *
 * `new Date('2026-02-31')` não estoura: vira 3 de março. A escola
 * ficaria com um dia fechado que ninguém marcou, e o prazo de todo mundo
 * sairia empurrado sem explicação.
 */
function exigirDataIso(bruto: string): string {
  const texto = bruto.trim()
  const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!partes) throw new DataInvalidaError(bruto)

  const ano = Number(partes[1])
  const mes = Number(partes[2])
  const dia = Number(partes[3])

  if (mes < 1 || mes > 12) throw new DataInvalidaError(bruto)
  if (dia < 1 || dia > new Date(Date.UTC(ano, mes, 0)).getUTCDate()) {
    throw new DataInvalidaError(bruto)
  }

  return texto
}

function diasEntre(de: string, ate: string): string[] {
  const dias: string[] = []
  const fim = new Date(`${ate}T00:00:00.000Z`).getTime()
  let atual = new Date(`${de}T00:00:00.000Z`)

  while (atual.getTime() <= fim) {
    dias.push(atual.toISOString().slice(0, 10))
    atual = new Date(
      Date.UTC(atual.getUTCFullYear(), atual.getUTCMonth(), atual.getUTCDate() + 1),
    )
    // Guarda contra período gigante: o teto real é checado pelo chamador,
    // mas o laço não pode crescer sem limite enquanto ele não checa.
    if (dias.length > MAXIMO_DE_DIAS_POR_PERIODO + 1) break
  }

  return dias
}
