import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-8 p-6">
      <div>
        <h1 className="text-3xl font-semibold">Marca-Página</h1>
        <p className="mt-1 text-neutral-600">Biblioteca da escola</p>
      </div>

      {/* Dois reinos separados desde a porta de entrada (spec §3.6). Um
          login único que "descobre" se é aluno ou staff obrigaria a
          tratar os dois com o mesmo formulário — e o do aluno é matrícula
          e data de nascimento, não e-mail e senha. */}
      <div className="flex flex-col gap-3">
        <Link
          href="/aluno/entrar"
          className="rounded border border-neutral-300 px-5 py-4 hover:bg-neutral-50"
        >
          <span className="block text-lg font-medium">Sou aluno</span>
          <span className="block text-sm text-neutral-600">
            Entre com sua matrícula e data de nascimento
          </span>
        </Link>

        <Link
          href="/entrar"
          className="rounded border border-neutral-300 px-5 py-4 hover:bg-neutral-50"
        >
          <span className="block text-lg font-medium">Sou da equipe</span>
          <span className="block text-sm text-neutral-600">
            Coordenação, bibliotecária, monitor ou professor
          </span>
        </Link>
      </div>
    </main>
  )
}
