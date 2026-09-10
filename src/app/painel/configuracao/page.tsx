import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Faixa } from '@/components/ui/faixa'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { SemPermissaoError } from '@/core/errors'
import { temPermissao } from '@/core/rbac/verificar'
import { dependenciasDaCirculacao } from '@/modules/circulacao/circulacao.deps'
import { listarDiasNaoLetivos } from '@/modules/circulacao/calendario.service'
import {
  listarOverrides,
  obterConfiguracaoEfetiva,
} from '@/modules/circulacao/configuracao.service'
import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'
import { AjustesPorSerie } from './ajustes-por-serie'
import { agruparPorMes, type MesNaoLetivo } from './calendario-na-tela'
import { formularioDaConfiguracao, resumirConfiguracao } from './configuracao-na-tela'
import { DiasNaoLetivos } from './dias-nao-letivos'
import { RegrasDaEscola } from './regras-da-escola'
import { ValoresEmVigor } from './valores-em-vigor'

export const runtime = 'nodejs'

interface DadosDaTela {
  daEscola: ConfiguracaoDaEscola | null
  overrides: OverrideDeSerie[] | null
  meses: MesNaoLetivo[] | null
  /**
   * Se esta pessoa pode salvar. Não é autorização — quem autoriza é o
   * serviço, que exige `config:editar` e recusa a Server Action venha ela
   * de onde vier. Serve para a tela não desenhar botão que o serviço vai
   * negar, e para quem só opera o balcão ainda poder LER o prazo.
   */
  podeEditar: boolean
  recusa: string | null
}

/**
 * Configuração da circulação.
 *
 * Três blocos, na ordem em que a coordenação pensa: as regras da escola,
 * os ajustes por série que sobrescrevem campo a campo, e o calendário de
 * dias não letivos que o cálculo do prazo consulta.
 *
 * Componente de servidor: as três consultas rodam na requisição, com o
 * `Principal` da sessão, e nada de banco atravessa para o navegador. As
 * escritas moram em Server Actions.
 *
 * `<main>` próprio: a casca do painel entrega um `<div>`, e é aqui que o
 * conteúdo principal começa.
 */
export default async function PaginaDeConfiguracao() {
  const dados: DadosDaTela = await comStaffNoTenant(async (principal) => {
    const deps = dependenciasDaCirculacao()

    try {
      // `null` como série pede a configuração da ESCOLA — é a base que os
      // ajustes por série sobrescrevem, e é contra ela que a tela diz o
      // que é herdado.
      const [daEscola, overrides, dias] = await Promise.all([
        obterConfiguracaoEfetiva(principal, null, deps),
        listarOverrides(principal, deps),
        listarDiasNaoLetivos(principal, deps),
      ])

      return {
        daEscola,
        overrides,
        // O serviço devolve um `Set` para o cálculo do prazo. A tela
        // ordena e agrupa por mês — por texto, sem `Date` no caminho.
        meses: agruparPorMes([...dias]),
        podeEditar: temPermissao(principal, 'config:editar'),
        recusa: null,
      }
    } catch (erro) {
      // Quem não tem nem `obra:ver` alcança a URL digitando. Sem este
      // ramo a recusa do serviço sairia como erro 500 — e um 500 não diz
      // à pessoa que ela está na tela errada, diz que o sistema quebrou.
      if (erro instanceof SemPermissaoError) {
        return {
          daEscola: null,
          overrides: null,
          meses: null,
          podeEditar: false,
          recusa: erro.message,
        }
      }
      throw erro
    }
  })

  return (
    <main className="px-8 py-6">
      <CabecalhoDeTela
        titulo="Configuração da circulação"
        descricao={
          dados.daEscola === null ? (
            'As regras de empréstimo, os ajustes por série e o calendário da escola.'
          ) : (
            <>
              Vale hoje na escola:{' '}
              <span className="text-tinta">{resumirConfiguracao(dados.daEscola)}</span>
            </>
          )
        }
      />

      {dados.recusa !== null || dados.daEscola === null || dados.overrides === null || dados.meses === null ? (
        <div className="mt-[18px] max-w-[620px]">
          <Faixa tom="erro" titulo="Esta tela é de quem configura a biblioteca.">
            {dados.recusa === null
              ? 'Não foi possível ler a configuração da escola.'
              : dados.recusa}{' '}
            Fale com a coordenação se você precisa mudar prazo, limite ou calendário.
          </Faixa>
        </div>
      ) : (
        <div className="mt-[18px] flex max-w-[1120px] flex-col gap-5">
          {/* A frase mais importante da tela, e ela vem ANTES dos campos:
              a coordenação muda o prazo esperando que os atrasados de hoje
              mudem, e conclui que o sistema não funciona quando eles não
              mudam. Recalcular seria pior — mudaria a data que já foi
              combinada em voz alta com o aluno no balcão. */}
          <Faixa tom="atencao" icone="info" titulo="Mudança vale para o próximo empréstimo.">
            Alterar prazo, limite, renovação, penalidade ou calendário{' '}
            <strong>não recalcula nada que já está em mãos do aluno</strong>. Os empréstimos em
            curso mantêm a data combinada na retirada, inclusive os que já estão atrasados.
          </Faixa>

          {dados.podeEditar ? (
            <RegrasDaEscola inicial={formularioDaConfiguracao(dados.daEscola)} />
          ) : (
            <>
              <Faixa tom="atencao" icone="info" titulo="Você pode ver, mas não mudar.">
                Mudar as regras da circulação depende da permissão de configuração da escola.
              </Faixa>
              <ValoresEmVigor config={dados.daEscola} />
            </>
          )}

          <AjustesPorSerie
            daEscola={dados.daEscola}
            overrides={dados.overrides}
            podeEditar={dados.podeEditar}
          />

          <DiasNaoLetivos meses={dados.meses} podeEditar={dados.podeEditar} />
        </div>
      )}
    </main>
  )
}
