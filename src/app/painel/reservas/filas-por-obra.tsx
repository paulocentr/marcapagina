import type { ReactElement } from 'react'
import Link from 'next/link'
import { Cartao, CabecalhoDeCartao } from '@/components/ui/cartao'
import { Matricula, Tombo } from '@/components/ui/codigo'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import type { FilaDaObra, PessoaNaFila } from '@/modules/circulacao/fila-de-reservas.service'
import { BotaoDeCancelar } from './botao-de-cancelar'
import { ChipNaFila } from './chips-da-reserva'
import { formatarDiaEMes } from './datas'
import { proximoDaFila } from './reservas-na-tela'

/**
 * As filas de reserva, uma por obra, em ordem de chegada.
 *
 * É a tela que responde "sou o quantos?" na frente do aluno — a pergunta
 * que o balcão recebe todo dia e que `filaDaObra`, sozinha, respondia
 * apenas com identificadores.
 *
 * A fila maior vem em cima: é onde a coordenação precisa de outra cópia e
 * onde há mais gente para atender. Dentro da obra, quem chegou primeiro
 * vem primeiro — é a promessa que a fila faz.
 */
export function FilasPorObra({ filas }: { filas: FilaDaObra[] }): ReactElement {
  const esperando = filas.reduce((soma, fila) => soma + fila.esperando, 0)

  return (
    <Cartao semPadding>
      <CabecalhoDeCartao>
        <span className="text-tinta-3">
          <Icone nome="pessoas" tamanho={20} traco={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-semibold text-tinta">Filas de reserva</h2>
          <p className="text-[12.5px] text-tinta-2">
            {filas.length === 0
              ? 'nenhuma fila aberta'
              : `${filas.length} obra(s) com fila · ${esperando} leitor(es) esperando por uma cópia`}
          </p>
        </div>
      </CabecalhoDeCartao>

      <div className="px-[22px] py-5">
        {filas.length === 0 ? (
          <p className="text-[13.5px] text-tinta-2">
            Nenhuma fila aberta. A reserva se cria no balcão, quando o aluno pede um título que
            não tem cópia em estante — havendo cópia, o caminho é emprestar, não entrar numa
            fila de um.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {filas.map((fila) => (
              <BlocoDaFila key={fila.obraId} fila={fila} />
            ))}
          </div>
        )}
      </div>
    </Cartao>
  )
}

function BlocoDaFila({ fila }: { fila: FilaDaObra }): ReactElement {
  const proximo = proximoDaFila(fila)

  return (
    <section className="flex flex-col gap-[10px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14.5px] font-semibold text-tinta">
          {/* A ficha da obra é uma page.tsx, não um Route Handler: o
              prefetch do App Router só a renderiza. */}
          <Link
            href={`/painel/acervo/${fila.obraId}`}
            className="hover:text-marca-forte hover:underline"
          >
            {fila.tituloDaObra}
          </Link>
        </h3>

        <Rotulo tom="discreto">
          {/* Dois números, e não um só: quem espera precisa de uma cópia
              que volte; quem tem exemplar separado precisa aparecer no
              balcão. Somá-los faria a tela prometer livro a quem ainda não
              tem nenhum. */}
          {fila.esperando} esperando
          {fila.separados > 0 ? ` · ${fila.separados} já separado(s)` : ''}
        </Rotulo>
      </div>

      <ol className="flex flex-col">
        {fila.pessoas.map((pessoa) => (
          <LinhaDaFila
            key={pessoa.reservaId}
            pessoa={pessoa}
            ehOProximo={proximo !== null && proximo.reservaId === pessoa.reservaId}
          />
        ))}
      </ol>
    </section>
  )
}

function LinhaDaFila({
  pessoa,
  ehOProximo,
}: {
  pessoa: PessoaNaFila
  ehOProximo: boolean
}): ReactElement {
  return (
    <li className="flex flex-wrap items-start justify-between gap-4 border-b border-linha py-[11px] last:border-b-0">
      <div className="flex min-w-0 flex-1 items-start gap-[11px]">
        {/* A posição é o número que o aluno leva na cabeça. Em mono para
            não competir com o nome ao lado. */}
        <span
          aria-hidden="true"
          className="mt-[1px] flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full bg-papel-2 font-mono text-[11.5px] text-tinta-2"
        >
          {pessoa.posicao}
        </span>

        <div className="min-w-0">
          <div className="text-[13.5px] text-tinta">
            <span className="sr-only">posição {pessoa.posicao} da fila: </span>
            {pessoa.nomeDoLeitor}
            <span className="text-tinta-2">
              {pessoa.turma === null ? ' · sem turma' : ` · ${pessoa.turma}`}
            </span>
          </div>

          <div className="mt-[2px] flex flex-wrap items-center gap-x-[7px] text-[12.5px] text-tinta-2">
            <Matricula valor={pessoa.matricula} tamanho="discreto" />
            {pessoa.status === 'DISPONIVEL' && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  guardado no balcão até {formatarDiaEMes(pessoa.retirarAte)} —{' '}
                  <Tombo valor={pessoa.tomboSeparado} tamanho="discreto" />
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end gap-[7px]">
        <ChipNaFila status={pessoa.status} ehOProximo={ehOProximo} />
        <BotaoDeCancelar
          reservaId={pessoa.reservaId}
          nomeDoLeitor={pessoa.nomeDoLeitor}
          comExemplarSeparado={pessoa.status === 'DISPONIVEL'}
        />
      </div>
    </li>
  )
}
