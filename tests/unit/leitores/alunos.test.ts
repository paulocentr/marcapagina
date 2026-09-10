import { describe, it, expect, beforeEach } from 'vitest'
import { SemPermissaoError } from '@/core/errors'
import {
  AlunoComLivrosEmMaosError,
  AlunoInexistenteError,
  MatriculaEmUsoError,
  criarAluno,
  desativarAluno,
  editarAluno,
  listarAlunos,
  obterFichaDoAluno,
  reativarAluno,
} from '@/modules/leitores/alunos.service'
import { TurmaInexistenteError } from '@/modules/leitores/turmas.service'
import type { Principal } from '@/core/auth/principal'
import {
  criarFakeDeAlunos,
  criarFakeDeAnosLetivos,
  criarFakeDeTransacao,
  criarFakeDeTurmas,
} from '../../apoio/fakes/leitores.fake'

const BIBLIOTECARIO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Bibliotecária',
  permissoes: ['aluno:ver', 'aluno:criar', 'aluno:editar', 'turma:gerenciar'],
}

const MONITOR: Principal = {
  reino: 'STAFF',
  id: 'usr_2',
  escolaId: 'esc_1',
  nome: 'Monitor',
  permissoes: ['aluno:ver'],
}

const ALUNO_LOGADO: Principal = {
  reino: 'ALUNO',
  id: 'alu_9',
  escolaId: 'esc_1',
  nome: 'Aluno curioso',
  matricula: '2024999',
}

let deps: {
  alunos: ReturnType<typeof criarFakeDeAlunos>
  turmas: ReturnType<typeof criarFakeDeTurmas>
  anosLetivos: ReturnType<typeof criarFakeDeAnosLetivos>
  emTransacao: <T>(fn: () => Promise<T>) => Promise<T>
}
let transacao: ReturnType<typeof criarFakeDeTransacao>

const TURMA_5A = { id: 'tur_1', nome: '5º A', serie: '5', turno: 'MANHA', anoLetivoId: 'anl_1' }

beforeEach(() => {
  const anosLetivos = criarFakeDeAnosLetivos([
    {
      id: 'anl_1',
      ano: 2026,
      dataInicio: new Date('2026-02-01T00:00:00.000Z'),
      dataFim: new Date('2026-12-15T00:00:00.000Z'),
      ativo: true,
    },
  ])
  const turmas = criarFakeDeTurmas(anosLetivos)
  turmas.semear(TURMA_5A)

  const alunos = criarFakeDeAlunos()
  alunos.registrarTurma({ id: 'tur_1', nome: '5º A', serie: '5' })

  transacao = criarFakeDeTransacao()
  deps = { alunos, turmas, anosLetivos, emTransacao: transacao.emTransacao }
})

const ANA = {
  matricula: '2024001',
  nome: 'Ana Souza',
  dataNascimento: '2012-03-15',
  turmaId: 'tur_1',
}

