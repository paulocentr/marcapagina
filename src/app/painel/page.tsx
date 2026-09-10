import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import type { ReactElement } from 'react'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Cartao } from '@/components/ui/cartao'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
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
  icone: NomeDeIcone
  permissao: Permissao
}

// Só entram atalhos para telas que EXISTEM. Um card que leva a 404
// ensina a operadora a desconfiar do menu inteiro, e depois disso ela
// para de explorar o sistema.
//
// Os ícones são os mesmos da navegação lateral, item por item: o atalho e
// o item de menu que levam à mesma tela têm de ser reconhecíveis como a
// mesma coisa.
const ATALHOS: Atalho[] = [
  {
    titulo: 'Balcão',
    descricao: 'Emprestar e devolver — matrícula, tombo, confirma',
    href: '/painel/balcao',
    icone: 'troca',
    permissao: 'emprestimo:criar',
  },
  {
    titulo: 'Acervo',
    descricao: 'Buscar livros por título e ver os exemplares de cada obra',
    href: '/painel/acervo',
    icone: 'livros',
    permissao: 'obra:ver',
  },
  {
    titulo: 'Catalogar por ISBN',
    descricao: 'Bipar o código de barras e cadastrar em série',
    href: '/painel/acervo/novo',
    icone: 'codigo-de-barras',
    permissao: 'obra:criar',
  },
]

export default async function PaginaDoPainel(): Promise<ReactElement> {
  const principal = await lerSessao()

  // O middleware só viu que existe cookie, e a casca do painel não é
  // fronteira de segurança: layout em Next não volta a rodar em navegação
  // de cliente entre telas irmãs e Server Action nenhuma passa por ele. A
  // validação real é aqui, na página — cookie forjado ou sessão de aluno
  // não entram no painel de staff.
  if (!principal || !ehStaff(principal)) redirect('/entrar')

  // Esconder atalho NÃO é autorização: quem autoriza é o serviço, que
  // recebe o Principal e chama `exigirPermissao`. O filtro existe para o
  // painel não oferecer à monitora uma tela que vai recusá-la.
  const disponiveis = ATALHOS.filter((atalho) => temPermissao(principal, atalho.permissao))

  return (
    <main className="px-8 pt-6 pb-8">
      <div className="max-w-[980px]">
        {/* Nome de quem está logado e "Sair" NÃO entram aqui: a casca do
            painel (src/app/painel/layout.tsx) carrega os dois no rodapé da
            navegação, em toda tela de /painel. Repetir o nome nesta página
            o deixaria duas vezes na mesma tela. */}
        <CabecalhoDeTela titulo="Painel" descricao="Por onde o atendimento começa." />

        {disponiveis.length === 0 ? (
          <p className="mt-6 text-tinta-2">
            Seu acesso ainda não tem nenhuma permissão. Fale com quem cuida do sistema na escola.
          </p>
        ) : (
          <ul className="mt-[22px] grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {disponiveis.map((atalho) => (
              <li key={atalho.href}>
                {/* O foco visível fica no <Link>, que é o que o teclado
                    alcança; o cartão dentro dele só desenha. */}
                <Link
                  href={atalho.href}
                  className="group block h-full rounded-cartao focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
                >
                  <Cartao className="flex h-full items-start gap-[14px] transition-colors group-hover:border-linha-2 group-hover:bg-papel-2">
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-controle bg-marca-suave text-marca-forte"
                    >
                      <Icone nome={atalho.icone} tamanho={20} traco={1.7} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-serif text-base font-semibold text-tinta">
                        {atalho.titulo}
                      </span>
                      <span className="mt-1 block text-[13.5px] text-tinta-2">
                        {atalho.descricao}
                      </span>
                    </span>
                  </Cartao>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <EmConstrucao principal={principal} />
      </div>
    </main>
  )
}

/**
 * O que ainda não existe, dito em voz alta.
 *
 * Sem isto a operadora abre o painel, não acha a reserva e conclui que o
 * sistema não reserva livro — em vez de concluir que essa parte ainda
 * está sendo feita.
 *
 * Borda tracejada e nenhuma cor de estado: não é aviso nem erro, e usar a
 * faixa de atenção aqui gastaria em roadmap o amarelo que a tela reserva
 * para livro atrasado.
 */
function EmConstrucao({ principal }: { principal: PrincipalStaff }): ReactElement | null {
  if (!temPermissao(principal, 'emprestimo:criar')) return null

  return (
    <section className="mt-8 rounded-cartao border border-dashed border-linha-2 p-5">
      <h2 className="font-sans">
        <Rotulo tom="discreto">Ainda em construção</Rotulo>
      </h2>
      <p className="mt-2 text-[13.5px] text-tinta-2">
        As reservas e o Carrinho da Leitura ainda não têm tela. As regras já existem e estão
        testadas — o que falta é a tela por onde usá-las.
      </p>
    </section>
  )
}
