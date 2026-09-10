'use server'

import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { ErroDeDominio } from '@/core/errors'
import { exigirPermissao } from '@/core/rbac/verificar'
import { lerPlanilha } from '@/infra/planilha/ler'
import { dependenciasDaImportacaoDeAlunos } from '@/modules/importacao/importacao.deps'
import {
  ImportacaoComErrosError,
  MapeamentoIncompletoError,
  importar,
  previsualizar,
  type CampoDeImportacao,
  type ProblemaNaLinha,
} from '@/modules/importacao/importacao.service'
import { planoDeAlunos } from '@/modules/importacao/plano-alunos'
import { validarArquivoEnviado } from './arquivo'
import { mapeamentoDoFormulario, sugerirMapeamento } from './mapeamento'
import { dataComoAEscolaEscreve } from './plano-na-tela'

/**
 * As Server Actions da tela de importação de alunos.
 *
 * Quem lê a sessão é esta camada, com `comStaffNoTenant`, e quem autoriza
 * é o serviço, que recebe o `Principal` por parâmetro (decisão 13). A
 * tela nunca vê repositório, `@prisma/client` nem `@/core/db` — há gate
 * no CI para isso.
 *
 * São DUAS actions e o arquivo é enviado nas duas, de propósito. O
 * serviço de importação é sem memória: `previsualizar` não guarda nada e
 * `importar` refaz a análise inteira antes de gravar. Guardar a planilha
 * analisada entre os dois passos — em sessão, em disco, em memória do
 * processo — criaria uma segunda verdade sobre um arquivo com dados de
 * menores, e faria a confirmação gravar o que a tela tinha visto e não o
 * que o banco tem agora. Reenviar custa alguns kilobytes e mantém uma
 * verdade só.
 *
 * É Server Action e não Route Handler porque a rota exigiria autorização
 * própria e o serviço já autoriza — e porque `<Link>` para Route Handler
 * é executado pelo prefetch do App Router, sem ninguém clicar.
 */

/** Os campos do plano, para a tela desenhar a escolha de colunas. */
export type CampoNaTela = CampoDeImportacao

export interface LeituraDaPlanilha {
  arquivo: string
  /** Os títulos, como estão escritos na primeira linha do arquivo. */
  cabecalho: string[]
  /** chave do campo → índice da coluna. É o que foi USADO na análise. */
  mapeamento: Record<string, number>
  /** Linhas de dados que o leitor encontrou (sem contar o cabeçalho). */
  totalDeLinhas: number
}

/**
 * Uma linha válida como o sistema a entendeu.
 *
 * Existe por um motivo só, e é o que nenhuma contagem resolve: mapeamento
 * trocado produz planilha 100% válida e cadastro 100% errado. O nome da
 * mãe no campo do aluno passa por toda validação. Ver quatro linhas
 * escritas é o que permite à operadora reconhecer o erro antes de gravar.
 */
export interface LinhaDeAmostra {
  matricula: string
  nome: string
  /** Já em dd/mm/aaaa, como a escola escreve. */
  dataNascimento: string
  responsavel: string | null
}

export interface PlanoNaTela {
  /** Quantas linhas viram cadastro NOVO. */
  entram: number
  /** Linhas cuja matrícula já está no banco: serão puladas, não é erro. */
  jaCadastrados: ProblemaNaLinha[]
  /** Linhas recusadas pelo plano. Com qualquer uma, nada é gravado. */
  problemas: ProblemaNaLinha[]
  amostra: LinhaDeAmostra[]
}

export type RespostaDaAnalise =
  | { situacao: 'analisada'; leitura: LeituraDaPlanilha; plano: PlanoNaTela; campos: CampoNaTela[] }
  /** Leu o arquivo, mas falta dizer de qual coluna sai qual campo. */
  | { situacao: 'falta-mapear'; leitura: LeituraDaPlanilha; campos: CampoNaTela[]; erro: string }
  | { situacao: 'recusada'; erro: string }

const LINHAS_DA_AMOSTRA = 6

