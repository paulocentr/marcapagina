import { redirect } from 'next/navigation'
import type { ReactElement } from 'react'
import { Botao } from '@/components/ui/botao'
import { Cartao } from '@/components/ui/cartao'
import { Chip } from '@/components/ui/chip'
import { Matricula } from '@/components/ui/codigo'
import { FaixaDaFita } from '@/components/ui/faixa'
import { Logotipo } from '@/components/ui/icones'
import { NaoAutenticadoError } from '@/core/errors'
import type { PrincipalAluno } from '@/core/auth/principal'
import { comAlunoNoTenant } from '@/modules/portal/contexto-do-aluno'
import { dependenciasDoPortal } from '@/modules/portal/portal.deps'
import { verMinhaEstante } from '@/modules/portal/minha-estante.service'
import { SessaoNaoEhDeAlunoError } from '@/modules/portal/autorizacao-do-aluno'
import type { LivroNaMinhaEstante, MinhaEstante } from '@/modules/portal/portal.tipos'
import { contarLivros, formatarDia, formatarDiaCurto } from './formato'
import { RenovarLivro } from './renovar-livro'

export const runtime = 'nodejs'

/**
 * O portal do aluno (prancha docs/design/Portal).
 *
 * O que esta tela mostra é só o que o aluno tem sobre SI: os livros em
 * mãos com o prazo, quantos ainda pode levar, a reserva já separada no
 * balcão e a renovação. Nada de colega e nada de responsável — é
 * mitigação obrigatória da decisão 3 da spec (aluno autentica por
 * matrícula + data de nascimento). O dia em que um par desses circular
 * pela escola, o que se perde é só o próprio empréstimo de quem vazou.
 *
 * A garantia não é de desenho, é de camada: `verMinhaEstante` não aceita
 * id de aluno por parâmetro. O único id que entra na consulta é o da
 * sessão assinada, e é por isso que o aluno não tem — nem pode ter —
 * `aluno:ver`. Esconder botão não é autorização; aqui não há nem o que
 * esconder.
 *
 * O que a prancha mostra e esta tela NÃO mostra, por falta de dado no
 * sistema e não por escolha de desenho: a meta de leitura do ano, as
 * medalhas e a barra de progresso, "seu último livro foi", o botão de
 * pedir no carrinho (o serviço do Carrinho exige `carrinho:gerenciar`, de
 * equipe) e a data em que o carrinho passa na turma. Desenhar qualquer um
 * com número inventado seria pior que não desenhar.
 *
 * Sem barra de abas, pelo mesmo critério: Buscar, Pedir e Perfil não têm
 * rota, e com `typedRoutes` um atalho para rota inexistente é erro de
 * compilação — que é exatamente onde se quer que ele apareça.
 */
