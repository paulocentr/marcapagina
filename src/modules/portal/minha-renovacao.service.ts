import { calcularDataDeDevolucao } from '@/modules/circulacao/prazo'
import { exigirMeuProprioDado, exigirSessaoDeAluno } from '@/modules/portal/autorizacao-do-aluno'
import { diaDeHojeNaEscola } from '@/modules/portal/dia-da-escola'
import { avaliarRenovacao } from '@/modules/portal/estante'
import { meuContexto } from '@/modules/portal/meu-contexto'
import {
  LivroJaDevolvidoError,
  LivroNaoEstaComVoceError,
  RenovacaoRecusadaError,
  type DependenciasDoPortal,
} from '@/modules/portal/portal.tipos'
import type { Principal } from '@/core/auth/principal'

export interface EntradaDaMinhaRenovacao {
  /** Vem do formulário — é entrada do cliente, e é tratada como tal. */
  emprestimoId: string
  agora: Date
}

export interface MeuLivroRenovado {
  emprestimoId: string
  previstaPara: Date
  renovacoes: number
}

/**
 * Renovação pelo portal.
 *
 * O `emprestimoId` vem do formulário, então é o único ponto do portal em
 * que o cliente escolhe uma linha do banco — e é por isso que ele leva
 * TRÊS camadas em cima:
 *
 * 1. o repositório filtra por `alunoId` no WHERE da leitura;
 * 2. o serviço confere `alunoId` da linha lida contra `principal.id`;
 * 3. a escrita filtra por `alunoId` de novo, junto com `devolvidaEm: null`.
 *
 * Sem a (3), escopar a leitura impediria VER o empréstimo do colega e
 * ainda assim permitiria ESCREVER nele, bastando o id. Sem a (2), o dia
 * em que alguém reescrevesse o `where` da (1) o vazamento passaria em
 * silêncio.
 *
 * Por que não chama `renovar` de `renovar.service.ts`: aquela função
 * começa com `exigirPermissao(principal, 'emprestimo:renovar')`, e a
 * sessão do aluno não carrega permissão nenhuma — de propósito. A saída
 * seria forjar um principal de STAFF para atravessar o guard, o que
 * mentiria para a auditoria e abriria um caminho de escalação dentro do
 * próprio código. O certo é a circulação passar a aceitar uma
 * autorização por escopo; até então, o portal orquestra a regra ele
 * mesmo, chamando as MESMAS funções puras (`calcularDataDeDevolucao`,
 * `resolverConfiguracao`) e a MESMA contagem de fila do balcão.
 */
export async function renovarMeuLivro(
  principal: Principal | null,
  entrada: EntradaDaMinhaRenovacao,
  deps: DependenciasDoPortal,
): Promise<MeuLivroRenovado> {
  exigirSessaoDeAluno(principal)

  const hoje = diaDeHojeNaEscola(entrada.agora)

  const emprestimo = await deps.portal.meuEmprestimo(principal.id, entrada.emprestimoId)
  // Mesma resposta para "não existe" e para "não alcançado pelo filtro":
  // distinguir os dois responderia "este id existe?" a quem experimenta
  // ids no formulário.
  if (!emprestimo) throw new LivroNaoEstaComVoceError()

  exigirMeuProprioDado(principal, emprestimo.alunoId)

  if (emprestimo.devolvidaEm !== null) throw new LivroJaDevolvidoError()

  const [contexto, naFila] = await Promise.all([
    meuContexto(principal, deps),
    deps.reservas.contarAguardando(emprestimo.obraId),
  ])

  // A MESMA avaliação que decide se o botão aparece. Um segundo conjunto
  // de regras aqui deixaria o botão prometer o que o servidor recusa.
  const possibilidade = avaliarRenovacao(
    {
      emprestimoId: emprestimo.emprestimoId,
      alunoId: emprestimo.alunoId,
      obraId: emprestimo.obraId,
      titulo: emprestimo.titulo,
      autor: emprestimo.autor,
      previstaPara: emprestimo.previstaPara,
      renovacoes: emprestimo.renovacoes,
      naFila,
    },
    contexto.cadastro,
    contexto.config,
    hoje,
  )
  if (!possibilidade.pode) {
    throw new RenovacaoRecusadaError(possibilidade.motivo, possibilidade.explicacao)
  }

  const diasNaoLetivos = await deps.leitor.diasNaoLetivos()
  const previstaPara = calcularDataDeDevolucao(
    baseDaRenovacao(emprestimo.previstaPara),
    contexto.config.prazoEmDias,
    (dia) => diasNaoLetivos.has(dia.toISOString().slice(0, 10)),
  )

  const linhas = await deps.portal.registrarMinhaRenovacao(
    principal.id,
    emprestimo.emprestimoId,
    previstaPara,
  )
  // Zero linhas: o livro foi devolvido no balcão entre a leitura e a
  // escrita. Tratar como sucesso deixaria o empréstimo aberto para
  // sempre, com o livro já de volta na estante e data futura.
  if (linhas === 0) throw new LivroJaDevolvidoError()

  return {
    emprestimoId: emprestimo.emprestimoId,
    previstaPara,
    renovacoes: emprestimo.renovacoes + 1,
  }
}

/**
 * De que data se conta o novo prazo: sempre do VENCIMENTO ATUAL.
 *
 * Contar de hoje puniria quem renova cedo — devolveria as mesmas duas
 * semanas que já estavam garantidas. O balcão usa a MAIOR entre
 * vencimento e hoje, para poder renovar o atrasado; aqui não há esse
 * caso, porque `avaliarRenovacao` recusa livro atrasado antes de chegar
 * neste ponto.
 *
 * Meio-dia UTC e não a data crua: `previstaPara` sai de coluna
 * `@db.Date`, ou seja meia-noite UTC, e meia-noite UTC de 24/09 é 21h de
 * 23/09 em São Paulo. `calcularDataDeDevolucao` converte para o dia
 * LOCAL da escola, então passar o valor cru faria toda renovação nascer
 * um dia curta. Meio-dia UTC cai às 9h da manhã na escola — o mesmo dia,
 * com folga larga dos dois lados.
 */
function baseDaRenovacao(previstaPara: Date): Date {
  return new Date(
    Date.UTC(
      previstaPara.getUTCFullYear(),
      previstaPara.getUTCMonth(),
      previstaPara.getUTCDate(),
      12,
    ),
  )
}
