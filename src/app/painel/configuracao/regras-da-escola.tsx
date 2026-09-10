'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Botao } from '@/components/ui/botao'
import { CabecalhoDeCartao, Cartao } from '@/components/ui/cartao'
import { CampoComRotulo } from '@/components/ui/campo'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { salvarRegrasDaEscolaAction } from './actions'
import { CampoDeEscolha } from './campo-de-escolha'
import {
  CAMPOS_NUMERICOS,
  DESCRICOES,
  type CampoDaConfiguracao,
  type ErrosPorCampo,
  type FormularioDaEscola,
} from './configuracao-na-tela'

/**
 * As regras que valem para a escola inteira.
 *
 * Os seis campos são lidos e conferidos de uma vez: a coordenação corrige
 * os seis numa passada em vez de descobrir um erro por salvamento.
 *
 * **A tela não conhece piso nem teto.** Quem recusa prazo 0 e limite 0 é
 * `validarConfiguracao`, e a frase que aparece na faixa é a dele. Uma
 * segunda cópia das faixas aqui divergiria da primeira correção feita em
 * apenas um dos dois lugares — e a divergência apareceria como "a tela
 * aceitou e o sistema recusou".
 */
export function RegrasDaEscola({ inicial }: { inicial: FormularioDaEscola }) {
  const router = useRouter()
  const [form, setForm] = useState<FormularioDaEscola>(inicial)
  const [porCampo, setPorCampo] = useState<ErrosPorCampo>({})
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  function mudar(campo: CampoDaConfiguracao, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }))

    // O erro do campo sai quando a pessoa mexe nele: manter a borda
    // vermelha embaixo do texto já corrigido faz a tela parecer travada.
    setPorCampo((atual) => {
      if (atual[campo] === undefined) return atual
      const copia = { ...atual }
      delete copia[campo]
      return copia
    })
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()

    setErro(null)
    setAviso(null)
    setSalvando(true)

    try {
      const resposta = await salvarRegrasDaEscolaAction(form)
      if (!resposta.ok) {
        setErro(resposta.erro)
        setPorCampo(resposta.porCampo)
        return
      }

      setPorCampo({})
      setAviso(resposta.aviso)
      // Os ajustes por série são desenhados no servidor comparando com a
      // configuração da escola. Sem recarregar, eles continuariam dizendo
      // "herdado" ao lado de um número que acabou de mudar.
      router.refresh()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Cartao semPadding>
      <CabecalhoDeCartao>
        <span className="text-tinta-3">
          <Icone nome="ajustes" tamanho={20} traco={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-semibold text-tinta">Regras da escola</h2>
          <p className="text-[12.5px] text-tinta-2">
            o padrão de toda série que não tem ajuste próprio
          </p>
        </div>
      </CabecalhoDeCartao>

      <form onSubmit={salvar} className="flex flex-col gap-5 px-[22px] py-5">
        <div className="grid gap-[18px] sm:grid-cols-2">
          {CAMPOS_NUMERICOS.map((campo) => (
            <CampoComRotulo
              key={campo}
              id={`escola-${campo}`}
              rotulo={DESCRICOES[campo].rotulo}
              dica={DESCRICOES[campo].ajuda}
              erro={porCampo[campo]}
              value={form[campo]}
              onChange={(evento) => mudar(campo, evento.target.value)}
              // `inputMode` numérico abre o teclado de número no celular, e
              // `type="text"` de propósito: `type="number"` aceita `1e3` e
              // vírgula conforme o idioma do navegador, e some com o valor
              // digitado quando ele não agrada ao campo. Quem lê o número é
              // `interpretarInteiro`, que só aceita dígitos.
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="max-w-[160px]"
            />
          ))}

          <CampoDeEscolha
            id="escola-alunoPodeReservar"
            rotulo={DESCRICOES.alunoPodeReservar.rotulo}
            dica={DESCRICOES.alunoPodeReservar.ajuda}
            erro={porCampo.alunoPodeReservar}
            valor={form.alunoPodeReservar}
            opcoes={[
              { valor: 'SIM', rotulo: 'Sim — o aluno reserva pelo portal' },
              { valor: 'NAO', rotulo: 'Não — só a biblioteca reserva' },
            ]}
            onEscolher={(valor) => mudar('alunoPodeReservar', valor)}
          />
        </div>

        {erro !== null && <Faixa tom="erro">{erro}</Faixa>}
        {aviso !== null && <Faixa tom="sucesso">{aviso}</Faixa>}

        <div className="flex items-center gap-3">
          <Botao type="submit" icone="check" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar regras da escola'}
          </Botao>
          <span className="text-[12px] text-tinta-3">
            Nenhum empréstimo em curso é recalculado.
          </span>
        </div>
      </form>
    </Cartao>
  )
}
