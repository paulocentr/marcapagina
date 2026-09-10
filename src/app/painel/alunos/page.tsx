import Link from 'next/link'
import { Botao, estilosDeBotao } from '@/components/ui/botao'
import { CabecalhoDeTela } from '@/components/ui/cabecalho-de-tela'
import { Campo } from '@/components/ui/campo'
import { Cartao } from '@/components/ui/cartao'
import { Matricula } from '@/components/ui/codigo'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import { Celula, CelulaDeTitulo, Tabela } from '@/components/ui/tabela'
import { comStaffNoTenant } from '@/core/auth/contexto-de-requisicao'
import { SemPermissaoError } from '@/core/errors'
import { listarAlunos } from '@/modules/leitores/alunos.service'
import { listarTurmas, type TurmaNaLista } from '@/modules/leitores/turmas.service'
import { dependenciasDeLeitores } from '@/modules/leitores/leitores.deps'
import { rotuloDaSerie } from '@/modules/leitores/serie'
import { ChipDoCadastro } from './chip-do-cadastro'

export const runtime = 'nodejs'

/**
 * A lista de leitores.
 *
 * É o gargalo do sistema: sem aluno cadastrado, o balcão não empresta
 * para ninguém. Por isso a tela abre pela BUSCA e pelo botão de
 * cadastrar, e não por um painel de números.
 *
 * A data de nascimento NÃO aparece em nenhuma coluna. Ela é a metade
 * secreta do login do aluno (decisão 3), e esta é a tela que fica aberta
 * no balcão, de frente para quem passa. O serviço não a devolve, então
 * não existe caminho para ela chegar aqui.
 *
 * Componente de servidor: as duas consultas rodam na requisição, com o
 * `Principal` da sessão, e nada de banco atravessa para o navegador. As
 * escritas moram em Server Actions.
 *
 * `<main>` próprio: a casca do painel entrega um `<div>`, e é aqui que o
 * conteúdo principal começa.
 */
