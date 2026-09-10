/**
 * As regras do arquivo enviado, antes de qualquer byte chegar ao leitor
 * de planilha.
 *
 * Módulo puro e sem servidor: a mesma função valida no navegador (para a
 * operadora saber na hora) e na Server Action (que é onde vale, porque o
 * navegador não é autoridade sobre nada). O leitor de `.xlsx` descompacta
 * um arquivo vindo de fora, num sistema com dados de menores — dar-lhe
 * um arquivo de 80 MB ou um `.pdf` renomeado é justamente o que não pode
 * depender de boa vontade do cliente.
 */

/**
 * 2 MB. A planilha da secretaria com 400 alunos tem algumas dezenas de
 * kilobytes; o limite é folgado por duas ordens de grandeza e ainda
 * impede que o arquivo enviado vire a memória do servidor.
 */
export const LIMITE_DE_BYTES = 2 * 1024 * 1024

/** O limite escrito como a tela mostra. Uma fonte só, para não divergir. */
export const LIMITE_EM_TEXTO = '2 MB'

/**
 * O que `src/infra/planilha/ler.ts` sabe ler de verdade.
 *
 * `.xlsx` é o uso primário (é o que o Excel da secretaria salva) e
 * `.csv` é o que ela exporta quando a planilha vem de outro sistema.
 * A lista NÃO inclui `.xls` antigo: o leitor não abre esse formato, e
 * aceitá-lo aqui só trocaria uma recusa clara por um erro de biblioteca.
 */
export const EXTENSOES_ACEITAS = ['.xlsx', '.csv'] as const

export type ValidacaoDoArquivo =
  | { ok: true; extensao: string }
  | { ok: false; erro: string }

export function validarArquivoEnviado(nome: string, tamanhoEmBytes: number): ValidacaoDoArquivo {
  const ponto = nome.lastIndexOf('.')
  const extensao = ponto === -1 ? '' : nome.slice(ponto).toLowerCase()

  if (!(EXTENSOES_ACEITAS as readonly string[]).includes(extensao)) {
    return {
      ok: false,
      erro:
        `"${nome}" não é uma planilha que o sistema saiba ler. ` +
        `Envie o arquivo em ${EXTENSOES_ACEITAS.join(' ou ')}.`,
    }
  }

  if (tamanhoEmBytes <= 0) {
    return { ok: false, erro: `"${nome}" está vazio. Confira o arquivo antes de enviar.` }
  }

  if (tamanhoEmBytes > LIMITE_DE_BYTES) {
    return {
      ok: false,
      erro:
        `"${nome}" tem ${emMegabytes(tamanhoEmBytes)} e o limite é ${LIMITE_EM_TEXTO}. ` +
        `Uma planilha de alunos não chega perto disso — confira se é o arquivo certo.`,
    }
  }

  return { ok: true, extensao }
}

function emMegabytes(bytes: number): string {
  // Uma decimal: "3,4 MB" é o que a operadora confere contra o Windows.
  const megabytes = bytes / (1024 * 1024)
  return `${megabytes.toFixed(1).replace('.', ',')} MB`
}
