import { dbDoTenant } from '@/core/db/tenant-extension'
import type {
  RepositorioDaFilaDeReservas,
  ReservaVivaBruta,
  StatusVivoDaReserva,
} from '@/modules/circulacao/fila-de-reservas.service'

export const filaDeReservasRepository: RepositorioDaFilaDeReservas = {
  async reservasVivas(): Promise<ReservaVivaBruta[]> {
    const linhas = await dbDoTenant().reserva.findMany({
      // Viva = espera ou já tem exemplar separado, o mesmo recorte de
      // `listarFila`. ATENDIDA saiu com o livro na mão, EXPIRADA perdeu a
      // vez e CANCELADA desistiu: contá-las faria a tela dizer "cinco na
      // fila" para uma obra que ninguém espera, e a coordenação
      // compraria cópia por nada.
      //
      // O prazo VENCIDO continua aqui de propósito: o livro está
      // fisicamente na prateleira até o cron passar a vez, e sumir com a
      // reserva antes disso deixaria a operadora com um exemplar na mão e
      // nenhuma explicação para ele.
      where: { status: { in: ['AGUARDANDO', 'DISPONIVEL'] } },
      // Ordem de chegada, com o desempate por data de criação — o mesmo
      // par de `ordemDaFila` em reservas.repository.ts. A posição é lida e
      // gravada em transações diferentes, então duas reservas simultâneas
      // ainda podem nascer empatadas, e `posicao` sozinha devolveria a
      // fila em ordem arbitrária.
      orderBy: [{ posicao: 'asc' }, { criadaEm: 'asc' }],
      select: {
        id: true,
        obraId: true,
        alunoId: true,
        posicao: true,
        status: true,
        retirarAte: true,
        // Nome, matrícula, turma, título e tombo vêm nos joins do próprio
        // SELECT: resolvê-los por linha seria um N+1 num painel que a
        // operadora deixa aberto o dia inteiro.
        obra: { select: { titulo: true } },
        aluno: { select: { nome: true, matricula: true, turma: { select: { nome: true } } } },
        exemplar: { select: { tombo: true } },
      },
    })

    return linhas.map((linha) => ({
      reservaId: linha.id,
      obraId: linha.obraId,
      tituloDaObra: linha.obra.titulo,
      posicao: linha.posicao,
      status: linha.status as StatusVivoDaReserva,
      alunoId: linha.alunoId,
      nomeDoLeitor: linha.aluno.nome,
      matricula: linha.aluno.matricula,
      // `?? null` sobre uma relação OPCIONAL do schema: aluno sem turma é
      // situação normal (transferido, ainda sem enturmação), e o nulo é o
      // dado, não a falta dele. A tela diz "sem turma" em vez de inventar.
      turma: linha.aluno.turma?.nome ?? null,
      tomboSeparado: linha.exemplar?.tombo ?? null,
      retirarAte: linha.retirarAte,
    }))
  },
}
