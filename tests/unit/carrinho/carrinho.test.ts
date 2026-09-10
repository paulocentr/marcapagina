import { describe, it, expect, beforeEach } from 'vitest'
import { SemPermissaoError } from '@/core/errors'
import { criarFakeDoCarrinho } from '../../apoio/fakes/carrinho.fake'
import {
  planejarRodada,
  sugerirExemplares,
  registrarPedido,
  emprestarEmLote,
  relatorioDeSugestaoDeCompra,
  AlunoInexistenteError,
  LoteInterrompidoError,
  LoteVazioError,
  ObraInexistenteError,
  PedidoComDoisAlvosError,
  PedidoDuplicadoError,
  PedidoSemAlvoError,
  RodadaCanceladaError,
  RodadaInexistenteError,
  TomboRepetidoNoLoteError,
  TurmaInexistenteError,
} from '@/modules/carrinho/carrinho.service'
import type { Principal } from '@/core/auth/principal'

const HOJE = new Date('2026-09-10T12:00:00-03:00')

const COORDENACAO: Principal = {
  reino: 'STAFF',
  id: 'usr_1',
  escolaId: 'esc_1',
  nome: 'Coordenação',
  permissoes: ['carrinho:gerenciar', 'emprestimo:criar'],
}

const SEM_CARRINHO: Principal = { ...COORDENACAO, permissoes: ['emprestimo:criar'] }
const SEM_EMPRESTIMO: Principal = { ...COORDENACAO, permissoes: ['carrinho:gerenciar'] }

let fake: ReturnType<typeof criarFakeDoCarrinho>

beforeEach(() => {
  fake = criarFakeDoCarrinho()
  fake.adicionarTurma('tur_5A', '5')
  fake.adicionarAluno('alu_1', 'tur_5A', '5')
  fake.adicionarAluno('alu_2', 'tur_5A', '5')
  fake.adicionarObra('obr_1', 'Dom Casmurro')
  fake.adicionarExemplar('000001', 'obr_1')
})

