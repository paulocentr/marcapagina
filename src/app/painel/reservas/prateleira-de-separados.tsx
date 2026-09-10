import type { ReactElement, ReactNode } from 'react'
import { Cartao, CabecalhoDeCartao } from '@/components/ui/cartao'
import { Chip } from '@/components/ui/chip'
import { Tombo } from '@/components/ui/codigo'
import { Faixa, FaixaDaFita } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import { BotaoDeCancelar } from './botao-de-cancelar'
import { ChipDeRetirada } from './chips-da-reserva'
import type {
  DestinoDoExemplar,
  LinhaDaPrateleira,
  PrateleiraNaTela,
  SituacaoDaRetirada,
} from './reservas-na-tela'

/**
 * A prateleira física: o que está guardado atrás do balcão esperando quem
 * reservou.
 *
 * Três grupos, e o que vence primeiro em cima de cada um. O grupo dos
 * vencidos abre a lista de propósito: é o único em que a operadora tem
 * algo a FAZER hoje — avisar quem herdou a vez, ou pôr o livro de volta
 * na estante depois de o sistema virar o dia.
 *
 * A fita terracota abre o cartão porque é a regra que a prateleira
 * inteira serve: exemplar reservado não volta para a estante. Devolvê-lo
 * à estante trava a fila — o próximo continua esperando por um livro que
 * já está lá, disponível para o primeiro que aparecer.
 */
