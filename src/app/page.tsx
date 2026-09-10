import Link from 'next/link'
import type { Route } from 'next'
import type { ReactElement } from 'react'
import { Cartao } from '@/components/ui/cartao'
import type { NomeDeIcone } from '@/components/ui/icone-nomes'
import { Icone, Logotipo } from '@/components/ui/icones'
import { nomeDoProduto } from '@/core/produto'

interface Porta {
  titulo: string
  descricao: string
  // `Route` e não `string`: com typedRoutes ligado, é isto que faz uma
  // porta para rota inexistente virar erro de compilação em vez de 404
  // descoberto por quem só queria entrar.
  href: Route
  icone: NomeDeIcone
}

/*
 * Dois reinos separados desde a porta de entrada (spec §3.6). Um login
 * único que "descobre" se é aluno ou staff obrigaria a tratar os dois com
 * o mesmo formulário — e o do aluno é matrícula e data de nascimento, não
 * e-mail e senha.
 */
const PORTAS: Porta[] = [
  {
    titulo: 'Sou aluno',
    descricao: 'Entre com a sua matrícula e a sua data de nascimento.',
    href: '/aluno/entrar',
    icone: 'livros',
  },
  {
    titulo: 'Sou da equipe',
    descricao: 'Coordenação, bibliotecária, monitor ou professor.',
    href: '/entrar',
    icone: 'painel',
  },
]

export default function Home(): ReactElement {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[760px] flex-col justify-center gap-9 px-6 py-12">
      {/* A linha de 2px em tinta é o fecho de cabeçalho da prancha de
          Fundamentos: é o que dá voz de biblioteca à porta de entrada sem
          gastar cor de ação em decoração. */}
      <header className="border-b-2 border-tinta pb-7">
        <div className="flex items-center gap-3">
          <Logotipo tamanho={34} />
          <h1 className="font-serif text-[31px] font-bold tracking-[-0.022em] text-tinta">
            {nomeDoProduto()}
          </h1>
        </div>
        <p className="mt-3 max-w-[560px] text-[15px] text-tinta-2">
          A biblioteca da escola: pegar livro emprestado, devolver no prazo e acompanhar o que
          cada turma está lendo.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {PORTAS.map((porta) => (
          <li key={porta.href}>
            {/* O foco visível fica no <Link>, que é o que o teclado
                alcança; o cartão dentro dele só desenha. */}
            <Link
              href={porta.href}
              className="group block h-full rounded-cartao focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
            >
              <Cartao className="flex h-full items-start gap-[14px] transition-colors group-hover:border-linha-2 group-hover:bg-papel-2">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-controle bg-marca-suave text-marca-forte"
                >
                  <Icone nome={porta.icone} tamanho={20} traco={1.7} />
                </span>
                <span className="min-w-0">
                  <span className="block font-serif text-lg font-semibold text-tinta">
                    {porta.titulo}
                  </span>
                  <span className="mt-1 block text-[13.5px] text-tinta-2">{porta.descricao}</span>
                </span>
              </Cartao>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
