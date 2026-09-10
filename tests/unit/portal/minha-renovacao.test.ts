import { describe, it, expect } from 'vitest'
import { renovarMeuLivro } from '@/modules/portal/minha-renovacao.service'
import {
  LivroJaDevolvidoError,
  LivroNaoEstaComVoceError,
  RenovacaoRecusadaError,
} from '@/modules/portal/portal.tipos'
import {
  DadoDeOutroLeitorError,
  SessaoNaoEhDeAlunoError,
} from '@/modules/portal/autorizacao-do-aluno'
import { AGORA, ANA, BRUNO_ID, COORD, CONFIG, emprestimoDoBanco, montarFake } from './apoio'

describe('renovarMeuLivro — o caminho que funciona', () => {
  it('empurra o prazo em dias corridos a partir do vencimento atual', async () => {
    const { deps, renovacoesGravadas } = montarFake({ emprestimo: emprestimoDoBanco() })

    const renovado = await renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps)

    // Vencia 24/09 (quinta); +14 dias cai em 08/10, quinta-feira.
    expect(renovado.previstaPara).toEqual(new Date('2026-10-08T00:00:00.000Z'))
    expect(renovado.renovacoes).toBe(1)
    expect(renovacoesGravadas).toHaveLength(1)
  })

  it('conta do VENCIMENTO, não de hoje — quem renova cedo não perde dias', async () => {
    const { deps } = montarFake({ emprestimo: emprestimoDoBanco() })

    const renovado = await renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps)

    // De hoje (10/09) daria 24/09. Do vencimento (24/09) dá 08/10.
    expect(renovado.previstaPara).not.toEqual(new Date('2026-09-24T00:00:00.000Z'))
  })

  it('não deixa o novo prazo vencer em dia não letivo', async () => {
    const { deps } = montarFake({
      emprestimo: emprestimoDoBanco(),
      // 08/10 marcado como recesso: o prazo tem de andar para 09/10.
      diasNaoLetivos: ['2026-10-08'],
    })

    const renovado = await renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps)

    expect(renovado.previstaPara).toEqual(new Date('2026-10-09T00:00:00.000Z'))
  })

  it('grava a renovação escopada pelo aluno da SESSÃO', async () => {
    const { deps, renovacoesGravadas, espiao } = montarFake({
      emprestimo: emprestimoDoBanco(),
    })

    await renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps)

    expect(renovacoesGravadas[0]!.alunoId).toBe(ANA.id)
    // Escopar só a LEITURA impediria ver o empréstimo do colega e ainda
    // assim permitiria escrever nele, bastando o id.
    expect(espiao.escritos).toEqual([ANA.id])
    expect(espiao.lidos.every((id) => id === ANA.id)).toBe(true)
  })
})

describe('a renovação não alcança o livro de outro aluno', () => {
  it('RECUSA quando o repositório devolve o empréstimo do colega', async () => {
    // O teste central da faixa. O aluno manda o id do empréstimo pelo
    // formulário — é entrada do cliente. Aqui o repositório fake IGNORA o
    // filtro por aluno e devolve o do colega; o serviço tem de recusar
    // sozinho, sem depender de o WHERE estar certo.
    const { deps, renovacoesGravadas } = montarFake({
      emprestimo: emprestimoDoBanco({ alunoId: BRUNO_ID }),
    })

    await expect(
      renovarMeuLivro(ANA, { emprestimoId: 'emp_do_bruno', agora: AGORA }, deps),
    ).rejects.toThrow(DadoDeOutroLeitorError)

    // E não escreve nada: recusar depois de gravar seria o pior dos dois
    // mundos — o prazo do colega mudado e a mensagem de erro na tela.
    expect(renovacoesGravadas).toEqual([])
  })

  it('RECUSA o empréstimo da equipe, que não tem aluno', async () => {
    const { deps } = montarFake({ emprestimo: emprestimoDoBanco({ alunoId: null }) })

    await expect(
      renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps),
    ).rejects.toThrow(DadoDeOutroLeitorError)
  })

  it('empréstimo que o filtro não alcançou responde igual a inexistente', async () => {
    const { deps } = montarFake({ emprestimo: null })

    await expect(
      renovarMeuLivro(ANA, { emprestimoId: 'emp_do_bruno', agora: AGORA }, deps),
    ).rejects.toThrow(LivroNaoEstaComVoceError)
  })

  it('sessão de equipe não renova pelo portal', async () => {
    const { deps } = montarFake({ emprestimo: emprestimoDoBanco() })

    await expect(
      renovarMeuLivro(COORD, { emprestimoId: 'emp_1', agora: AGORA }, deps),
    ).rejects.toThrow(SessaoNaoEhDeAlunoError)
  })

  it('RECUSA quando o cadastro lido é de outro aluno', async () => {
    const { deps } = montarFake({
      emprestimo: emprestimoDoBanco(),
      leitor: { id: BRUNO_ID, nome: 'Bruno', ativo: true, serie: '8', suspensaoAte: null },
    })

    await expect(
      renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps),
    ).rejects.toThrow(DadoDeOutroLeitorError)
  })
})

describe('as regras da renovação valem no servidor, não só no botão', () => {
  it('recusa o que já bateu o máximo da série', async () => {
    const { deps } = montarFake({ emprestimo: emprestimoDoBanco({ renovacoes: 1 }) })

    await expect(
      renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps),
    ).rejects.toThrow(RenovacaoRecusadaError)
  })

  it('recusa quando há fila esperando pela obra', async () => {
    const { deps } = montarFake({
      emprestimo: emprestimoDoBanco(),
      filaPorObra: { obra_1: 1 },
    })

    await expect(
      renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps),
    ).rejects.toThrow(/esperando por este livro/)
  })

  it('recusa livro atrasado', async () => {
    const { deps } = montarFake({
      emprestimo: emprestimoDoBanco({ previstaPara: new Date('2026-09-02T00:00:00.000Z') }),
    })

    await expect(
      renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps),
    ).rejects.toThrow(/atrasado/)
  })

  it('recusa leitor suspenso', async () => {
    const { deps } = montarFake({
      emprestimo: emprestimoDoBanco(),
      leitor: {
        id: ANA.id,
        nome: ANA.nome,
        ativo: true,
        serie: '8',
        suspensaoAte: new Date('2026-09-20T00:00:00.000Z'),
      },
    })

    await expect(
      renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps),
    ).rejects.toThrow(RenovacaoRecusadaError)
  })

  it('recusa série sem renovação nenhuma', async () => {
    const { deps } = montarFake({
      emprestimo: emprestimoDoBanco(),
      config: { ...CONFIG, maximoDeRenovacoes: 0 },
    })

    await expect(
      renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps),
    ).rejects.toThrow(/não permite renovar/)
  })

  it('recusa livro já devolvido', async () => {
    const { deps } = montarFake({
      emprestimo: emprestimoDoBanco({ devolvidaEm: new Date('2026-09-08T12:00:00.000Z') }),
    })

    await expect(
      renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps),
    ).rejects.toThrow(LivroJaDevolvidoError)
  })

  it('zero linhas gravadas é devolução no balcão durante a renovação — falha alto', async () => {
    // Tratar como sucesso deixaria o livro emprestado para sempre, já de
    // volta na estante e com data futura.
    const { deps } = montarFake({
      emprestimo: emprestimoDoBanco(),
      linhasRenovadas: 0,
    })

    await expect(
      renovarMeuLivro(ANA, { emprestimoId: 'emp_1', agora: AGORA }, deps),
    ).rejects.toThrow(LivroJaDevolvidoError)
  })
})
