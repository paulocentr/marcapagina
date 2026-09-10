import { TODAS_AS_PERMISSOES, type Permissao } from '@/core/rbac/permissoes'

const SOMENTE_LEITURA: readonly Permissao[] = [
  'obra:ver',
  'aluno:ver',
  'relatorio:ver',
  'relatorio:exportar',
]

const BALCAO: readonly Permissao[] = [
  'emprestimo:criar',
  'emprestimo:devolver',
  'emprestimo:renovar',
  'reserva:criar',
  'reserva:gerenciar',
]

export const PAPEIS_DE_FABRICA = {
  SUPER_ADMIN: {
    descricao: 'Dono do sistema. Gerencia escolas. Não pertence a nenhuma escola.',
    permissoes: TODAS_AS_PERMISSOES,
  },

  COORDENACAO: {
    descricao: 'Coordenação da biblioteca. Tudo dentro da própria escola.',
    permissoes: TODAS_AS_PERMISSOES.filter((p) => !p.startsWith('escola:')),
  },

  DIRECAO: {
    descricao: 'Direção. Enxerga tudo, não opera o balcão.',
    permissoes: [...SOMENTE_LEITURA, 'auditoria:ver'],
  },

  BIBLIOTECARIO: {
    descricao: 'Balcão completo e cadastros do acervo e de leitores.',
    permissoes: [
      ...SOMENTE_LEITURA,
      ...BALCAO,
      'emprestimo:forcar',
      'obra:criar',
      'obra:editar',
      'exemplar:criar',
      'exemplar:editar',
      'exemplar:baixar',
      'aluno:criar',
      'aluno:editar',
      'aluno:importar',
      'turma:gerenciar',
      'carrinho:gerenciar',
      'inventario:executar',
    ],
  },

  MONITOR: {
    descricao:
      'Aluno auxiliar de balcão. Empresta e devolve; não edita cadastro, não exclui e não força bloqueio.',
    permissoes: ['obra:ver', 'aluno:ver', ...BALCAO],
  },

  PROFESSOR: {
    descricao: 'Professor. Enxerga as próprias turmas e pede rodadas do carrinho.',
    permissoes: ['obra:ver', 'aluno:ver', 'relatorio:ver', 'carrinho:gerenciar'],
  },

  ALUNO: {
    descricao:
      'Leitor. O portal do aluno não usa permissões de staff — suas ações são autorizadas por ser o dono do próprio registro.',
    permissoes: [],
  },
} as const satisfies Record<string, { descricao: string; permissoes: readonly Permissao[] }>

export type NomePapel = keyof typeof PAPEIS_DE_FABRICA
