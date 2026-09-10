import { describe, it, expect } from 'vitest'
import { NOMES_DE_ICONE } from '@/components/ui/icone-nomes'
import { PERMISSOES_ATRIBUIVEIS_NA_ESCOLA } from '@/modules/usuarios/usuarios'
import {
  GRUPOS_DE_PERMISSAO,
  ROTULOS_DE_PERMISSAO,
  descreverConta,
  formatarDiaDaEscola,
  montarContas,
  motivoParaNaoDesativar,
  resumirPapelDaConta,
} from '../../../src/app/painel/usuarios/usuarios-na-tela'
import type { UsuarioNaTela } from '@/modules/usuarios/usuarios.service'

/**
 * A lógica da tela de contas, em módulo puro.
 *
 * O que vale provar aqui, e custa milissegundos:
 *
 *  1. **nenhuma permissão fica de fora do editor de papéis.** O catálogo
 *     em `permissoes.ts` cresce a cada plano, e uma permissão que não
 *     entrou em grupo nenhum simplesmente NÃO APARECE na tela — o papel
 *     salvo passa a ser diferente do que a coordenação vê;
 *  2. **nenhuma permissão aparece como chave crua.** `carrinho:gerenciar`
 *     na tela não diz nada a quem coordena a biblioteca;
 *  3. **o estado da conta tem palavra E ícone.** Ativo/desativado dito só
 *     pela cor é a regra dura do sistema.
 */

describe('grupos de permissão do editor de papéis', () => {
  const noEditor = GRUPOS_DE_PERMISSAO.flatMap((g) => g.permissoes)

  it('cobre TODA permissão que a escola pode conceder', () => {
    const faltando = PERMISSOES_ATRIBUIVEIS_NA_ESCOLA.filter((p) => !noEditor.includes(p))

    expect(
      faltando,
      'Permissão sem grupo não aparece no editor: o papel salvo fica diferente ' +
        `do que a coordenação vê na tela. Acrescente em GRUPOS_DE_PERMISSAO: ${faltando.join(', ')}`,
    ).toEqual([])
  })

  it('não oferece permissão que a escola NÃO pode conceder', () => {
    const indevidas = noEditor.filter((p) => !PERMISSOES_ATRIBUIVEIS_NA_ESCOLA.includes(p))
    expect(indevidas).toEqual([])
  })

  it('nenhuma permissão aparece em dois grupos', () => {
    const repetidas = noEditor.filter((p, i) => noEditor.indexOf(p) !== i)
    expect(repetidas).toEqual([])
  })

  it('todo grupo tem título e ao menos uma permissão', () => {
    for (const grupo of GRUPOS_DE_PERMISSAO) {
      expect(grupo.titulo.length, JSON.stringify(grupo)).toBeGreaterThan(0)
      expect(grupo.permissoes.length, grupo.titulo).toBeGreaterThan(0)
    }
  })
})

describe('rótulos das permissões', () => {
  it('toda permissão concedível tem rótulo em pt-BR, e não a chave crua', () => {
    for (const permissao of PERMISSOES_ATRIBUIVEIS_NA_ESCOLA) {
      const rotulo = ROTULOS_DE_PERMISSAO[permissao]
      expect(rotulo, permissao).toBeTruthy()
      expect(rotulo, permissao).not.toBe(permissao)
      expect(rotulo, permissao).not.toContain(':')
    }
  })
})

describe('descreverConta', () => {
  it('conta ativa: palavra e ícone', () => {
    const { palavra, icone } = descreverConta(true)
    expect(palavra).toBe('Ativa')
    expect(NOMES_DE_ICONE).toContain(icone)
  })

  it('conta desativada: palavra e ícone, nunca só a cor', () => {
    const { palavra, icone } = descreverConta(false)
    expect(palavra).toBe('Desativada')
    expect(NOMES_DE_ICONE).toContain(icone)
  })

  it('os dois estados têm palavras diferentes E ícones diferentes', () => {
    const ativa = descreverConta(true)
    const inativa = descreverConta(false)
    expect(ativa.palavra).not.toBe(inativa.palavra)
    expect(ativa.icone).not.toBe(inativa.icone)
  })
})