export default async function PaginaDoAluno(): Promise<ReactElement> {
  const carregado = await carregarPortal()
  // `redirect` fora do try: ele funciona lançando, e um `catch` em volta
  // engoliria a navegação.
  if (carregado === 'ENTRAR') redirect('/aluno/entrar')

  const { principal, estante } = carregado

  return (
    // Celular primeiro. Nenhuma barra de status falsa no topo: no aparelho
    // de verdade a real renderiza por cima e as duas ficam duplicadas.
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col gap-5 px-5 pt-10 pb-8">
      <header className="flex items-center gap-3">
        {/* Enfeite, não informação: as iniciais são aria-hidden porque o
            nome inteiro está no título ao lado. */}
        <span
          aria-hidden="true"
          className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-marca-suave font-serif text-base font-bold text-marca-forte"
        >
          {iniciais(principal.nome)}
        </span>

        <div className="min-w-0 grow">
          <h1 className="font-serif text-[22px] font-semibold text-tinta">
            Olá, {principal.nome}
          </h1>
          <p className="text-[12.5px] text-tinta-2">
            {/* A palavra sai do fluxo do leitor de tela porque o próprio
                `Matricula` já se anuncia como "matrícula 2024001" — sem
                isto ela é lida duas vezes. */}
            <span aria-hidden="true">matrícula </span>
            <Matricula valor={principal.matricula} />
          </p>
        </div>

        <Logotipo tamanho={24} className="shrink-0" />
      </header>

      {/* A fita terracota é "vá ao balcão buscar": é o único aviso da tela
          que pede uma ação com hora marcada, e o único que o aluno perde
          se não ler hoje. */}
      {estante.reservaPronta && (
        <FaixaDaFita titulo="Sua reserva chegou">
          <strong>{estante.reservaPronta.titulo}</strong> está separado no balcão. Retire até{' '}
          <strong>{formatarDia(estante.reservaPronta.retirarAte)}</strong>, senão passa para a
          próxima pessoa da fila.
        </FaixaDaFita>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-[17px] font-semibold text-tinta">
            {estante.livros.length === 0
              ? 'Você não está com nenhum livro'
              : `Você tem ${contarLivros(estante.livros.length)}`}
          </h2>
          {/* O NÚMERO, e não o sim/não: "pode levar 3" responde a pergunta
              que o aluno faz no corredor antes de ir à biblioteca. */}
          <span className="shrink-0 text-[12.5px] text-tinta-2">
            pode levar {estante.limiteDaMinhaSerie}
          </span>
        </div>

        {estante.livros.map((livro) => (
          <LivroDaEstante key={livro.emprestimoId} livro={livro} />
        ))}

        <SobraDaEstante estante={estante} />
      </section>

      {/* POST, não link — ver o comentário em src/app/sair/route.ts.
          `mt-auto` prende o botão no rodapé da tela: sair é a última coisa
          que se faz, e ele não disputa espaço com o conteúdo. */}
      <form action="/sair" method="post" className="mt-auto pt-2">
        <Botao type="submit" variante="secundaria" tamanho="grande" icone="sair" className="w-full">
          Sair
        </Botao>
      </form>
    </main>
  )
}

/**
 * Um livro em mãos.
 *
 * O estado sai do `Chip`, que carrega palavra E ícone — nunca só a cor. O
 * cartão do atrasado ganha borda de atenção por cima disso, como reforço
 * e não como a informação.
 */
function LivroDaEstante({ livro }: { livro: LivroNaMinhaEstante }): ReactElement {
  return (
    <Cartao
      // `semPadding` e padding próprio em vez de sobrescrever o `p-6` do
      // kit: no celular de 390px, 24px de cada lado comem o título.
      //
      // O `!` vai no FIM da classe — é a sintaxe do Tailwind v4. Na v3 ele
      // vinha na frente, e `!border-...` aqui seria uma classe morta: a
      // borda de atenção simplesmente não apareceria, sem erro nenhum.
      semPadding
      className={`flex flex-col gap-[7px] p-[14px]${
        livro.atrasado ? ' border-atencao-borda! bg-atencao-suave/35' : ''
      }`}
    >
      <div>
        <p className="font-serif text-base leading-[1.25] font-semibold text-tinta">
          {livro.titulo}
        </p>
        {/* Obra sem autor é comum no acervo da escola (apostila,
            cartilha). Nada de "Autor desconhecido" inventado. */}
        {livro.autor !== null && <p className="text-[12.5px] text-tinta-2">{livro.autor}</p>}
      </div>

      <div>
        {livro.atrasado ? (
          <Chip
            estado="ATRASADO"
            complemento={`há ${livro.diasDeAtraso === 1 ? '1 dia' : `${livro.diasDeAtraso} dias`}`}
          />
        ) : (
          <Chip estado="EM_DIA" complemento={`devolver até ${formatarDiaCurto(livro.previstaPara)}`} />
        )}
      </div>

      {/* O prazo inteiro, com ano, em texto: o chip é curto para caber, e
          é neste número que o aluno confia para decidir o dia. */}
      <p className="text-[12.5px] text-tinta-2">
        Devolução prevista para {formatarDia(livro.previstaPara)}.
      </p>

      {livro.renovacao.pode ? (
        <RenovarLivro emprestimoId={livro.emprestimoId} porDias={livro.renovacao.porDias} />
      ) : (
        // O motivo escrito, e não um botão desabilitado sem explicação: o
        // aluno não tem balcão à mão para perguntar por quê.
        <p className="text-[12.5px] text-tinta-2">{livro.renovacao.explicacao}</p>
      )}
    </Cartao>
  )
}

/**
 * Quantos ainda cabem — ou o motivo de não caber nenhum.
 *
 * Existe separado do cabeçalho porque a resposta tem duas metades: o
 * limite da série (que não muda) e o que sobra hoje (que muda a cada
 * empréstimo, e cai a zero quando há atraso ou suspensão, mesmo abaixo do
 * limite).
 */
function SobraDaEstante({ estante }: { estante: MinhaEstante }): ReactElement {
  if (estante.quantosAindaPodeLevar > 0) {
    return (
      <p className="text-[12.5px] text-tinta-2">
        Você ainda pode levar{' '}
        <strong className="text-tinta">
          {contarLivros(estante.quantosAindaPodeLevar)}
        </strong>
        .
      </p>
    )
  }

  return (
    <p className="text-[12.5px] text-tinta-2">
      {estante.porqueNaoPodeLevar === null
        ? 'Você não pode levar mais livros agora.'
        : estante.porqueNaoPodeLevar}
    </p>
  )
}

type PortalCarregado = { principal: PrincipalAluno; estante: MinhaEstante }

/**
 * A leitura da tela, com o único erro que vira navegação isolado.
 *
 * Sessão ausente, sessão de equipe ou sessão apontando para um cadastro
 * que não é desta escola mandam entrar de novo. TODO o resto sobe: se
 * `DadoDeOutroLeitorError` chegar aqui, é bug de camada e tem de aparecer
 * como falha, não como tela vazia dizendo ao aluno que ele não tem livro
 * nenhum.
 */
async function carregarPortal(): Promise<PortalCarregado | 'ENTRAR'> {
  try {
    return await comAlunoNoTenant(async (principal) => ({
      principal,
      estante: await verMinhaEstante(principal, { agora: new Date() }, dependenciasDoPortal()),
    }))
  } catch (erro) {
    if (erro instanceof NaoAutenticadoError || erro instanceof SessaoNaoEhDeAlunoError) {
      return 'ENTRAR'
    }
    throw erro
  }
}

/**
 * As iniciais do círculo do topo.
 *
 * Cópia deliberada da mesma função em `navegacao-lateral.tsx`, que é
 * privada do módulo: o portal do aluno não é dono daquele componente de
 * staff, e importar dele acoplaria a casca do painel ao portal por causa
 * de duas letras.
 */
function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((parte) => parte.length > 0)
  if (partes.length === 0) return '?'
  const primeira = partes[0]!.charAt(0)
  const ultima = partes.length > 1 ? partes[partes.length - 1]!.charAt(0) : ''
  return `${primeira}${ultima}`.toUpperCase()
}
