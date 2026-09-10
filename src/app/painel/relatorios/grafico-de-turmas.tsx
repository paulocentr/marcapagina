import type { ReactElement } from 'react'
import { Cartao } from '@/components/ui/cartao'
import { Icone } from '@/components/ui/icones'
import { Celula, CelulaDeTitulo, Tabela } from '@/components/ui/tabela'
import { ALTURA_DO_PLOT, escalaDeBarras, indicesComRotulo } from '@/modules/relatorios/escala'
import type { LinhaDeTurma } from '@/modules/relatorios/painel-do-leitor.service'
import { porAlunoNaTela } from './painel-na-tela'

/**
 * Empréstimos por turma.
 *
 * Duas leituras da mesma tabela, e nunca no mesmo eixo:
 *
 * - O GRÁFICO desenha o absoluto. Série única, uma cor só (o verde da
 *   marca), sem legenda — o título nomeia a série. Marcas finas com a
 *   ponta arredondada ancorada na linha de base, grade discreta, e
 *   rótulo de valor só na maior e na menor barra.
 * - A TABELA embaixo traz "por aluno", que é o engajamento de verdade:
 *   no absoluto a turma de trinta ganha sempre da turma de dez, e o
 *   ranking passa a medir tamanho de turma em vez de leitura.
 *
 * Duas escalas, dois desenhos. Um eixo duplo poria "45 empréstimos" e
 * "1,5 por aluno" na mesma régua e as duas leituras ficariam falsas.
 *
 * O gráfico é `aria-hidden` de propósito: a tabela logo abaixo tem os
 * mesmos números, com cabeçalho, e é ela que serve para quem ouve a tela.
 */
export function GraficoDeTurmas({
  turmas,
  rotuloDoPeriodo,
}: {
  turmas: LinhaDeTurma[]
  rotuloDoPeriodo: string
}): ReactElement {
  const valores = turmas.map((turma) => turma.emprestimos)
  const escala = escalaDeBarras(valores, ALTURA_DO_PLOT)
  const comRotulo = new Set(indicesComRotulo(valores))

  return (
    <Cartao semPadding className="min-w-0 px-[22px] py-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-semibold text-tinta">
          Empréstimos por turma, em {rotuloDoPeriodo}
        </h2>
        {turmas.length > 0 && (
          <span className="text-[12.5px] text-tinta-3">
            passe o cursor sobre a barra para ver o número
          </span>
        )}
      </div>

      {turmas.length === 0 ? (
        <p className="mt-4 text-[13.5px] text-tinta-2">
          Nenhuma turma com aluno ativo ou empréstimo no período. Enquanto as turmas não
          estiverem cadastradas, este gráfico fica vazio — e é melhor vazio do que com uma
          barra inventada.
        </p>
      ) : (
        <>
          <div className="mt-5 flex gap-[14px]" aria-hidden="true">
            {/* Eixo y: três marcas inteiras, discretas, em mono. */}
            <div
              className="relative w-[26px] shrink-0"
              style={{ height: `${ALTURA_DO_PLOT}px` }}
            >
              {escala.marcas.map((marca, indice) => (
                <span
                  key={marca}
                  className="absolute right-0 font-mono text-[10.5px] text-tinta-3"
                  style={{
                    top: `${(indice / (escala.marcas.length - 1)) * ALTURA_DO_PLOT - 6}px`,
                  }}
                >
                  {marca}
                </span>
              ))}
            </div>

            <div
              className="relative min-w-0 grow overflow-x-auto"
              style={{ height: `${ALTURA_DO_PLOT}px` }}
            >
              {escala.marcas.map((marca, indice) => (
                <div
                  key={marca}
                  className={`absolute inset-x-0 border-t ${
                    marca === 0 ? 'border-linha-2' : 'border-linha'
                  }`}
                  style={{ top: `${(indice / (escala.marcas.length - 1)) * ALTURA_DO_PLOT}px` }}
                />
              ))}

              <div
                className="relative flex items-end gap-3"
                style={{ height: `${ALTURA_DO_PLOT}px` }}
              >
                {turmas.map((turma, indice) => (
                  <div
                    key={turma.turmaId ?? 'sem-turma'}
                    className="relative flex h-full min-w-[18px] grow flex-col items-center justify-end"
                    // `title` e não tooltip de JavaScript: a tela é
                    // componente de servidor e o navegador já sabe fazer
                    // isso sem enviar um byte de script.
                    title={`${turma.nome}: ${turma.emprestimos} empréstimo(s)`}
                  >
                    {comRotulo.has(indice) && (
                      <span className="mb-1 font-mono text-[11.5px] font-semibold text-tinta">
                        {turma.emprestimos}
                      </span>
                    )}
                    <div
                      // Ponta arredondada de 4px ancorada na base: a
                      // barra nasce da linha de zero, nunca flutuando.
                      className="w-full rounded-t-[4px] bg-marca"
                      style={{ height: `${escala.alturas[indice] ?? 0}px` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Eixo x, alinhado com as barras. */}
          <div className="mt-2 flex gap-[14px]" aria-hidden="true">
            <div className="w-[26px] shrink-0" />
            <div className="flex min-w-0 grow gap-3">
              {turmas.map((turma) => (
                <span
                  key={turma.turmaId ?? 'sem-turma'}
                  className="min-w-[18px] grow text-center text-[11.5px] text-tinta-2"
                >
                  {turma.nome}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-start gap-[10px] border-t border-linha pt-[14px] text-[12.5px] text-tinta-2">
            <span className="mt-px shrink-0 text-tinta-3">
              <Icone nome="info" tamanho={15} traco={1.6} />
            </span>
            <span>
              A barra é o total da turma, e a turma maior empresta mais só por ser maior. A
              comparação justa é a coluna <strong>por aluno</strong> da tabela abaixo.
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <Tabela>
              <caption className="sr-only">
                Empréstimos por turma em {rotuloDoPeriodo}, com o total e a média por aluno
              </caption>
              <thead>
                <tr>
                  <CelulaDeTitulo>Turma</CelulaDeTitulo>
                  <CelulaDeTitulo className="text-right">Empréstimos</CelulaDeTitulo>
                  <CelulaDeTitulo className="text-right">Alunos ativos</CelulaDeTitulo>
                  <CelulaDeTitulo className="text-right">Por aluno</CelulaDeTitulo>
                </tr>
              </thead>
              <tbody>
                {turmas.map((turma) => (
                  <tr key={turma.turmaId ?? 'sem-turma'}>
                    <Celula className="font-semibold">{turma.nome}</Celula>
                    <Celula className="text-right font-mono">{turma.emprestimos}</Celula>
                    <Celula className="text-right font-mono text-tinta-2">{turma.alunos}</Celula>
                    <Celula
                      className={`text-right ${
                        turma.porAluno === null ? 'text-tinta-3' : 'font-mono font-semibold'
                      }`}
                    >
                      {porAlunoNaTela(turma.porAluno)}
                    </Celula>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        </>
      )}
    </Cartao>
  )
}
