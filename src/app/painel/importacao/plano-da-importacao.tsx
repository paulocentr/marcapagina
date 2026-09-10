'use client'

import type { ReactElement, ReactNode } from 'react'
import { Cartao, CabecalhoDeCartao } from '@/components/ui/cartao'
import { Matricula } from '@/components/ui/codigo'
import { Faixa } from '@/components/ui/faixa'
import { Rotulo } from '@/components/ui/rotulo'
import { Celula, CelulaDeTitulo, Tabela } from '@/components/ui/tabela'
import { ChipDoPlano, type DestinoDaLinha } from './chip-do-plano'
import { frasearLinhas, resumirPlano, type GrupoDeMotivo } from './plano-na-tela'
import type { LeituraDaPlanilha, PlanoNaTela } from './actions'

/**
 * O PLANO, mostrado antes de qualquer gravação.
 *
 * É a razão de a tela existir em dois passos em vez de um botão só. O
 * serviço tem `previsualizar` separado de `importar` de propósito: a
 * operadora vê quantos alunos entram, quantos já estão cadastrados e
 * quais linhas estão com problema — e só então confirma. Importador que
 * grava direto e avisa depois é como a escola perde o controle da
 * própria base.
 *
 * Nenhum número aqui é calculado por esta tela a partir de suposição:
 * todos vêm da prévia do serviço, e `resumirPlano` só os soma.
 */

/** Acima disto a lista detalhada é cortada; os agrupados dizem o resto. */
const PROBLEMAS_DETALHADOS = 50

export function PlanoDaImportacao({
  leitura,
  plano,
  acoes,
}: {
  leitura: LeituraDaPlanilha
  plano: PlanoNaTela
  /** O que fazer em seguida. Fica aqui embaixo, ao lado do que decide. */
  acoes: ReactNode
}): ReactElement {
  const resumo = resumirPlano({
    entram: plano.entram,
    jaCadastrados: plano.jaCadastrados,
    problemas: plano.problemas,
  })

  return (
    <Cartao semPadding>
      <CabecalhoDeCartao>
        <div className="min-w-0">
          <div className="truncate font-serif text-base font-bold text-tinta">
            {leitura.arquivo}
          </div>
          <div className="mt-[2px] text-[12.5px] text-tinta-2">
            {leitura.totalDeLinhas} linha(s) de aluno lidas · cabeçalho na linha 1
          </div>
        </div>
      </CabecalhoDeCartao>

      <div className="flex flex-col gap-6 p-[22px]">
        {/* Toda linha lida cai em um dos três destinos — entra, é pulada
            ou está com problema. Se a soma não fecha com o que o leitor
            encontrou no arquivo, alguma linha desapareceu no caminho, e a
            operadora precisa saber ANTES de confirmar: um plano que não
            explica o arquivo inteiro é um plano que não se pode aprovar. */}
        {resumo.linhasLidas !== leitura.totalDeLinhas && (
          <Faixa tom="atencao" titulo="O plano não explica o arquivo inteiro.">
            O leitor encontrou {leitura.totalDeLinhas} linha(s) e o plano dá conta de{' '}
            {resumo.linhasLidas}. Escolha o arquivo de novo antes de confirmar.
          </Faixa>
        )}

        <div className="grid gap-[10px] sm:grid-cols-3">
          <Contagem destino="ENTRA" quantos={resumo.entram} />
          <Contagem destino="JA_CADASTRADO" quantos={resumo.jaCadastrados} />
          <Contagem destino="COM_PROBLEMA" quantos={resumo.comProblema} />
        </div>

        {/* A frase do tudo-ou-nada aparece ANTES de confirmar, não depois
            de falhar: é o que impede a operadora de imaginar que a
            importação anda aos poucos e pode ser interrompida no meio. */}
        <p className="text-[13px] text-tinta-2">
          A gravação é única e indivisível: ou entram os {resumo.entram} de uma vez, ou não entra
          nenhum. Nada é gravado enquanto você não confirmar.
        </p>

        {plano.amostra.length > 0 && <Amostra plano={plano} />}

        {resumo.comProblema > 0 && (
          <Problemas grupos={resumo.motivosDosProblemas} problemas={plano.problemas} />
        )}

        {resumo.jaCadastrados > 0 && (
          <JaCadastrados quantos={resumo.jaCadastrados} grupos={resumo.motivosDosJaCadastrados} />
        )}

        <div className="border-t border-linha pt-5">{acoes}</div>
      </div>
    </Cartao>
  )
}

function Contagem({ destino, quantos }: { destino: DestinoDaLinha; quantos: number }): ReactElement {
  return (
    <div className="rounded-controle border border-linha bg-papel px-[15px] py-[13px]">
      <div className="font-mono text-[22px] leading-none font-semibold text-tinta">{quantos}</div>
      <div className="mt-[9px]">
        <ChipDoPlano destino={destino} />
      </div>
    </div>
  )
}

