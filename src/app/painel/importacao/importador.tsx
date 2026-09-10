'use client'

import { useCallback, useState, type ChangeEvent, type ReactElement } from 'react'
import { Botao } from '@/components/ui/botao'
import { Cartao } from '@/components/ui/cartao'
import { Faixa } from '@/components/ui/faixa'
import { Rotulo } from '@/components/ui/rotulo'
import type { ProblemaNaLinha } from '@/modules/importacao/importacao.service'
import { EXTENSOES_ACEITAS, LIMITE_EM_TEXTO, validarArquivoEnviado } from './arquivo'
import { EscolhaDeColunas } from './escolha-de-colunas'
import { PREFIXO_DA_COLUNA } from './mapeamento'
import { PlanoDaImportacao } from './plano-da-importacao'
import { agruparPorMotivo, frasearLinhas } from './plano-na-tela'
import {
  analisarPlanilhaAction,
  importarPlanilhaAction,
  type CampoNaTela,
  type LeituraDaPlanilha,
  type PlanoNaTela,
} from './actions'

/**
 * A tela de importação de alunos, em três passos que são o trabalho real:
 *
 *  1. a planilha da secretaria;
 *  2. de qual coluna sai qual campo — conferido, não adivinhado em
 *     silêncio;
 *  3. o PLANO, e só então o botão de gravar.
 *
 * O passo 3 é a razão de a tela existir. Sem alunos cadastrados o balcão
 * não empresta para ninguém, e a planilha é o caminho primário para eles
 * entrarem (decisão 8) — mas importador que grava direto e avisa depois é
 * como a escola perde o controle da própria base. Aqui nada é gravado até
 * a operadora ver quantos entram, quantos são pulados e quais linhas
 * estão com problema.
 *
 * O arquivo fica no navegador entre a análise e a confirmação, e é
 * reenviado na hora de gravar: o serviço é sem memória e refaz a análise
 * antes de escrever. Guardar a planilha no servidor entre os dois passos
 * criaria uma segunda verdade sobre um arquivo com dados de menores.
 */
