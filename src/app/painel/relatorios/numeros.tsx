import type { ReactElement, ReactNode } from 'react'
import { Cartao } from '@/components/ui/cartao'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import { sparkline } from '@/modules/relatorios/escala'
import { SEMANAS_DA_TENDENCIA, type PainelDoLeitor } from '@/modules/relatorios/painel-do-leitor.service'
import { descreverComparacao, numeroNaTela } from './painel-na-tela'

/**
 * Os quatro números que abrem o painel.
 *
 * Todos CONTADOS na consulta desta requisição. Nenhum vem de campo
 * materializado, e o de atrasados menos que todos: um campo "atrasado"
 * mente todo dia em que o cron falhar, e mente dizendo que está tudo em
 * ordem.
 */

const NUMERO_GRANDE = 'font-serif text-[38px] font-bold leading-none tracking-[-0.03em]'

function CartaoDeNumero({
  rotulo,
  children,
  apoio,
  className,
}: {
  rotulo: string
  children: ReactNode
  apoio: ReactNode
  className?: string
}): ReactElement {
  return (
    <Cartao semPadding className={`px-5 py-[18px]${className ? ` ${className}` : ''}`}>
      <Rotulo tom="discreto">{rotulo}</Rotulo>
      <div className="mt-[6px]">{children}</div>
      <div className="mt-2 text-[12.5px] text-tinta-2">{apoio}</div>
    </Cartao>
  )
}

/**
 * A cor da frase de comparação.
 *
 * Alta em verde é o da prancha. Queda NÃO usa a cor de atenção: aquele
 * âmbar é reservado para atraso, e emprestar menos em setembro não é um
 * problema operacional — é o mês do simulado. Pintar a queda de âmbar
 * gastaria a cor de estado num número que a própria frase já explica, e
 * depois disso o âmbar do atraso deixaria de significar algo.
 */
const TOM_DA_COMPARACAO = {
  alta: 'text-certo',
  baixa: 'text-tinta',
  neutro: 'text-tinta-2',
} as const

export function Numeros({ painel }: { painel: PainelDoLeitor }): ReactElement {
  const comparacao = descreverComparacao(painel.emprestimos.comparacao, painel.anterior.rotulo)
  const doAcervo = numeroNaTela(painel.emMaos.percentualDoAcervo)
  const dosAlunos = numeroNaTela(painel.leitores.percentual)

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <CartaoDeNumero
        rotulo={`Empréstimos em ${painel.periodo.rotulo}`}
        apoio={
          <>
            <span className={`font-semibold ${TOM_DA_COMPARACAO[comparacao.tom]}`}>
              {comparacao.texto}
            </span>{' '}
            · {SEMANAS_DA_TENDENCIA} semanas
          </>
        }
      >
        <div className="flex items-end justify-between gap-3">
          <span className={NUMERO_GRANDE}>{painel.emprestimos.total}</span>
          <Tendencia valores={painel.emprestimos.tendencia} />
        </div>
      </CartaoDeNumero>

      <CartaoDeNumero
        rotulo="Livros em mãos agora"
        apoio={
          doAcervo === null ? (
            // Sem exemplar no acervo, "0% circulando" afirmaria que há
            // acervo parado. O que existe é acervo nenhum.
            <>ainda não há exemplar cadastrado no acervo</>
          ) : (
            <>
              {doAcervo}% do acervo circulando · {painel.emMaos.exemplaresNoAcervo} exemplares
            </>
          )
        }
      >
        <span className={NUMERO_GRANDE}>{painel.emMaos.total}</span>
      </CartaoDeNumero>

      {/*
        A única cor de estado da tela, e ela vem com ícone E palavra: o
        rótulo diz "Atrasados" e o relógio acompanha o número. Cor
        sozinha não informa quem não distingue os tons, nem quem olha
        numa tela com brilho ruim.
      */}
      <CartaoDeNumero
        className="border-atencao-borda bg-atencao-suave/40"
        rotulo="Atrasados"
        apoio={
          <span className="text-atencao-texto">
            {painel.atrasados.diasDoMaisAntigo === null
              ? 'nenhum livro em atraso'
              : `o mais antigo há ${painel.atrasados.diasDoMaisAntigo} dias`}{' '}
            · {painel.atrasados.leitoresSuspensos} leitor
            {painel.atrasados.leitoresSuspensos === 1 ? '' : 'es'} suspenso
            {painel.atrasados.leitoresSuspensos === 1 ? '' : 's'}
          </span>
        }
      >
        <div className="flex items-end gap-[9px] text-atencao">
          <span className={NUMERO_GRANDE}>{painel.atrasados.total}</span>
          <span className="mb-[6px]">
            <Icone nome="relogio" tamanho={18} traco={1.8} />
          </span>
        </div>
      </CartaoDeNumero>

      <CartaoDeNumero
        rotulo="Leitores ativos"
        apoio={
          dosAlunos === null ? (
            <>ainda não há aluno ativo cadastrado</>
          ) : (
            <>{dosAlunos}% dos alunos pegaram ao menos um livro</>
          )
        }
      >
        <div className="flex items-end gap-[6px]">
          <span className={NUMERO_GRANDE}>{painel.leitores.ativos}</span>
          <span className="mb-1 text-[15px] text-tinta-3">de {painel.leitores.total}</span>
        </div>
        {painel.leitores.percentual !== null && (
          <div
            className="mt-3 h-[6px] overflow-hidden rounded-full bg-papel-2"
            // A barra repete o número que já está escrito ao lado; para
            // quem ouve a tela ela é ruído.
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-marca"
              style={{ width: `${Math.min(100, painel.leitores.percentual)}%` }}
            />
          </div>
        )}
      </CartaoDeNumero>
    </div>
  )
}

/**
 * O sparkline das últimas semanas.
 *
 * Uma cor só — o verde da marca — e sem legenda: o rótulo do cartão
 * nomeia a série. `aria-hidden` porque o número grande ao lado já diz o
 * valor de agora, e "polilinha de doze pontos" não é informação para
 * quem ouve.
 */
function Tendencia({ valores }: { valores: number[] }): ReactElement | null {
  const linha = sparkline(valores, 120, 32)
  if (linha === null) return null

  return (
    <svg
      width="120"
      height="32"
      viewBox="0 0 120 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="mb-[3px] shrink-0 text-marca"
    >
      <polyline
        points={linha.pontos}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* O marcador da ponta: é onde o olho para para ler "é hoje". */}
      <circle
        cx={linha.ultimo.x}
        cy={linha.ultimo.y}
        r="3"
        fill="currentColor"
        stroke="var(--color-superficie)"
        strokeWidth="2"
      />
    </svg>
  )
}
