import Link from 'next/link'
import { estilosDeBotao } from '@/components/ui/botao'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Faixa } from '@/components/ui/faixa'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { SemPermissaoError } from '@/core/errors'
import { listarTurmas } from '@/modules/leitores/turmas.service'
import { dependenciasDeLeitores } from '@/modules/leitores/leitores.deps'
import { FormularioDeAluno } from '../formulario-de-aluno'

export const runtime = 'nodejs'

/**
 * Cadastrar aluno.
 *
 * A lista de turmas é lida NO SERVIDOR e passada pronta ao formulário: o
 * componente de cliente não fala com serviço nenhum, e assim nada de
 * banco atravessa para o navegador além dos nomes das turmas.
 *
 * A tela é de cadastro em SÉRIE — a operadora tem a lista da secretaria
 * na mão. Ver `FormularioDeAluno`: ao salvar, o formulário se esvazia, o
 * cursor volta para a matrícula e a turma escolhida fica.
 */
export default async function PaginaDeNovoAluno() {
  const dados = await comStaffNoTenant(async (principal) => {
    try {
      const turmas = await listarTurmas(principal, {}, dependenciasDeLeitores())
      return { turmas, recusa: null }
    } catch (erro) {
      if (erro instanceof SemPermissaoError) {
        return { turmas: null, recusa: erro.message }
      }
      throw erro
    }
  })

  return (
    <main className="px-8 py-6">
      <CabecalhoDeTela
        titulo="Cadastrar aluno"
        descricao="Matrícula e data de nascimento são o que o aluno usa para entrar no portal."
        acoes={
          <Link href="/painel/alunos" className={estilosDeBotao('secundaria')}>
            Voltar aos leitores
          </Link>
        }
      />

      <div className="mt-[18px] max-w-[760px]">
        {dados.recusa !== null ? (
          <Faixa tom="erro" titulo="Esta tela é de quem cadastra leitores.">
            {dados.recusa} Fale com a coordenação.
          </Faixa>
        ) : (
          <FormularioDeAluno
            turmas={dados.turmas.map((turma) => ({
              id: turma.id,
              nome: turma.nome,
              serie: turma.serie,
              ano: turma.ano,
            }))}
          />
        )}
      </div>
    </main>
  )
}
