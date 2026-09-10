import { executarEmTransacao } from '@/core/db/tenant-extension'
import { provedorDeMetadados } from '@/infra/metadados'
import { obrasRepository } from '@/modules/acervo/obras.repository'
import { autoresRepository } from '@/modules/acervo/autores.repository'
import { exemplaresRepository } from '@/modules/acervo/exemplares.repository'
import { categoriasRepository } from '@/modules/acervo/categorias.repository'
import { localizacoesRepository } from '@/modules/acervo/localizacoes.repository'
import type { DependenciasDeCatalogacao } from '@/modules/acervo/catalogacao.service'
import type { DependenciasDeCategorias } from '@/modules/acervo/categorias.service'
import type { DependenciasDeLocalizacoes } from '@/modules/acervo/localizacoes.service'

/**
 * Ponto de composição do acervo.
 *
 * Existe para que as rotas nunca importem um `*.repository.ts` — a
 * Global Constraint 1 proíbe, e há gate no CI. A rota pede o pacote
 * pronto e passa adiante; quem sabe montar é este módulo.
 */
export function dependenciasDoAcervo(): DependenciasDeCatalogacao &
  DependenciasDeCategorias &
  DependenciasDeLocalizacoes {
  return {
    obras: obrasRepository,
    autores: autoresRepository,
    exemplares: exemplaresRepository,
    categorias: categoriasRepository,
    localizacoes: localizacoesRepository,
    metadados: provedorDeMetadados(),
    emTransacao: executarEmTransacao,
  }
}
