import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import {
  resolverConfiguracao,
  validarConfiguracao,
  type ConfiguracaoDaEscola,
  type OverrideDeSerie,
} from '@/modules/circulacao/configuracao'
import type { Principal } from '@/core/auth/principal'

export interface RepositorioDeConfiguracao {
  obterDaEscola(): Promise<ConfiguracaoDaEscola | null>
  gravarDaEscola(config: ConfiguracaoDaEscola): Promise<void>
  listarOverrides(): Promise<OverrideDeSerie[]>
  gravarOverride(override: OverrideDeSerie): Promise<void>
  removerOverride(serie: string): Promise<void>
}

export interface DependenciasDeConfiguracao {
  configuracao: RepositorioDeConfiguracao
}

/**
 * Padrão usado enquanto a coordenação não configurou nada.
 *
 * A biblioteca precisa emprestar no primeiro dia, antes de alguém abrir a
 * tela de configuração. Os números são conservadores de propósito: errar
 * para menos atrapalha um aluno, errar para mais some com o acervo.
 */
export const CONFIGURACAO_PADRAO: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 2,
  maximoDeRenovacoes: 1,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

const CAMPOS_DO_OVERRIDE = [
  'prazoEmDias',
  'limiteSimultaneo',
  'maximoDeRenovacoes',
  'diasDeSuspensaoPorDiaDeAtraso',
  'prazoDeRetiradaEmDias',
  'alunoPodeReservar',
] as const

export class OverrideVazioError extends ErroDeDominio {
  constructor() {
    super(
      'Este ajuste de série não muda nada. Preencha ao menos um campo — ' +
        'senão ele aparece configurado na tela e não tem efeito.',
      'OVERRIDE_VAZIO',
    )
  }
}

export async function definirConfiguracaoDaEscola(
  principal: Principal,
  config: ConfiguracaoDaEscola,
  deps: DependenciasDeConfiguracao,
): Promise<void> {
  exigirPermissao(principal, 'config:editar')

  // Validar ANTES de gravar. Gravar e só então validar deixaria a
  // biblioteca com limite 0 até alguém perceber — e o sintoma seria
  // "todo aluno está no limite", que ninguém liga à tela de configuração.
  validarConfiguracao(config)

  await deps.configuracao.gravarDaEscola(config)
}

export async function definirOverrideDeSerie(
  principal: Principal,
  override: OverrideDeSerie,
  deps: DependenciasDeConfiguracao,
): Promise<void> {
  exigirPermissao(principal, 'config:editar')

  const serie = override.serie.trim()
  if (!serie) throw new ErroDeDominio('Informe a série.', 'SERIE_OBRIGATORIA')

  const informados = CAMPOS_DO_OVERRIDE.filter((campo) => override[campo] !== undefined)
  if (informados.length === 0) throw new OverrideVazioError()

  // O override é validado pelas MESMAS regras da escola: um limite 0 aqui
  // bloqueia aquela série inteira, com o mesmo sintoma e a mesma
  // dificuldade de diagnosticar. Os campos ausentes são preenchidos com o
  // padrão só para a validação — não são gravados.
  validarConfiguracao({ ...CONFIGURACAO_PADRAO, ...semSerie(override) })

  await deps.configuracao.gravarOverride({ ...override, serie })
}

export async function removerOverrideDeSerie(
  principal: Principal,
  serie: string,
  deps: DependenciasDeConfiguracao,
): Promise<void> {
  exigirPermissao(principal, 'config:editar')
  await deps.configuracao.removerOverride(serie)
}

/**
 * A configuração que vale para uma série.
 *
 * Exige apenas `obra:ver`: o balcão precisa dela para calcular o prazo, e
 * exigir permissão de EDIÇÃO para LER impediria o monitor de emprestar.
 */
export async function obterConfiguracaoEfetiva(
  principal: Principal,
  serie: string | null,
  deps: DependenciasDeConfiguracao,
): Promise<ConfiguracaoDaEscola> {
  exigirPermissao(principal, 'obra:ver')

  const [daEscola, overrides] = await Promise.all([
    deps.configuracao.obterDaEscola(),
    deps.configuracao.listarOverrides(),
  ])

  return resolverConfiguracao(serie, daEscola ?? CONFIGURACAO_PADRAO, overrides)
}

export async function listarOverrides(
  principal: Principal,
  deps: DependenciasDeConfiguracao,
): Promise<OverrideDeSerie[]> {
  exigirPermissao(principal, 'obra:ver')
  return deps.configuracao.listarOverrides()
}

function semSerie(override: OverrideDeSerie): Partial<ConfiguracaoDaEscola> {
  const copia: Record<string, unknown> = { ...override }
  delete copia.serie
  return copia as Partial<ConfiguracaoDaEscola>
}