describe('criarAluno', () => {
  it('cria o aluno na turma informada, já ativo', async () => {
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)

    expect(aluno.matricula).toBe('2024001')
    expect(aluno.nome).toBe('Ana Souza')
    expect(aluno.ativo).toBe(true)
    expect(aluno.turma).toEqual({ id: 'tur_1', nome: '5º A', serie: '5' })
  })

  it('grava a data de nascimento em ISO curta, sem deslocar o dia', async () => {
    // É a metade secreta do login do aluno (decisão 3). Um dia a menos
    // aqui faz o aluno não conseguir entrar no portal com a data que sabe
    // de cor — e ninguém descobre até ele tentar.
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)

    expect(deps.alunos.bruta(aluno.id)?.dataNascimento).toBe('2012-03-15')
  })

  it('aceita a data no formato que o Excel pt-BR produz', async () => {
    // Mesmo par de formatos que o importador aceita (plano-alunos.ts).
    // Divergir faria a planilha entrar e o cadastro à mão recusar.
    const aluno = await criarAluno(
      BIBLIOTECARIO,
      { ...ANA, dataNascimento: '15/07/2011' },
      deps,
    )

    expect(deps.alunos.bruta(aluno.id)?.dataNascimento).toBe('2011-07-15')
  })

  it('recusa data que não existe no calendário', async () => {
    // 31/02 vira 2 de março num `new Date()` ingênuo, e o aluno passaria
    // a não conseguir entrar com a data que ele sabe.
    await expect(
      criarAluno(BIBLIOTECARIO, { ...ANA, dataNascimento: '31/02/2011' }, deps),
    ).rejects.toThrow(/nascimento/i)
  })

  it('NÃO devolve a data de nascimento em nenhum campo do retorno', async () => {
    // Credencial não viaja para o cliente sem necessidade. O retorno vai
    // direto para a tela pela Server Action.
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)

    expect(JSON.stringify(aluno)).not.toContain('2012')
    expect(Object.keys(aluno)).not.toContain('dataNascimento')
  })

  it('recusa matrícula repetida dizendo QUAL matrícula e de quem é', async () => {
    await criarAluno(BIBLIOTECARIO, ANA, deps)

    const repetida = criarAluno(
      BIBLIOTECARIO,
      { ...ANA, nome: 'Bruno Lima', matricula: '2024001' },
      deps,
    )

    await expect(repetida).rejects.toBeInstanceOf(MatriculaEmUsoError)
    await expect(repetida).rejects.toThrow('2024001')
    // O nome do outro aluno vai na mensagem: sem ele a operadora não sabe
    // se digitou errado ou se o aluno já está cadastrado.
    await expect(repetida).rejects.toThrow('Ana Souza')
  })

  it('acha a colisão mesmo quando o aluno da matrícula está desativado', async () => {
    // Matrícula de aluno desativado continua ocupada: o índice único do
    // banco não sabe de `ativo`. Se a checagem prévia filtrasse por
    // ativos, ela liberaria a matrícula e o banco recusaria depois — com
    // uma mensagem que a operadora não entenderia.
    const ana = await criarAluno(BIBLIOTECARIO, ANA, deps)
    await desativarAluno(BIBLIOTECARIO, { alunoId: ana.id }, deps)

    const repetida = criarAluno(BIBLIOTECARIO, { ...ANA, nome: 'Outro Aluno' }, deps)

    await expect(repetida).rejects.toBeInstanceOf(MatriculaEmUsoError)
    await expect(repetida).rejects.toThrow('2024001')
  })

  // A OUTRA metade da regra da matrícula única — a corrida entre a
  // checagem prévia e a gravação, em que o índice único do banco é o
  // único guarda — não dá para provar aqui: quem traduz o P2002 do
  // Prisma é o repositório, e um fake não tem índice único de verdade.
  // Ela está provada em tests/integration/leitores/alunos.test.ts, contra
  // o banco, inserindo por baixo do serviço.

  it('recusa turma que não existe nesta escola', async () => {
    // Passa pelo escopo de tenant, então turma da escola vizinha também
    // cai aqui — e a mensagem sai em pt-BR em vez de a FK reclamar.
    await expect(
      criarAluno(BIBLIOTECARIO, { ...ANA, turmaId: 'tur_da_vizinha' }, deps),
    ).rejects.toBeInstanceOf(TurmaInexistenteError)
  })

  it('aceita aluno sem turma', async () => {
    // Aluno novo chega antes de a turma dele existir; recusar obrigaria a
    // operadora a inventar uma turma para conseguir cadastrar.
    const aluno = await criarAluno(BIBLIOTECARIO, { ...ANA, turmaId: undefined }, deps)
    expect(aluno.turma).toBeNull()
  })

  it('apara o nome e colapsa espaço do meio', async () => {
    // Nome colado de outra tela vem com espaço duplo e viraria dois
    // alunos visualmente idênticos na lista.
    const aluno = await criarAluno(
      BIBLIOTECARIO,
      { ...ANA, nome: '  Ana   Souza  ' },
      deps,
    )
    expect(aluno.nome).toBe('Ana Souza')
  })

  it('recusa matrícula com espaço no meio em vez de reescrevê-la', async () => {
    // Reescrever em silêncio mudaria a metade pública do login de um
    // aluno que já existe. Recusar alto é o que faz alguém corrigir.
    await expect(
      criarAluno(BIBLIOTECARIO, { ...ANA, matricula: '2024 001' }, deps),
    ).rejects.toThrow(/matrícula/i)
  })

  it('recusa quem não tem aluno:criar', async () => {
    await expect(criarAluno(MONITOR, ANA, deps)).rejects.toBeInstanceOf(SemPermissaoError)
  })

  it('recusa o aluno logado no portal', async () => {
    // Permissão de staff não existe no reino ALUNO: `temPermissao`
    // devolve false para ele, e é isso que impede o portal de cadastrar.
    await expect(criarAluno(ALUNO_LOGADO, ANA, deps)).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('editarAluno', () => {
  it('muda o nome sem tocar na data de nascimento', async () => {
    // Data omitida significa "não mexa". Zerá-la por omissão apagaria a
    // credencial do aluno numa edição de nome.
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)

    await editarAluno(BIBLIOTECARIO, aluno.id, { nome: 'Ana Souza Lima' }, deps)

    const bruta = deps.alunos.bruta(aluno.id)
    expect(bruta?.nome).toBe('Ana Souza Lima')
    expect(bruta?.dataNascimento).toBe('2012-03-15')
  })

  it('troca a data de nascimento quando ela é informada', async () => {
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)

    await editarAluno(BIBLIOTECARIO, aluno.id, { dataNascimento: '2012-04-20' }, deps)

    expect(deps.alunos.bruta(aluno.id)?.dataNascimento).toBe('2012-04-20')
  })

  it('tira o aluno da turma quando turmaId vem nulo', async () => {
    // `null` é "sem turma" e `undefined` é "não mexa": sem a distinção,
    // editar o telefone do responsável tiraria o aluno da turma.
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)

    const semTurma = await editarAluno(BIBLIOTECARIO, aluno.id, { turmaId: null }, deps)
    expect(semTurma.turma).toBeNull()

    const soTelefone = await editarAluno(
      BIBLIOTECARIO,
      aluno.id,
      { responsavelTelefone: '11999990000' },
      deps,
    )
    expect(soTelefone.turma).toBeNull()
  })

  it('não deixa a turma sair sem ninguém pedir', async () => {
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)

    const editado = await editarAluno(BIBLIOTECARIO, aluno.id, { nome: 'Ana S. Lima' }, deps)

    expect(editado.turma).toEqual({ id: 'tur_1', nome: '5º A', serie: '5' })
  })

  it('recusa mudar para uma matrícula que já é de outro aluno', async () => {
    const ana = await criarAluno(BIBLIOTECARIO, ANA, deps)
    await criarAluno(BIBLIOTECARIO, { ...ANA, matricula: '2024002', nome: 'Bruno Lima' }, deps)

    await expect(
      editarAluno(BIBLIOTECARIO, ana.id, { matricula: '2024002' }, deps),
    ).rejects.toBeInstanceOf(MatriculaEmUsoError)
  })

  it('aceita salvar a própria matrícula sem reclamar de si mesmo', async () => {
    // A tela manda o formulário inteiro. Comparar só "existe alguém com
    // esta matrícula" recusaria toda edição de aluno.
    const ana = await criarAluno(BIBLIOTECARIO, ANA, deps)

    const editado = await editarAluno(
      BIBLIOTECARIO,
      ana.id,
      { matricula: '2024001', nome: 'Ana Souza Lima' },
      deps,
    )

    expect(editado.nome).toBe('Ana Souza Lima')
  })

  it('recusa aluno que não existe', async () => {
    await expect(
      editarAluno(BIBLIOTECARIO, 'alu_inexistente', { nome: 'Ninguém' }, deps),
    ).rejects.toBeInstanceOf(AlunoInexistenteError)
  })

  it('recusa quem não tem aluno:editar', async () => {
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)
    await expect(
      editarAluno(MONITOR, aluno.id, { nome: 'Outro' }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('desativarAluno', () => {
  it('desativa quem não está com livro nenhum', async () => {
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)

    const resultado = await desativarAluno(BIBLIOTECARIO, { alunoId: aluno.id }, deps)

    expect(resultado.aluno.ativo).toBe(false)
    expect(resultado.livrosEmMaos).toBe(0)
  })

  it('AVISA com o número de livros em mãos em vez de desativar em silêncio', async () => {
    // Desativar é bloqueio de empréstimo (`avaliarBloqueios` trata
    // INATIVO). Fazê-lo com dois livros na mochila do aluno tira da
    // operadora o único caminho de devolução — e nada na tela disse isso.
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)
    deps.alunos.definirLivrosEmMaos(aluno.id, 2)

    const recusa = desativarAluno(BIBLIOTECARIO, { alunoId: aluno.id }, deps)

    await expect(recusa).rejects.toBeInstanceOf(AlunoComLivrosEmMaosError)
    await expect(recusa).rejects.toThrow('2')
    // E não desativou.
    expect(deps.alunos.bruta(aluno.id)?.ativo).toBe(true)
  })

  it('desativa com livro em mãos quando a operadora confirma', async () => {
    // O aviso é aviso, não proibição: aluno que saiu da escola sem
    // devolver existe, e o cadastro tem de poder registrar isso.
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)
    deps.alunos.definirLivrosEmMaos(aluno.id, 2)

    const resultado = await desativarAluno(
      BIBLIOTECARIO,
      { alunoId: aluno.id, confirmado: true },
      deps,
    )

    expect(resultado.aluno.ativo).toBe(false)
    // O número acompanha o resultado: é o que a tela usa para dizer
    // "desativado, e 2 livros continuam com ele".
    expect(resultado.livrosEmMaos).toBe(2)
  })

  it('conta e desativa na MESMA transação', async () => {
    // Sem transação, a contagem e a escrita podem discordar: uma
    // devolução entre as duas faria a tela dizer "desativado com 1 livro"
    // sobre um aluno que devolveu tudo.
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)

    await desativarAluno(BIBLIOTECARIO, { alunoId: aluno.id }, deps)

    expect(transacao.estado.aberturas).toBe(1)
  })

  it('NÃO apaga o aluno — desativar preserva o histórico', async () => {
    // Excluir órfanaria empréstimo, reserva e penalidade. O relatório de
    // engajamento passaria a contar um ano letivo que não bate com nada.
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)

    await desativarAluno(BIBLIOTECARIO, { alunoId: aluno.id }, deps)

    expect(deps.alunos.bruta(aluno.id)).not.toBeNull()
    expect(deps.alunos.bruta(aluno.id)?.matricula).toBe('2024001')
  })

  it('recusa aluno que não existe', async () => {
    await expect(
      desativarAluno(BIBLIOTECARIO, { alunoId: 'alu_inexistente' }, deps),
    ).rejects.toBeInstanceOf(AlunoInexistenteError)
  })

  it('recusa quem não tem aluno:editar', async () => {
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)
    await expect(
      desativarAluno(MONITOR, { alunoId: aluno.id }, deps),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('reativarAluno', () => {
  it('devolve o aluno à ativa', async () => {
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)
    await desativarAluno(BIBLIOTECARIO, { alunoId: aluno.id }, deps)

    const reativado = await reativarAluno(BIBLIOTECARIO, aluno.id, deps)

    expect(reativado.ativo).toBe(true)
  })

  it('recusa quem não tem aluno:editar', async () => {
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)
    await expect(reativarAluno(MONITOR, aluno.id, deps)).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('listarAlunos', () => {
  beforeEach(async () => {
    await criarAluno(BIBLIOTECARIO, ANA, deps)
    await criarAluno(
      BIBLIOTECARIO,
      { matricula: '2024002', nome: 'Bruno Lima', dataNascimento: '2011-07-15' },
      deps,
    )
  })

  it('lista todos por padrão, ativos e inativos', async () => {
    const pagina = await listarAlunos(BIBLIOTECARIO, {}, deps)
    expect(pagina.total).toBe(2)
  })

  it('filtra por ativos quando pedido', async () => {
    const bruno = await deps.alunos.obterPorMatricula('2024002')
    await desativarAluno(BIBLIOTECARIO, { alunoId: bruno!.id }, deps)

    const pagina = await listarAlunos(BIBLIOTECARIO, { apenasAtivos: true }, deps)

    expect(pagina.itens.map((a) => a.matricula)).toEqual(['2024001'])
  })

  it('acha por parte do nome, ignorando a caixa', async () => {
    const pagina = await listarAlunos(BIBLIOTECARIO, { termo: 'bruno' }, deps)
    expect(pagina.itens.map((a) => a.nome)).toEqual(['Bruno Lima'])
  })

  it('acha por matrícula', async () => {
    const pagina = await listarAlunos(BIBLIOTECARIO, { termo: '2024001' }, deps)
    expect(pagina.itens.map((a) => a.nome)).toEqual(['Ana Souza'])
  })

  it('NÃO devolve a data de nascimento de ninguém na lista', async () => {
    // A lista é a tela que fica aberta no balcão, de frente para quem
    // passa. A credencial de um aluno não aparece ali, e — porque o tipo
    // não a tem — não existe caminho para ela aparecer sem alguém mudar
    // o contrato de propósito.
    const pagina = await listarAlunos(BIBLIOTECARIO, {}, deps)

    expect(JSON.stringify(pagina)).not.toContain('2012-03-15')
    for (const item of pagina.itens) {
      expect(Object.keys(item)).not.toContain('dataNascimento')
    }
  })

  it('trata termo em branco como "sem filtro"', async () => {
    // Campo de busca esvaziado manda string vazia; tratá-la como termo
    // faria a lista responder vazia e a operadora concluir que perdeu os
    // alunos.
    const pagina = await listarAlunos(BIBLIOTECARIO, { termo: '   ' }, deps)
    expect(pagina.total).toBe(2)
  })

  it('recusa quem não tem aluno:ver', async () => {
    const semNada: Principal = { ...MONITOR, permissoes: [] }
    await expect(listarAlunos(semNada, {}, deps)).rejects.toBeInstanceOf(SemPermissaoError)
  })

  it('limita o tamanho de página pedido de fora', async () => {
    // `porPagina` chega pela URL. Sem teto, `?porPagina=999999` puxa a
    // escola inteira numa consulta.
    const pagina = await listarAlunos(BIBLIOTECARIO, { porPagina: 999999 }, deps)
    expect(pagina.porPagina).toBeLessThanOrEqual(100)
  })
})

describe('obterFichaDoAluno', () => {
  it('traz o responsável e o número de livros em mãos', async () => {
    const aluno = await criarAluno(
      BIBLIOTECARIO,
      { ...ANA, responsavelNome: 'Marta Souza', responsavelTelefone: '11999990000' },
      deps,
    )
    deps.alunos.definirLivrosEmMaos(aluno.id, 1)

    const ficha = await obterFichaDoAluno(BIBLIOTECARIO, aluno.id, deps)

    expect(ficha.responsavelNome).toBe('Marta Souza')
    expect(ficha.livrosEmMaos).toBe(1)
  })

  it('NÃO traz a data de nascimento nem na ficha', async () => {
    const aluno = await criarAluno(BIBLIOTECARIO, ANA, deps)

    const ficha = await obterFichaDoAluno(BIBLIOTECARIO, aluno.id, deps)

    expect(Object.keys(ficha)).not.toContain('dataNascimento')
    expect(JSON.stringify(ficha)).not.toContain('2012-03-15')
  })

  it('recusa aluno que não existe', async () => {
    await expect(
      obterFichaDoAluno(BIBLIOTECARIO, 'alu_inexistente', deps),
    ).rejects.toBeInstanceOf(AlunoInexistenteError)
  })
})
