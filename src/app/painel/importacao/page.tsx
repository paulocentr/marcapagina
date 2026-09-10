import type { ReactElement } from 'react'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Faixa } from '@/components/ui/faixa'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { temPermissao } from '@/core/rbac/verificar'
import { planoDeAlunos } from '@/modules/importacao/plano-alunos'
import { Importador } from './importador'

export const runtime = 'nodejs'

/**
 * Importação de alunos por planilha.
 *
 * É o gargalo do sistema, não uma conveniência: sem alunos cadastrados o
 * balcão não empresta para ninguém, e a lista já existe na secretaria —
 * ninguém vai redigitar quatrocentos alunos (decisão 8 e spec §2.6).
 *
 * Componente de servidor só para duas coisas: ler a sessão e entregar ao
 * cliente os campos que o plano de importação declara. O trabalho todo
 * mora nas Server Actions, porque é lá que o `Principal` existe e é de lá
 * que o serviço autoriza.
 *
 * `<main>` próprio: a casca do painel entrega um `<div>`, e é aqui que o
 * conteúdo principal começa.
 */
export default async function PaginaDeImportacao(): Promise<ReactElement> {
  // Isto NÃO é autorização — esconder tela na UI não autoriza nada. Quem
  // autoriza é o serviço, que recebe o Principal e chama
  // `exigirPermissao` em cada uma das duas actions (decisão 13). O teste
  // aqui existe para a tela não pedir uma planilha com dados de menores a
  // quem vai ser recusado depois do envio.
  const podeImportar = await comStaffNoTenant(async (principal) =>
    temPermissao(principal, planoDeAlunos.permissao),
  )

  return (
    <main className="min-h-screen px-8 py-6">
      <CabecalhoDeTela
        titulo="Importar alunos"
        descricao="A planilha da secretaria entra aqui · nada é gravado antes de você ver o plano."
      />

      <div className="mt-6">
        {podeImportar ? (
          <Importador campos={[...planoDeAlunos.campos]} />
        ) : (
          <div className="max-w-[640px]">
            <Faixa tom="erro" titulo="Você não tem permissão para importar alunos.">
              Esta tela cadastra alunos em lote. Peça à coordenação a permissão de importação.
            </Faixa>
          </div>
        )}
      </div>
    </main>
  )
}
