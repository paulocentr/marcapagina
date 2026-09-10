import { exigirSessaoDeAluno, exigirTodosMeus } from '@/modules/portal/autorizacao-do-aluno'
import { diaDeHojeNaEscola } from '@/modules/portal/dia-da-escola'
import { resumirEstante } from '@/modules/portal/estante'
import { meuContexto } from '@/modules/portal/meu-contexto'
import type { Principal } from '@/core/auth/principal'
import type {
  DependenciasDoPortal,
  MeuLivroComFila,
  MinhaEstante,
} from '@/modules/portal/portal.tipos'

export interface EntradaDaMinhaEstante {
  /** O instante da requisição. O serviço converte para o dia da escola. */
  agora: Date
}

/**
 * A estante do aluno: o que ele tem em mãos, quanto ainda pode levar e a
 * reserva que já está separada no balcão.
 *
 * **A autorização desta função não é uma permissão, é um ESCOPO.** Não
 * existe parâmetro dizendo de quem são os livros: o único id que entra na
 * consulta é `principal.id`, o da sessão assinada. É por isso que o aluno
 * não precisa de `aluno:ver` — e é por isso que ele não pode recebê-la.
 * `aluno:ver` responde "pode ver ficha de aluno?", e a resposta que o
 * portal precisa é "pode ver a SUA", que permissão nenhuma sabe dizer.
 *
 * O `escolaId` também não entra por parâmetro: o contexto de tenant foi
 * aberto pela camada de rota a partir da sessão, e a extensão do Prisma
 * injeta o filtro em toda query. O serviço não sabe que existe escola.
 */
export async function verMinhaEstante(
  principal: Principal | null,
  entrada: EntradaDaMinhaEstante,
  deps: DependenciasDoPortal,
): Promise<MinhaEstante> {
  exigirSessaoDeAluno(principal)

  const hoje = diaDeHojeNaEscola(entrada.agora)

  const [contexto, livros, reserva] = await Promise.all([
    meuContexto(principal, deps),
    deps.portal.meusLivrosEmMaos(principal.id),
    deps.portal.minhaReservaPronta(principal.id),
  ])

  // Segunda barreira, depois do filtro do repositório: nada sobe para a
  // tela sem ser do aluno da sessão. Se um método novo nascer sem o
  // `alunoId` no WHERE, aqui é onde a requisição morre — em vez de a tela
  // desenhar a ficha do colega e ninguém ver.
  exigirTodosMeus(principal, livros.map((livro) => livro.alunoId))
  if (reserva) exigirTodosMeus(principal, [reserva.alunoId])

  // A fila de cada obra sai da MESMA contagem que o balcão usa. Uma
  // consulta por obra e não um `groupBy` próprio: são no máximo o limite
  // da série de obras (2 a 5), e um segundo caminho para o mesmo número
  // deixaria a tela do aluno discordar da tela da operadora sobre quantos
  // esperam pelo livro.
  const comFila: MeuLivroComFila[] = await Promise.all(
    livros.map(async (livro) => ({
      ...livro,
      naFila: await deps.reservas.contarAguardando(livro.obraId),
    })),
  )

  return resumirEstante({
    livros: comFila,
    leitor: contexto.cadastro,
    reservaPronta: reserva ? { titulo: reserva.titulo, retirarAte: reserva.retirarAte } : null,
    config: contexto.config,
    hoje,
  })
}
