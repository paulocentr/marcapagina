import { describe, it, expect } from 'vitest'
import { ehOItemAtivo } from '@/components/painel/item-ativo'

const MENU = [
  { href: '/painel' },
  { href: '/painel/balcao' },
  { href: '/painel/acervo' },
  { href: '/painel/acervo/novo' },
]

describe('ehOItemAtivo', () => {
  it('acende o item da própria tela', () => {
    expect(ehOItemAtivo('/painel/balcao', '/painel/balcao', MENU)).toBe(true)
    expect(ehOItemAtivo('/painel/acervo', '/painel/balcao', MENU)).toBe(false)
  })

  it('acende só o item mais específico quando um caminho é filho do outro', () => {
    // Em /painel/acervo/novo, "Acervo" e "Catalogar" ambos casam. Acender
    // os dois faria a barra à esquerda parar de dizer onde a operadora está.
    expect(ehOItemAtivo('/painel/acervo/novo', '/painel/acervo/novo', MENU)).toBe(true)
    expect(ehOItemAtivo('/painel/acervo', '/painel/acervo/novo', MENU)).toBe(false)
  })

  it('a raiz do painel não fica acesa em toda tela filha', () => {
    // /painel casa com tudo por prefixo; sem a regra do mais longo, o
    // item "Painel" ficaria aceso no balcão e no acervo ao mesmo tempo.
    expect(ehOItemAtivo('/painel', '/painel/acervo', MENU)).toBe(false)
    expect(ehOItemAtivo('/painel', '/painel', MENU)).toBe(true)
  })

  it('acende o pai numa tela filha que não é item do menu', () => {
    // A ficha da obra (/painel/acervo/<id>) não tem item próprio: quem
    // acende é Acervo, senão a navegação fica toda apagada.
    expect(ehOItemAtivo('/painel/acervo', '/painel/acervo/abc123', MENU)).toBe(true)
    expect(ehOItemAtivo('/painel/acervo/novo', '/painel/acervo/abc123', MENU)).toBe(false)
  })

  it('não confunde prefixo de texto com caminho filho', () => {
    expect(ehOItemAtivo('/painel/acervo', '/painel/acervoteca', MENU)).toBe(false)
  })

  it('sem caminho conhecido, nada acende', () => {
    expect(ehOItemAtivo('/painel', null, MENU)).toBe(false)
    expect(ehOItemAtivo('/painel', '/entrar', MENU)).toBe(false)
  })
})
