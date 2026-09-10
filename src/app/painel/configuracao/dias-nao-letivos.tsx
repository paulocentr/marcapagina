'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Botao } from '@/components/ui/botao'
import { CabecalhoDeCartao, Cartao } from '@/components/ui/cartao'
import { CampoComRotulo } from '@/components/ui/campo'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import {
  desmarcarDiaNaoLetivoAction,
  marcarDiaNaoLetivoAction,
  marcarPeriodoNaoLetivoAction,
} from './actions'
import type { DiaNaoLetivoNaTela, MesNaoLetivo } from './calendario-na-tela'

/**
 * O calendário de dias não letivos.
 *
 * Serve ao cálculo do prazo: um vencimento que cai em dia fechado é
 * empurrado para o próximo dia letivo, porque o aluno não pode ser
 * marcado como atrasado num dia em que não havia como devolver.
 *
 * **A data viaja como texto `aaaa-mm-dd`, do campo até o serviço.** O
 * `<input type="date">` entrega `aaaa-mm-dd` por especificação, seja qual
 * for o idioma do navegador, e é esse texto que sobe. Nada aqui constrói
 * `Date` a partir do que foi digitado: o fuso da escola é fixo em
 * `prazo.ts`, e converter pelo fuso do navegador faria o feriado marcado
 * na secretaria cair no dia anterior no servidor — empurrando o prazo de
 * todo mundo sem explicação.
 */
export function DiasNaoLetivos({
  meses,
  podeEditar,
}: {
  meses: MesNaoLetivo[]
  podeEditar: boolean
}) {
  const router = useRouter()
  const [data, setData] = useState('')
  const [ate, setAte] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [desmarcando, setDesmarcando] = useState<string | null>(null)

  const emPeriodo = ate.trim().length > 0

  async function marcar(evento: React.FormEvent) {
    evento.preventDefault()

    setErro(null)
    setAviso(null)
    setSalvando(true)

    try {
      // Um campo "até" preenchido é um PERÍODO. Recesso e férias são
      // digitados assim: exigir dia a dia faria a coordenação marcar
      // julho em trinta cliques e desistir no décimo, deixando o
      // calendário pela metade — que é pior que não ter calendário.
      const resposta = emPeriodo
        ? await marcarPeriodoNaoLetivoAction({ de: data, ate, motivo })
        : await marcarDiaNaoLetivoAction({ data, motivo })

      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      setAviso(resposta.aviso)
      setData('')
      setAte('')
      setMotivo('')
      // A lista é lida no servidor: sem recarregar, o dia que acabou de
      // ser marcado não apareceria, e a coordenação marcaria de novo.
      router.refresh()
    } finally {
      setSalvando(false)
    }
  }

  async function desmarcar(dia: DiaNaoLetivoNaTela) {
    setErro(null)
    setAviso(null)
    setDesmarcando(dia.iso)

    try {
      // Sobe o `iso` que veio do servidor, não o texto dd/mm/aaaa da tela.
      const resposta = await desmarcarDiaNaoLetivoAction(dia.iso)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      setAviso(resposta.aviso)
      router.refresh()
    } finally {
      setDesmarcando(null)
    }
  }

  const total = meses.reduce((soma, mes) => soma + mes.dias.length, 0)

  return (
    <Cartao semPadding>
      <CabecalhoDeCartao>
        <span className="text-tinta-3">
          <Icone nome="relogio" tamanho={20} traco={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-semibold text-tinta">
            Calendário — dias não letivos
          </h2>
          <p className="text-[12.5px] text-tinta-2">
            feriado, recesso e emenda: o vencimento nunca cai em dia fechado
          </p>
        </div>
        <Rotulo tom="discreto">
          {total === 1 ? '1 dia marcado' : `${total} dias marcados`}
        </Rotulo>
      </CabecalhoDeCartao>

      <div className="flex flex-col gap-5 px-[22px] py-5">
        <p className="text-[13px] text-tinta-2">
          Sábado e domingo já são considerados fechados — não precisam ser marcados. Mudar o
          calendário <strong className="text-tinta">não muda</strong> a data de empréstimo já em
          curso: ela foi calculada e combinada com o aluno na hora da retirada.
        </p>

        {podeEditar && (
          <form onSubmit={marcar} className="flex flex-col gap-[18px]">
            <div className="grid gap-[18px] sm:grid-cols-3">
              <CampoComRotulo
                id="dia-nao-letivo-data"
                rotulo="Data"
                type="date"
                value={data}
                onChange={(evento) => setData(evento.target.value)}
              />
              <CampoComRotulo
                id="dia-nao-letivo-ate"
                rotulo="Até (opcional)"
                dica="Preenchido, marca o período inteiro — recesso, férias, semana de prova."
                type="date"
                value={ate}
                onChange={(evento) => setAte(evento.target.value)}
              />
              <CampoComRotulo
                id="dia-nao-letivo-motivo"
                rotulo="Motivo"
                dica="Fica gravado no dia. Sem ele, meses depois ninguém sabe se foi feriado, recesso ou engano — e ninguém ousa apagar."
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                autoComplete="off"
                placeholder="Independência do Brasil"
              />
            </div>

            {erro !== null && <Faixa tom="erro">{erro}</Faixa>}
            {aviso !== null && <Faixa tom="sucesso">{aviso}</Faixa>}

            <div>
              <Botao type="submit" icone="mais" disabled={salvando}>
                {salvando
                  ? 'Marcando…'
                  : emPeriodo
                    ? 'Marcar período como não letivo'
                    : 'Marcar dia como não letivo'}
              </Botao>
            </div>
          </form>
        )}

        {meses.length === 0 ? (
          <p className="text-[13.5px] text-tinta-2">
            Nenhum dia não letivo marcado. O cálculo do prazo está pulando só sábados e domingos.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {meses.map((mes) => (
              <div key={mes.chave}>
                <Rotulo>{mes.titulo}</Rotulo>
                <ul className="mt-2 flex flex-col">
                  {mes.dias.map((dia) => (
                    <li
                      key={dia.iso}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-linha py-[10px] last:border-b-0"
                    >
                      <div className="min-w-0">
                        <span className="text-[13.5px] font-semibold text-tinta">
                          {dia.escrito}
                        </span>
                        <span className="ml-2 text-[12.5px] text-tinta-2">{dia.diaDaSemana}</span>
                        {dia.ehFimDeSemana && (
                          <span className="mt-[2px] block text-[12px] text-tinta-3">
                            Já era fechado por ser fim de semana — marcar não muda nenhum prazo.
                          </span>
                        )}
                      </div>

                      {podeEditar && (
                        <Botao
                          type="button"
                          variante="fantasma"
                          icone="xis"
                          onClick={() => void desmarcar(dia)}
                          disabled={desmarcando === dia.iso}
                        >
                          {desmarcando === dia.iso ? 'Desmarcando…' : 'Desmarcar'}
                        </Botao>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Cartao>
  )
}