function Amostra({ plano }: { plano: PlanoNaTela }): ReactElement {
  return (
    <div>
      <Rotulo tom="discreto">Como o sistema entendeu as primeiras linhas</Rotulo>
      <p className="mt-[6px] mb-[10px] text-[13px] text-tinta-2">
        Confira se cada valor está na coluna certa. Coluna trocada produz planilha válida e
        cadastro errado — o nome do responsável no lugar do nome do aluno passa por todas as
        validações.
      </p>

      <div className="overflow-x-auto">
        <Tabela>
          <thead>
            <tr>
              <CelulaDeTitulo>Matrícula</CelulaDeTitulo>
              <CelulaDeTitulo>Nome do aluno</CelulaDeTitulo>
              <CelulaDeTitulo>Nascimento</CelulaDeTitulo>
              <CelulaDeTitulo>Responsável</CelulaDeTitulo>
            </tr>
          </thead>
          <tbody>
            {plano.amostra.map((linha) => (
              <tr key={`${linha.matricula} ${linha.nome}`}>
                <Celula>
                  <Matricula valor={linha.matricula} />
                </Celula>
                <Celula>{linha.nome}</Celula>
                <Celula>
                  <span className="font-mono text-[13px]">{linha.dataNascimento}</span>
                </Celula>
                <Celula>
                  {linha.responsavel === null ? (
                    <span className="text-tinta-3">não informado</span>
                  ) : (
                    linha.responsavel
                  )}
                </Celula>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </div>

      {plano.entram > plano.amostra.length && (
        <p className="mt-[10px] text-[12.5px] text-tinta-3">
          Mostrando {plano.amostra.length} das {plano.entram} linhas que entram.
        </p>
      )}
    </div>
  )
}

function Problemas({
  grupos,
  problemas,
}: {
  grupos: GrupoDeMotivo[]
  problemas: { linha: number; mensagem: string }[]
}): ReactElement {
  const detalhadas = problemas.slice(0, PROBLEMAS_DETALHADOS)

  return (
    <div className="flex flex-col gap-4">
      <Faixa tom="erro" titulo={`${problemas.length} linha(s) com problema.`}>
        Nada será gravado enquanto houver problema. Corrija na planilha e envie de novo — os
        números abaixo são os das linhas como o Excel as mostra.
      </Faixa>

      <div className="flex flex-col gap-[9px]">
        {grupos.map((grupo) => (
          <div
            key={grupo.motivo}
            className="rounded-controle border border-linha bg-papel px-[15px] py-[11px]"
          >
            <div className="text-[13.5px] font-semibold text-tinta">{grupo.motivo}</div>
            <div className="mt-[3px] text-[12.5px] text-tinta-2">
              {grupo.linhas.length} linha(s) · {frasearLinhas(grupo.linhas)}
            </div>
          </div>
        ))}
      </div>

      <div>
        <Rotulo tom="discreto">Linha por linha</Rotulo>
        <div className="mt-[8px] overflow-x-auto">
          <Tabela>
            <thead>
              <tr>
                <CelulaDeTitulo className="w-[110px]">Linha</CelulaDeTitulo>
                <CelulaDeTitulo>O que está errado</CelulaDeTitulo>
              </tr>
            </thead>
            <tbody>
              {detalhadas.map((problema) => (
                <tr key={`${problema.linha} ${problema.mensagem}`}>
                  <Celula>
                    <span className="font-mono text-[13.5px] font-semibold">{problema.linha}</span>
                  </Celula>
                  <Celula>{problema.mensagem}</Celula>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </div>

        {problemas.length > detalhadas.length && (
          <p className="mt-[10px] text-[12.5px] text-tinta-3">
            Mostrando as {detalhadas.length} primeiras. Os motivos acima nomeiam TODAS as linhas —
            nenhuma ficou escondida.
          </p>
        )}
      </div>
    </div>
  )
}

function JaCadastrados({
  quantos,
  grupos,
}: {
  quantos: number
  grupos: GrupoDeMotivo[]
}): ReactElement {
  return (
    <details className="rounded-controle border border-linha bg-papel px-[15px] py-[11px]">
      <summary className="cursor-pointer text-[13.5px] text-tinta">
        {quantos} linha(s) já cadastradas — serão ignoradas, e isso não é erro
      </summary>
      <p className="mt-[8px] text-[12.5px] text-tinta-2">
        Reimportar a planilha inteira da secretaria é o uso normal: quem já está no sistema é
        pulado, e nenhum cadastro existente é alterado por aqui.
      </p>
      <ul className="mt-[10px] flex flex-col gap-[6px]">
        {grupos.map((grupo) => (
          <li key={grupo.motivo} className="text-[12.5px] text-tinta-2">
            <span className="text-tinta">{grupo.motivo}</span> · {frasearLinhas(grupo.linhas)}
          </li>
        ))}
      </ul>
    </details>
  )
}
