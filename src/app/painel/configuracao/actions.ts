'use server'

import { revalidatePath } from 'next/cache'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { ErroDeDominio } from '@/core/errors'
import { dependenciasDaCirculacao } from '@/modules/circulacao/circulacao.deps'
import {
  definirConfiguracaoDaEscola,
  definirOverrideDeSerie,
  removerOverrideDeSerie,
} from '@/modules/circulacao/configuracao.service'
import {
  desmarcarDiaNaoLetivo,
  marcarDiaNaoLetivo,
  marcarPeriodoNaoLetivo,
} from '@/modules/circulacao/calendario.service'
import { escreverDiaIso, interpretarDiaDigitado } from './calendario-na-tela'
import {
  montarConfiguracaoDaEscola,
  montarOverrideDeSerie,
  resumirConfiguracao,
  type ErrosPorCampo,
  type FormularioDaEscola,
  type FormularioDaSerie,
} from './configuracao-na-tela'

/**
 * As Server Actions da tela de configuração da circulação.
 *
 * Quem lê a sessão é esta camada, com `comStaffNoTenant`; quem autoriza é
 * o serviço, que recebe o `Principal` por parâmetro e exige
 * `config:editar` (decisão 13). A tela nunca vê repositório,
 * `@prisma/client` nem `@/core/db` — há gate no CI.
 *
 * A tela também não valida faixa. O texto do formulário vira número aqui
 * (é a única conversão, e é provada em `configuracao-na-tela.ts`) e o
 * resto é do domínio: piso, teto, "precisa ser inteiro", série vazia,
 * override que não muda nada e dia inexistente chegam como `ErroDeDominio`
 * e a frase do serviço é o que a coordenação lê.
 */

/** A rota que se recarrega depois de qualquer escrita desta tela. */
const ROTA = '/painel/configuracao'

/**
 * A frase que acompanha toda mudança de regra.
 *
 * Sem ela a coordenação muda o prazo esperando que os atrasados de hoje
 * mudem — e conclui que o sistema não funciona quando eles não mudam.
 * Recalcular empréstimo em curso seria pior: mudaria a data que já foi
 * combinada em voz alta com o aluno no balcão.
 */
const VALE_DAQUI_PARA_FRENTE =
  'Vale para os próximos empréstimos. Os que já estão em mãos mantêm a data combinada com o ' +
  'aluno — nada é recalculado para trás.'

export type RespostaComCampos =
  | { ok: true; aviso: string }
  | { ok: false; erro: string; porCampo: ErrosPorCampo }

export type RespostaSimples = { ok: true; aviso: string } | { ok: false; erro: string }

export async function salvarRegrasDaEscolaAction(
  form: FormularioDaEscola,
): Promise<RespostaComCampos> {
  const montada = montarConfiguracaoDaEscola(form)
  if (!montada.ok) {
    return {
      ok: false,
      erro: 'Confira os campos marcados: nada foi salvo.',
      porCampo: montada.porCampo,
    }
  }

  try {
    await comStaffNoTenant((principal) =>
      definirConfiguracaoDaEscola(principal, montada.config, dependenciasDaCirculacao()),
    )

    // A tela é lida no servidor: sem recarregar, os ajustes por série
    // continuariam comparando com o valor ANTIGO da escola e diriam
    // "herdado" ao lado de um número que já não existe.
    revalidatePath(ROTA)

    return {
      ok: true,
      aviso: `Agora vale: ${resumirConfiguracao(montada.config)}. ${VALE_DAQUI_PARA_FRENTE}`,
    }
  } catch (erro) {
    // A recusa de faixa do domínio entra aqui e sai como a frase DELE. Ela
    // não é de campo nenhum de propósito: repetir a regra em cima do campo
    // exigiria uma segunda cópia do piso e do teto nesta camada.
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message, porCampo: {} }
    throw erro
  }
}