describe('rodada', () => {
  it('planeja rodada com data, turma e responsável', async () => {
    const rodada = await planejarRodada(
      COORDENACAO,
      { turmaId: 'tur_5A', data: HOJE, exemplaresIds: ['exe_000001'] },
      fake,
    )

    expect(rodada.turmaId).toBe('tur_5A')
    expect(rodada.data).toEqual(HOJE)
    expect(rodada.status).toBe('PLANEJADA')
    expect(rodada.exemplaresIds).toEqual(['exe_000001'])
  })

  it('o responsável é quem está logado, não um nome digitado', async () => {
    // O responsável responde pelo carrinho fora da biblioteca. Deixar o
    // campo ser digitado permitiria assinar a rodada com o nome de outra
    // pessoa — e é justamente esse nome que a coordenação procura quando
    // um livro não volta.
    const rodada = await planejarRodada(COORDENACAO, { turmaId: 'tur_5A', data: HOJE }, fake)

    expect(rodada.responsavelId).toBe('usr_1')
    expect(rodada.responsavelNome).toBe('Coordenação')
  })

  it('recusa turma que não existe nesta escola', async () => {
    await expect(
      planejarRodada(COORDENACAO, { turmaId: 'tur_de_outra_escola', data: HOJE }, fake),
    ).rejects.toBeInstanceOf(TurmaInexistenteError)
  })

  it('exige a permissão carrinho:gerenciar', async () => {
    await expect(
      planejarRodada(SEM_CARRINHO, { turmaId: 'tur_5A', data: HOJE }, fake),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })

  it('o mesmo exemplar levado duas vezes na lista entra uma vez só', async () => {
    const rodada = await planejarRodada(
      COORDENACAO,
      { turmaId: 'tur_5A', data: HOJE, exemplaresIds: ['exe_000001', 'exe_000001'] },
      fake,
    )

    expect(rodada.exemplaresIds).toEqual(['exe_000001'])
  })
})

describe('sugestão de exemplares', () => {
  it('sugere exemplares a partir dos pedidos pendentes da turma', async () => {
    await fake.adicionarPedido('alu_1', 'obr_1')

    const sugestoes = await sugerirExemplares(COORDENACAO, { turmaId: 'tur_5A' }, fake)

    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0]!.tombo).toBe('000001')
    expect(sugestoes[0]!.pedidos).toBe(1)
  })

  it('não sugere obra que ninguém da turma pediu', async () => {
    fake.adicionarObra('obr_2', 'Vidas Secas')
    fake.adicionarExemplar('000002', 'obr_2')

    await fake.adicionarPedido('alu_1', 'obr_1')

    const sugestoes = await sugerirExemplares(COORDENACAO, { turmaId: 'tur_5A' }, fake)

    expect(sugestoes.map((s) => s.tombo)).toEqual(['000001'])
  })

  it('o pedido de OUTRA turma não entra na sugestão desta', async () => {
    fake.adicionarTurma('tur_9B', '9')
    fake.adicionarAluno('alu_9', 'tur_9B', '9')
    await fake.adicionarPedido('alu_9', 'obr_1')

    const sugestoes = await sugerirExemplares(COORDENACAO, { turmaId: 'tur_5A' }, fake)

    expect(sugestoes).toEqual([])
  })

  it('a sugestão respeita a faixa etária da turma', async () => {
    // O carrinho vai para a sala e a professora entrega o que está nele.
    // Um título de 14+ chegando à mão de uma criança de 10 é o tipo de
    // erro que a escola não pode explicar ao responsável.
    fake.adicionarObra('obr_adulto', 'Livro Pesado', '14+')
    fake.adicionarExemplar('000003', 'obr_adulto')
    await fake.adicionarPedido('alu_1', 'obr_adulto')
    await fake.adicionarPedido('alu_2', 'obr_1')

    const sugestoes = await sugerirExemplares(COORDENACAO, { turmaId: 'tur_5A' }, fake)

    expect(sugestoes.map((s) => s.tombo)).toEqual(['000001'])
  })

  it('não sugere exemplar indisponível', async () => {
    // Sugerir o que já está com outro aluno faz a operadora procurar na
    // estante um livro que não está lá, com o carrinho parado.
    fake.adicionarExemplar('000001', 'obr_1', 'EMPRESTADO')
    await fake.adicionarPedido('alu_1', 'obr_1')

    const sugestoes = await sugerirExemplares(COORDENACAO, { turmaId: 'tur_5A' }, fake)

    expect(sugestoes).toEqual([])
  })

  it('leva uma cópia por aluno que pediu, até onde o acervo alcança', async () => {
    // Levar UMA cópia quando dois pediram garante um aluno decepcionado
    // numa visita que acontece uma vez por mês.
    fake.adicionarExemplar('000004', 'obr_1')
    await fake.adicionarPedido('alu_1', 'obr_1')
    await fake.adicionarPedido('alu_2', 'obr_1')

    const sugestoes = await sugerirExemplares(COORDENACAO, { turmaId: 'tur_5A' }, fake)

    expect(sugestoes.map((s) => s.tombo).sort()).toEqual(['000001', '000004'])
  })

  it('o mais pedido vem primeiro, porque o carrinho é pequeno', async () => {
    fake.adicionarObra('obr_2', 'Vidas Secas')
    fake.adicionarExemplar('000002', 'obr_2')
    await fake.adicionarPedido('alu_1', 'obr_2')
    await fake.adicionarPedido('alu_2', 'obr_2')
    await fake.adicionarPedido('alu_1', 'obr_1')

    const sugestoes = await sugerirExemplares(COORDENACAO, { turmaId: 'tur_5A' }, fake)

    expect(sugestoes[0]!.obraId).toBe('obr_2')
  })

  it('pedido já atendido não volta a ser sugerido', async () => {
    // Sem isso o carrinho levaria à mesma sala o mesmo livro para o mesmo
    // aluno, rodada após rodada.
    await fake.adicionarPedido('alu_1', 'obr_1')
    fake.pedidosGravados()[0]!.status = 'ATENDIDO'

    const sugestoes = await sugerirExemplares(COORDENACAO, { turmaId: 'tur_5A' }, fake)

    expect(sugestoes).toEqual([])
  })
})

