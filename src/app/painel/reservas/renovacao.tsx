'use client'

import { useState } from 'react'
import { Botao } from '@/components/ui/botao'
import { Cartao, CabecalhoDeCartao } from '@/components/ui/cartao'
import { Campo } from '@/components/ui/campo'
import { Chip } from '@/components/ui/chip'
import { Matricula, Tombo } from '@/components/ui/codigo'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import {
  buscarLeitorParaRenovarAction,
  renovarAction,
  type LeitorParaRenovar,
  type LivroParaRenovar,
} from './actions'

/**
 * Renovar um empréstimo, pela matrícula.
 *
 * Pela matrícula e não pelo tombo: quem chega ao balcão pedindo mais
 * tempo chega com a carteirinha, e muitas vezes SEM o livro — ele está na
 * mochila, em casa, na sala. Exigir o tombo obrigaria a operadora a
 * procurar o empréstimo pelo título no acervo.
 *
 * O botão desabilitado com a frase do lado é deliberado: esconder a
 * renovação de quem já esgotou o limite da série deixaria a operadora
 * procurando por um botão que não existe, sem saber que é a configuração
 * da série que manda. Esconder botão também não é autorização — quem
 * autoriza é `renovar`, no serviço.
 */
export function Renovacao() {
  const [matricula, setMatricula] = useState('')
  const [leitor, setLeitor] = useState<LeitorParaRenovar | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [renovando, setRenovando] = useState<string | null>(null)

  async function buscar(evento: React.FormEvent) {
    evento.preventDefault()
    const buscada = matricula.trim()
    if (buscada.length === 0) return

    setErro(null)
    setFeito(null)
    setLeitor(null)
    setBuscando(true)

    try {
      const resposta = await buscarLeitorParaRenovarAction(buscada)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      setLeitor(resposta.leitor)
    } finally {
      setBuscando(false)
    }
  }

  async function renovarLivro(livro: LivroParaRenovar) {
    // Sem leitor na tela não há botão de renovar. A guarda existe para a
    // releitura abaixo usar a matrícula que o BANCO devolveu, e não a que
    // ficou no campo — a operadora pode ter começado a digitar a próxima.
    if (leitor === null) return

    setErro(null)
    setFeito(null)
    setRenovando(livro.emprestimoId)

    try {
      const resposta = await renovarAction(livro.emprestimoId)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      setFeito(
        `${livro.tituloDaObra} renovado até ${resposta.renovado.previstaPara} ` +
          `(${resposta.renovado.renovacoes}ª renovação).`,
      )

      // A ficha é relida do servidor em vez de remendada aqui: a
      // renovação mexe na data prevista e na contagem, e reescrever os
      // dois na tela faria a próxima renovação decidir sobre número que
      // ninguém confirmou.
      const relida = await buscarLeitorParaRenovarAction(leitor.matricula)
      if (relida.ok) setLeitor(relida.leitor)
    } finally {
      setRenovando(null)
    }
  }

  return (
    <Cartao semPadding>
      <CabecalhoDeCartao>
        <span className="text-tinta-3">
          <Icone nome="troca" tamanho={20} traco={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-semibold text-tinta">Renovar</h2>
          <p className="text-[12.5px] text-tinta-2">mais tempo com o livro que já está em mãos</p>
        </div>
      </CabecalhoDeCartao>

      <div className="flex flex-col gap-4 px-[22px] py-5">
        <form onSubmit={buscar} className="flex flex-col gap-[7px]">
          <label htmlFor="renovar-matricula">
            <Rotulo>Matrícula do leitor</Rotulo>
          </label>
          <div className="flex items-center gap-[10px]">
            <Campo
              id="renovar-matricula"
              variante="bipagem"
              value={matricula}
              onChange={(evento) => setMatricula(evento.target.value)}
              placeholder="0000000"
              inputMode="numeric"
              className="max-w-[220px]"
            />
            <Botao type="submit" tamanho="grande" icone="busca" disabled={buscando}>
              {buscando ? 'Buscando…' : 'Ver livros em mãos'}
            </Botao>
          </div>
        </form>

        {erro !== null && <Faixa tom="erro">{erro}</Faixa>}
        {feito !== null && <Faixa tom="sucesso">{feito}</Faixa>}

        {leitor !== null && (
          <FichaDoLeitor
            leitor={leitor}
            renovando={renovando}
            onRenovar={(livro) => void renovarLivro(livro)}
          />
        )}
      </div>
    </Cartao>
  )
}

function FichaDoLeitor({
  leitor,
  renovando,
  onRenovar,
}: {
  leitor: LeitorParaRenovar
  renovando: string | null
  onRenovar: (livro: LivroParaRenovar) => void
}) {
  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-linha pt-4">
        <div>
          <div className="text-[14.5px] font-semibold text-tinta">{leitor.nome}</div>
          <div className="mt-[2px] flex flex-wrap items-center gap-x-[7px] text-[12.5px] text-tinta-2">
            <Matricula valor={leitor.matricula} tamanho="discreto" />
            <span aria-hidden="true">·</span>
            <span>{leitor.turma === null ? 'sem turma' : leitor.turma}</span>
          </div>
        </div>

        <Rotulo tom="discreto">
          {/* O número da SÉRIE, não da escola: a coordenação pode ter
              desligado a renovação de uma série e mantido de outra. */}
          {leitor.maximoDeRenovacoes === 0
            ? 'esta série não renova'
            : `até ${leitor.maximoDeRenovacoes} renovação(ões) por empréstimo`}
        </Rotulo>
      </div>

      {leitor.emMaos.length === 0 ? (
        <p className="text-[13.5px] text-tinta-2">
          Este leitor não está com nenhum livro — não há o que renovar.
        </p>
      ) : (
        <ul className="flex flex-col">
          {leitor.emMaos.map((livro) => (
            <LinhaDoLivro
              key={livro.emprestimoId}
              livro={livro}
              renovando={renovando === livro.emprestimoId}
              onRenovar={() => onRenovar(livro)}
            />
          ))}
        </ul>
      )}

      <p className="text-[12.5px] text-tinta-3">
        A renovação também é recusada quando há fila de reserva para o título — dar mais tempo a
        quem já leu é tirar a vez de quem esperou. A fila é conferida no momento do clique.
      </p>
    </div>
  )
}

