import type { ReactElement } from 'react'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Cartao } from '@/components/ui/cartao'
import { Faixa } from '@/components/ui/faixa'
import { Rotulo } from '@/components/ui/rotulo'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { SemPermissaoError } from '@/core/errors'
import { dependenciasDaCirculacao } from '@/modules/circulacao/circulacao.deps'
import { listarAtrasados } from '@/modules/circulacao/emprestimos.service'
import { descreverAtraso, formatarDataDaEscola, montarFolha } from './atrasados-na-tela'
import type { FolhaDeAtrasados } from './atrasados-na-tela'
import { BotaoDeImprimir } from './botao-de-imprimir'
import { EstiloDeImpressao } from './estilo-de-impressao'
import { FolhaDeTurma } from './folha-de-turma'

export const runtime = 'nodejs'

/**
 * Atrasados agora.
 *
 * A tela existe para uma entrega FÍSICA: a coordenação imprime uma folha
 * por turma e manda para a professora da sala. Por isso o agrupamento por
 * turma não é uma opção de visualização — é o formato da entrega — e por
 * isso a impressão é a própria página em `@media print`, e não um PDF
 * montado em outro lugar.
 *
 * "Atrasado" é sempre `previstaPara < hoje AND devolvidaEm IS NULL`. Não
 * existe campo a ler, nem aqui nem no repositório, e `montarFolha` recusa
 * a lista se os dias de atraso discordarem das datas — ver
 * `atrasados-na-tela.ts`. Um campo materializado mente todo dia em que o
 * cron falhar, e mente na direção pior: dizendo que está tudo em ordem.
 *
 * Componente de servidor: a consulta roda na requisição, com o `Principal`
 * da sessão, e nada de banco atravessa para o navegador. Não há Server
 * Action nesta tela porque não há escrita: cobrar é conversa, e devolver
 * se faz no Balcão, onde a penalidade é aplicada junto.
 *
 * `<main>` próprio: a casca do painel entrega um `<div>`, e é aqui que o
 * conteúdo principal começa.
 */
export default async function PaginaDeAtrasados(): Promise<ReactElement> {
  const dados = await comStaffNoTenant(async (principal) => {
    const deps = dependenciasDaCirculacao()

    // `hoje` é resolvido UMA vez e atravessa a consulta e a montagem da
    // folha. Duas chamadas a `new Date()` podem cair em dias diferentes na
    // virada da meia-noite — e aí a conferência de `montarFolha` acusaria
    // divergência num sistema sem defeito nenhum.
    const hoje = new Date()

    try {
      const atrasados = await listarAtrasados(principal, hoje, deps)
      return { folha: montarFolha(atrasados, hoje), hoje, recusa: null }
    } catch (erro) {
      // Quem não vê relatório (a monitora, por exemplo) não tem o item no
      // menu, mas alcança a URL digitando. Sem este ramo a recusa do
      // serviço sairia como erro 500 — e um 500 não diz à pessoa que ela
      // está na tela errada, diz que o sistema quebrou.
      if (erro instanceof SemPermissaoError) {
        return { folha: null, hoje, recusa: erro.message }
      }
      throw erro
    }
  })

  return (
    <main className="px-8 py-6">
      <EstiloDeImpressao />

      <div className="nao-imprime">
        <CabecalhoDeTela
          titulo="Atrasados agora"
          descricao={
            <>
              Calculado na hora: prazo menor que hoje e ainda sem devolução.{' '}
              <span className="text-tinta-3">
                Uma folha por turma — é assim que a lista chega à professora da sala.
              </span>
            </>
          }
          acoes={dados.folha !== null && dados.folha.total > 0 ? <BotaoDeImprimir /> : undefined}
        />
      </div>

      {dados.recusa !== null ? (
        <div className="mt-[18px] max-w-[620px]">
          <Faixa tom="erro" titulo="Esta tela é de quem acompanha os relatórios.">
            {dados.recusa} Fale com a coordenação se você precisa cobrar atrasos.
          </Faixa>
        </div>
      ) : (
        <ListaDeAtrasados folha={dados.folha} hoje={dados.hoje} />
      )}
    </main>
  )
}

function ListaDeAtrasados({
  folha,
  hoje,
}: {
  folha: FolhaDeAtrasados
  hoje: Date
}): ReactElement {
  if (folha.total === 0) {
    return (
      <div className="nao-imprime mt-[18px] max-w-[620px]">
        <Faixa tom="sucesso" titulo="Nenhum livro em atraso agora.">
          Todo empréstimo em aberto está dentro do prazo. Esta lista é recalculada a cada vez
          que a tela abre — não há nada guardado que possa envelhecer aqui.
        </Faixa>
      </div>
    )
  }

  const turmas = folha.grupos.filter((grupo) => grupo.tipo === 'TURMA').length

  return (
    <>
      <div className="nao-imprime mt-[18px] flex flex-col gap-5 xl:flex-row xl:items-start">
        <Cartao className="xl:w-[320px] xl:shrink-0">
          <Rotulo tom="discreto">Fora da estante agora</Rotulo>
          <p className="mt-1 font-serif text-[26px] leading-none font-semibold text-tinta">
            {folha.total === 1 ? '1 livro' : `${folha.total} livros`}
          </p>
          <p className="mt-2 text-[13px] text-tinta-2">
            {turmas === 1 ? 'em 1 turma' : `em ${turmas} turmas`}
            {' · '}o mais antigo há {descreverAtraso(folha.maiorAtrasoEmDias)}
          </p>
        </Cartao>

        {/*
          UMA faixa, e não duas: `Faixa` de atenção é `role="alert"`, e
          dois alertas disparando na abertura da tela fazem o leitor de
          tela anunciar um em cima do outro.

          A suspensão é dita aqui de propósito. O silêncio seria lido como
          "ninguém está suspenso" — e esta consulta não traz suspensão
          nenhuma: ela é aplicada NA DEVOLUÇÃO, por dia de atraso, e quem
          a mostra é a ficha do leitor no Balcão. Desenhar um chip de
          suspensão sem o dado seria afirmar o que não se sabe.
        */}
        <Faixa
          tom="atencao"
          className="min-w-0 flex-1"
          titulo="A folha impressa é uma fotografia deste momento."
        >
          Confira no Balcão antes de cobrar: um livro devolvido depois da impressão continua
          escrito no papel — a data de emissão vai no alto de cada folha por isso. E ela não diz
          quem está suspenso: a suspensão é aplicada quando o livro volta, um dia por dia de
          atraso, e aparece na ficha do leitor quando a matrícula é bipada no Balcão.
        </Faixa>
      </div>

      {/*
        Bloco e não flex: no papel, cada folha começa numa página nova
        (`break-before: page`), e caixa de flex não fragmenta entre
        páginas de forma previsível. A margem entre as folhas sai do
        `mt-5 first:mt-0` de cada uma.
      */}
      <div id="folha-de-atrasados" className="mt-5 max-w-[1120px]">
        {folha.grupos.map((grupo) => (
          <FolhaDeTurma key={grupo.rotulo} grupo={grupo} hoje={hoje} />
        ))}
      </div>

      <p className="nao-imprime mt-4 text-[12.5px] text-tinta-3">
        Emitida em {formatarDataDaEscola(hoje)}. Sem devolução registrada até aqui.
      </p>
    </>
  )
}
