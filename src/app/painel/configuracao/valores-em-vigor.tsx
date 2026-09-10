import type { ReactElement } from 'react'
import { CabecalhoDeCartao, Cartao } from '@/components/ui/cartao'
import { Icone } from '@/components/ui/icones'
import { Celula, CelulaDeTitulo, Tabela } from '@/components/ui/tabela'
import type { ConfiguracaoDaEscola } from '@/modules/circulacao/configuracao'
import { CAMPOS_DA_CONFIGURACAO, DESCRICOES, formatarValor } from './configuracao-na-tela'

/**
 * As regras da escola só para LER.
 *
 * É o que aparece para quem opera o balcão mas não configura a escola:
 * mostrar o formulário com um botão que o serviço vai recusar seria
 * desenhar botão morto, e esconder tudo deixaria o monitor sem saber por
 * que o prazo é de 14 dias. Quem autoriza continua sendo o serviço —
 * isto aqui é sobre não mentir na tela.
 */
export function ValoresEmVigor({ config }: { config: ConfiguracaoDaEscola }): ReactElement {
  return (
    <Cartao semPadding>
      <CabecalhoDeCartao>
        <span className="text-tinta-3">
          <Icone nome="ajustes" tamanho={20} traco={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-semibold text-tinta">Regras da escola</h2>
          <p className="text-[12.5px] text-tinta-2">o que vale hoje para quem não tem ajuste</p>
        </div>
      </CabecalhoDeCartao>

      <div className="overflow-x-auto px-[22px] py-4">
        <Tabela>
          <thead>
            <tr>
              <CelulaDeTitulo>Regra</CelulaDeTitulo>
              <CelulaDeTitulo>Vale hoje</CelulaDeTitulo>
              <CelulaDeTitulo>O que isso faz</CelulaDeTitulo>
            </tr>
          </thead>
          <tbody>
            {CAMPOS_DA_CONFIGURACAO.map((campo) => (
              <tr key={campo}>
                <Celula className="text-tinta-2">{DESCRICOES[campo].rotulo}</Celula>
                <Celula className="font-semibold text-tinta">
                  {formatarValor(campo, config[campo])}
                </Celula>
                <Celula className="max-w-[520px] text-[12.5px] text-tinta-2">
                  {DESCRICOES[campo].ajuda}
                </Celula>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </div>
    </Cartao>
  )
}
