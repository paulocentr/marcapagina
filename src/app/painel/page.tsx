import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { lerSessao } from '@/core/auth/sessao'
import { ehStaff } from '@/core/auth/principal'
import { temPermissao } from '@/core/rbac/verificar'
import type { Permissao } from '@/core/rbac/permissoes'
import type { PrincipalStaff } from '@/core/auth/principal'

export const runtime = 'nodejs'

interface Atalho {
  titulo: string
  descricao: string
  // `Route` e não `string`: com typedRoutes ligado, é isto que faz um
  // atalho para rota inexistente virar erro de compilação em vez de 404
  // descoberto pela operadora.
  href: Route
  permissao: Permissao
}

// Só entram atalhos para telas que EXISTEM. Um card que leva a 404
// ensina a operadora a desconfiar do menu inteiro, e depois disso ela
// para de explorar o sistema.
const ATALHOS: Atalho[] = [
  {
    titulo: 'Acervo',
    descricao: 'Buscar livros por título e ver os exemplares de cada obra',
    href: '/painel/acervo',
    permissao: 'obra:ver',
  },
  {
    titulo: 'Catalogar por ISBN',
    descricao: 'Bipar o código de barras e cadastrar em série',
    href: '/painel/acervo/novo',
    permissao: 'obra:criar',
  },
]

export default async function PaginaDoPainel() {
  const principal = await lerSessao()

  // O middleware só viu que existe cookie. A validação real é aqui:
  // cookie forjado ou sessão de aluno não entram no painel de staff.
  if (!principal || !ehStaff(principal)) redirect('/entrar')

  const disponiveis = ATALHOS.filter((atalho) => temPermissao(principal, atalho.permissao))

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Marca-Página</h1>
          <p className="text-sm text-neutral-600">{principal.nome}</p>
        </div>
        <Link href="/sair" className="text-sm underline">
          Sair
        </Link>
      </header>

      {disponiveis.length === 0 ? (
        <p className="text-neutral-600">
          Seu acesso ainda não tem nenhuma permissão. Fale com a coordenação.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {disponiveis.map((atalho) => (
            <li key={atalho.href}>
              <Link
                href={atalho.href}
                className="block h-full rounded border border-neutral-300 p-5 hover:bg-neutral-50"
              >
                <span className="block text-lg font-medium">{atalho.titulo}</span>
                <span className="mt-1 block text-sm text-neutral-600">{atalho.descricao}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <EmConstrucao principal={principal} />
    </main>
  )
}

/**
 * O que ainda não existe, dito em voz alta.
 *
 * Sem isto a coordenação abre o painel, não acha o balcão e conclui que
 * o sistema não empresta livro — em vez de concluir que essa parte ainda
 * está sendo feita.
 */
function EmConstrucao({ principal }: { principal: PrincipalStaff }) {
  if (!temPermissao(principal, 'emprestimo:criar')) return null

  return (
    <section className="mt-10 rounded border border-dashed border-neutral-300 p-5">
      <h2 className="font-medium">Ainda em construção</h2>
      <p className="mt-1 text-sm text-neutral-600">
        O balcão de empréstimo e devolução, as reservas e o Carrinho da Leitura estão sendo
        implementados. As regras já existem e estão testadas; falta a tela.
      </p>
    </section>
  )
}
