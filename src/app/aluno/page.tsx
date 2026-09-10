import { redirect } from 'next/navigation'
import { lerSessao } from '@/core/auth/sessao'
import { ehAluno } from '@/core/auth/principal'

export const runtime = 'nodejs'

export default async function PaginaDoAluno() {
  const principal = await lerSessao()
  if (!principal || !ehAluno(principal)) redirect('/aluno/entrar')

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Olá, {principal.nome}</h1>
      <p className="mt-1 text-sm text-neutral-600">Matrícula {principal.matricula}</p>
      <a href="/sair" className="mt-6 inline-block text-sm underline">
        Sair
      </a>
    </main>
  )
}