/**
 * Lê a planilha e devolve o PLANO — sem gravar nada.
 *
 * `previsualizar` é uma função separada de `importar` no serviço
 * exatamente para isto existir: a operadora vê quantos entram, quantos
 * já estão cadastrados e quais linhas estão com problema antes de
 * qualquer escrita.
 */
export async function analisarPlanilhaAction(dados: FormData): Promise<RespostaDaAnalise> {
  try {
    return await comStaffNoTenant(async (principal) => {
      // Defesa em profundidade: recusa ANTES de descompactar um .xlsx
      // vindo de fora. A autorização que vale continua sendo a do
      // serviço, que chama `exigirPermissao` com este mesmo Principal —
      // esta linha só evita entregar o descompactador a quem já se sabe
      // que vai ser recusado.
      exigirPermissao(principal, planoDeAlunos.permissao)

      const preparo = await prepararPlanilha(dados)
      if (!preparo.ok) return { situacao: 'recusada' as const, erro: preparo.erro }

      const { leitura, linhas } = preparo

      try {
        const previa = await previsualizar(
          principal,
          {
            plano: planoDeAlunos,
            cabecalho: leitura.cabecalho,
            linhas,
            mapeamento: leitura.mapeamento,
          },
          dependenciasDaImportacaoDeAlunos(),
        )

        return {
          situacao: 'analisada' as const,
          leitura,
          campos: planoDeAlunos.campos,
          plano: {
            entram: previa.validas.length,
            jaCadastrados: previa.jaExistentes,
            problemas: previa.problemas,
            amostra: previa.validas.slice(0, LINHAS_DA_AMOSTRA).map((aluno) => ({
              matricula: aluno.matricula,
              nome: aluno.nome,
              dataNascimento: dataComoAEscolaEscreve(aluno.dataNascimento),
              responsavel: aluno.responsavelNome === undefined ? null : aluno.responsavelNome,
            })),
          },
        }
      } catch (erro) {
        // Faltar coluna obrigatória NÃO é arquivo recusado: o arquivo foi
        // lido e o cabeçalho está na mão. Devolver a leitura é o que
        // permite à tela mostrar a escolha de colunas em vez de mandar a
        // operadora renomear a planilha da secretaria.
        if (erro instanceof MapeamentoIncompletoError) {
          return {
            situacao: 'falta-mapear' as const,
            leitura,
            campos: planoDeAlunos.campos,
            erro: erro.message,
          }
        }
        throw erro
      }
    })
  } catch (erro) {
    if (erro instanceof ErroDeDominio) return { situacao: 'recusada', erro: erro.message }
    throw erro
  }
}

export type RespostaDaImportacao =
  | { situacao: 'gravada'; arquivo: string; importados: number; ignorados: number }
  /**
   * A planilha tem linha com problema e NADA foi gravado. Situação
   * própria porque não é falha de sistema: é o tudo-ou-nada funcionando,
   * e a tela precisa mostrar as linhas para consertar no Excel.
   */
  | { situacao: 'com-erros'; erro: string; problemas: ProblemaNaLinha[] }
  | { situacao: 'recusada'; erro: string }

/**
 * Confirma e grava.
 *
 * A gravação é tudo-ou-nada: `importar` refaz a análise, recusa a
 * planilha inteira se alguma linha tiver problema e grava o resto numa
 * transação só. Não existe importação pela metade, e é por isso que a
 * tela não tem barra de progresso nem "importando 120 de 400".
 */
export async function importarPlanilhaAction(dados: FormData): Promise<RespostaDaImportacao> {
  try {
    return await comStaffNoTenant(async (principal) => {
      exigirPermissao(principal, planoDeAlunos.permissao)

      const preparo = await prepararPlanilha(dados)
      if (!preparo.ok) return { situacao: 'recusada' as const, erro: preparo.erro }

      const { leitura, linhas } = preparo

      const resultado = await importar(
        principal,
        {
          plano: planoDeAlunos,
          cabecalho: leitura.cabecalho,
          linhas,
          mapeamento: leitura.mapeamento,
        },
        dependenciasDaImportacaoDeAlunos(),
      )

      return {
        situacao: 'gravada' as const,
        arquivo: leitura.arquivo,
        importados: resultado.importados,
        ignorados: resultado.ignorados,
      }
    })
  } catch (erro) {
    if (erro instanceof ImportacaoComErrosError) {
      return { situacao: 'com-erros', erro: erro.message, problemas: erro.problemas }
    }
    if (erro instanceof ErroDeDominio) return { situacao: 'recusada', erro: erro.message }
    throw erro
  }
}

