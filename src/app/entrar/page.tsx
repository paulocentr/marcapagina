'use client'

import { useActionState } from 'react'
import { entrarComoStaff, type EstadoDoFormulario } from './actions'

const INICIAL: EstadoDoFormulario = { erro: null }

export default function PaginaDeLoginStaff() {
  const [estado, acao, pendente] = useActionState(entrarComoStaff, INICIAL)

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Marca-Página</h1>
        <p className="text-sm text-neutral-600">Acesso da equipe da biblioteca</p>
      </div>

      <form action={acao} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">E-mail</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Senha</span>
          <input
            name="senha"
            type="password"
            required
            autoComplete="current-password"
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>

        {estado.erro && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {estado.erro}
          </p>
        )}

        <button
          type="submit"
          disabled={pendente}
          className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-60"
        >
          {pendente ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <a href="/aluno/entrar" className="text-sm text-neutral-600 underline">
        Sou aluno
      </a>
    </main>
  )
}