export function Importador({ campos }: { campos: CampoNaTela[] }): ReactElement {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [leitura, setLeitura] = useState<LeituraDaPlanilha | null>(null)
  const [plano, setPlano] = useState<PlanoNaTela | null>(null)
  const [escolhido, setEscolhido] = useState<Record<string, string>>({})
  const [mapeamentoTocado, setMapeamentoTocado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // As linhas que a GRAVAÇÃO recusou, que só existem quando o arquivo
  // muda entre a análise e a confirmação. Estado próprio porque não são
  // as do plano: o plano já foi descartado quando elas aparecem.
  const [problemasDaGravacao, setProblemasDaGravacao] = useState<ProblemaNaLinha[] | null>(null)
  const [resultado, setResultado] = useState<
    { arquivo: string; importados: number; ignorados: number } | null
  >(null)
  const [ocupado, setOcupado] = useState<'analise' | 'gravacao' | null>(null)
  // Trocar a chave remonta o <input type="file">, que é a única forma de
  // limpar a escolha anterior sem manipular o DOM à mão. Sem isso,
  // escolher DE NOVO o mesmo arquivo depois de corrigi-lo no Excel não
  // dispara `change`, e a operadora acha que a tela travou.
  const [chaveDoSeletor, setChaveDoSeletor] = useState(0)

  const analisar = useCallback(
    async (arquivoAAnalisar: File, mapeamentoExplicito: Record<string, string> | null) => {
      setOcupado('analise')
      setErro(null)
      setAviso(null)
      setResultado(null)
      setProblemasDaGravacao(null)

      try {
        const resposta = await analisarPlanilhaAction(
          montarFormulario(arquivoAAnalisar, campos, mapeamentoExplicito),
        )

        if (resposta.situacao === 'recusada') {
          setErro(resposta.erro)
          setLeitura(null)
          setPlano(null)
          return
        }

        setLeitura(resposta.leitura)
        // Os selects passam a mostrar o mapeamento REALMENTE usado na
        // análise. Mostrar o que a operadora pediu, quando o servidor
        // usou outro, faria a tela mentir sobre a origem dos números.
        setEscolhido(comoTexto(campos, resposta.leitura.mapeamento))
        setMapeamentoTocado(false)

        if (resposta.situacao === 'falta-mapear') {
          setPlano(null)
          setAviso(resposta.erro)
          return
        }

        setPlano(resposta.plano)
      } catch {
        // Reenviar o arquivo falha quando ele foi movido ou reescrito no
        // Excel depois de escolhido — o navegador já não consegue lê-lo.
        setErro(
          'Não foi possível enviar a planilha. Se você a editou depois de escolher, ' +
            'selecione o arquivo de novo.',
        )
      } finally {
        setOcupado(null)
      }
    },
    [campos],
  )

  function escolherArquivo(evento: ChangeEvent<HTMLInputElement>): void {
    const lista = evento.target.files
    const escolhidoAgora = lista === null || lista.length === 0 ? null : lista[0]
    if (escolhidoAgora === null || escolhidoAgora === undefined) return

    // A mesma validação da action, rodando aqui só para a recusa ser
    // imediata. A que vale é a do servidor: o navegador não é autoridade
    // sobre nada.
    const validacao = validarArquivoEnviado(escolhidoAgora.name, escolhidoAgora.size)
    if (!validacao.ok) {
      setErro(validacao.erro)
      setArquivo(null)
      setLeitura(null)
      setPlano(null)
      return
    }

    setArquivo(escolhidoAgora)
    void analisar(escolhidoAgora, null)
  }

  async function gravar(): Promise<void> {
    if (arquivo === null || leitura === null) return

    setOcupado('gravacao')
    setErro(null)
    setProblemasDaGravacao(null)

    try {
      const resposta = await importarPlanilhaAction(
        // O mapeamento enviado é o ANALISADO, não o que está nos selects:
        // é o único jeito de a gravação cumprir exatamente o plano que
        // está na tela.
        montarFormulario(arquivo, campos, comoTexto(campos, leitura.mapeamento)),
      )

      if (resposta.situacao === 'gravada') {
        setResultado({
          arquivo: resposta.arquivo,
          importados: resposta.importados,
          ignorados: resposta.ignorados,
        })
        // A planilha gravada sai da tela: deixar o plano aceso convidaria
        // a confirmar de novo, e a segunda passada não erraria — ela
        // simplesmente ignoraria os 400, o que é igualmente confuso.
        setArquivo(null)
        setLeitura(null)
        setPlano(null)
        setChaveDoSeletor((atual) => atual + 1)
        return
      }

      if (resposta.situacao === 'com-erros') {
        // Chegar aqui significa que o arquivo mudou entre a análise e a
        // confirmação — o Excel reescreveu a planilha embaixo da tela. O
        // plano que está na tela já não vale, então ele sai; e os
        // problemas que o servidor devolveu entram no lugar, porque só
        // eles dizem QUAIS linhas mudaram. Nada foi gravado: a
        // importação é tudo-ou-nada.
        setErro(resposta.erro)
        setPlano(null)
        setProblemasDaGravacao(resposta.problemas)
        return
      }

      setErro(resposta.erro)
    } catch {
      setErro(
        'Não foi possível enviar a planilha para gravação. Nada foi importado — ' +
          'selecione o arquivo de novo.',
      )
    } finally {
      setOcupado(null)
    }
  }

  const analisando = ocupado === 'analise'
  const gravando = ocupado === 'gravacao'

  return (
    <div className="flex max-w-[980px] flex-col gap-5">
      {erro !== null && <Faixa tom="erro">{erro}</Faixa>}

      {problemasDaGravacao !== null && (
        <Cartao>
          <Rotulo tom="discreto">Linhas recusadas na gravação · nada foi importado</Rotulo>
          <p className="mt-[6px] text-[13.5px] text-tinta-2">
            O arquivo mudou depois da conferência. Corrija estas linhas na planilha e escolha o
            arquivo de novo no passo 1 — os números são os das linhas como o Excel as mostra.
          </p>
          <ul className="mt-[12px] flex flex-col gap-[6px]">
            {agruparPorMotivo(problemasDaGravacao).map((grupo) => (
              <li key={grupo.motivo} className="text-[13px] text-tinta-2">
                <span className="font-semibold text-tinta">{grupo.motivo}</span> ·{' '}
                {frasearLinhas(grupo.linhas)}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {resultado !== null && (
        <Faixa
          tom="sucesso"
          titulo={`${resultado.importados} aluno(s) importados de "${resultado.arquivo}".`}
        >
          {resultado.ignorados > 0
            ? `${resultado.ignorados} linha(s) foram ignoradas porque já estavam cadastradas.`
            : 'Nenhuma linha precisou ser ignorada.'}
        </Faixa>
      )}

      <Cartao>
        <Passo numero="1" titulo="A planilha da secretaria" />

        <p className="mt-[10px] text-[13.5px] text-tinta-2">
          A primeira linha do arquivo tem de ser o cabeçalho com o nome das colunas. As colunas
          obrigatórias são {listarObrigatorios(campos)} — as outras entram se existirem.
        </p>

        <div className="mt-4">
          <label htmlFor="planilha">
            <Rotulo>Arquivo da planilha</Rotulo>
          </label>
        </div>

        <div className="mt-[7px] flex flex-wrap items-center gap-[14px]">
          <input
            key={chaveDoSeletor}
            id="planilha"
            type="file"
            accept={EXTENSOES_ACEITAS.join(',')}
            disabled={analisando || gravando}
            onChange={escolherArquivo}
            className="block cursor-pointer rounded-controle border border-linha-2 bg-superficie px-3 py-[9px] text-[13.5px] text-tinta file:mr-3 file:cursor-pointer file:rounded-controle file:border-0 file:bg-papel-2 file:px-3 file:py-[6px] file:text-[13px] file:font-semibold file:text-tinta disabled:cursor-not-allowed disabled:opacity-40"
          />
          {analisando && (
            <span role="status" className="text-[13.5px] text-tinta-2">
              Lendo a planilha…
            </span>
          )}
        </div>

        <p className="mt-3 text-[12.5px] text-tinta-3">
          {EXTENSOES_ACEITAS.join(' ou ')} · até {LIMITE_EM_TEXTO} por arquivo. Escolher o arquivo
          não grava nada: o próximo passo é conferir o plano.
        </p>
      </Cartao>

      {leitura !== null && (
        <Cartao>
          <Passo numero="2" titulo="De qual coluna sai cada campo" />

          {aviso !== null ? (
            <div className="mt-[14px]">
              <Faixa tom="atencao" titulo="Falta dizer onde estão as colunas obrigatórias.">
                {aviso}
              </Faixa>
            </div>
          ) : (
            <p className="mt-[10px] text-[13.5px] text-tinta-2">
              Isto é o que o sistema reconheceu no cabeçalho de{' '}
              <span className="font-medium text-tinta">{leitura.arquivo}</span>. Corrija se alguma
              coluna estiver no campo errado.
            </p>
          )}

          <div className="mt-[18px]">
            <EscolhaDeColunas
              campos={campos}
              cabecalho={leitura.cabecalho}
              escolhido={escolhido}
              desabilitado={analisando || gravando}
              onEscolher={(chave, coluna) => {
                setEscolhido((atual) => ({ ...atual, [chave]: coluna }))
                setMapeamentoTocado(true)
              }}
            />
          </div>

          {mapeamentoTocado && (
            <div className="mt-5 flex flex-wrap items-center gap-[14px] border-t border-linha pt-5">
              {/* O plano em tela foi calculado com o mapeamento ANTIGO.
                  Enquanto a releitura não acontecer, não existe plano
                  para confirmar — e é por isso que o botão de gravar
                  desaparece em vez de ficar aceso com número velho. */}
              <Botao
                type="button"
                icone="troca"
                disabled={arquivo === null || analisando}
                onClick={() => {
                  if (arquivo !== null) void analisar(arquivo, escolhido)
                }}
              >
                Reconferir a planilha
              </Botao>
              <span className="text-[13px] text-tinta-2">
                As colunas mudaram: releia a planilha para ver o plano com o novo mapeamento.
              </span>
            </div>
          )}
        </Cartao>
      )}

      {leitura !== null && plano !== null && !mapeamentoTocado && (
        <div>
          <div className="mb-[10px]">
            <Passo numero="3" titulo="O plano — nada foi gravado ainda" />
          </div>

          <PlanoDaImportacao
            leitura={leitura}
            plano={plano}
            acoes={
              plano.problemas.length > 0 ? (
                <div className="flex flex-wrap items-center gap-[14px]">
                  <span className="text-[13.5px] text-tinta-2">
                    Corrija as linhas acima na planilha e escolha o arquivo de novo no passo 1.
                  </span>
                </div>
              ) : plano.entram === 0 ? (
                <div className="flex flex-wrap items-center gap-[14px]">
                  <span className="text-[13.5px] text-tinta-2">
                    Não há nada para importar: todas as linhas desta planilha já estão
                    cadastradas.
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-[14px]">
                  <Botao
                    type="button"
                    tamanho="grande"
                    icone="pessoas"
                    disabled={gravando}
                    onClick={() => void gravar()}
                  >
                    {gravando
                      ? 'Gravando…'
                      : `Importar ${plano.entram} aluno(s) de uma vez`}
                  </Botao>
                  {gravando && (
                    <span role="status" className="text-[13px] text-tinta-2">
                      Uma gravação só, sem parciais. Não feche a página.
                    </span>
                  )}
                </div>
              )
            }
          />
        </div>
      )}
    </div>
  )
}

function Passo({ numero, titulo }: { numero: string; titulo: string }): ReactElement {
  return (
    <div className="flex items-center gap-[10px]">
      <span
        aria-hidden="true"
        className="flex h-[21px] w-[21px] items-center justify-center rounded-full bg-marca font-mono text-[11.5px] text-white"
      >
        {numero}
      </span>
      <h2 className="font-serif text-[17px] font-semibold text-tinta">{titulo}</h2>
    </div>
  )
}

function listarObrigatorios(campos: CampoNaTela[]): string {
  const rotulos = campos.filter((campo) => campo.obrigatorio).map((campo) => campo.rotulo)
  if (rotulos.length <= 1) return rotulos.join('')
  return `${rotulos.slice(0, -1).join(', ')} e ${rotulos[rotulos.length - 1]}`
}

function comoTexto(
  campos: CampoNaTela[],
  mapeamento: Record<string, number>,
): Record<string, string> {
  const texto: Record<string, string> = {}
  for (const campo of campos) {
    const coluna = mapeamento[campo.chave]
    // Campo sem coluna vira string vazia, que é o "não usar" do select.
    // Um `?? 0` aqui apontaria todo campo ausente para a primeira coluna
    // da planilha — o tipo de valor mágico que o projeto proíbe.
    texto[campo.chave] = coluna === undefined ? '' : String(coluna)
  }
  return texto
}

function montarFormulario(
  arquivo: File,
  campos: CampoNaTela[],
  mapeamento: Record<string, string> | null,
): FormData {
  const dados = new FormData()
  dados.set('arquivo', arquivo)

  if (mapeamento === null) return dados

  // O sinalizador diz ao servidor "este mapeamento é escolha, não
  // ausência de escolha" — sem ele, deixar todos os campos em "não usar"
  // cairia na sugestão automática e a tela mostraria um plano de outro
  // mapeamento.
  dados.set('mapeamento-explicito', '1')
  for (const campo of campos) {
    const coluna = mapeamento[campo.chave]
    dados.set(`${PREFIXO_DA_COLUNA}${campo.chave}`, coluna === undefined ? '' : coluna)
  }
  return dados
}
