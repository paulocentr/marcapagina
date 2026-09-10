'use client'

import { useEffect, useState } from 'react'
import { Cartao } from '@/components/ui/cartao'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Celula, CelulaDeTitulo, Tabela } from '@/components/ui/tabela'
import { sugestaoDeCompraAction, type LinhaDeCompraNaTela } from './actions'

/**
 * Passo 3 — sugestão de compra.
 *
 * Os títulos que os alunos pediram e a biblioteca NÃO tem, agrupados pelo
 * título normalizado: "o pequeno principe" e "O Pequeno Príncipe" são o
 * mesmo pedido de compra.
 *
 * O número da frente é o de ALUNOS DISTINTOS, e não o de pedidos, porque
 * é esse que a coordenação leva à direção: um aluno pedindo três vezes
 * não são três pessoas querendo o livro. Os dois números aparecem, e
 * rotulados, para ninguém confundir um com o outro na reunião.
 */
export function SugestaoDeCompra() {
  const [linhas, setLinhas] = useState<LinhaDeCompraNaTela[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true

    void sugestaoDeCompraAction().then((resposta) => {
      if (!ativo) return
      if (resposta.ok) setLinhas(resposta.linhas)
      else setErro(resposta.erro)
    })

    return () => {
      ativo = false
    }
  }, [])

  if (erro !== null) return <Faixa tom="erro">{erro}</Faixa>

  if (linhas === null) {
    return <p className="text-[13.5px] text-tinta-2">Contando os pedidos…</p>
  }

  if (linhas.length === 0) {
    return (
      <Faixa tom="atencao" icone="info" titulo="Nenhum pedido de livro fora do acervo.">
        Esta lista enche sozinha: sempre que um aluno pede um título que a biblioteca não tem,
        ele aparece aqui com a contagem de quem mais pediu.
      </Faixa>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Cartao semPadding>
        <div className="border-b border-linha bg-papel-2 px-[22px] py-[18px]">
          <h2 className="font-serif text-[19px] font-semibold text-tinta">Sugestão de compra</h2>
          <p className="mt-[3px] text-[13px] text-tinta-2">
            Títulos que os alunos pediram e a biblioteca não tem, reunidos por título — grafias
            diferentes contam como o mesmo pedido.
          </p>
        </div>

        <div className="overflow-x-auto px-[22px] py-[18px]">
          <Tabela>
            <thead>
              <tr>
                <CelulaDeTitulo>Título pedido</CelulaDeTitulo>
                <CelulaDeTitulo className="text-right">Alunos diferentes</CelulaDeTitulo>
                <CelulaDeTitulo className="text-right">Pedidos</CelulaDeTitulo>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.tituloNormalizado}>
                  <Celula className="text-[14.5px] font-medium">{linha.titulo}</Celula>
                  <Celula className="text-right">
                    <strong className="font-mono text-base">{linha.alunos}</strong>
                  </Celula>
                  <Celula className="text-right text-tinta-2">
                    <span className="font-mono">{linha.pedidos}</span>
                  </Celula>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </div>
      </Cartao>

      <p className="flex items-start gap-[10px] px-1 text-[13px] text-tinta-2">
        <span className="mt-px shrink-0 text-tinta-3">
          <Icone nome="info" tamanho={16} traco={1.6} />
        </span>
        <span>
          É o argumento da verba: não “os alunos queriam mais livros”, mas{' '}
          <strong>{linhas[0]!.pedidos} pedidos</strong> de{' '}
          <strong>{linhas[0]!.alunos} alunos diferentes</strong> pelo mesmo título —{' '}
          {linhas[0]!.titulo}.
        </span>
      </p>
    </div>
  )
}
