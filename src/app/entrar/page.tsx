'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import type { ReactElement } from 'react'
import { Botao } from '@/components/ui/botao'
import { CampoComRotulo } from '@/components/ui/campo'
import { Cartao } from '@/components/ui/cartao'
import { Faixa } from '@/components/ui/faixa'
import { Logotipo } from '@/components/ui/icones'
import { nomeDoProduto } from '@/core/produto'
import { entrarComoStaff, type EstadoDoFormulario } from './actions'

const INICIAL: EstadoDoFormulario = { erro: null }

export default function PaginaDeLoginStaff(): ReactElement {
  const [estado, acao, pendente] = useActionState(entrarComoStaff, INICIAL)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[400px] flex-col justify-center gap-6 px-6 py-12">
      <div className="flex items-center gap-2.5">
        <Logotipo tamanho={30} />
        <span className="font-serif text-[22px] font-bold tracking-[-0.02em] text-tinta">
          {nomeDoProduto()}
        </span>
      </div>

      <Cartao className="flex flex-col gap-5">
        <div>
          <h1 className="font-serif text-[22px] font-semibold text-tinta">Acesso da equipe</h1>
          <p className="mt-[3px] text-[13.5px] text-tinta-2">
            Coordenação, bibliotecária, monitor ou professor.
          </p>
        </div>

        <form action={acao} className="flex flex-col gap-4">
          <CampoComRotulo
            id="email"
            rotulo="E-mail"
            name="email"
            type="email"
            required
            autoComplete="username"
          />

          <CampoComRotulo
            id="senha"
            rotulo="Senha"
            name="senha"
            type="password"
            required
            autoComplete="current-password"
          />

          {/*
            A mensagem é GENÉRICA de propósito e vem pronta do serviço:
            "Dados de acesso incorretos." não diz se o e-mail existe, e é
            isso que impede usar o formulário para descobrir quem trabalha
            na escola. A faixa também não marca os campos de vermelho — não
            se sabe qual dos dois está errado, e apontar o errado seria
            justamente a dica que não se quer dar.
          */}
          {estado.erro !== null && <Faixa tom="erro">{estado.erro}</Faixa>}

          <Botao type="submit" tamanho="grande" disabled={pendente} className="w-full">
            {pendente ? 'Entrando…' : 'Entrar'}
          </Botao>
        </form>
      </Cartao>

      <p className="text-center text-[13px] text-tinta-2">
        Aluno entra por outra porta:{' '}
        <Link href="/aluno/entrar" className="font-semibold">
          entrar com matrícula
        </Link>
      </p>
    </main>
  )
}
