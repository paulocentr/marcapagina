'use client'

import { useState } from 'react'
import { Botao } from '@/components/ui/botao'
import { Cartao } from '@/components/ui/cartao'
import { CampoComRotulo, classesDeCampo } from '@/components/ui/campo'
import { Tombo } from '@/components/ui/codigo'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import {
  planejarRodadaAction,
  sugerirAction,
  type RodadaNaTela,
  type SugestaoNaTela,
  type TurmaNaTela,
} from './actions'

/**
 * Passo 1 — o que levar.
 *
 * A lista sai dos pedidos PENDENTES da turma, filtrada pela faixa etária
 * e pelo que está em estante. É sugestão, não decisão: a operadora
 * desmarca o que não vai levar antes de empurrar o carrinho, e é o que
 * fica marcado que vira o romaneio da rodada.
 */
export function OQueLevar({
  turmas,
  onRodadaPlanejada,
}: {
  turmas: TurmaNaTela[]
  onRodadaPlanejada: (rodada: RodadaNaTela) => void
}) {
  const [turmaId, setTurmaId] = useState('')
  const [data, setData] = useState(hojeNoCampo)
  const [observacao, setObservacao] = useState('')
  const [sugestoes, setSugestoes] = useState<SugestaoNaTela[] | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const turma = turmas.find((candidata) => candidata.id === turmaId)

  async function verOQueLevar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!turma) return
    setErro(null)
    setSugestoes(null)
    setOcupado(true)

    try {
      const resposta = await sugerirAction(turma.id)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      setSugestoes(resposta.sugestoes)
      // Tudo marcado na chegada: a sugestão já é o recorte do que cabe na
      // turma e está em estante, e o trabalho da operadora é TIRAR o que
      // não vai. Chegar tudo desmarcado a obrigaria a reconstruir à mão
      // uma lista que o sistema acabou de montar.
      setMarcados(new Set(resposta.sugestoes.map((s) => s.exemplarId)))
    } finally {
      setOcupado(false)
    }
  }

  async function planejar() {
    if (!turma || sugestoes === null) return
    setErro(null)
    setOcupado(true)

    try {
      const resposta = await planejarRodadaAction({
        turmaId: turma.id,
        data,
        observacao: observacao.trim().length > 0 ? observacao.trim() : undefined,
        // A ordem da tela, filtrada pelo que ficou marcado.
        exemplaresIds: sugestoes
          .filter((s) => marcados.has(s.exemplarId))
          .map((s) => s.exemplarId),
      })

      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      setSugestoes(null)
      setMarcados(new Set())
      setObservacao('')
      onRodadaPlanejada(resposta.rodada)
    } finally {
      setOcupado(false)
    }
  }

  function alternar(exemplarId: string) {
    setMarcados((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(exemplarId)) proximo.delete(exemplarId)
      else proximo.add(exemplarId)
      return proximo
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Cartao className="px-[22px] py-5">
        <form onSubmit={verOQueLevar} className="flex flex-col gap-[18px]">
          <div className="flex flex-wrap items-end gap-[14px]">
            <div className="flex w-[240px] flex-col gap-[7px]">
              <label htmlFor="carrinho-turma">
                <Rotulo>1 · Turma que o carrinho visita</Rotulo>
              </label>
              <select
                id="carrinho-turma"
                value={turmaId}
                onChange={(evento) => {
                  setTurmaId(evento.target.value)
                  // A sugestão é de UMA turma. Deixá-la na tela depois de
                  // trocar de turma faria a operadora montar o carrinho do
                  // 7º B com a lista do 5º A.
                  setSugestoes(null)
                  setMarcados(new Set())
                  setErro(null)
                }}
                className={classesDeCampo()}
              >
                <option value="">Escolha a turma</option>
                {turmas.map((candidata) => (
                  <option key={candidata.id} value={candidata.id}>
                    {candidata.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex w-[180px] flex-col gap-[7px]">
              <label htmlFor="carrinho-data">
                <Rotulo>2 · Dia da visita</Rotulo>
              </label>
              <input
                id="carrinho-data"
                type="date"
                value={data}
                onChange={(evento) => setData(evento.target.value)}
                className={classesDeCampo()}
              />
            </div>

            <div className="w-[260px]">
              <CampoComRotulo
                id="carrinho-observacao"
                rotulo="3 · Observação (opcional)"
                placeholder="3ª aula, com a professora Ana"
                value={observacao}
                onChange={(evento) => setObservacao(evento.target.value)}
              />
            </div>

            <Botao
              type="submit"
              variante="secundaria"
              icone="busca"
              disabled={ocupado || turmaId.length === 0}
            >
              Ver o que levar
            </Botao>
          </div>

          {turma && <FaixaDaTurma turma={turma} />}
        </form>
      </Cartao>

      {erro && <Faixa tom="erro">{erro}</Faixa>}

      {sugestoes !== null && turma && (
        <Cartao semPadding>
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-linha bg-papel-2 px-[22px] py-[18px]">
            <div>
              <h2 className="font-serif text-[19px] font-semibold text-tinta">
                O que levar ao {turma.nome}
              </h2>
              <p className="mt-[3px] text-[13px] text-tinta-2">
                Saiu dos pedidos pendentes da turma, filtrado pela faixa etária e pelo que está
                em estante. É sugestão — desmarque o que não vai no carrinho.
              </p>
            </div>
            {/* A contagem sai da própria lista, então não tem como
                divergir do que está marcado embaixo dela. */}
            <p className="text-[13px] text-tinta-2">
              <strong className="font-mono text-base text-tinta">{marcados.size}</strong> de{' '}
              {sugestoes.length} {sugestoes.length === 1 ? 'marcado' : 'marcados'}
            </p>
          </div>

          {sugestoes.length === 0 ? (
            <div className="p-[22px]">
              <Faixa tom="atencao" icone="info" titulo="Nada a sugerir para esta turma.">
                Nenhum aluno do {turma.nome} tem pedido pendente de um título com exemplar
                disponível em estante. Os pedidos de livros que a biblioteca não tem estão no
                passo 3.
              </Faixa>
            </div>
          ) : (
            <>
              <ul className="flex flex-col">
                {sugestoes.map((sugestao) => (
                  <li key={sugestao.exemplarId} className="border-b border-linha last:border-b-0">
                    <label className="flex cursor-pointer items-center gap-[14px] px-[22px] py-[13px] hover:bg-papel">
                      <input
                        type="checkbox"
                        checked={marcados.has(sugestao.exemplarId)}
                        onChange={() => alternar(sugestao.exemplarId)}
                        className="h-[17px] w-[17px] shrink-0 accent-marca"
                      />
                      <span className="min-w-0 grow">
                        <span className="block truncate text-[14.5px] font-medium text-tinta">
                          {sugestao.titulo}
                        </span>
                        <span className="mt-[2px] block text-[12.5px] text-tinta-2">
                          tombo <Tombo valor={sugestao.tombo} tamanho="discreto" />
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-[6px] text-[12.5px] text-tinta-2">
                        <span className="text-tinta-3">
                          <Icone nome="pessoas" tamanho={15} traco={1.7} />
                        </span>
                        pedido por {sugestao.pedidos}{' '}
                        {sugestao.pedidos === 1 ? 'aluno' : 'alunos'}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-[10px] border-t border-linha px-[22px] py-[18px]">
                <Botao
                  type="button"
                  tamanho="grande"
                  icone="carrinho"
                  onClick={planejar}
                  disabled={ocupado || marcados.size === 0}
                >
                  Planejar a rodada com {marcados.size}{' '}
                  {marcados.size === 1 ? 'livro' : 'livros'}
                </Botao>
                <Botao
                  type="button"
                  variante="secundaria"
                  tamanho="grande"
                  onClick={() => setMarcados(new Set())}
                  disabled={ocupado || marcados.size === 0}
                >
                  Desmarcar tudo
                </Botao>
              </div>
            </>
          )}
        </Cartao>
      )}
    </div>
  )
}

/**
 * A faixa etária da turma, dita em palavras.
 *
 * Quando a série não diz uma idade típica, o filtro NÃO roda — e a tela
 * tem de admitir isso. Calar faria a operadora acreditar que um título
 * de 14+ foi conferido antes de entrar no carrinho do 3º ano.
 */
function FaixaDaTurma({ turma }: { turma: TurmaNaTela }) {
  return (
    <p className="flex items-center gap-[10px] text-[13px] text-tinta-2">
      <span className="shrink-0 text-tinta-3">
        <Icone nome="info" tamanho={16} traco={1.6} />
      </span>
      {turma.idadeTipica === null ? (
        <span>
          A série <strong>{turma.serie}</strong> não diz uma idade típica, então{' '}
          <strong>nenhum título é barrado por faixa etária</strong> nesta sugestão. Confira você
          o que vai na caixa.
        </span>
      ) : (
        <span>
          Idade típica do {turma.nome}: <strong>{turma.idadeTipica} anos</strong>. Títulos
          marcados no acervo acima dessa idade ficam fora da sugestão.
        </span>
      )}
    </p>
  )
}

/**
 * O dia de hoje no campo de data, em aaaa-mm-dd.
 *
 * Sai do relógio do navegador, que é a máquina da secretaria. É um valor
 * PRÉ-PREENCHIDO e visível, que a operadora troca com um clique — não um
 * prazo calculado. O fuso fixo da escola existe em `prazo.ts` e continua
 * sendo quem decide vencimento; aqui ninguém calcula nada.
 */
function hojeNoCampo(): string {
  const agora = new Date()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mes}-${dia}`
}
