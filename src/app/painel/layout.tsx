import { redirect } from 'next/navigation'
import type { ReactElement, ReactNode } from 'react'
import { NavegacaoLateral, type ItemDeNavegacao } from '@/components/painel/navegacao-lateral'
import { ehStaff } from '@/core/auth/principal'
import { lerSessao } from '@/core/auth/sessao'
import type { Permissao } from '@/core/rbac/permissoes'
import { temPermissao } from '@/core/rbac/verificar'

export const runtime = 'nodejs'

interface ItemDoMenu extends ItemDeNavegacao {
  /**
   * A permissão que faz o item aparecer, ou `null` para o item que todo
   * membro da equipe abre.
   *
   * É `null` explícito e não opcional: assim quem acrescenta um item é
   * obrigado a decidir, em vez de esquecer o campo e publicar um atalho
   * que oferece à monitora uma tela que vai recusá-la.
   *
   * Isto NÃO é autorização — esconder botão na UI não autoriza nada.
   * Quem autoriza é o serviço, que recebe o Principal e chama
   * `exigirPermissao`. O filtro aqui existe para o menu não mentir.
   */
  permissao: Permissao | null
}

// Só entram atalhos para telas que EXISTEM. Um item que leva a 404
// ensina a operadora a desconfiar do menu inteiro, e depois disso ela
// para de explorar o sistema.
//
// Atrasados, alunos e turmas, Painel do Leitor e configuração aparecem
// nas pranchas mas ainda não têm tela: entram aqui quando a rota
// existir, uma a uma.
const MENU: ItemDoMenu[] = [
  { titulo: 'Painel', href: '/painel', icone: 'painel', permissao: null },
  {
    titulo: 'Balcão',
    href: '/painel/balcao',
    icone: 'troca',
    permissao: 'emprestimo:criar',
  },
  { titulo: 'Acervo', href: '/painel/acervo', icone: 'livros', permissao: 'obra:ver' },
  {
    titulo: 'Catalogar por ISBN',
    href: '/painel/acervo/novo',
    icone: 'codigo-de-barras',
    permissao: 'obra:criar',
  },
  {
    titulo: 'Reservas',
    href: '/painel/reservas',
    icone: 'fita',
    permissao: 'reserva:gerenciar',
  },
  {
    titulo: 'Carrinho da Leitura',
    href: '/painel/carrinho',
    icone: 'carrinho',
    permissao: 'carrinho:gerenciar',
  },
]

export default async function LayoutDoPainel({
  children,
}: {
  children: ReactNode
}): Promise<ReactElement> {
  const principal = await lerSessao()

  // O middleware só viu que existe cookie. A validação real é aqui, no
  // layout, porque ele é o ponto por onde TODA tela de /painel/* passa —
  // uma tela nova nasce protegida em vez de nascer esquecida.
  //
  // Isso NÃO substitui a validação de cada página e de cada action: o
  // layout não volta a rodar em navegação de cliente entre irmãs, e
  // Server Action nenhuma passa por ele. As páginas continuam validando
  // por conta, e é de propósito — em Next, layout não é fronteira de
  // segurança, é só o primeiro lugar onde a porta fecha.
  if (!principal || !ehStaff(principal)) redirect('/entrar')

  const itens: ItemDeNavegacao[] = MENU.filter(
    (item) => item.permissao === null || temPermissao(principal, item.permissao),
    // A permissão fica no servidor: o cliente recebe só o que desenha.
  ).map(({ titulo, href, icone }) => ({ titulo, href, icone }))

  return (
    <div className="flex min-h-screen bg-papel">
      <NavegacaoLateral itens={itens} usuario={{ nome: principal.nome }} />
      {/*
        `div` e não `main`: as telas de /painel ainda montam o seu próprio
        `<main>`. Dois `<main>` na mesma página quebram o atalho "ir para
        o conteúdo" do leitor de tela. Quando as telas passarem a usar a
        casca, este contêiner vira o `<main>` único.
      */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
