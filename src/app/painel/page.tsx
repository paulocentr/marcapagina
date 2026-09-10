import { redirect } from 'next/navigation'
import { lerSessao } from '@/core/auth/sessao'
import { ehStaff } from '@/core/auth/principal'

export const runtime = 'nodejs'

export default async function PaginaDoPainel() {
  const principal = await lerSessao()

  // O middleware só viu que existe cookie. A validação real é aqui:
  // cookie forjado ou sessão de aluno não entram no painel de staff.
  if (!principal || !ehStaff(principal)) redirect('/entrar')

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Painel</h1>
      <p className="mt-2 text-neutral-700">{principal.nome}</p>
      <p className="mt-1 text-sm text-neutral-500">
        {principal.permissoes.length} permissões ativas
      </p>
      <a href="/sair" className="mt-6 inline-block text-sm underline">
        Sair
      </a>
    </main>
  )
}
