'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Botao } from '@/components/ui/botao'
import { CabecalhoDeCartao, Cartao } from '@/components/ui/cartao'
import { CampoComRotulo } from '@/components/ui/campo'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import { Celula, CelulaDeTitulo, Tabela } from '@/components/ui/tabela'
import type { ConfiguracaoDaEscola, OverrideDeSerie } from '@/modules/circulacao/configuracao'
import { removerAjusteDeSerieAction, salvarAjusteDeSerieAction } from './actions'
import { CampoDeEscolha } from './campo-de-escolha'
import { MarcaDeOrigem } from './marca-de-origem'
import {
  CAMPOS_NUMERICOS,
  DESCRICOES,
  FORMULARIO_DE_SERIE_EM_BRANCO,
  descreverSerie,
  formularioDoOverride,
  separarPorOrigem,
  type CampoDaConfiguracao,
  type ErrosPorCampo,
  type FormularioDaSerie,
} from './configuracao-na-tela'

/**
 * Os ajustes por série.
 *
 * O ajuste vale **campo a campo**: a série pode mudar só o limite e
 * herdar o resto. É a regra mais fácil de não entender do sistema
 * inteiro, então a tela a mostra em vez de explicá-la — cada campo de
 * cada série aparece com a marca de onde o valor vem e, quando é ajuste,
 * com o valor que a escola usaria ao lado.
 *
 * Sem isso a coordenação vê "6º ano tem 7 dias" sem saber se ela
 * escolheu 7 ou se herdou de algum lugar — e muda o prazo da escola
 * esperando mudar o do 6º ano.
 */
