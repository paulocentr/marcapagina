import Link from 'next/link'
import { notFound } from 'next/navigation'
import { estilosDeBotao } from '@/components/ui/botao'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Cartao } from '@/components/ui/cartao'
import { Matricula } from '@/components/ui/codigo'
import { Faixa } from '@/components/ui/faixa'
import { Rotulo } from '@/components/ui/rotulo'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { SemPermissaoError } from '@/core/errors'
import {
  AlunoInexistenteError,
  obterFichaDoAluno,
  type FichaDoAluno,
} from '@/modules/leitores/alunos.service'
import { listarTurmas, type TurmaNaLista } from '@/modules/leitores/turmas.service'
import { dependenciasDeLeitores } from '@/modules/leitores/leitores.deps'
import { rotuloDaSerie } from '@/modules/leitores/serie'
import { ChipDoCadastro, LivrosEmMaos } from '../chip-do-cadastro'
import { FormularioDeAluno } from '../formulario-de-aluno'
import { SituacaoDoCadastro } from './situacao-do-cadastro'

export const runtime = 'nodejs'

/**
 * A ficha do aluno: consultar, editar e desativar.
 *
 * A data de nascimento NÃO é lida aqui, e não é esquecimento: o serviço
 * não a devolve em nenhum tipo de retorno, porque ela é a metade secreta
 * do login do aluno (decisão 3). O formulário de edição abre o campo em
 * branco, e branco significa "não mexa" — como um campo de senha.
 *
 * `<main>` próprio: a casca do painel entrega um `<div>`.
 */
export default async function PaginaDaFichaDoAluno({
  params,
}: {
  params: Promise<{ alunoId: string }>
}) {
  const { alunoId } = await params

  const dados = await comStaffNoTenant(async (principal) => {
    const deps = dependenciasDeLeitores()

    try {
      const [aluno, turmas] = await Promise.all([
        obterFichaDoAluno(principal, alunoId, deps),
        listarTurmas(principal, {}, deps),
      ])
      return { aluno, turmas, recusa: null }
    } catch (erro) {
      // Aluno de outra escola cai aqui: o escopo de tenant não o acha, e
      // o serviço diz "não existe". 404 é a resposta certa — dizer
      // "sem permissão" confirmaria que o registro existe em algum lugar.
      if (erro instanceof AlunoInexistenteError) return null
      if (erro instanceof SemPermissaoError) {
        return { aluno: null, turmas: null, recusa: erro.message }
      }
      throw erro
    }
  })

  if (dados === null) notFound()

  if (dados.recusa !== null) {
    return (
      <main className="px-8 py-6">
        <CabecalhoDeTela titulo="Ficha do leitor" />
        <div className="mt-[18px] max-w-[620px]">
          <Faixa tom="erro" titulo="Esta tela é de quem cuida do cadastro de leitores.">
            {dados.recusa} Fale com a coordenação.
          </Faixa>
        </div>
      </main>
    )
  }

  const { aluno, turmas } = dados

  return (
    <main className="px-8 py-6">
      <CabecalhoDeTela
        titulo={aluno.nome}
        descricao={
          <>
            <Matricula valor={aluno.matricula} />
            {aluno.turma !== null && (
              <span className="text-tinta-3">
                {' · '}
                {aluno.turma.nome} · {rotuloDaSerie(aluno.turma.serie)}
              </span>
            )}
          </>
        }
        acoes={
          <Link href="/painel/alunos" className={estilosDeBotao('secundaria')}>
            Voltar aos leitores
          </Link>
        }
      />

      <div className="mt-[18px] grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="min-w-0">
          <h2 className="mb-[10px] font-serif text-[17px] font-semibold text-tinta">
            Dados do cadastro
          </h2>
          <FormularioDeAluno
            turmas={turmas.map((turma: TurmaNaLista) => ({
              id: turma.id,
              nome: turma.nome,
              serie: turma.serie,
              ano: turma.ano,
            }))}
            aluno={{
              id: aluno.id,
              matricula: aluno.matricula,
              nome: aluno.nome,
              turmaId: aluno.turma === null ? '' : aluno.turma.id,
              responsavelNome: aluno.responsavelNome ?? '',
              responsavelEmail: aluno.responsavelEmail ?? '',
              responsavelTelefone: aluno.responsavelTelefone ?? '',
            }}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Cartao>
            <Rotulo tom="discreto">Situação</Rotulo>
            <div className="mt-[10px] flex flex-wrap items-center gap-[7px]">
              <ChipDoCadastro ativo={aluno.ativo} />
              <LivrosEmMaos quantos={aluno.livrosEmMaos} />
            </div>
            <div className="mt-4 border-t border-linha pt-4">
              <SituacaoDoCadastro alunoId={aluno.id} ativo={aluno.ativo} nome={aluno.nome} />
            </div>
          </Cartao>

          <Cartao>
            <Rotulo tom="discreto">Responsável</Rotulo>
            <Responsavel aluno={aluno} />
          </Cartao>
        </div>
      </div>
    </main>
  )
}

function Responsavel({ aluno }: { aluno: FichaDoAluno }) {
  const nada =
    aluno.responsavelNome === null &&
    aluno.responsavelEmail === null &&
    aluno.responsavelTelefone === null

  if (nada) {
    return (
      <p className="mt-2 text-[13px] text-tinta-2">
        Nenhum contato de responsável cadastrado. É por ele que a biblioteca avisa de
        atraso sem passar pelo aluno.
      </p>
    )
  }

  return (
    <dl className="mt-[10px] flex flex-col gap-[9px] text-[13.5px]">
      {aluno.responsavelNome !== null && (
        <div>
          <dt className="text-[11.5px] text-tinta-3">Nome</dt>
          <dd className="text-tinta">{aluno.responsavelNome}</dd>
        </div>
      )}
      {aluno.responsavelEmail !== null && (
        <div>
          <dt className="text-[11.5px] text-tinta-3">E-mail</dt>
          <dd className="break-all text-tinta">{aluno.responsavelEmail}</dd>
        </div>
      )}
      {aluno.responsavelTelefone !== null && (
        <div>
          <dt className="text-[11.5px] text-tinta-3">Telefone</dt>
          <dd className="text-tinta">{aluno.responsavelTelefone}</dd>
        </div>
      )}
    </dl>
  )
}
