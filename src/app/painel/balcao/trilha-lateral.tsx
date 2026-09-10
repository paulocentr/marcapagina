'use client'

import type { ReactElement } from 'react'
import { Cartao } from '@/components/ui/cartao'
import { Chip } from '@/components/ui/chip'
import { Tombo } from '@/components/ui/codigo'
import { Icone } from '@/components/ui/icones'
import {
  chipDoLivroEmMaos,
  fraseDoAtrasoNaTira,
  fraseDoCorte,
  primeiroNome,
  rotuloDoMovimento,
  situacaoNaPrateleira,
  type PalavraComTom,
  type TomDaTira,
} from './trilha'
import type {
  LeitorDaTela,
  MovimentoNaTira,
  PainelDoBalcaoNaTela,
  PrateleiraNaTrilha,
} from './actions'

/**
 * A trilha lateral do balcão.
 *
 * A coluna da esquerda é o atendimento de AGORA; esta é o contexto que
 * decide se aquele atendimento está certo — o que o leitor já tem em
 * mãos, o que passou pelo balcão hoje e o que está guardado atrás dele
 * esperando quem reservou.
 *
 * Toda frase daqui sai de `./trilha`, módulo puro e testado, e todo
 * número sai de uma consulta. Nenhum contador é o tamanho da lista
 * exibida: a tira é um corte do dia, e quando ela corta, ela diz.
 */

/** A cor acompanha a palavra da tira. Nunca a substitui. */
const COR_DO_TOM: Record<TomDaTira, string> = {
  certo: 'text-certo',
  neutro: 'text-tinta-2',
  atencao: 'text-atencao',
  alerta: 'text-alerta',
  fita: 'text-fita',
}

/**
 * O título de cartão da trilha.
 *
 * `font-sans` explícito porque o `globals.css` põe serifa em todo `h2` —
 * e nas pranchas o título da trilha é sans de 15px, para não competir com
 * o nome do leitor na coluna operacional, que é serifa de 19px.
 */
function TituloDaTrilha({
  titulo,
  aoLado,
}: {
  titulo: string
  aoLado?: string
}): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-sans text-[15px] font-semibold text-tinta">{titulo}</h2>
      {aoLado !== undefined && (
        <span className="shrink-0 text-[12.5px] text-tinta-3">{aoLado}</span>
      )}
    </div>
  )
}

function FraseVazia({ children }: { children: string }): ReactElement {
  return <p className="mt-[14px] text-[13px] text-tinta-2">{children}</p>
}

/** "mostrando os 8 mais recentes de 31" — só quando a tira cortou o dia. */
function ConfissaoDoCorte({ mostrados, total }: { mostrados: number; total: number }) {
  const frase = fraseDoCorte(mostrados, total)
  if (frase === null) return null

  return <p className="mt-[10px] text-[11.5px] text-tinta-3">{frase}</p>
}

/**
 * Uma linha da tira do dia.
 *
 * `destaque` é a palavra do tipo do movimento — "saiu", "voltou". Vem
 * `null` na lista de devoluções, onde todas as linhas são devolução e
 * repetir a palavra em cada uma só roubaria espaço do nome do aluno.
 */
