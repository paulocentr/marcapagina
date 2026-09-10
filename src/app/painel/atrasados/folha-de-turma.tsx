import type { ReactElement } from 'react'
import { Cartao, CabecalhoDeCartao } from '@/components/ui/cartao'
import { Tombo } from '@/components/ui/codigo'
import { Icone } from '@/components/ui/icones'
import { Celula, CelulaDeTitulo, Tabela } from '@/components/ui/tabela'
import { formatarDataDaEscola, type GrupoDeAtraso, type TipoDeGrupo } from './atrasados-na-tela'
import { ChipDeAcumulo, ChipDeAtraso } from './chips-do-atraso'

/**
 * A folha de UMA turma: o que a coordenação imprime e manda para a
 * professora da sala.
 *
 * O cartão é a unidade de página no papel (ver `estilo-de-impressao.tsx`),
 * e por isso o cabeçalho repete o nome da turma e a data de emissão: solta
 * numa mesa de sala de aula, a folha tem de dizer de que sala ela é e de
 * que dia ela fala. Uma lista de atrasados sem data envelhece sem avisar,
 * e a professora cobra um livro que já voltou.
 *
 * A coluna "Turma" da prancha não existe aqui: a turma é o próprio
 * cabeçalho. Repeti-la em toda linha gastaria a largura que o título do
 * livro precisa.
 */
export function FolhaDeTurma({
  grupo,
  hoje,
}: {
  grupo: GrupoDeAtraso
  hoje: Date
}): ReactElement {
  return (
    <Cartao semPadding className="folha-de-turma mt-5 first:mt-0">
      <CabecalhoDeCartao>
        <span className="text-tinta-3">
          <Icone nome={grupo.tipo === 'EQUIPE' ? 'pessoas' : 'livros'} tamanho={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-semibold text-tinta">{grupo.rotulo}</h2>
          <p className="text-[12.5px] text-tinta-2">
            {grupo.linhas.length === 1
              ? '1 livro em atraso'
              : `${grupo.linhas.length} livros em atraso`}
            {' · '}
            {/* O maior atraso no cabeçalho: é o que decide se esta folha
                vai hoje ou pode esperar a próxima visita da turma. */}
            mais antigo há {grupo.maiorAtrasoEmDias === 1
              ? '1 dia'
              : `${grupo.maiorAtrasoEmDias} dias`}
          </p>
          {/* Só no papel: na tela a data de hoje é redundante, na folha
              solta ela é a diferença entre cobrar e cobrar errado. */}
          <p className="hidden text-[12px] text-tinta-2 print:block">
            Lista emitida em {formatarDataDaEscola(hoje)} — confira no Balcão antes de cobrar: o
            livro pode ter sido devolvido depois da impressão.
          </p>
        </div>
      </CabecalhoDeCartao>

      <div className="overflow-x-auto px-[22px] py-5">
        <Tabela>
          <caption className="sr-only">
            Livros em atraso de {grupo.rotulo}, do vencimento mais antigo para o mais recente.
          </caption>
          <thead>
            <tr>
              <CelulaDeTitulo className="w-[38%]">{PALAVRA_DO_LEITOR[grupo.tipo]}</CelulaDeTitulo>
              <CelulaDeTitulo>Livro</CelulaDeTitulo>
              <CelulaDeTitulo className="w-[96px]">Tombo</CelulaDeTitulo>
              <CelulaDeTitulo className="w-[110px]">Venceu em</CelulaDeTitulo>
              <CelulaDeTitulo className="w-[190px]">Atraso</CelulaDeTitulo>
            </tr>
          </thead>
          <tbody>
            {grupo.linhas.map((linha) => (
              <tr key={linha.atraso.emprestimoId}>
                <Celula className="font-semibold">
                  <span className="flex flex-wrap items-center gap-2">
                    {linha.atraso.nomeDoLeitor}
                    <ChipDeAcumulo livrosDoLeitor={linha.livrosDoLeitor} />
                  </span>
                </Celula>
                <Celula>{linha.atraso.tituloDaObra}</Celula>
                <Celula>
                  <Tombo valor={linha.atraso.tombo} />
                </Celula>
                <Celula className="font-mono text-tinta-2">
                  {formatarDataDaEscola(linha.atraso.previstaPara)}
                </Celula>
                <Celula>
                  <ChipDeAtraso linha={linha} />
                </Celula>
              </tr>
            ))}
          </tbody>
        </Tabela>

        {/* Espaço para a professora anotar quem trouxe. É uma folha de
            trabalho, e ela volta rabiscada — só na versão impressa,
            porque na tela um campo em branco parece campo que se
            preenche. */}
        <p className="mt-4 hidden text-[12px] text-tinta-2 print:block">
          Recebido por ______________________________ em ____ / ____ / ________
        </p>
      </div>
    </Cartao>
  )
}

/**
 * A palavra da primeira coluna, exaustiva sobre o tipo de grupo.
 *
 * O grupo da equipe não lista alunos, e escrever "Aluno" no alto dele
 * mandaria a coordenação procurar na secretaria uma matrícula que não
 * existe.
 */
const PALAVRA_DO_LEITOR: Record<TipoDeGrupo, string> = {
  TURMA: 'Aluno',
  SEM_TURMA: 'Aluno',
  EQUIPE: 'Leitor',
}
