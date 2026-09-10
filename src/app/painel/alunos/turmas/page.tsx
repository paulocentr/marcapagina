import Link from 'next/link'
import { estilosDeBotao } from '@/components/ui/botao'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Faixa } from '@/components/ui/faixa'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { SemPermissaoError } from '@/core/errors'
import { listarTurmas } from '@/modules/leitores/turmas.service'
import { listarAnosLetivos } from '@/modules/leitores/anos-letivos.service'
import { dependenciasDeLeitores } from '@/modules/leitores/leitores.deps'
import { TurmasEAnos } from './turmas-e-anos'

export const runtime = 'nodejs'

/**
 * Turmas e ano letivo.
 *
 * As duas coisas na mesma tela porque turma pende de ano letivo, e quem
 * abre o ano seguinte cadastra as duas na mesma sessão.
 *
 * As datas são formatadas AQUI, no servidor, para dd/mm/aaaa — como a
 * escola escreve. Mandar `Date` para o cliente e formatar lá faria a
 * data depender do fuso do navegador, e a mesma tela mostraria dias
 * diferentes na secretaria e em casa.
 *
 * `<main>` próprio: a casca do painel entrega um `<div>`.
 */
export default async function PaginaDeTurmas() {
  const dados = await comStaffNoTenant(async (principal) => {
    const deps = dependenciasDeLeitores()

    try {
      const [anos, turmas] = await Promise.all([
        listarAnosLetivos(principal, deps),
        listarTurmas(principal, {}, deps),
      ])

      return {
        anos: anos.map((ano) => ({
          id: ano.id,
          ano: ano.ano,
          dataInicio: formatarData(ano.dataInicio),
          dataFim: formatarData(ano.dataFim),
          ativo: ano.ativo,
        })),
        turmas,
        recusa: null,
      }
    } catch (erro) {
      if (erro instanceof SemPermissaoError) {
        return { anos: null, turmas: null, recusa: erro.message }
      }
      throw erro
    }
  })

  return (
    <main className="px-8 py-6">
      <CabecalhoDeTela
        titulo="Turmas e ano letivo"
        descricao={
          <>
            A turma é o que dá série ao aluno.{' '}
            <span className="text-tinta-3">
              E é a série que o Carrinho da Leitura usa para não sugerir livro fora da
              faixa etária, e que a configuração de circulação usa para o prazo por
              série.
            </span>
          </>
        }
        acoes={
          <Link href="/painel/alunos" className={estilosDeBotao('secundaria')}>
            Voltar aos leitores
          </Link>
        }
      />

      <div className="mt-[18px] max-w-[1120px]">
        {dados.recusa !== null ? (
          <Faixa tom="erro" titulo="Esta tela é de quem gerencia turmas.">
            {dados.recusa} Fale com a coordenação.
          </Faixa>
        ) : (
          <TurmasEAnos anos={dados.anos} turmas={dados.turmas} />
        )}
      </div>
    </main>
  )
}

/** dd/mm/aaaa — como a escola escreve, não como o ISO escreve. */
function formatarData(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, '0')
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getUTCFullYear()}`
}
