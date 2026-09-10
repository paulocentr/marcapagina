import Link from 'next/link'
import type { ReactElement } from 'react'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { SemPermissaoError } from '@/core/errors'
import { temPermissao } from '@/core/rbac/verificar'
import {
  montarPainelDoLeitor,
  type PainelDoLeitor,
} from '@/modules/relatorios/painel-do-leitor.service'
import { dependenciasDeRelatorios } from '@/modules/relatorios/relatorios.deps'
import { ehChaveDePeriodo, type ChaveDePeriodo } from '@/modules/relatorios/periodo'
import { AtrasadosAgora } from './atrasados-agora'
import { GraficoDeTurmas } from './grafico-de-turmas'
import { MaisEmprestados } from './mais-emprestados'
import { Numeros } from './numeros'
import { ROTULO_DO_PERIODO } from './painel-na-tela'

export const runtime = 'nodejs'

const PERIODOS: ChaveDePeriodo[] = ['MES', 'BIMESTRE', 'ANO']

/**
 * O Painel do Leitor: o que a coordenação leva para a reunião
 * pedagógica.
 *
 * Componente de SERVIDOR: as consultas rodam nesta requisição, com o
 * `Principal` da sessão, e nada de banco atravessa para o navegador. Não
 * há Server Action nenhuma aqui porque a tela não escreve nada — ela
 * conta. O período viaja na URL (`?periodo=`), e é por isso que a
 * coordenação pode guardar nos favoritos "o bimestre" e recarregar sem
 * perder o recorte.
 *
 * Todo número é CONTADO na hora, incluindo os atrasados. Ver
 * `painel-do-leitor.service.ts`.
 */
export default async function PaginaDoPainelDoLeitor({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}): Promise<ReactElement> {
  const { periodo } = await searchParams

  // Entrada de fora: chave inválida vira o mês, que é o padrão da tela.
  // Sem esta guarda, `?periodo=x` cairia num `switch` sem caso e o
  // recorte sairia de um `default` silencioso.
  const chave: ChaveDePeriodo =
    periodo !== undefined && ehChaveDePeriodo(periodo) ? periodo : 'MES'

  const dados = await comStaffNoTenant(async (principal) => {
    try {
      const painel = await montarPainelDoLeitor(
        principal,
        // `agora` sai da rota, não do serviço: é o que deixa o teste do
        // serviço rodar em qualquer data sem mexer no relógio da máquina.
        { chave, agora: new Date() },
        dependenciasDeRelatorios(),
      )

      // A permissão de EXPORTAR é outra: o professor enxerga o painel e
      // não leva o arquivo com a escola inteira. Esconder o botão não é
      // autorização — quem recusa é o serviço, na rota de exportação.
      return { painel, podeExportar: temPermissao(principal, 'relatorio:exportar'), recusa: null }
    } catch (erro) {
      // Quem não tem `relatorio:ver` (a monitora, por exemplo) não vê o
      // item no menu, mas alcança a URL digitando. Sem este ramo a
      // recusa sairia como erro 500 — e um 500 não diz à pessoa que ela
      // está na tela errada, diz que o sistema quebrou.
      if (erro instanceof SemPermissaoError) {
        return { painel: null, podeExportar: false, recusa: erro.message }
      }
      throw erro
    }
  })

  return (
    <main className="px-8 py-6">
      <CabecalhoDeTela
        titulo="Painel do Leitor"
        descricao="o que a coordenação leva para a reunião pedagógica"
        acoes={
          dados.painel === null ? undefined : (
            <>
              <SeletorDePeriodo atual={chave} />
              {dados.podeExportar && <BotoesDeExportacao chave={chave} />}
            </>
          )
        }
      />

      {dados.recusa !== null ? (
        <div className="mt-[18px] max-w-[620px]">
          <Faixa tom="erro" titulo="Esta tela é de quem lê relatórios.">
            {dados.recusa} Fale com a coordenação se você precisa acompanhar os números da
            biblioteca.
          </Faixa>
        </div>
      ) : (
        <PainelInteiro painel={dados.painel} />
      )}
    </main>
  )
}

function PainelInteiro({ painel }: { painel: PainelDoLeitor }): ReactElement {
  return (
    <div className="mt-[22px] flex flex-col gap-4">
      <Numeros painel={painel} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,344px)]">
        <GraficoDeTurmas turmas={painel.turmas} rotuloDoPeriodo={painel.periodo.rotulo} />
        <MaisEmprestados painel={painel} />
      </div>

      <AtrasadosAgora painel={painel} />
    </div>
  )
}

/**
 * Mês, bimestre ou ano letivo.
 *
 * São `<Link>` e não botões com estado: o recorte fica na URL, então
 * recarregar, voltar pelo histórico e guardar nos favoritos continuam
 * funcionando — e a tela segue sendo componente de servidor, sem um byte
 * de JavaScript para trocar de período.
 */
function SeletorDePeriodo({ atual }: { atual: ChaveDePeriodo }): ReactElement {
  return (
    <div
      className="flex overflow-hidden rounded-controle border border-linha-2 bg-superficie"
      role="group"
      aria-label="Recorte do período"
    >
      {PERIODOS.map((chave, indice) => (
        <Link
          key={chave}
          href={`/painel/relatorios?periodo=${chave}`}
          aria-current={chave === atual ? 'page' : undefined}
          className={`flex h-[38px] items-center px-[14px] text-[13px] ${
            indice === 0 ? '' : 'border-l border-linha'
          } ${
            chave === atual
              ? 'bg-marca-suave font-semibold text-marca-forte'
              : 'font-medium text-tinta-2 hover:bg-papel'
          }`}
        >
          {ROTULO_DO_PERIODO[chave]}
        </Link>
      ))}
    </div>
  )
}

/**
 * CSV e PDF.
 *
 * `<a href>` e NUNCA `<Link>`: o App Router prefetcha todo `<Link>` que
 * entra na viewport, disparando um GET no href sem ninguém clicar — e o
 * href aqui é um Route Handler que monta o relatório inteiro. Com
 * `<Link>`, abrir a tela geraria o PDF do acervo por conta própria. Há
 * gate no CI para isso.
 */
function BotoesDeExportacao({ chave }: { chave: ChaveDePeriodo }): ReactElement {
  const classes =
    'inline-flex h-[38px] items-center gap-2 rounded-controle border border-linha-2 ' +
    'bg-superficie px-4 text-[13.5px] font-semibold text-tinta hover:bg-papel ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca'

  return (
    <>
      <a href={`/api/relatorios?formato=csv&periodo=${chave}`} className={classes}>
        Exportar CSV
      </a>
      <a href={`/api/relatorios?formato=pdf&periodo=${chave}`} className={classes}>
        <Icone nome="impressora" tamanho={16} traco={1.9} />
        PDF
      </a>
    </>
  )
}
