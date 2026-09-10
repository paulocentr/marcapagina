// Fonte da verdade das permissões. O banco guarda apenas a atribuição
// (Papel.permissoes: String[]); o catálogo vive aqui, tipado, para que
// uma permissão inexistente seja erro de compilação e não bug em runtime.
//
// Ao adicionar uma permissão nos próximos planos, adicione-a AQUI e
// conceda-a explicitamente aos papéis que devem tê-la.
export const TODAS_AS_PERMISSOES = [
  // Acervo
  'obra:ver',
  'obra:criar',
  'obra:editar',
  'obra:excluir',
  'exemplar:criar',
  'exemplar:editar',
  'exemplar:baixar',

  // Circulação
  'emprestimo:criar',
  'emprestimo:devolver',
  'emprestimo:renovar',
  'emprestimo:forcar',
  'reserva:criar',
  'reserva:gerenciar',

  // Leitores
  'aluno:ver',
  'aluno:criar',
  'aluno:editar',
  'aluno:importar',
  'turma:gerenciar',

  // Carrinho da Leitura
  'carrinho:gerenciar',

  // Inventário
  'inventario:executar',

  // Relatórios
  'relatorio:ver',
  'relatorio:exportar',

  // Administração da escola
  'usuario:gerenciar',
  'papel:gerenciar',
  'config:editar',
  'auditoria:ver',

  // Dono do sistema
  'escola:gerenciar',
] as const

export type Permissao = (typeof TODAS_AS_PERMISSOES)[number]

export function ehPermissaoValida(valor: string): valor is Permissao {
  return (TODAS_AS_PERMISSOES as readonly string[]).includes(valor)
}