describe('motivoParaNaoDesativar', () => {
  const conta = (extra: { id?: string; unicoAdministrador?: boolean } = {}) => ({
    id: extra.id ?? 'usr_bib',
    unicoAdministrador: extra.unicoAdministrador ?? false,
  })

  it('conta comum de outra pessoa: nada impede', () => {
    expect(motivoParaNaoDesativar(conta(), 'usr_coord')).toBeNull()
  })

  it('a própria conta: diz por que não', () => {
    const motivo = motivoParaNaoDesativar(conta({ id: 'usr_coord' }), 'usr_coord')
    expect(motivo).toMatch(/própria conta/i)
  })

  it('último administrador: diz por que não', () => {
    const motivo = motivoParaNaoDesativar(conta({ unicoAdministrador: true }), 'usr_coord')
    expect(motivo).toMatch(/administr/i)
  })

  it('a própria conta E último administrador: uma razão só, a mais direta', () => {
    // Duas frases empilhadas no mesmo botão desabilitado não ajudam
    // ninguém a decidir o que fazer.
    const motivo = motivoParaNaoDesativar(
      conta({ id: 'usr_coord', unicoAdministrador: true }),
      'usr_coord',
    )
    expect(motivo).toMatch(/própria conta/i)
    expect(motivo!.split('. ').length).toBeLessThanOrEqual(2)
  })
})

describe('resumirPapelDaConta', () => {
  it('nomeia o papel único', () => {
    expect(resumirPapelDaConta([{ id: 'p1', nome: 'BIBLIOTECARIO', permissoes: [] }])).toBe(
      'Bibliotecária ou bibliotecário',
    )
  })

  it('conta sem papel nenhum é dita, não deixada em branco', () => {
    // Em branco a coordenação leria "ainda não carregou". A conta existe e
    // não faz nada — e isso tem de aparecer.
    expect(resumirPapelDaConta([])).toBe('sem papel')
  })

  it('papel criado pela escola aparece com o nome que ela deu', () => {
    expect(resumirPapelDaConta([{ id: 'p1', nome: 'Auxiliar da tarde', permissoes: [] }])).toBe(
      'Auxiliar da tarde',
    )
  })

  it('mais de um papel: nomeia os dois', () => {
    const resumo = resumirPapelDaConta([
      { id: 'p1', nome: 'MONITOR', permissoes: [] },
      { id: 'p2', nome: 'PROFESSOR', permissoes: [] },
    ])
    expect(resumo).toContain('Monitor')
    expect(resumo).toContain('Professor')
  })
})

describe('formatarDiaDaEscola', () => {
  it('escreve dd/mm/aaaa', () => {
    expect(formatarDiaDaEscola(new Date('2026-09-10T15:00:00Z'))).toBe('10/09/2026')
  })

  it('usa o fuso da ESCOLA, não o do processo', () => {
    // 01:00 UTC do dia 11 ainda é dia 10 em São Paulo. Formatar pelo dia
    // UTC diria à coordenação que a conta nasceu num dia em que a
    // secretaria estava fechada.
    expect(formatarDiaDaEscola(new Date('2026-09-11T01:00:00Z'))).toBe('10/09/2026')
  })
})

describe('montarContas', () => {
  const usuario = (extra: Partial<UsuarioNaTela> = {}): UsuarioNaTela => ({
    id: 'usr_bib',
    nome: 'Bibliotecária',
    email: 'bib@escola.br',
    ativo: true,
    criadoEm: new Date('2026-02-03T15:00:00Z'),
    papeis: [{ id: 'pap_bib', nome: 'BIBLIOTECARIO', permissoes: ['emprestimo:criar'] }],
    permissoes: ['emprestimo:criar'],
    unicoAdministrador: false,
    ...extra,
  })

  it('traduz papel, data e motivo de bloqueio de uma vez', () => {
    const [conta] = montarContas([usuario()], 'usr_coord')

    expect(conta!.resumoDoPapel).toBe('Bibliotecária ou bibliotecário')
    expect(conta!.criadaEm).toBe('03/02/2026')
    expect(conta!.motivoParaNaoDesativar).toBeNull()
    expect(conta!.papelId).toBe('pap_bib')
  })

  it('a própria conta de quem está olhando vem marcada', () => {
    const [conta] = montarContas([usuario({ id: 'usr_coord' })], 'usr_coord')

    expect(conta!.souEu).toBe(true)
    expect(conta!.motivoParaNaoDesativar).toMatch(/própria conta/i)
  })

  it('conta sem papel tem papelId nulo, e a tela sabe dizer isso', () => {
    const [conta] = montarContas([usuario({ papeis: [], permissoes: [] })], 'usr_coord')

    expect(conta!.papelId).toBeNull()
    expect(conta!.resumoDoPapel).toBe('sem papel')
  })

  it('NÃO carrega senhaHash nem nada além do que a tela desenha', () => {
    const [conta] = montarContas([usuario()], 'usr_coord')

    expect(Object.keys(conta!).sort()).toEqual([
      'ativo',
      'criadaEm',
      'email',
      'id',
      'motivoParaNaoDesativar',
      'nome',
      'papelId',
      'resumoDoPapel',
      'souEu',
      'unicoAdministrador',
    ])
  })
})