export async function salvarAjusteDeSerieAction(
  form: FormularioDaSerie,
): Promise<RespostaComCampos> {
  const montada = montarOverrideDeSerie(form)
  if (!montada.ok) {
    return {
      ok: false,
      erro: 'Confira os campos marcados: nada foi salvo.',
      porCampo: montada.porCampo,
    }
  }

  try {
    await comStaffNoTenant((principal) =>
      definirOverrideDeSerie(principal, montada.override, dependenciasDaCirculacao()),
    )

    revalidatePath(ROTA)

    return {
      ok: true,
      aviso: `Ajuste de ${montada.override.serie.trim()} salvo. ${VALE_DAQUI_PARA_FRENTE}`,
    }
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message, porCampo: {} }
    throw erro
  }
}

export async function removerAjusteDeSerieAction(serie: string): Promise<RespostaSimples> {
  try {
    await comStaffNoTenant((principal) =>
      removerOverrideDeSerie(principal, serie, dependenciasDaCirculacao()),
    )

    revalidatePath(ROTA)

    return {
      ok: true,
      aviso: `${serie} voltou a seguir as regras da escola em todos os campos.`,
    }
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

/**
 * Marca um dia não letivo.
 *
 * A data viaja como TEXTO `aaaa-mm-dd`, do campo até o serviço, sem
 * passar por `Date`. Converter pelo fuso do navegador faria o feriado
 * marcado na secretaria cair no dia anterior no servidor — e o prazo de
 * todo mundo sairia empurrado sem explicação.
 */
export async function marcarDiaNaoLetivoAction(entrada: {
  data: string
  motivo: string
}): Promise<RespostaSimples> {
  const dia = interpretarDiaDigitado(entrada.data)
  if (!dia.ok) return { ok: false, erro: dia.erro }

  try {
    await comStaffNoTenant((principal) =>
      // O motivo vai cru: quem exige e quem apara é o serviço.
      marcarDiaNaoLetivo(
        principal,
        { data: dia.dia, motivo: entrada.motivo },
        dependenciasDaCirculacao(),
      ),
    )

    revalidatePath(ROTA)

    // A confirmação sai em dd/mm/aaaa, que é como a escola escreve — e
    // pela mesma função de recorte de texto, sem `Date` no caminho.
    return { ok: true, aviso: `${escreverDiaIso(dia.dia)} marcado como dia não letivo.` }
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

/**
 * Marca um período inteiro — recesso, férias, semana de prova.
 *
 * Existe porque exigir dia a dia faria a coordenação marcar julho em
 * trinta cliques e desistir no décimo, deixando o calendário pela metade
 * — que é pior que não ter calendário.
 */
export async function marcarPeriodoNaoLetivoAction(entrada: {
  de: string
  ate: string
  motivo: string
}): Promise<RespostaSimples> {
  const de = interpretarDiaDigitado(entrada.de)
  if (!de.ok) return { ok: false, erro: `Data inicial: ${de.erro}` }

  const ate = interpretarDiaDigitado(entrada.ate)
  if (!ate.ok) return { ok: false, erro: `Data final: ${ate.erro}` }

  try {
    await comStaffNoTenant((principal) =>
      marcarPeriodoNaoLetivo(
        principal,
        { de: de.dia, ate: ate.dia, motivo: entrada.motivo },
        dependenciasDaCirculacao(),
      ),
    )

    revalidatePath(ROTA)

    return {
      ok: true,
      aviso:
        `Período de ${escreverDiaIso(de.dia)} a ${escreverDiaIso(ate.dia)} marcado como ` +
        'não letivo.',
    }
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}

export async function desmarcarDiaNaoLetivoAction(data: string): Promise<RespostaSimples> {
  const dia = interpretarDiaDigitado(data)
  if (!dia.ok) return { ok: false, erro: dia.erro }

  try {
    await comStaffNoTenant((principal) =>
      desmarcarDiaNaoLetivo(principal, dia.dia, dependenciasDaCirculacao()),
    )

    revalidatePath(ROTA)

    return { ok: true, aviso: `${escreverDiaIso(dia.dia)} voltou a ser dia letivo.` }
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { ok: false, erro: erro.message }
    throw erro
  }
}