export function PrateleiraDeSeparados({
  prateleira,
}: {
  prateleira: PrateleiraNaTela
}): ReactElement {
  return (
    <Cartao semPadding>
      <CabecalhoDeCartao>
        <span className="text-fita">
          <Icone nome="fita" tamanho={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-semibold text-tinta">
            Prateleira de separados
          </h2>
          <p className="text-[12.5px] text-tinta-2">
            {prateleira.total === 0
              ? 'nada guardado agora'
              : `${prateleira.total} livro(s) guardado(s) esperando quem reservou`}
          </p>
        </div>
      </CabecalhoDeCartao>

      <div className="px-[22px] py-5">
        {prateleira.total === 0 ? (
          <p className="text-[13.5px] text-tinta-2">
            Nada separado agora. Quando um exemplar reservado for devolvido, ele aparece aqui
            com o nome de quem esperou e o prazo para vir buscar.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <FaixaDaFita titulo="Estes exemplares não voltam para a estante">
              Cada um está guardado para o leitor nomeado abaixo. Devolvido à estante, ele fica
              disponível para o primeiro que aparecer no balcão — e quem esperou na fila
              continua esperando.{' '}
              {/* Não há botão de "entregar" aqui de propósito: quem entrega
                  é o empréstimo, e é ele que fecha a reserva. Um segundo
                  caminho para a mesma entrega deixaria a reserva atendida
                  sem empréstimo gravado — livro fora da estante e fora da
                  ficha de ninguém. */}
              <strong>Para entregar, bipe o tombo no Balcão:</strong> o empréstimo encerra a
              reserva sozinho.
            </FaixaDaFita>

            {prateleira.vencidas.length > 0 && (
              <Grupo
                rotulo={`Prazo vencido · ${prateleira.vencidas.length}`}
                linhas={prateleira.vencidas}
                aviso={
                  <Faixa tom="atencao" titulo="O prazo passou e o livro continua na prateleira.">
                    E deve continuar: ele está fisicamente aí. O sistema passa a vez sozinho na
                    virada do dia — até lá, cada linha diz para quem ela vai.
                  </Faixa>
                }
              />
            )}

            {prateleira.vencemHoje.length > 0 && (
              <Grupo
                rotulo={`Vence hoje · ${prateleira.vencemHoje.length}`}
                linhas={prateleira.vencemHoje}
                aviso={
                  <Faixa tom="atencao" titulo="Último dia para vir buscar.">
                    Quem vence hoje tem o dia inteiro. Amanhã o sistema passa a vez.
                  </Faixa>
                }
              />
            )}

            {prateleira.noPrazo.length > 0 && (
              <Grupo
                rotulo={`Ainda no prazo · ${prateleira.noPrazo.length}`}
                linhas={prateleira.noPrazo}
              />
            )}
          </div>
        )}
      </div>
    </Cartao>
  )
}

function Grupo({
  rotulo,
  linhas,
  aviso,
}: {
  rotulo: string
  linhas: LinhaDaPrateleira[]
  aviso?: ReactNode
}): ReactElement {
  return (
    <section className="flex flex-col gap-[10px]">
      <Rotulo tom="discreto">{rotulo}</Rotulo>
      {aviso}
      <ul className="flex flex-col">
        {linhas.map((linha) => (
          <LinhaNaPrateleira key={linha.item.reservaId} linha={linha} />
        ))}
      </ul>
    </section>
  )
}

function LinhaNaPrateleira({ linha }: { linha: LinhaDaPrateleira }): ReactElement {
  const { item, situacao, destino } = linha
  const oQueAcontece = fraseDoDestino(situacao, destino)

  return (
    <li className="flex flex-wrap items-start justify-between gap-4 border-b border-linha py-[13px] last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-tinta">{item.tituloDaObra}</div>

        <div className="mt-[2px] flex flex-wrap items-center gap-x-[7px] gap-y-1 text-[12.5px] text-tinta-2">
          <Tombo valor={item.tombo} tamanho="discreto" />
          <span aria-hidden="true">·</span>
          {/* Localização é opcional no acervo (etiquetagem gradual). Dizer
              "sem estante registrada" é diferente de deixar em branco: a
              operadora sabe que tem de procurar, em vez de achar que a
              tela perdeu o dado. */}
          <span>{item.localizacao === null ? 'sem estante registrada' : item.localizacao}</span>
        </div>

        <div className="mt-[3px] text-[13px] text-tinta">
          {item.nomeDoLeitor}
          <span className="text-tinta-2">
            {item.turma === null ? ' · sem turma' : ` · ${item.turma}`}
          </span>
        </div>

        {oQueAcontece !== null && (
          <p className="mt-[3px] text-[12.5px] text-atencao-texto">{oQueAcontece}</p>
        )}
      </div>

      <div className="flex flex-col items-end gap-[7px]">
        <div className="flex flex-wrap items-center justify-end gap-[6px]">
          {/* O estado do EXEMPLAR, com a fita — o mesmo chip que a ficha da
              obra mostra. Ao lado dele, o prazo, que é outra informação. */}
          <Chip estado="SEPARADO_PARA_RESERVA" />
          <ChipDeRetirada situacao={situacao} retirarAte={item.retirarAte} />
        </div>

        <BotaoDeCancelar
          reservaId={item.reservaId}
          nomeDoLeitor={item.nomeDoLeitor}
          comExemplarSeparado
        />
      </div>
    </li>
  )
}

/**
 * O que acontece com este exemplar se o leitor não vier buscar.
 *
 * `null` para quem ainda tem prazo: ali não há nada a fazer, e a frase
 * viraria ruído em cima da linha que está em ordem.
 *
 * `INDETERMINADO` não vira silêncio nem chute. A tela diz que não sabe —
 * prometer "volta à estante" quando o cron vai passar a vez para alguém é
 * o tipo de afirmação que a operadora repete para o aluno.
 */
function fraseDoDestino(
  situacao: SituacaoDaRetirada,
  destino: DestinoDoExemplar,
): string | null {
  if (situacao.tipo === 'NO_PRAZO') return null

  // O prazo vencido já passou: o que falta é o sistema virar o dia. O que
  // vence hoje ainda depende de o leitor não aparecer — e a frase tem de
  // dizer isso, senão a operadora avisa o próximo da fila com um dia de
  // antecedência e tira a vez de quem ainda ia buscar.
  const condicao = situacao.tipo === 'VENCIDO' ? 'A' : 'Se ele não vier hoje, a'
  const quando = situacao.tipo === 'VENCIDO' ? 'na virada do dia' : 'amanhã'

  switch (destino.tipo) {
    case 'PASSA_ADIANTE':
      return `${condicao} vez passa para ${destino.nome} ${quando}.`
    case 'VOLTA_A_ESTANTE':
      return `Ninguém mais espera por este título: o exemplar volta à estante ${quando}.`
    case 'INDETERMINADO':
      return 'Não consigo dizer quem herda a vez — a fila desta reserva não veio na consulta. Recarregue a tela.'
  }
}
