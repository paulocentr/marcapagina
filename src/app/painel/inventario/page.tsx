import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { dependenciasDoAcervo } from '@/modules/acervo/acervo.deps'
import { descreverLocalizacao, listarLocalizacoes } from '@/modules/acervo/localizacoes.service'
import { Conferir } from './conferir'

export const runtime = 'nodejs'

/**
 * A tela de conferência de acervo.
 *
 * As estantes vêm do servidor já escritas por extenso: o seletor de
 * escopo é a primeira coisa que a operadora usa, e um `<select>` que
 * aparece vazio por um instante enquanto carrega é um seletor que ela
 * abre antes de ter opção nenhuma. O resto da tela é cliente, porque
 * bipar é diálogo — cada tombo lido responde na hora, sem recarregar
 * página no meio da estante.
 */
export default async function PaginaDeInventario() {
  const localizacoes = await comStaffNoTenant(() =>
    listarLocalizacoes(dependenciasDoAcervo()),
  )

  return (
    <main className="px-8 py-6">
      <CabecalhoDeTela
        titulo="Conferência de acervo"
        descricao="Bipe tombo por tombo com a estante na frente — o cursor volta sozinho para o campo."
      />

      <Conferir
        localizacoes={localizacoes.map((localizacao) => ({
          id: localizacao.id,
          caminho: descreverLocalizacao(localizacao),
        }))}
      />
    </main>
  )
}
