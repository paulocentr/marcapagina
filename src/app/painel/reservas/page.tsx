import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Faixa } from '@/components/ui/faixa'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { SemPermissaoError } from '@/core/errors'
import { dependenciasDaCirculacao } from '@/modules/circulacao/circulacao.deps'
import { listarFilasDeReserva } from '@/modules/circulacao/fila-de-reservas.service'
import { listarPrateleiraDeSeparados } from '@/modules/circulacao/painel-do-balcao.service'
import { FilasPorObra } from './filas-por-obra'
import { PrateleiraDeSeparados } from './prateleira-de-separados'
import { Renovacao } from './renovacao'
import { montarPrateleira } from './reservas-na-tela'

export const runtime = 'nodejs'

/**
 * Reservas e renovação.
 *
 * A tela abre pelo trabalho FÍSICO — a prateleira de separados, com o que
 * vence hoje em destaque. Sem ela a operadora não sabe o que está
 * guardado atrás do balcão, e um exemplar reservado devolvido à estante
 * trava a fila em silêncio: o próximo espera por um livro que já está na
 * estante, disponível para o primeiro que aparecer.
 *
 * Depois vêm as filas, obra por obra, que respondem "sou o quantos?"; e a
 * renovação, que é a outra ponta da mesma pergunta — quem tem o livro
 * quer mais tempo, e quem está na fila quer que ele devolva.
 *
 * Componente de servidor: as três consultas rodam na requisição, com o
 * `Principal` da sessão, e nada de banco atravessa para o navegador. As
 * escritas (cancelar, renovar) moram em Server Actions.
 *
 * `<main>` próprio: a casca do painel entrega um `<div>`, e é aqui que o
 * conteúdo principal começa.
 */
export default async function PaginaDeReservas() {
  const dados = await comStaffNoTenant(async (principal) => {
    const deps = dependenciasDaCirculacao()

    // `hoje` é resolvido UMA vez e as duas consultas o compartilham. Duas
    // chamadas a `new Date()` podem cair em dias diferentes na virada da
    // meia-noite, e aí a prateleira e a fila falariam de dias distintos
    // na mesma tela.
    const hoje = new Date()

    try {
      const [separados, filasVivas] = await Promise.all([
        listarPrateleiraDeSeparados(principal, hoje, deps),
        listarFilasDeReserva(principal, deps),
      ])

      // As filas entram no cálculo da prateleira porque é delas que sai
      // "para quem a vez passa" quando o prazo de retirada vence. É a
      // pergunta que a operadora responde ao aluno no balcão.
      return {
        prateleira: montarPrateleira(separados, filasVivas),
        filas: filasVivas,
        recusa: null,
      }
    } catch (erro) {
      // Quem não gerencia fila (direção, professor) não vê o item no menu,
      // mas alcança a URL digitando. Sem este ramo a recusa do serviço
      // sairia como erro 500 — e um 500 não diz à pessoa que ela está na
      // tela errada, diz que o sistema quebrou.
      if (erro instanceof SemPermissaoError) {
        return { prateleira: null, filas: null, recusa: erro.message }
      }
      throw erro
    }
  })

  return (
    <main className="px-8 py-6">
      <CabecalhoDeTela
        titulo="Reservas e renovação"
        descricao={
          <>
            A prateleira é o trabalho de hoje; a fila é a promessa que a biblioteca fez.{' '}
            <span className="text-tinta-3">
              Passado o prazo de retirada, o sistema passa a vez sozinho na virada do dia.
            </span>
          </>
        }
      />

      {dados.recusa !== null ? (
        <div className="mt-[18px] max-w-[620px]">
          <Faixa tom="erro" titulo="Esta tela é de quem opera a fila de reserva.">
            {dados.recusa} Fale com a coordenação se você precisa gerenciar reservas.
          </Faixa>
        </div>
      ) : (
        <>
          <div className="mt-[18px] grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
            <PrateleiraDeSeparados prateleira={dados.prateleira} />
            <Renovacao />
          </div>

          <div className="mt-5 max-w-[1120px]">
            <FilasPorObra filas={dados.filas} />
          </div>
        </>
      )}
    </main>
  )
}