export default async function PaginaDeAlunos({
  searchParams,
}: {
  searchParams: Promise<{
    termo?: string
    turma?: string
    situacao?: string
    pagina?: string
  }>
}) {
  const { termo, turma, situacao, pagina } = await searchParams

  const termoLimpo = termo?.trim()
  const soAtivos = situacao !== 'todos'
  const semTurma = turma === 'sem'
  const turmaId = semTurma || turma === undefined || turma === '' ? undefined : turma

  const dados = await comStaffNoTenant(async (principal) => {
    const deps = dependenciasDeLeitores()

    try {
      const [alunos, turmas] = await Promise.all([
        listarAlunos(
          principal,
          {
            termo: termoLimpo,
            turmaId,
            semTurma: semTurma ? true : undefined,
            apenasAtivos: soAtivos ? true : undefined,
            pagina: paginaPedida(pagina),
          },
          deps,
        ),
        listarTurmas(principal, {}, deps),
      ])

      return { alunos, turmas, recusa: null }
    } catch (erro) {
      // Quem não tem `aluno:ver` não vê o item no menu, mas alcança a URL
      // digitando. Sem este ramo a recusa do serviço sairia como erro
      // 500 — e um 500 não diz à pessoa que ela está na tela errada, diz
      // que o sistema quebrou.
      if (erro instanceof SemPermissaoError) {
        return { alunos: null, turmas: null, recusa: erro.message }
      }
      throw erro
    }
  })

  if (dados.recusa !== null) {
    return (
      <main className="px-8 py-6">
        <CabecalhoDeTela titulo="Leitores" />
        <div className="mt-[18px] max-w-[620px]">
          <Faixa tom="erro" titulo="Esta tela é de quem cuida do cadastro de leitores.">
            {dados.recusa} Fale com a coordenação se você precisa consultar alunos.
          </Faixa>
        </div>
      </main>
    )
  }

  return (
    <main className="px-8 py-6">
      <CabecalhoDeTela
        titulo="Leitores"
        descricao={
          <>
            Sem aluno cadastrado o balcão não empresta para ninguém.{' '}
            <span className="text-tinta-3">
              A data de nascimento é a senha do portal e não aparece nesta lista.
            </span>
          </>
        }
        acoes={
          <>
            <Link href="/painel/alunos/turmas" className={estilosDeBotao('secundaria')}>
              <Icone nome="pessoas" tamanho={16} traco={1.9} />
              Turmas e ano letivo
            </Link>
            <Link href="/painel/alunos/novo" className={estilosDeBotao('primaria')}>
              <Icone nome="mais" tamanho={16} traco={1.9} />
              Cadastrar aluno
            </Link>
          </>
        }
      />

      <Filtros
        termo={termoLimpo}
        turma={turma}
        situacao={situacao}
        turmas={dados.turmas}
      />

      {dados.alunos.itens.length === 0 ? (
        <Cartao className="mt-5 max-w-[520px] text-center">
          <span className="inline-flex text-tinta-3">
            <Icone nome="busca" tamanho={26} />
          </span>
          <p className="mt-2 font-serif text-[17px] font-semibold text-tinta">
            {temFiltro(termoLimpo, turma, situacao)
              ? 'Nenhum aluno encontrado'
              : 'Nenhum aluno cadastrado ainda'}
          </p>
          <p className="mt-1 text-[13px] text-tinta-2">
            {temFiltro(termoLimpo, turma, situacao)
              ? 'A busca é por parte do nome ou da matrícula, e diferencia acento — "Jose" não acha "José".'
              : 'Cadastre o primeiro, ou importe a lista da secretaria por planilha.'}
          </p>
        </Cartao>
      ) : (
        <>
          <p className="mt-5 mb-[10px] text-[12.5px] text-tinta-2">
            {contagemDeAlunos(dados.alunos.total, soAtivos)}
          </p>

          <Cartao semPadding className="max-w-[1120px]">
            <div className="overflow-x-auto px-[22px] pt-[18px] pb-2">
              <Tabela>
                <thead>
                  <tr>
                    <CelulaDeTitulo>Matrícula</CelulaDeTitulo>
                    <CelulaDeTitulo>Nome</CelulaDeTitulo>
                    <CelulaDeTitulo>Turma</CelulaDeTitulo>
                    <CelulaDeTitulo>Cadastro</CelulaDeTitulo>
                  </tr>
                </thead>
                <tbody>
                  {dados.alunos.itens.map((aluno) => (
                    <tr key={aluno.id}>
                      <Celula>
                        <Matricula valor={aluno.matricula} />
                      </Celula>
                      <Celula>
                        {/* A linha inteira leva à ficha pelo nome: é o
                            alvo mais largo da linha, e a operadora está
                            de pé no balcão. */}
                        <Link
                          href={`/painel/alunos/${aluno.id}`}
                          className="font-semibold text-tinta hover:text-marca hover:underline"
                        >
                          {aluno.nome}
                        </Link>
                      </Celula>
                      <Celula>
                        {aluno.turma === null ? (
                          <span className="text-tinta-3">sem turma</span>
                        ) : (
                          <>
                            {aluno.turma.nome}
                            <span className="text-tinta-3">
                              {' · '}
                              {rotuloDaSerie(aluno.turma.serie)}
                            </span>
                          </>
                        )}
                      </Celula>
                      <Celula>
                        <ChipDoCadastro ativo={aluno.ativo} />
                      </Celula>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </div>
          </Cartao>

          <Paginacao
            busca={{ termo: termoLimpo, turma, situacao }}
            pagina={dados.alunos.pagina}
            porPagina={dados.alunos.porPagina}
            total={dados.alunos.total}
          />
        </>
      )}
    </main>
  )
}

/**
 * Busca e filtros, num `form method="get"`.
 *
 * `get` de propósito: o filtro fica na URL, então a operadora recarrega,
 * guarda nos favoritos e volta pelo histórico sem perder o que já tinha
 * escolhido — e "os inativos do 5º A" é um endereço que ela pode mandar
 * para a coordenação.
 */
function Filtros({
  termo,
  turma,
  situacao,
  turmas,
}: {
  termo: string | undefined
  turma: string | undefined
  situacao: string | undefined
  turmas: TurmaNaLista[]
}) {
  return (
    <form method="get" className="mt-[18px] flex flex-wrap items-end gap-[10px]">
      <div>
        <label htmlFor="termo" className="mb-[7px] block">
          <Rotulo>Nome ou matrícula</Rotulo>
        </label>
        <div className="relative w-[300px]">
          <span className="pointer-events-none absolute top-[11px] left-[13px] text-tinta-3">
            <Icone nome="busca" tamanho={17} />
          </span>
          <Campo
            id="termo"
            name="termo"
            defaultValue={termo}
            placeholder="parte do nome ou da matrícula"
            className="pl-[38px]"
          />
        </div>
      </div>

      <div>
        <label htmlFor="turma" className="mb-[7px] block">
          <Rotulo>Turma</Rotulo>
        </label>
        <select
          id="turma"
          name="turma"
          defaultValue={turma === undefined ? '' : turma}
          className="h-10 w-[220px] rounded-controle border border-linha-2 bg-superficie px-3 text-sm text-tinta focus:border-marca focus:ring-[3px] focus:ring-marca/15 focus:outline-none"
        >
          <option value="">todas as turmas</option>
          {/* A lista que a coordenação precisa no começo do ano: quem
              entrou pela planilha e ainda não foi para uma turma. */}
          <option value="sem">sem turma</option>
          {turmas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome} · {t.ano}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="situacao" className="mb-[7px] block">
          <Rotulo>Cadastro</Rotulo>
        </label>
        <select
          id="situacao"
          name="situacao"
          defaultValue={situacao === undefined ? 'ativos' : situacao}
          className="h-10 w-[170px] rounded-controle border border-linha-2 bg-superficie px-3 text-sm text-tinta focus:border-marca focus:ring-[3px] focus:ring-marca/15 focus:outline-none"
        >
          <option value="ativos">só ativos</option>
          <option value="todos">ativos e desativados</option>
        </select>
      </div>

      <Botao type="submit" variante="secundaria">
        Filtrar
      </Botao>
    </form>
  )
}

function temFiltro(
  termo: string | undefined,
  turma: string | undefined,
  situacao: string | undefined,
): boolean {
  return (
    (termo !== undefined && termo.length > 0) ||
    (turma !== undefined && turma.length > 0) ||
    situacao === 'todos'
  )
}

function contagemDeAlunos(total: number, soAtivos: boolean): string {
  const quantidade = total.toLocaleString('pt-BR')
  const substantivo = total === 1 ? 'aluno' : 'alunos'
  return soAtivos
    ? `${quantidade} ${substantivo} ${total === 1 ? 'ativo' : 'ativos'}`
    : `${quantidade} ${substantivo}`
}

/**
 * A página pedida na URL.
 *
 * Só dígito conta: `Number('abc')` é `NaN`, e um `?? 1` por cima
 * transformaria URL torta em "primeira página" silenciosa. Devolver
 * `undefined` deixa o serviço aplicar o padrão dele, que é o único lugar
 * onde esse padrão está escrito.
 */
function paginaPedida(bruto: string | undefined): number | undefined {
  if (bruto === undefined || !/^\d+$/.test(bruto)) return undefined
  const numero = Number(bruto)
  return numero >= 1 ? numero : undefined
}

/**
 * Ir e voltar uma página, com os filtros preservados.
 *
 * `<Link>` para a mesma tela com outra query, e não `<button>`: a página
 * 3 dos inativos do 5º A é um endereço que a operadora pode recarregar, e
 * o histórico do navegador volta para onde ela estava.
 */
function Paginacao({
  busca,
  pagina,
  porPagina,
  total,
}: {
  busca: { termo?: string; turma?: string; situacao?: string }
  pagina: number
  porPagina: number
  total: number
}) {
  const paginas = Math.ceil(total / porPagina)
  if (paginas <= 1) return null

  // O retorno é template literal, e não `string`, porque `typedRoutes`
  // recusa `string` solto num `href` — e essa recusa é útil: é ela que
  // pega o link para uma rota que não existe.
  function enderecoDaPagina(numero: number): `/painel/alunos?${string}` {
    const query = new URLSearchParams()
    if (busca.termo !== undefined && busca.termo.length > 0) query.set('termo', busca.termo)
    if (busca.turma !== undefined && busca.turma.length > 0) query.set('turma', busca.turma)
    if (busca.situacao !== undefined) query.set('situacao', busca.situacao)
    query.set('pagina', String(numero))
    return `/painel/alunos?${query.toString()}`
  }

  return (
    <nav aria-label="Páginas de resultados" className="mt-4 flex items-center gap-3">
      {pagina > 1 && (
        <Link href={enderecoDaPagina(pagina - 1)} className={estilosDeBotao('secundaria')}>
          Anteriores
        </Link>
      )}
      <span className="text-[12.5px] text-tinta-2">
        Página {pagina} de {paginas}
      </span>
      {pagina < paginas && (
        <Link href={enderecoDaPagina(pagina + 1)} className={estilosDeBotao('secundaria')}>
          Próximas
        </Link>
      )}
    </nav>
  )
}
