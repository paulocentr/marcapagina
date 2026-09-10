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
import { entrarComoAluno, type EstadoDoFormulario } from './actions'

const INICIAL: EstadoDoFormulario = { erro: null }

export default function PaginaDeLoginAluno(): ReactElement {
  const [estado, acao, pendente] = useActionState(entrarComoAluno, INICIAL)

  return (
    // Celular primeiro: é onde o aluno abre o portal. Os dois campos e o
    // botão são de 52px e 44px, acima do alvo mínimo de toque.
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center gap-6 px-5 py-10">
      <div className="flex items-center gap-2.5">
        <Logotipo tamanho={30} />
        <span className="font-serif text-[22px] font-bold tracking-[-0.02em] text-tinta">
          {nomeDoProduto()}
        </span>
      </div>

      <Cartao className="flex flex-col gap-5">
        <div>
          <h1 className="font-serif text-[22px] font-semibold text-tinta">Entrar na biblioteca</h1>
          <p className="mt-[3px] text-[13.5px] text-tinta-2">
            Use a sua matrícula e a sua data de nascimento.
          </p>
        </div>

        <form action={acao} className="flex flex-col gap-4">
          {/*
            Variante de bipagem nos dois: matrícula e data são números que
            se digitam olhando para um papel, e em mono de 19px o aluno
            confere dígito a dígito o que acabou de teclar.

            `autoComplete` assimétrico de propósito. A matrícula é o
            identificador e o navegador guardá-la poupa digitação a cada
            entrada; a data de nascimento é a METADE SECRETA do par
            (decisão 3 da spec), e deixar o navegador de um aparelho
            compartilhado guardá-la transformaria o portal do colega em
            dois toques. A variante de bipagem já entrega `off` sozinha —
            aqui só a matrícula abre exceção.
          */}
          <CampoComRotulo
            id="matricula"
            rotulo="Matrícula"
            variante="bipagem"
            name="matricula"
            required
            inputMode="numeric"
            autoComplete="username"
          />

          <CampoComRotulo
            id="dataNascimento"
            rotulo="Data de nascimento"
            variante="bipagem"
            name="dataNascimento"
            type="date"
            required
          />

          {/*
            Genérica de propósito: não diz se a matrícula existe. Sem isso,
            o formulário responderia "quem estuda aqui?" a quem
            experimentasse números em sequência.
          */}
          {estado.erro !== null && <Faixa tom="erro">{estado.erro}</Faixa>}

          <Botao type="submit" tamanho="grande" disabled={pendente} className="w-full">
            {pendente ? 'Entrando…' : 'Entrar'}
          </Botao>
        </form>
      </Cartao>

      <p className="text-center text-[13px] text-tinta-2">
        É da equipe da escola?{' '}
        <Link href="/entrar" className="font-semibold">
          entrar com e-mail e senha
        </Link>
      </p>
    </main>
  )
}