describe('pedido', () => {
  it('aceita obra do acervo', async () => {
    const pedido = await registrarPedido(COORDENACAO, { alunoId: 'alu_1', obraId: 'obr_1' }, fake)

    expect(pedido.obraId).toBe('obr_1')
    expect(pedido.tituloLivre).toBeNull()
    expect(pedido.status).toBe('PENDENTE')
  })

  it('aceita TÍTULO LIVRE que a biblioteca não tem', async () => {
    // Vira lista de sugestão de compra com contagem de demanda — o
    // argumento que a coordenação leva à direção para pedir verba.
    const pedido = await registrarPedido(
      COORDENACAO,
      { alunoId: 'alu_1', tituloLivre: 'O Pequeno Príncipe' },
      fake,
    )

    expect(pedido.obraId).toBeNull()
    expect(pedido.tituloLivre).toBe('O Pequeno Príncipe')
    expect(pedido.tituloLivreNormalizado).toBe('o pequeno principe')
  })

  it('título livre que a biblioteca JÁ TEM vira pedido da obra', async () => {
    // Sem isso a coordenação pediria verba à direção para comprar um
    // livro que está na estante — e perderia a credibilidade da lista
    // inteira na primeira conferência.
    const pedido = await registrarPedido(
      COORDENACAO,
      { alunoId: 'alu_1', tituloLivre: '  dom   casmurro ' },
      fake,
    )

    expect(pedido.obraId).toBe('obr_1')
    expect(pedido.tituloLivreNormalizado).toBeNull()
  })

  it('recusa pedido sem obra e sem título', async () => {
    await expect(
      registrarPedido(COORDENACAO, { alunoId: 'alu_1' }, fake),
    ).rejects.toBeInstanceOf(PedidoSemAlvoError)
  })

  it('recusa pedido com obra E título ao mesmo tempo', async () => {
    await expect(
      registrarPedido(COORDENACAO, { alunoId: 'alu_1', obraId: 'obr_1', tituloLivre: 'Outro' }, fake),
    ).rejects.toBeInstanceOf(PedidoComDoisAlvosError)
  })

  it('título só de espaço não é título', async () => {
    await expect(
      registrarPedido(COORDENACAO, { alunoId: 'alu_1', tituloLivre: '   ' }, fake),
    ).rejects.toBeInstanceOf(PedidoSemAlvoError)
  })

  it('recusa aluno que não existe nesta escola', async () => {
    await expect(
      registrarPedido(COORDENACAO, { alunoId: 'alu_fantasma', obraId: 'obr_1' }, fake),
    ).rejects.toBeInstanceOf(AlunoInexistenteError)
  })

  it('recusa obra que não existe nesta escola', async () => {
    await expect(
      registrarPedido(COORDENACAO, { alunoId: 'alu_1', obraId: 'obr_fantasma' }, fake),
    ).rejects.toBeInstanceOf(ObraInexistenteError)
  })

  it('recusa o mesmo pedido pendente duas vezes', async () => {
    // O duplo clique é o que infla a contagem de demanda — justamente o
    // número que vai à direção pedir dinheiro.
    await registrarPedido(COORDENACAO, { alunoId: 'alu_1', tituloLivre: 'Percy Jackson' }, fake)

    await expect(
      registrarPedido(COORDENACAO, { alunoId: 'alu_1', tituloLivre: 'percy jackson' }, fake),
    ).rejects.toBeInstanceOf(PedidoDuplicadoError)
  })

  it('exige a permissão carrinho:gerenciar', async () => {
    await expect(
      registrarPedido(SEM_CARRINHO, { alunoId: 'alu_1', obraId: 'obr_1' }, fake),
    ).rejects.toBeInstanceOf(SemPermissaoError)
  })
})

