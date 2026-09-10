// Todo modelo que tem coluna escolaId entra aqui. Modelos que NÃO entram:
//   Escola        — é a raiz do tenant
//   UsuarioPapel  — tabela de junção, escopada pelas pontas
//   TentativaLogin— consultada antes de o tenant existir (login)
//
// Ao adicionar um modelo com escolaId nos próximos planos, adicione o nome
// AQUI na mesma alteração. O teste da Tarefa 11 falha se você esquecer.
export const MODELOS_ESCOPADOS_POR_TENANT = new Set<string>([
  'Usuario',
  'Papel',
  'Aluno',
  'Turma',
  'AnoLetivo',
  'LogAuditoria',
  'Categoria',
  'Localizacao',
  'Autor',
  'Obra',
  'Exemplar',
  'Inventario',
  'InventarioItem',
  'ConfiguracaoDeCirculacao',
  'ConfiguracaoPorSerie',
  'DiaNaoLetivo',
  'Emprestimo',
  'Reserva',
  'Penalidade',
])

export const MODELOS_FORA_DO_TENANT = new Set<string>([
  'Escola',
  'UsuarioPapel',
  'TentativaLogin',
])
