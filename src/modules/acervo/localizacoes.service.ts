import { exigirPermissao } from '@/core/rbac/verificar'
import { ErroDeDominio } from '@/core/errors'
import type { Principal } from '@/core/auth/principal'

export interface LocalizacaoRegistrada {
  id: string
  nome: string
  corredor: string | null
  estante: string | null
  prateleira: string | null
}

export interface RepositorioDeLocalizacoes {
  listar(): Promise<LocalizacaoRegistrada[]>
  criar(dados: Omit<LocalizacaoRegistrada, 'id'>): Promise<LocalizacaoRegistrada>
}

export interface DependenciasDeLocalizacoes {
  localizacoes: RepositorioDeLocalizacoes
}

export async function criarLocalizacao(
  principal: Principal,
  entrada: { nome: string; corredor?: string; estante?: string; prateleira?: string },
  deps: DependenciasDeLocalizacoes,
): Promise<LocalizacaoRegistrada> {
  exigirPermissao(principal, 'config:editar')

  const nome = entrada.nome.trim()
  if (!nome) throw new ErroDeDominio('Informe o nome da localização.', 'NOME_OBRIGATORIO')

  // Corredor, estante e prateleira são opcionais de propósito: nem toda
  // biblioteca escolar tem corredor numerado, e exigir os três barraria a
  // escola que guarda tudo em "Armário da sala 5".
  return deps.localizacoes.criar({
    nome,
    corredor: vazioViraNulo(entrada.corredor),
    estante: vazioViraNulo(entrada.estante),
    prateleira: vazioViraNulo(entrada.prateleira),
  })
}

export async function listarLocalizacoes(
  deps: DependenciasDeLocalizacoes,
): Promise<LocalizacaoRegistrada[]> {
  return deps.localizacoes.listar()
}

/**
 * Caminho físico legível, para a etiqueta e para a tela de inventário.
 * Os campos ausentes somem junto com o separador — "Infantil A · · " é o
 * tipo de saída que faz a operadora achar que o sistema perdeu o dado.
 */
export function descreverLocalizacao(l: LocalizacaoRegistrada): string {
  return [
    l.nome,
    l.corredor ? `corredor ${l.corredor}` : null,
    l.estante ? `estante ${l.estante}` : null,
    l.prateleira ? `prateleira ${l.prateleira}` : null,
  ]
    .filter((parte): parte is string => parte !== null)
    .join(' · ')
}

function vazioViraNulo(valor: string | undefined): string | null {
  const limpo = valor?.trim()
  return limpo ? limpo : null
}