describe('sugestão de compra', () => {
  it('agrupa a demanda por título livre, contando quantos pediram', async () => {
    await fake.adicionarPedidoDeTituloLivre('alu_1', 'O Pequeno Príncipe')
    await fake.adicionarPedidoDeTituloLivre('alu_2', 'o pequeno principe')

    const relatorio = await relatorioDeSugestaoDeCompra(COORDENACAO, fake)

    expect(relatorio).toHaveLength(1)
    expect(relatorio[0]!.tituloNormalizado).toBe('o pequeno principe')
    expect(relatorio[0]!.alunos).toBe(2)
    expect(relatorio[0]!.pedidos).toBe(2)
  })

  it('conta ALUNOS distintos, não linhas', async () => {
    // Um aluno pedindo o mesmo livro em três rodadas não são três alunos
    // querendo. Levar "3 alunos" à direção com uma pessoa por trás é o
    // erro que derruba a lista inteira quando alguém confere.
    await fake.adicionarPedidoDeTituloLivre('alu_1', 'Percy Jackson')
    fake.pedidosGravados()[0]!.status = 'SUGERIDO_COMPRA'
    await fake.adicionarPedidoDeTituloLivre('alu_1', 'Percy Jackson')

    const relatorio = await relatorioDeSugestaoDeCompra(COORDENACAO, fake)

    expect(relatorio[0]!.alunos).toBe(1)
    expect(relatorio[0]!.pedidos).toBe(2)
  })

  it('o mais pedido encabeça a lista', async () => {
    await fake.adicionarPedidoDeTituloLivre('alu_1', 'Um Só')
    await fake.adicionarPedidoDeTituloLivre('alu_1', 'Os Dois')
    await fake.adicionarPedidoDeTituloLivre('alu_2', 'Os Dois')

    const relatorio = await relatorioDeSugestaoDeCompra(COORDENACAO, fake)

    expect(relatorio.map((l) => l.titulo)).toEqual(['Os Dois', 'Um Só'])
  })

  it('pedido de obra do acervo NÃO entra na lista de compra', async () => {
    await fake.adicionarPedido('alu_1', 'obr_1')

    const relatorio = await relatorioDeSugestaoDeCompra(COORDENACAO, fake)

    expect(relatorio).toEqual([])
  })

  it('exige a permissão carrinho:gerenciar', async () => {
    await expect(relatorioDeSugestaoDeCompra(SEM_CARRINHO, fake)).rejects.toBeInstanceOf(
      SemPermissaoError,
    )
  })
})