function LinhaDoLivro({
  livro,
  renovando,
  onRenovar,
}: {
  livro: LivroParaRenovar
  renovando: boolean
  onRenovar: () => void
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-4 border-b border-linha py-[13px] last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-tinta">{livro.tituloDaObra}</div>

        <div className="mt-[2px] flex flex-wrap items-center gap-x-[7px] text-[12.5px] text-tinta-2">
          <Tombo valor={livro.tombo} tamanho="discreto" />
          <span aria-hidden="true">·</span>
          <span>devolver até {livro.previstaPara}</span>
          <span aria-hidden="true">·</span>
          {/* A contagem vem do empréstimo, não da tela. */}
          <span>
            {livro.renovacoes === 0
              ? 'sem renovação ainda'
              : `${livro.renovacoes} renovação(ões) usada(s)`}
          </span>
        </div>

        {!livro.renovacao.pode && (
          <p className="mt-[3px] text-[12.5px] text-tinta-2">{livro.renovacao.motivo}</p>
        )}
      </div>

      <div className="flex flex-col items-end gap-[7px]">
        {/* Atrasado é estado do EMPRÉSTIMO e sai do catálogo do kit, com
            palavra e ícone. O empréstimo em dia não recebe chip: chip para
            tudo transforma o chip em decoração. */}
        {livro.atrasado && <Chip estado="ATRASADO" complemento={`${livro.diasDeAtraso} dia(s)`} />}

        <Botao
          type="button"
          variante="secundaria"
          icone="troca"
          onClick={onRenovar}
          disabled={!livro.renovacao.pode || renovando}
        >
          {renovando ? 'Renovando…' : 'Renovar'}
        </Botao>

        {livro.renovacao.pode && (
          <span className="text-[11.5px] text-tinta-3">
            {livro.renovacao.restantes} restante(s)
          </span>
        )}
      </div>
    </li>
  )
}
