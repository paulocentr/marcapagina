import type { ReactElement } from 'react'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Faixa } from '@/components/ui/faixa'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { SemPermissaoError } from '@/core/errors'
import { temPermissao } from '@/core/rbac/verificar'
import { dependenciasDeUsuarios } from '@/modules/usuarios/usuarios.deps'
import {
  listarPapeisDaEscola,
  listarUsuariosDaEscola,
} from '@/modules/usuarios/usuarios.service'
import { EditorDePapeis } from './editor-de-papeis'
import { FormularioDeNovaConta } from './formulario-de-nova-conta'
import { ListaDeContas } from './lista-de-contas'
import { montarContas, nomeDoPapelNaTela } from './usuarios-na-tela'
import type { ContaNaTela } from './usuarios-na-tela'
import type { OpcaoDePapel } from './formulario-de-nova-conta'
import type { PapelParaEditar } from './editor-de-papeis'

export const runtime = 'nodejs'

/**
 * Contas da equipe e papéis.
 *
 * Por que esta tela existe: a bibliotecária e a monitora operam o balcão
 * todo dia. Sem conta própria, a coordenação empresta a senha dela — e
 * então TODA linha da auditoria passa a dizer que foi a coordenação. O
 * registro de quem fez o quê deixa de servir para o que existe.
 *
 * Componente de servidor: as duas consultas rodam na requisição, com o
 * `Principal` da sessão, e o que atravessa para o navegador é o tipo
 * estreito `ContaNaTela` — sem `senhaHash`, que a gestão de contas é a
 * única parte do sistema a escrever. As escritas moram em Server Actions.
 *
 * O editor de papéis aparece só para quem tem `papel:gerenciar`, que é
 * permissão separada de `usuario:gerenciar`: a coordenação pode querer
 * que a secretaria crie contas sem poder redesenhar o que cada papel faz.
 * Esconder não é autorizar — quem recusa é o serviço.
 *
 * `<main>` próprio: a casca do painel entrega um `<div>`, e é aqui que o
 * conteúdo principal começa.
 */
export default async function PaginaDeUsuarios(): Promise<ReactElement> {
  const dados = await comStaffNoTenant(async (principal) => {
    const deps = dependenciasDeUsuarios()

    try {
      const [usuarios, papeis] = await Promise.all([
        listarUsuariosDaEscola(principal, deps),
        listarPapeisDaEscola(principal, deps),
      ])

      // Só os papéis que esta escola atribui: SUPER_ADMIN não pertence a
      // escola nenhuma, e oferecê-lo num `<select>` seria convidar a
      // coordenação a um clique que o serviço recusa.
      const daEscola = papeis.filter((papel) => papel.atribuivel)

      const opcoes: OpcaoDePapel[] = daEscola.map((papel) => ({
        id: papel.id,
        nomeNaTela: nomeDoPapelNaTela(papel.nome),
        descricao: papel.descricao,
      }))

      const paraEditar: PapelParaEditar[] = daEscola.map((papel) => ({
        id: papel.id,
        nomeNaTela: nomeDoPapelNaTela(papel.nome),
        descricao: papel.descricao,
        permissoes: papel.permissoes,
        quantidadeDeUsuarios: papel.quantidadeDeUsuarios,
      }))

      return {
        contas: montarContas(usuarios, principal.id),
        opcoes,
        paraEditar,
        podeEditarPapeis: temPermissao(principal, 'papel:gerenciar'),
        recusa: null as string | null,
      }
    } catch (erro) {
      // Quem não administra contas (bibliotecária, monitora, professor)
      // não vê o item no menu, mas alcança a URL digitando. Sem este ramo
      // a recusa do serviço sairia como erro 500 — e um 500 não diz à
      // pessoa que ela está na tela errada, diz que o sistema quebrou.
      if (erro instanceof SemPermissaoError) {
        return {
          contas: [] as ContaNaTela[],
          opcoes: [] as OpcaoDePapel[],
          paraEditar: [] as PapelParaEditar[],
          podeEditarPapeis: false,
          recusa: erro.message as string | null,
        }
      }
      throw erro
    }
  })

  return (
    <main className="px-8 py-6">
      <CabecalhoDeTela
        titulo="Contas da equipe"
        descricao={
          <>
            Cada pessoa entra com a conta dela.{' '}
            <span className="text-tinta-3">
              É esse nome que o histórico guarda em cada empréstimo, devolução e baixa.
            </span>
          </>
        }
      />

      {dados.recusa !== null ? (
        <div className="mt-[18px] max-w-[620px]">
          <Faixa tom="erro" titulo="Esta tela é de quem administra a escola.">
            {dados.recusa} Fale com a coordenação se você precisa criar ou desativar contas.
          </Faixa>
        </div>
      ) : (
        <>
          <div className="mt-[18px] grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
            <ListaDeContas contas={dados.contas} papeis={dados.opcoes} />
            <FormularioDeNovaConta papeis={dados.opcoes} />
          </div>

          {dados.podeEditarPapeis && (
            <div className="mt-5 max-w-[1120px]">
              <EditorDePapeis papeis={dados.paraEditar} />
            </div>
          )}
        </>
      )}
    </main>
  )
}