describe('empréstimo em lote', () => {
  async function rodadaPlanejada(): Promise<string> {
    const rodada = await planejarRodada(COORDENACAO, { turmaId: 'tur_5A', data: HOJE }, fake)
    return rodada.id
  }

  it('lança 30 empréstimos numa chamada', async () => {
    // Uma tela para 30 alunos, não 30 telas.
    const itens: { alunoId: string; tombo: string }[] = []
    for (let i = 1; i <= 30; i++) {
      const tombo = String(100 + i)
      fake.adicionarAluno(`alu_lote_${i}`, 'tur_5A', '5')
      fake.adicionarExemplar(tombo, 'obr_1')
      itens.push({ alunoId: `alu_lote_${i}`, tombo })
    }

    const rodadaId = await rodadaPlanejada()
    const resultado = await emprestarEmLote(COORDENACAO, { rodadaId, itens, hoje: HOJE }, fake)

    expect(resultado.emprestados).toHaveLength(30)
    expect(resultado.recusados).toEqual([])
    expect(fake.emprestimosGravados()).toHaveLength(30)
  })

  it('um aluno bloqueado não derruba o lote inteiro', async () => {
    // Derrubar tudo por causa de um faria a operadora desistir do lote e
    // voltar a lançar um por um — que é o que o carrinho existe para
    // evitar.
    fake.adicionarExemplar('000002', 'obr_1')
    fake.adicionarExemplar('000003', 'obr_1')
    fake.adicionarAluno('alu_3', 'tur_5A', '5')
    fake.suspender('alu_2', new Date('2099-01-01'))

    const rodadaId = await rodadaPlanejada()
    const resultado = await emprestarEmLote(
      COORDENACAO,
      {
        rodadaId,
        itens: [
          { alunoId: 'alu_1', tombo: '000001' },
          { alunoId: 'alu_2', tombo: '000002' },
          { alunoId: 'alu_3', tombo: '000003' },
        ],
        hoje: HOJE,
      },
      fake,
    )

    expect(resultado.emprestados.map((e) => e.alunoId)).toEqual(['alu_1', 'alu_3'])
    expect(resultado.recusados.map((r) => r.alunoId)).toEqual(['alu_2'])
    expect(fake.emprestimosGravados()).toHaveLength(2)
  })

  it('devolve o que entrou e o que foi recusado, com o motivo', async () => {
    fake.adicionarExemplar('000002', 'obr_1')
    fake.suspender('alu_2', new Date('2099-01-01'))

    const rodadaId = await rodadaPlanejada()
    const resultado = await emprestarEmLote(
      COORDENACAO,
      {
        rodadaId,
        itens: [
          { alunoId: 'alu_1', tombo: '000001' },
          { alunoId: 'alu_2', tombo: '000002' },
        ],
        hoje: HOJE,
      },
      fake,
    )

    expect(resultado.emprestados[0]).toMatchObject({ alunoId: 'alu_1', tombo: '000001' })
    expect(resultado.emprestados[0]!.emprestimoId).toBeTruthy()
    expect(resultado.emprestados[0]!.previstaPara).toBeInstanceOf(Date)

    const recusa = resultado.recusados[0]!
    expect(recusa).toMatchObject({ alunoId: 'alu_2', tombo: '000002', codigo: 'LEITOR_BLOQUEADO' })
    // A operadora está com 30 alunos na frente: a recusa tem de dizer o
    // que houve, em português, sem ela abrir outra tela.
    expect(recusa.motivo.toLowerCase()).toContain('suspens')
  })

  it('cada recusa traz o motivo DAQUELE aluno, não um motivo genérico', async () => {
    fake.adicionarExemplar('000002', 'obr_1', 'EM_MANUTENCAO')
    fake.adicionarAluno('alu_3', 'tur_5A', '5')
    fake.suspender('alu_3', new Date('2099-01-01'))

    const rodadaId = await rodadaPlanejada()
    const resultado = await emprestarEmLote(
      COORDENACAO,
      {
        rodadaId,
        itens: [
          { alunoId: 'alu_1', tombo: '000002' },
          { alunoId: 'alu_3', tombo: '000001' },
        ],
        hoje: HOJE,
      },
      fake,
    )

    expect(resultado.recusados.map((r) => r.codigo)).toEqual([
      'EXEMPLAR_INDISPONIVEL',
      'LEITOR_BLOQUEADO',
    ])
  })

  it('o que entrou entra numa transação por aluno, não uma global', async () => {
    // Uma transação global desfaria os 29 empréstimos bons por causa do
    // 30º — que é exatamente o que a regra acima proíbe.
    fake.adicionarExemplar('000002', 'obr_1')
    fake.adicionarAluno('alu_3', 'tur_5A', '5')

    const rodadaId = await rodadaPlanejada()
    await emprestarEmLote(
      COORDENACAO,
      {
        rodadaId,
        itens: [
          { alunoId: 'alu_1', tombo: '000001' },
          { alunoId: 'alu_3', tombo: '000002' },
        ],
        hoje: HOJE,
      },
      fake,
    )

    expect(fake.transacoesAbertas).toBe(2)
  })

  it('o pedido atendido pelo lote deixa de ficar pendente', async () => {
    // Sem isso a próxima rodada levaria de volta o mesmo livro para o
    // mesmo aluno, que já está com ele na mochila.
    await fake.adicionarPedido('alu_1', 'obr_1')

    const rodadaId = await rodadaPlanejada()
    await emprestarEmLote(
      COORDENACAO,
      { rodadaId, itens: [{ alunoId: 'alu_1', tombo: '000001' }], hoje: HOJE },
      fake,
    )

    expect(fake.pedidosGravados()[0]!.status).toBe('ATENDIDO')
  })

  it('a rodada vira REALIZADA quando algum empréstimo entrou', async () => {
    const rodadaId = await rodadaPlanejada()
    await emprestarEmLote(
      COORDENACAO,
      { rodadaId, itens: [{ alunoId: 'alu_1', tombo: '000001' }], hoje: HOJE },
      fake,
    )

    expect(fake.rodada(rodadaId)!.status).toBe('REALIZADA')
  })

  it('a rodada continua PLANEJADA quando NADA entrou', async () => {
    // Fechar a rodada sem nenhum empréstimo trancaria a operadora fora
    // dela: ela resolve a suspensão e não tem mais onde lançar.
    fake.suspender('alu_1', new Date('2099-01-01'))

    const rodadaId = await rodadaPlanejada()
    const resultado = await emprestarEmLote(
      COORDENACAO,
      { rodadaId, itens: [{ alunoId: 'alu_1', tombo: '000001' }], hoje: HOJE },
      fake,
    )

    expect(resultado.emprestados).toEqual([])
    expect(fake.rodada(rodadaId)!.status).toBe('PLANEJADA')
  })

  it('recusa o lote vazio em vez de dizer "pronto" sem fazer nada', async () => {
    const rodadaId = await rodadaPlanejada()

    await expect(
      emprestarEmLote(COORDENACAO, { rodadaId, itens: [], hoje: HOJE }, fake),
    ).rejects.toBeInstanceOf(LoteVazioError)
  })

  it('recusa rodada que não existe nesta escola', async () => {
    await expect(
      emprestarEmLote(
        COORDENACAO,
        { rodadaId: 'rod_fantasma', itens: [{ alunoId: 'alu_1', tombo: '000001' }], hoje: HOJE },
        fake,
      ),
    ).rejects.toBeInstanceOf(RodadaInexistenteError)
  })

  it('recusa lançar sobre rodada cancelada', async () => {
    // Empréstimo apontando para uma rodada que "não aconteceu" é um dado
    // que ninguém consegue explicar depois.
    const rodadaId = await rodadaPlanejada()
    fake.rodada(rodadaId)!.status = 'CANCELADA'

    await expect(
      emprestarEmLote(
        COORDENACAO,
        { rodadaId, itens: [{ alunoId: 'alu_1', tombo: '000001' }], hoje: HOJE },
        fake,
      ),
    ).rejects.toBeInstanceOf(RodadaCanceladaError)
  })

  it('recusa o lote inteiro quando o mesmo tombo aparece duas vezes', async () => {
    // Há UM exemplar físico no carrinho. Deixar seguir faria o segundo
    // aluno ser recusado com "exemplar emprestado" um segundo depois de a
    // operadora mesma o ter emprestado — uma mensagem que não explica
    // nada. Melhor recusar antes, dizendo qual tombo se repetiu.
    fake.adicionarAluno('alu_3', 'tur_5A', '5')

    const rodadaId = await rodadaPlanejada()
    await expect(
      emprestarEmLote(
        COORDENACAO,
        {
          rodadaId,
          itens: [
            { alunoId: 'alu_1', tombo: '000001' },
            { alunoId: 'alu_3', tombo: '000001' },
          ],
          hoje: HOJE,
        },
        fake,
      ),
    ).rejects.toBeInstanceOf(TomboRepetidoNoLoteError)

    expect(fake.emprestimosGravados()).toEqual([])
  })

  it('falha de infraestrutura NÃO vira recusa do aluno', async () => {
    // Registrar "banco fora do ar" como recusa diria à operadora que o
    // aluno está bloqueado. Ela iria discutir com o aluno em vez de pedir
    // socorro, e o relatório do dia guardaria uma recusa que nunca houve.
    fake.adicionarExemplar('000002', 'obr_1')
    fake.adicionarAluno('alu_3', 'tur_5A', '5')

    const rodadaId = await rodadaPlanejada()
    fake.quebrarGravacaoNumero(2, new Error('conexão com o banco caiu'))

    const interrompido = await emprestarEmLote(
      COORDENACAO,
      {
        rodadaId,
        itens: [
          { alunoId: 'alu_1', tombo: '000001' },
          { alunoId: 'alu_3', tombo: '000002' },
        ],
        hoje: HOJE,
      },
      fake,
    ).catch((erro: unknown) => erro)

    expect(interrompido).toBeInstanceOf(LoteInterrompidoError)

    // O que já entrou viaja NO erro: aquele livro saiu fisicamente com o
    // aluno, e sem essa lista a operadora relançaria o lote inteiro às
    // cegas depois que o banco voltasse.
    const parcial = (interrompido as LoteInterrompidoError).parcial
    expect(parcial.emprestados.map((e) => e.alunoId)).toEqual(['alu_1'])
    expect(parcial.recusados).toEqual([])
    expect(fake.emprestimosGravados()).toHaveLength(1)
  })

  it('exige carrinho:gerenciar E emprestimo:criar, antes de emprestar qualquer um', async () => {
    // Descobrir a falta de permissão no 15º aluno deixaria 14 empréstimos
    // lançados e a operação pela metade.
    const rodadaId = await rodadaPlanejada()
    const itens = [{ alunoId: 'alu_1', tombo: '000001' }]

    await expect(
      emprestarEmLote(SEM_CARRINHO, { rodadaId, itens, hoje: HOJE }, fake),
    ).rejects.toBeInstanceOf(SemPermissaoError)
    await expect(
      emprestarEmLote(SEM_EMPRESTIMO, { rodadaId, itens, hoje: HOJE }, fake),
    ).rejects.toBeInstanceOf(SemPermissaoError)

    expect(fake.emprestimosGravados()).toEqual([])
  })
})
