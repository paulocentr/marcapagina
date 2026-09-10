import { redirect } from 'next/navigation'
import type { ReactElement } from 'react'
import { Botao } from '@/components/ui/botao'
import { Cartao } from '@/components/ui/cartao'
import { Matricula } from '@/components/ui/codigo'
import { Logotipo } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import { lerSessao } from '@/core/auth/sessao'
import { ehAluno } from '@/core/auth/principal'

export const runtime = 'nodejs'

/**
 * O portal do aluno, desenhado para celular (prancha docs/design/Portal).
 *
 * O que esta tela NÃO mostra, e é regra e não pendência: nada de dado
 * sensível — nem de colega, nem de responsável. É mitigação obrigatória da
 * decisão 3 da spec (aluno autentica por matrícula + data de nascimento);
 * o dia em que um par desses circular pela escola, o que se perde é só o
 * próprio empréstimo de quem vazou.
 *
 * O que a prancha mostra e esta tela deixou de fora POR FALTA DE DADO, não
 * por escolha de desenho: os livros em mãos com prazo, o aviso de reserva
 * separada, o botão de renovar, a meta de leitura com as medalhas e a data
 * em que o carrinho passa na turma. Nenhum deles tem serviço que uma
 * sessão de ALUNO possa chamar — todo serviço de circulação exige
 * permissão de equipe (`emprestimo:*`, `reserva:*`, `aluno:ver`), e a
 * sessão do aluno não carrega permissão nenhuma. Desenhar a lista com
 * número inventado seria pior que não a desenhar: o aluno confiaria no
 * prazo errado e devolveria atrasado.
 *
 * Sem barra de abas, pelo mesmo motivo: Buscar, Pedir e Perfil não têm
 * rota, e com typedRoutes um atalho para rota inexistente é erro de
 * compilação — que é exatamente onde se quer que ele apareça.
 */
export default async function PaginaDoAluno(): Promise<ReactElement> {
  const principal = await lerSessao()
  if (!principal || !ehAluno(principal)) redirect('/aluno/entrar')

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

      <Cartao className="flex flex-col gap-2">
        <h2 className="font-sans">
          <Rotulo tom="discreto">Meus livros</Rotulo>
        </h2>
        <p className="text-sm text-tinta">
          Os livros que você pegou na biblioteca ainda não aparecem aqui.
        </p>
        <p className="text-[13px] text-tinta-2">
          Enquanto esta parte não fica pronta, o prazo de devolução de cada livro está registrado
          na biblioteca — pergunte no balcão.
        </p>
      </Cartao>

      {/* POST, não link — ver o comentário em src/app/sair/route.ts.
          `mt-auto` prende o botão no rodapé da tela: sair é a última coisa
          que se faz, e ele não disputa espaço com o conteúdo. */}
      <form action="/sair" method="post" className="mt-auto">
        <Botao type="submit" variante="secundaria" tamanho="grande" icone="sair" className="w-full">
          Sair
        </Botao>
      </form>
    </main>
  )
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