function LinhaDaTira({
  hora,
  destaque,
  leitor,
  turma,
  titulo,
  tombo,
  atraso,
}: {
  hora: string
  destaque: PalavraComTom | null
  leitor: string
  turma: string | null
  titulo: string
  tombo: string
  atraso: PalavraComTom | null
}): ReactElement {
  return (
    <li className="flex gap-[10px] border-b border-linha py-[10px] last:border-b-0">
      <span className="w-[38px] shrink-0 pt-[2px] font-mono text-[11.5px] text-tinta-3">
        {hora}
      </span>
      <div className="min-w-0 grow text-[13px]">
        <div className="text-tinta">
          {destaque !== null && (
            <>
              <span className={`font-semibold ${COR_DO_TOM[destaque.tom]}`}>
                {destaque.palavra}
              </span>{' '}
              ·{' '}
            </>
          )}
          {leitor}
          {turma !== null && <span className="text-tinta-2"> · {turma}</span>}
        </div>
        <div className="text-[12.5px] text-tinta-2">
          {titulo} · <Tombo valor={tombo} tamanho="discreto" />
          {atraso !== null && (
            <>
              {' · '}
              <span className={`font-semibold ${COR_DO_TOM[atraso.tom]}`}>{atraso.palavra}</span>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * "Em mãos de Ana" — a ficha do leitor encontrado, em lista.
 *
 * O "2 de 3" ao lado do título é `emMaos.length`, a MESMA lista
 * desenhada logo abaixo dele. É o defeito que a consulta nova existe para
 * fechar: com o contador vindo de uma segunda consulta, nada impedia a
 * tela de dizer "2 de 3" ao lado de três livros — e a operadora, vendo o
 * número discordar do que ela conta com o dedo, deixa de confiar nos dois.
 */
function EmMaosDoLeitor({ leitor }: { leitor: LeitorDaTela }): ReactElement {
  const nome = primeiroNome(leitor.nome)

  return (
    <Cartao className="px-5 py-[18px]">
      <TituloDaTrilha
        titulo={nome === null ? 'Em mãos do leitor' : `Em mãos de ${nome}`}
        aoLado={`${leitor.emMaos.length} de ${leitor.limiteDaSerie}`}
      />

      {leitor.emMaos.length === 0 ? (
        <FraseVazia>Nenhum livro em mãos agora.</FraseVazia>
      ) : (
        <ul className="mt-[14px] flex flex-col">
          {leitor.emMaos.map((livro, posicao) => {
            const chip = chipDoLivroEmMaos(livro)

            return (
              <li
                key={livro.emprestimoId}
                className={posicao === 0 ? '' : 'mt-3 border-t border-linha pt-3'}
              >
                <div className="text-[13.5px] leading-[1.3] font-semibold text-tinta">
                  {livro.titulo}
                </div>
                <div className="mt-[2px]">
                  <Tombo valor={livro.tombo} tamanho="discreto" />
                </div>
                <Chip estado={chip.estado} complemento={chip.complemento} className="mt-[6px]" />
              </li>
            )
          })}
        </ul>
      )}
    </Cartao>
  )
}

/** "Últimos do balcão": o dia inteiro em linha do tempo, retirada e devolução. */
function UltimosDoBalcao({ painel }: { painel: PainelDoBalcaoNaTela }): ReactElement {
  // O total do dia é a soma dos dois contadores do resumo, que saem das
  // listas COMPLETAS. A tira mostra as linhas que couberam.
  const totalDoDia = painel.atendidosHoje + painel.devolvidosHoje

  return (
    <Cartao className="px-5 py-[18px]">
      <TituloDaTrilha titulo="Últimos do balcão" aoLado={`${totalDoDia} hoje`} />

      {painel.movimentos.length === 0 ? (
        <FraseVazia>Nenhum atendimento registrado hoje.</FraseVazia>
      ) : (
        <>
          <ul className="mt-3 flex max-h-[360px] flex-col overflow-y-auto">
            {painel.movimentos.map((movimento) => (
              <LinhaDaTira
                key={movimento.chave}
                hora={movimento.hora}
                destaque={rotuloDoMovimento(movimento.tipo)}
                leitor={movimento.leitor}
                turma={movimento.turma}
                titulo={movimento.titulo}
                tombo={movimento.tombo}
                atraso={fraseDoAtrasoNaTira(movimento.diasDeAtraso)}
              />
            ))}
          </ul>
          <ConfissaoDoCorte mostrados={painel.movimentos.length} total={totalDoDia} />
        </>
      )}
    </Cartao>
  )
}

/** Só as devoluções do dia — a aba de devolução não fala de retirada. */
function DevolucoesDeHoje({ painel }: { painel: PainelDoBalcaoNaTela }): ReactElement {
  const devolucoes: MovimentoNaTira[] = painel.movimentos.filter(
    (movimento) => movimento.tipo === 'DEVOLUCAO',
  )

  return (
    <Cartao className="px-5 py-[18px]">
      {/* O número é o do DIA, não o das linhas abaixo: são 27 devoluções
          mesmo quando só cinco caberam na tira. */}
      <TituloDaTrilha titulo="Devoluções de hoje" aoLado={`${painel.devolvidosHoje} hoje`} />

      {devolucoes.length === 0 ? (
        <FraseVazia>Nenhuma devolução registrada hoje.</FraseVazia>
      ) : (
        <>
          <ul className="mt-3 flex max-h-[360px] flex-col overflow-y-auto">
            {devolucoes.map((movimento) => (
              <LinhaDaTira
                key={movimento.chave}
                hora={movimento.hora}
                destaque={null}
                leitor={movimento.leitor}
                turma={movimento.turma}
                titulo={movimento.titulo}
                tombo={movimento.tombo}
                atraso={fraseDoAtrasoNaTira(movimento.diasDeAtraso)}
              />
            ))}
          </ul>
          <ConfissaoDoCorte mostrados={devolucoes.length} total={painel.devolvidosHoje} />
        </>
      )}
    </Cartao>
  )
}

/**
 * A prateleira física de separados.
 *
 * É a lista que impede o exemplar reservado de voltar à estante por
 * distração — e a que mostra o vencido, que só existe quando o job de
 * expiração não rodou. Um exemplar vencido escondido aqui fica parado
 * atrás do balcão sem ninguém saber por quê.
 */
function PrateleiraDeSeparados({
  prateleira,
}: {
  prateleira: PrateleiraNaTrilha
}): ReactElement {
  return (
    <Cartao className="px-5 py-[18px]">
      <TituloDaTrilha
        titulo="Prateleira de separados"
        aoLado={prateleira.permitida ? `${prateleira.itens.length} guardados` : undefined}
      />
      <p className="mt-[3px] text-[12.5px] text-tinta-2">esperando quem reservou</p>

      {!prateleira.permitida ? (
        // Recusa de permissão não é erro do sistema: a frase explica, e a
        // tira de devoluções abaixo continua servindo.
        <p className="mt-[14px] flex gap-[9px] text-[12.5px] text-tinta-2">
          <span className="mt-px shrink-0 text-tinta-3">
            <Icone nome="info" tamanho={15} traco={1.7} />
          </span>
          <span>{prateleira.motivo}</span>
        </p>
      ) : prateleira.itens.length === 0 ? (
        <FraseVazia>Nenhum exemplar separado agora.</FraseVazia>
      ) : (
        <ul className="mt-3 flex max-h-[360px] flex-col overflow-y-auto">
          {prateleira.itens.map((item) => {
            const situacao = situacaoNaPrateleira(item)

            return (
              <li
                key={item.reservaId}
                className="flex gap-[10px] border-b border-linha py-[11px] last:border-b-0"
              >
                <span className={`mt-[2px] shrink-0 ${COR_DO_TOM[situacao.tom]}`}>
                  <Icone nome={situacao.icone} tamanho={15} traco={2} />
                </span>
                <div className="min-w-0 grow text-[13px]">
                  <div className="font-semibold text-tinta">{item.titulo}</div>
                  <div className="text-[12.5px] text-tinta-2">
                    {item.leitor}
                    {item.turma !== null && ` · ${item.turma}`} ·{' '}
                    <Tombo valor={item.tombo} tamanho="discreto" />
                  </div>
                  <div className="text-[12.5px]">
                    <span className={`font-semibold ${COR_DO_TOM[situacao.tom]}`}>
                      {situacao.palavra}
                    </span>
                    <span className="text-tinta-2"> · {situacao.frase}</span>
                  </div>
                  {item.localizacao !== null && (
                    <div className="text-[11.5px] text-tinta-3">
                      guardado em {item.localizacao}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Cartao>
  )
}

/**
 * Enquanto a trilha não chegou, ou quando a consulta recusou.
 *
 * A frase da recusa entra aqui e não numa `Faixa` de erro: a trilha é
 * contexto, e um alarme vermelho na lateral tiraria a atenção da
 * operadora do atendimento que está acontecendo na coluna do lado.
 */
function TrilhaSemDados({ erro }: { erro: string | null }): ReactElement {
  return (
    <Cartao className="px-5 py-[18px]">
      <p className="text-[13px] text-tinta-2">
        {erro === null ? 'Abrindo o dia do balcão…' : erro}
      </p>
    </Cartao>
  )
}

export function TrilhaDoEmprestimo({
  leitor,
  painel,
  erro,
}: {
  leitor: LeitorDaTela | null
  painel: PainelDoBalcaoNaTela | null
  erro: string | null
}): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      {/* A ficha só existe quando há leitor na tela: um cartão "Em mãos
          de" vazio no começo do atendimento seria moldura sem conteúdo. */}
      {leitor !== null && <EmMaosDoLeitor leitor={leitor} />}
      {painel === null ? <TrilhaSemDados erro={erro} /> : <UltimosDoBalcao painel={painel} />}
    </div>
  )
}

export function TrilhaDaDevolucao({
  painel,
  erro,
}: {
  painel: PainelDoBalcaoNaTela | null
  erro: string | null
}): ReactElement {
  if (painel === null) {
    return (
      <div className="flex flex-col gap-4">
        <TrilhaSemDados erro={erro} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PrateleiraDeSeparados prateleira={painel.prateleira} />
      <DevolucoesDeHoje painel={painel} />
    </div>
  )
}
