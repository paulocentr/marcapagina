/**
 * O empréstimo visto por quem NÃO o criou: a reserva e a renovação.
 *
 * `obraId` vem junto de propósito, ainda que o empréstimo seja de um
 * exemplar. Reserva e renovação raciocinam sobre a OBRA — "ele já está
 * com este livro", "há fila para este livro" — e resolver o exemplar até a
 * obra no serviço obrigaria uma segunda consulta em cada regra.
 */
export interface EmprestimoEmCurso {
  id: string
  /** `null` quando o leitor é da equipe: staff também pega livro. */
  alunoId: string | null
  exemplarId: string
  obraId: string
  previstaPara: Date
  devolvidaEm: Date | null
  renovacoes: number
}

export interface RepositorioDeEmprestimosEmCurso {
  /** Este leitor está agora com algum exemplar desta obra em mãos? */
  alunoEstaComAObra(alunoId: string, obraId: string): Promise<boolean>
  obter(emprestimoId: string): Promise<EmprestimoEmCurso | null>
  /**
   * Empurra a data e CONTA a renovação, numa escrita só.
   *
   * Devolve quantas linhas mudaram: o UPDATE exige que o empréstimo ainda
   * esteja em aberto, então 0 significa que ele foi devolvido entre a
   * leitura e a escrita — a devolução no balcão acontecendo enquanto o
   * aluno renova pelo portal. Renovar um livro que já voltou para a
   * estante o deixaria emprestado para sempre.
   */
  registrarRenovacao(emprestimoId: string, novaPrevista: Date): Promise<number>
}