export function AjustesPorSerie({
  daEscola,
  overrides,
  podeEditar,
}: {
  daEscola: ConfiguracaoDaEscola
  overrides: OverrideDeSerie[]
  podeEditar: boolean
}) {
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  function terminar(mensagem: string) {
    setAviso(mensagem)
    setCriando(false)
    setEditando(null)
  }

  return (
    <Cartao semPadding>
      <CabecalhoDeCartao>
        <span className="text-tinta-3">
          <Icone nome="pessoas" tamanho={20} traco={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-semibold text-tinta">Ajustes por série</h2>
          <p className="text-[12.5px] text-tinta-2">
            campo a campo: o que a série não ajusta, ela herda
          </p>
        </div>
      </CabecalhoDeCartao>

      <div className="flex flex-col gap-5 px-[22px] py-5">
        <p className="text-[13px] text-tinta-2">
          O ajuste sobrescreve <strong className="text-tinta">só os campos preenchidos</strong>. O
          1º ano pode levar 1 livro por 7 dias e continuar herdando a penalidade e o prazo de
          retirada da escola. Campo deixado em branco significa herdar — e passa a acompanhar a
          escola quando ela mudar.
        </p>

        {aviso !== null && <Faixa tom="sucesso">{aviso}</Faixa>}

        {overrides.length === 0 ? (
          <p className="text-[13.5px] text-tinta-2">
            Nenhuma série tem ajuste próprio: todas seguem as regras da escola em todos os campos.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {overrides.map((override) => (
              <li key={override.serie}>
                {editando === override.serie ? (
                  <FormularioDeSerie
                    inicial={formularioDoOverride(override)}
                    serieFixa
                    onCancelar={() => setEditando(null)}
                    onSalvo={terminar}
                  />
                ) : (
                  <BlocoDaSerie
                    daEscola={daEscola}
                    override={override}
                    podeEditar={podeEditar}
                    onEditar={() => {
                      setAviso(null)
                      setCriando(false)
                      setEditando(override.serie)
                    }}
                    onRemovido={terminar}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {podeEditar &&
          (criando ? (
            <FormularioDeSerie
              inicial={FORMULARIO_DE_SERIE_EM_BRANCO}
              serieFixa={false}
              onCancelar={() => setCriando(false)}
              onSalvo={terminar}
            />
          ) : (
            <div>
              <Botao
                type="button"
                variante="secundaria"
                icone="mais"
                onClick={() => {
                  setAviso(null)
                  setEditando(null)
                  setCriando(true)
                }}
              >
                Ajustar uma série
              </Botao>
            </div>
          ))}
      </div>
    </Cartao>
  )
}

/**
 * Uma série, campo a campo.
 *
 * A coluna da direita diz a origem com palavra e ícone; embaixo do valor
 * ajustado vem o que a escola usaria, que é a comparação que explica o
 * ajuste sem obrigar a coordenação a subir a tela para conferir.
 */
function BlocoDaSerie({
  daEscola,
  override,
  podeEditar,
  onEditar,
  onRemovido,
}: {
  daEscola: ConfiguracaoDaEscola
  override: OverrideDeSerie
  podeEditar: boolean
  onEditar: () => void
  onRemovido: (mensagem: string) => void
}) {
  const linhas = descreverSerie(daEscola, override)
  const { ajustados } = separarPorOrigem(linhas)

  return (
    <div className="rounded-cartao border border-linha">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linha bg-papel-2 px-4 py-3">
        <div>
          <div className="text-[14px] font-semibold text-tinta">{override.serie}</div>
          <Rotulo tom="discreto">
            {/* Contagem, não estado: sai da lista de linhas, sempre. */}
            {ajustados.length} de {linhas.length} campos ajustados
          </Rotulo>
        </div>

        {podeEditar && (
          <div className="flex items-center gap-2">
            <Botao type="button" variante="secundaria" icone="ajustes" onClick={onEditar}>
              Editar ajuste
            </Botao>
            <BotaoDeRemover serie={override.serie} onRemovido={onRemovido} />
          </div>
        )}
      </div>

      <div className="overflow-x-auto px-4 py-2">
        <Tabela>
          <thead>
            <tr>
              <CelulaDeTitulo>Campo</CelulaDeTitulo>
              <CelulaDeTitulo>Vale nesta série</CelulaDeTitulo>
              <CelulaDeTitulo>Origem</CelulaDeTitulo>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr key={linha.campo}>
                <Celula className="text-tinta-2">{linha.rotulo}</Celula>
                <Celula>
                  <span className="font-semibold text-tinta">{linha.valorEfetivo}</span>
                  {linha.origem === 'SERIE' && (
                    <span className="mt-[2px] block text-[12px] text-tinta-3">
                      a escola usaria {linha.valorDaEscola}
                    </span>
                  )}
                </Celula>
                <Celula>
                  <MarcaDeOrigem origem={linha.origem} />
                </Celula>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </div>
    </div>
  )
}

/**
 * Remover o ajuste, em dois passos.
 *
 * Dois passos porque o efeito não é visível na hora e vale para uma série
 * inteira: o 1º ano volta a levar o número de livros da escola pelo prazo
 * da escola, e ninguém no balcão vai notar até o próximo empréstimo.
 */
function BotaoDeRemover({
  serie,
  onRemovido,
}: {
  serie: string
  onRemovido: (mensagem: string) => void
}) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function remover() {
    setErro(null)
    setEnviando(true)

    try {
      const resposta = await removerAjusteDeSerieAction(serie)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      setConfirmando(false)
      onRemovido(resposta.aviso)
      // A lista de ajustes é lida no servidor: sem recarregar, a série
      // removida continuaria na tela com os valores dela.
      router.refresh()
    } finally {
      setEnviando(false)
    }
  }

  if (!confirmando) {
    return (
      <div className="flex flex-col items-end gap-[6px]">
        <Botao
          type="button"
          variante="fantasma"
          icone="xis"
          onClick={() => {
            setErro(null)
            setConfirmando(true)
          }}
        >
          Remover ajuste
        </Botao>
        {erro !== null && <Faixa tom="erro">{erro}</Faixa>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-[8px]">
      <p className="max-w-[320px] text-right text-[12.5px] text-tinta-2">
        <strong className="text-tinta">{serie}</strong> volta a seguir as regras da escola em
        todos os campos.
      </p>

      <div className="flex items-center gap-2">
        <Botao
          type="button"
          variante="fantasma"
          onClick={() => setConfirmando(false)}
          disabled={enviando}
        >
          Não
        </Botao>
        <Botao type="button" variante="perigo" icone="xis" onClick={remover} disabled={enviando}>
          {enviando ? 'Removendo…' : 'Confirmar remoção'}
        </Botao>
      </div>

      {erro !== null && <Faixa tom="erro">{erro}</Faixa>}
    </div>
  )
}

/**
 * O formulário de uma série.
 *
 * Campo em branco é herança, e o texto de apoio de cada campo diz isso —
 * um campo vazio que a pessoa lê como "zero" mudaria a regra sem ela
 * querer. A série não é editável quando o ajuste já existe: trocar o nome
 * ali criaria um segundo ajuste e deixaria o antigo no ar.
 */
function FormularioDeSerie({
  inicial,
  serieFixa,
  onCancelar,
  onSalvo,
}: {
  inicial: FormularioDaSerie
  serieFixa: boolean
  onCancelar: () => void
  onSalvo: (mensagem: string) => void
}) {
  const router = useRouter()
  const [form, setForm] = useState<FormularioDaSerie>(inicial)
  const [porCampo, setPorCampo] = useState<ErrosPorCampo>({})
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  function mudar(campo: CampoDaConfiguracao | 'serie', valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }))

    if (campo === 'serie') return
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
    setSalvando(true)

    try {
      const resposta = await salvarAjusteDeSerieAction(form)
      if (!resposta.ok) {
        setErro(resposta.erro)
        setPorCampo(resposta.porCampo)
        return
      }

      setPorCampo({})
      onSalvo(resposta.aviso)
      router.refresh()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form
      onSubmit={salvar}
      className="flex flex-col gap-[18px] rounded-cartao border border-marca bg-papel-2 p-4 ring-[3px] ring-marca/10"
    >
      <div className="grid gap-[18px] sm:grid-cols-2">
        <CampoComRotulo
          id="serie-nome"
          rotulo="Série"
          dica={
            serieFixa
              ? 'A série do ajuste não muda. Para outra série, crie outro ajuste.'
              : 'Escreva exatamente como a série aparece nas turmas — por exemplo, 6º ano.'
          }
          value={form.serie}
          readOnly={serieFixa}
          onChange={(evento) => mudar('serie', evento.target.value)}
          autoComplete="off"
        />

        {CAMPOS_NUMERICOS.map((campo) => (
          <CampoComRotulo
            key={campo}
            id={`serie-${campo}`}
            rotulo={DESCRICOES[campo].rotulo}
            dica="Em branco: herda da escola."
            erro={porCampo[campo]}
            value={form[campo]}
            onChange={(evento) => mudar(campo, evento.target.value)}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="herda"
            className="max-w-[160px]"
          />
        ))}

        <CampoDeEscolha
          id="serie-alunoPodeReservar"
          rotulo={DESCRICOES.alunoPodeReservar.rotulo}
          erro={porCampo.alunoPodeReservar}
          valor={form.alunoPodeReservar}
          opcoes={[
            { valor: 'HERDA', rotulo: 'Herda da escola' },
            { valor: 'SIM', rotulo: 'Sim — o aluno reserva pelo portal' },
            { valor: 'NAO', rotulo: 'Não — só a biblioteca reserva' },
          ]}
          onEscolher={(valor) => mudar('alunoPodeReservar', valor)}
        />
      </div>

      {erro !== null && <Faixa tom="erro">{erro}</Faixa>}

      <div className="flex items-center gap-3">
        <Botao type="submit" icone="check" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar ajuste da série'}
        </Botao>
        <Botao type="button" variante="fantasma" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Botao>
      </div>
    </form>
  )
}
