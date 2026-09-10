import { executarEmTransacao } from '@/core/db/tenant-extension'
import { alunosImportacaoRepository } from '@/modules/importacao/alunos-importacao.repository'
import type { DependenciasDeImportacao } from '@/modules/importacao/importacao.service'
import type { RepositorioDeAlunosParaImportacao } from '@/modules/importacao/plano-alunos'

/**
 * Ponto de composição da importação.
 *
 * Existe para que as rotas nunca importem um `*.repository.ts` — a
 * Global Constraint 1 proíbe, e há gate no CI. A rota pede o pacote
 * pronto e passa adiante; quem sabe montar é este módulo.
 */
export type DependenciasDaImportacaoDeAlunos = DependenciasDeImportacao & {
  alunosParaImportacao: RepositorioDeAlunosParaImportacao
}

/**
 * É uma função por PLANO de importação, e não uma só, porque
 * `PlanoDeImportacao.jaExistentes` e `.gravar` recebem as dependências
 * como `unknown` e cada plano faz o seu próprio cast. Um pacote gordo com
 * os repositórios de todos os planos passaria pelo compilador e daria ao
 * plano de alunos acesso à gravação do acervo — o cast não confere nada.
 * Uma função por plano mantém o que chega ao plano igual ao que ele usa.
 *
 * `emTransacao` vem daqui e não do serviço porque é o que garante o
 * tudo-ou-nada: `executarEmTransacao` guarda o cliente da transação num
 * AsyncLocalStorage, e o repositório o encontra sem saber que existe uma.
 */
export function dependenciasDaImportacaoDeAlunos(): DependenciasDaImportacaoDeAlunos {
  return {
    alunosParaImportacao: alunosImportacaoRepository,
    emTransacao: executarEmTransacao,
  }
}