type PlanilhaPreparada =
  | { ok: true; leitura: LeituraDaPlanilha; linhas: string[][] }
  | { ok: false; erro: string }

/**
 * Do `FormData` até as linhas e o mapeamento — o mesmo caminho nas duas
 * actions, porque a análise que a operadora aprovou e a gravação que ela
 * confirmou têm de ler o arquivo do mesmo jeito. Dois caminhos
 * parecidos aqui seriam duas interpretações do mesmo arquivo, e a tela
 * mostraria um plano que a gravação não cumpre.
 */
async function prepararPlanilha(dados: FormData): Promise<PlanilhaPreparada> {
  const enviado = dados.get('arquivo')
  if (enviado === null || typeof enviado === 'string') {
    return { ok: false, erro: 'Escolha a planilha antes de enviar.' }
  }

  // Tamanho e tipo ANTES de qualquer byte chegar ao leitor: `.xlsx` é um
  // zip, e descompactar arquivo de tamanho arbitrário vindo de fora é
  // justamente o que não pode depender do que o navegador prometeu.
  const validacao = validarArquivoEnviado(enviado.name, enviado.size)
  if (!validacao.ok) return { ok: false, erro: validacao.erro }

  const bytes = Buffer.from(await enviado.arrayBuffer())

  let cabecalho: string[]
  let linhas: string[][]
  try {
    const lida = await lerPlanilha(bytes, enviado.name)
    cabecalho = lida.cabecalho
    linhas = lida.linhas
  } catch (erro) {
    // O detalhe entra na frase porque as mensagens do leitor são escritas
    // para a operadora ("A planilha não tem nenhuma aba.") e, quando o
    // erro é da biblioteca, ao menos dizem que o arquivo está corrompido.
    // Sem ele, "não conseguimos ler" manda ela tentar o mesmo arquivo.
    const detalhe = erro instanceof Error ? erro.message.slice(0, 200) : 'motivo desconhecido'
    return {
      ok: false,
      erro:
        `Não foi possível ler "${enviado.name}". ${detalhe} ` +
        'Confira se é a planilha exportada da secretaria.',
    }
  }

  if (linhas.length === 0) {
    return {
      ok: false,
      erro: `"${enviado.name}" tem cabeçalho mas nenhuma linha de aluno preenchida.`,
    }
  }

  // O mapeamento escolhido à mão manda; sem escolha, vale a sugestão.
  // A sugestão é recalculada a cada envio de propósito: ela é função só
  // do cabeçalho, e um mapeamento guardado do arquivo anterior aplicaria
  // as colunas de uma planilha na outra.
  //
  // Quem decide qual dos dois vale é o campo `mapeamento-explicito`, e
  // não "o formulário veio vazio?": a operadora que põe TODOS os campos
  // em "não usar" mandaria um mapeamento vazio, e cair na sugestão ali
  // seria analisar uma planilha diferente da que a tela mostra.
  const doFormulario = mapeamentoDoFormulario(
    entradasDeTexto(dados),
    planoDeAlunos.campos,
    cabecalho.length,
  )
  if (!doFormulario.ok) return { ok: false, erro: doFormulario.erro }

  const mapeamento =
    dados.get('mapeamento-explicito') === '1'
      ? doFormulario.mapeamento
      : sugerirMapeamento(cabecalho, planoDeAlunos.campos).mapeamento

  return {
    ok: true,
    leitura: { arquivo: enviado.name, cabecalho, mapeamento, totalDeLinhas: linhas.length },
    linhas,
  }
}

/** Só as entradas de texto do formulário: o arquivo não é mapeamento. */
function entradasDeTexto(dados: FormData): [string, string][] {
  const pares: [string, string][] = []
  for (const [nome, valor] of dados.entries()) {
    if (typeof valor === 'string') pares.push([nome, valor])
  }
  return pares
}
