import { dbDoTenant } from '@/core/db/tenant-extension'
import type {
  EmprestimoEmCurso,
  RepositorioDeEmprestimosEmCurso,
} from '@/modules/circulacao/emprestimos-em-curso.tipos'

export const emprestimosEmCursoRepository: RepositorioDeEmprestimosEmCurso = {
  async alunoEstaComAObra(alunoId: string, obraId: string): Promise<boolean> {
    // Pela OBRA, atravessando o exemplar: o leitor pode estar com uma
    // cópia diferente da que a reserva viria a separar, e ainda assim
    // está com o livro. Contar por exemplar deixaria ele reservar o que
    // já tem em mãos.
    const quantos = await dbDoTenant().emprestimo.count({
      where: { alunoId, devolvidaEm: null, exemplar: { obraId } },
    })

    return quantos > 0
  },

  async obter(emprestimoId: string): Promise<EmprestimoEmCurso | null> {
    const linha = await dbDoTenant().emprestimo.findFirst({
      where: { id: emprestimoId },
      select: {
        id: true,
        alunoId: true,
        exemplarId: true,
        previstaPara: true,
        devolvidaEm: true,
        renovacoes: true,
        // A obra vem junto porque toda regra de renovação e de reserva
        // raciocina sobre ela — resolver depois custaria uma segunda ida
        // ao banco em cada chamada.
        exemplar: { select: { obraId: true } },
      },
    })

    if (!linha) return null

    return {
      id: linha.id,
      alunoId: linha.alunoId,
      exemplarId: linha.exemplarId,
      obraId: linha.exemplar.obraId,
      previstaPara: linha.previstaPara,
      devolvidaEm: linha.devolvidaEm,
      renovacoes: linha.renovacoes,
    }
  },

  async registrarRenovacao(emprestimoId: string, novaPrevista: Date): Promise<number> {
    const resultado = await dbDoTenant().emprestimo.updateMany({
      // `devolvidaEm: null` no WHERE é a trava contra a devolução que
      // acontece no balcão enquanto o aluno renova pelo portal: sem ela,
      // o UPDATE ressuscitaria um empréstimo já encerrado e o livro
      // ficaria emprestado para sempre, de volta na estante.
      where: { id: emprestimoId, devolvidaEm: null },
      // `increment` e não um número lido antes: a contagem é a regra que
      // faz o máximo de renovações valer, e reescrevê-la com um valor
      // calculado fora do banco perderia a renovação concorrente.
      data: { previstaPara: novaPrevista, renovacoes: { increment: 1 } },
    })

    return resultado.count
  },
}
