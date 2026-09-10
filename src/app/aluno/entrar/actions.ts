'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { entradaLoginAlunoSchema } from '@/modules/autenticacao/autenticacao.schema'
import { autenticarAluno } from '@/modules/autenticacao/autenticacao.service'
import {
  usuariosRepository,
  alunosParaLoginRepository,
} from '@/modules/usuarios/usuarios.repository'
import { verificarBloqueio, registrarTentativa } from '@/core/auth/tentativas'
import { resolverTenant } from '@/core/tenant/resolver'
import { executarComTenant } from '@/core/tenant/context'
import { gravarCookieDeSessao } from '@/core/auth/sessao'
import { ErroDeDominio } from '@/core/errors'

export type EstadoDoFormulario = { erro: string | null }

export async function entrarComoAluno(
  _anterior: EstadoDoFormulario,
  dados: FormData,
): Promise<EstadoDoFormulario> {
  const analisado = entradaLoginAlunoSchema.safeParse({
    matricula: dados.get('matricula'),
    dataNascimento: dados.get('dataNascimento'),
  })
  if (!analisado.success) {
    return { erro: analisado.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const cabecalhos = await headers()
  const escola = await resolverTenant(cabecalhos.get('host'))
  if (!escola) return { erro: 'Escola não identificada neste endereço.' }

  const ip = cabecalhos.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'

  try {
    const principal = await executarComTenant(escola.id, () =>
      autenticarAluno(
        { ...analisado.data, escolaId: escola.id, ip },
        {
          usuarios: usuariosRepository,
          alunos: alunosParaLoginRepository,
          verificarBloqueio,
          registrarTentativa,
        },
      ),
    )

    await gravarCookieDeSessao(principal)
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { erro: erro.message }
    throw erro
  }

  redirect('/aluno')
}
