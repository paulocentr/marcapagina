import type { PrincipalAluno, PrincipalStaff } from '@/core/auth/principal'
import type { ConfiguracaoDaEscola } from '@/modules/circulacao/configuracao'
import type {
  DependenciasDoPortal,
  MeuEmprestimoParaRenovar,
  MeuLivroEmMaos,
  MinhaReservaPronta,
} from '@/modules/portal/portal.tipos'

export const ANA: PrincipalAluno = {
  reino: 'ALUNO',
  id: 'aluno_ana',
  escolaId: 'esc_1',
  nome: 'Ana Souza',
  matricula: '2024001',
}

export const BRUNO_ID = 'aluno_bruno'

export const COORD: PrincipalStaff = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Coordenação',
  // Com TODAS as permissões de circulação: o teste que usa esta sessão
  // prova que o portal não abre nem para quem pode tudo no painel.
  permissoes: ['aluno:ver', 'emprestimo:renovar', 'reserva:gerenciar'],
}

export const CONFIG: ConfiguracaoDaEscola = {
  prazoEmDias: 14,
  limiteSimultaneo: 3,
  maximoDeRenovacoes: 1,
  diasDeSuspensaoPorDiaDeAtraso: 1,
  prazoDeRetiradaEmDias: 2,
  alunoPodeReservar: true,
}

/** 10/09/2026, 15h em São Paulo. */
export const AGORA = new Date('2026-09-10T18:00:00.000Z')

export function livroDoBanco(sobrepor: Partial<MeuLivroEmMaos> = {}): MeuLivroEmMaos {
  return {
    emprestimoId: 'emp_1',
    alunoId: ANA.id,
    obraId: 'obra_1',
    titulo: 'Vidas Secas',
    autor: 'Graciliano Ramos',
    previstaPara: new Date('2026-09-24T00:00:00.000Z'),
    renovacoes: 0,
    ...sobrepor,
  }
}

export function emprestimoDoBanco(
  sobrepor: Partial<MeuEmprestimoParaRenovar> = {},
): MeuEmprestimoParaRenovar {
  return { ...livroDoBanco(), devolvidaEm: null, ...sobrepor }
}

export function reservaDoBanco(sobrepor: Partial<MinhaReservaPronta> = {}): MinhaReservaPronta {
  return {
    reservaId: 'res_1',
    alunoId: ANA.id,
    titulo: 'O Ateneu',
    retirarAte: new Date('2026-09-13T00:00:00.000Z'),
    ...sobrepor,
  }
}

/**
 * Registro de TUDO que o serviço pediu, por aluno.
 *
 * É o instrumento do teste central: um serviço que consultasse o id de
 * outro aluno apareceria aqui. Não há como o serviço enganá-lo — o fake
 * anota o argumento antes de responder.
 */
export interface EspiaoDeAlunoIds {
  lidos: string[]
  escritos: string[]
}

export interface FakeDoPortal {
  deps: DependenciasDoPortal
  espiao: EspiaoDeAlunoIds
  renovacoesGravadas: { alunoId: string; emprestimoId: string; novaPrevista: Date }[]
}

export interface MontagemDoFake {
  /** O que o repositório devolve, independentemente de quem pediu. */
  livros?: MeuLivroEmMaos[]
  reservaPronta?: MinhaReservaPronta | null
  emprestimo?: MeuEmprestimoParaRenovar | null
  leitor?: { id: string; nome: string; ativo: boolean; serie: string | null; suspensaoAte: Date | null } | null
  config?: ConfiguracaoDaEscola
  filaPorObra?: Record<string, number>
  linhasRenovadas?: number
  diasNaoLetivos?: string[]
}

/**
 * Um repositório fake que IGNORA o `alunoId` pedido: ele devolve sempre o
 * que a montagem mandou.
 *
 * Ignorar é de propósito — é assim que se simula o repositório que um dia
 * esqueça o filtro, ou o método novo que nasça sem ele. Com este fake, o
 * único que pode recusar o dado do colega é o SERVIÇO, e é isso que os
 * testes de vazamento provam.
 */
export function montarFake(montagem: MontagemDoFake = {}): FakeDoPortal {
  const espiao: EspiaoDeAlunoIds = { lidos: [], escritos: [] }
  const renovacoesGravadas: FakeDoPortal['renovacoesGravadas'] = []
  const filaPorObra = montagem.filaPorObra ?? {}

  const leitor =
    montagem.leitor === undefined
      ? { id: ANA.id, nome: ANA.nome, ativo: true, serie: '8', suspensaoAte: null }
      : montagem.leitor

  return {
    espiao,
    renovacoesGravadas,
    deps: {
      portal: {
        async meusLivrosEmMaos(alunoId) {
          espiao.lidos.push(alunoId)
          return montagem.livros ?? []
        },
        async minhaReservaPronta(alunoId) {
          espiao.lidos.push(alunoId)
          return montagem.reservaPronta ?? null
        },
        async meuEmprestimo(alunoId) {
          espiao.lidos.push(alunoId)
          return montagem.emprestimo ?? null
        },
        async registrarMinhaRenovacao(alunoId, emprestimoId, novaPrevista) {
          espiao.escritos.push(alunoId)
          renovacoesGravadas.push({ alunoId, emprestimoId, novaPrevista })
          return montagem.linhasRenovadas === undefined ? 1 : montagem.linhasRenovadas
        },
      },
      leitor: {
        async obterLeitor(alunoId) {
          espiao.lidos.push(alunoId)
          return leitor
        },
        async configuracaoDaEscola() {
          return montagem.config ?? CONFIG
        },
        async overridesPorSerie() {
          return []
        },
        async diasNaoLetivos() {
          return new Set(montagem.diasNaoLetivos ?? [])
        },
      },
      reservas: {
        async contarAguardando(obraId) {
          const naFila = filaPorObra[obraId]
          return naFila === undefined ? 0 : naFila
        },
      },
    },
  }
}
