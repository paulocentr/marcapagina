import type { CampoDeImportacao } from '@/modules/importacao/importacao.service'

/**
 * De qual coluna da planilha sai cada campo do plano.
 *
 * O serviço de importação exige `mapeamento: Record<string, number>` e
 * NÃO adivinha nada — de propósito: o teste de unidade dele diz que o
 * plano "declara os campos para a tela montar o mapeamento". Ou seja,
 * adivinhar é trabalho desta tela, e é aqui que ele fica: módulo puro,
 * sem React e sem servidor, provado em milissegundos.
 *
 * Por que adivinhar em vez de exigir cabeçalho fixo: a planilha vem da
 * secretaria já pronta, com o cabeçalho que ela sempre usou. Obrigar a
 * escola a renomear colunas antes de importar é o tipo de exigência que
 * faz a coordenadora voltar a digitar aluno a aluno.
 *
 * E por que a sugestão é SUGESTÃO, editável na tela: o erro mais caro do
 * importador não é a linha recusada, é a coluna trocada. Nome da mãe no
 * lugar do nome do aluno passa por todas as validações, grava trezentos
 * cadastros errados e ninguém vê.
 */

/**
 * Como cada campo aparece escrito na planilha de verdade.
 *
 * `Record<string, …>` e não um tipo fechado nas chaves do plano de
 * alunos: a máquina de importação é genérica (há um plano de brinquedo no
 * teste dela provando isso), e um plano futuro sem apelidos aqui continua
 * casando pelo próprio rótulo e pela própria chave.
 */
const APELIDOS: Record<string, readonly string[]> = {
  matricula: ['matricula', 'ra', 'registro', 'registro do aluno', 'codigo', 'codigo do aluno'],
  nome: ['nome', 'nome do aluno', 'aluno', 'nome completo', 'nome completo do aluno'],
  dataNascimento: [
    'data de nascimento',
    'data nascimento',
    'nascimento',
    'dt nascimento',
    'data de nasc',
    'nasc',
  ],
  responsavelNome: [
    'nome do responsavel',
    'responsavel',
    'nome da mae',
    'mae',
    'nome do pai',
    'pai',
    'filiacao',
  ],
  responsavelEmail: [
    'email do responsavel',
    'e mail do responsavel',
    'email',
    'e mail',
    'email do aluno',
  ],
  responsavelTelefone: [
    'telefone do responsavel',
    'telefone',
    'celular',
    'celular do responsavel',
    'fone',
    'contato',
  ],
}

/**
 * A chave de comparação de um título de coluna.
 *
 * Não reusa `normalizarParaBusca` porque aquela preserva pontuação de
 * propósito (título de obra), e aqui pontuação é ruído: "MATRÍCULA:",
 * "nome_completo" e "Data de nascimento" têm de casar. O que não é letra
 * nem dígito vira espaço.
 */
function chaveDeComparacao(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function candidatosDoCampo(campo: CampoDeImportacao): string[] {
  const apelidos = APELIDOS[campo.chave]
  return [
    chaveDeComparacao(campo.rotulo),
    // `dataNascimento` → "data nascimento": sem quebrar o camelCase, a
    // chave do campo nunca casaria com um cabeçalho escrito em palavras.
    chaveDeComparacao(campo.chave.replace(/([a-z0-9])([A-Z])/g, '$1 $2')),
    ...(apelidos === undefined ? [] : apelidos),
  ].filter((candidato) => candidato.length > 0)
}

/**
 * Quanto um título de coluna se parece com um campo.
 *
 * Três níveis, e a diferença entre eles é o que impede o acidente do
 * "nome do responsável": ele casa EXATO com `responsavelNome` (3) e
 * apenas CONTÉM o apelido de `nome` (1), então perde a coluna.
 */
function pontuar(tituloNormalizado: string, candidatos: string[]): number {
  if (tituloNormalizado.length === 0) return 0

  if (candidatos.includes(tituloNormalizado)) return 3

  const acolchoado = ` ${tituloNormalizado} `
  let melhor = 0
  for (const candidato of candidatos) {
    if (tituloNormalizado.startsWith(`${candidato} `)) {
      melhor = Math.max(melhor, 2)
      continue
    }
    // Palavra inteira, não pedaço: sem os espaços, "nome" casaria com
    // "sobrenome" e "ra" casaria com "serie".
    if (acolchoado.includes(` ${candidato} `)) melhor = Math.max(melhor, 1)
  }
  return melhor
}

export interface SugestaoDeMapeamento {
  /** chave do campo → índice da coluna. Só os campos reconhecidos. */
  mapeamento: Record<string, number>
  /** Rótulos dos campos OBRIGATÓRIOS que ninguém reconheceu. */
  obrigatoriosSemColuna: string[]
}

export function sugerirMapeamento(
  cabecalho: string[],
  campos: CampoDeImportacao[],
): SugestaoDeMapeamento {
  const titulos = cabecalho.map(chaveDeComparacao)

  const pares: { campo: number; coluna: number; pontos: number }[] = []
  campos.forEach((campo, indiceDoCampo) => {
    const candidatos = candidatosDoCampo(campo)
    titulos.forEach((titulo, coluna) => {
      const pontos = pontuar(titulo, candidatos)
      if (pontos > 0) pares.push({ campo: indiceDoCampo, coluna, pontos })
    })
  })

  // Guloso pelo par mais forte primeiro. Empate resolvido pela ordem do
  // plano e depois pela ordem das colunas — assim a mesma planilha
  // produz sempre o mesmo mapeamento, e a tela não muda de opinião entre
  // dois envios do mesmo arquivo.
  pares.sort(
    (a, b) => b.pontos - a.pontos || a.campo - b.campo || a.coluna - b.coluna,
  )

  const mapeamento: Record<string, number> = {}
  const camposTomados = new Set<number>()
  const colunasTomadas = new Set<number>()

  for (const par of pares) {
    if (camposTomados.has(par.campo) || colunasTomadas.has(par.coluna)) continue
    const campo = campos[par.campo]
    if (campo === undefined) continue
    mapeamento[campo.chave] = par.coluna
    camposTomados.add(par.campo)
    colunasTomadas.add(par.coluna)
  }

  return {
    mapeamento,
    obrigatoriosSemColuna: campos
      .filter((campo) => campo.obrigatorio && mapeamento[campo.chave] === undefined)
      .map((campo) => campo.rotulo),
  }
}

/** A letra da coluna, como o Excel escreve na barra de cima. */
export function letraDaColuna(indice: number): string {
  let restante = indice
  let letras = ''
  do {
    letras = String.fromCharCode(65 + (restante % 26)) + letras
    restante = Math.floor(restante / 26) - 1
  } while (restante >= 0)
  return letras
}

/**
 * "A · matricula" — a letra que a operadora vê no Excel e o título que
 * está escrito na célula. Só o título não bastaria: duas colunas
 * chamadas "nome" seriam indistinguíveis na lista de escolha.
 */
export function rotuloDaColuna(indice: number, titulo: string): string {
  const escrito = titulo.trim()
  return `${letraDaColuna(indice)} · ${escrito.length > 0 ? escrito : '(sem título)'}`
}

/** O prefixo dos campos de mapeamento no formulário enviado à action. */
export const PREFIXO_DA_COLUNA = 'coluna.'

export type LeituraDoMapeamento =
  | { ok: true; mapeamento: Record<string, number> }
  | { ok: false; erro: string }

/**
 * Lê o mapeamento que veio do formulário.
 *
 * Validação dura porque o mapeamento é a única coisa que a tela manda ao
 * servidor além do arquivo — e `Number()` sobre entrada não validada é
 * proibido no projeto justamente por casos como este: `"1e3"` viraria
 * coluna 1000, toda célula sairia vazia e a planilha seria recusada
 * inteira com "informe a matrícula" em 400 linhas.
 */
export function mapeamentoDoFormulario(
  entradas: Iterable<[string, string]>,
  campos: CampoDeImportacao[],
  quantidadeDeColunas: number,
): LeituraDoMapeamento {
  const chavesValidas = new Set(campos.map((campo) => campo.chave))
  const mapeamento: Record<string, number> = {}
  const donoDaColuna = new Map<number, string>()

  for (const [nome, valor] of entradas) {
    if (!nome.startsWith(PREFIXO_DA_COLUNA)) continue

    const chave = nome.slice(PREFIXO_DA_COLUNA.length)
    if (!chavesValidas.has(chave)) {
      return { ok: false, erro: `O formulário aponta um campo desconhecido: "${chave}".` }
    }

    // Campo deixado em "não usar" simplesmente não entra no mapeamento —
    // é assim que o serviço entende "esta planilha não tem essa coluna".
    if (valor.trim().length === 0) continue

    if (!/^\d+$/.test(valor)) {
      return { ok: false, erro: `Coluna inválida para "${chave}": "${valor}".` }
    }

    const coluna = Number(valor)
    if (coluna >= quantidadeDeColunas) {
      return {
        ok: false,
        erro:
          `A coluna escolhida para "${chave}" não existe nesta planilha, ` +
          `que tem ${quantidadeDeColunas} coluna(s).`,
      }
    }

    const jaUsadaPor = donoDaColuna.get(coluna)
    if (jaUsadaPor !== undefined) {
      return {
        ok: false,
        erro:
          `A coluna ${letraDaColuna(coluna)} foi apontada para dois campos ` +
          `("${jaUsadaPor}" e "${chave}"). Cada campo sai de uma coluna diferente.`,
      }
    }

    donoDaColuna.set(coluna, chave)
    mapeamento[chave] = coluna
  }

  return { ok: true, mapeamento }
}
