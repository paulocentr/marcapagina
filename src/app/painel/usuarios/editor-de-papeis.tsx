'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactElement } from 'react'
import { Botao } from '@/components/ui/botao'
import { Cartao, CabecalhoDeCartao } from '@/components/ui/cartao'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import type { Permissao } from '@/core/rbac/permissoes'
import { definirPermissoesAction } from './actions'
import { GRUPOS_DE_PERMISSAO, ROTULOS_DE_PERMISSAO } from './usuarios-na-tela'

export interface PapelParaEditar {
  id: string
  nomeNaTela: string
  descricao: string | null
  permissoes: Permissao[]
  quantidadeDeUsuarios: number
}

/**
 * O editor de papéis.
 *
 * Um papel por vez, e as permissões agrupadas pelo TRABALHO — "Balcão",
 * "Acervo" — e não pelo prefixo técnico: quem monta um papel está
 * pensando "a monitora atende o balcão e não mexe em cadastro".
 *
 * Salvar manda a lista COMPLETA de marcadas, não um delta. Um delta
 * aplicado sobre um papel que outra pessoa editou no meio produziria um
 * papel que ninguém montou.
 *
 * O grupo "Administração da escola" leva aviso permanente: tirar
 * `usuario:gerenciar` e `papel:gerenciar` de todo mundo tranca a escola
 * fora da própria administração. O serviço RECUSA — este aviso existe
 * para a recusa não ser surpresa depois de a coordenação desmarcar
 * quinze caixas.
 */
export function EditorDePapeis({ papeis }: { papeis: PapelParaEditar[] }): ReactElement {
  const [abertoId, setAbertoId] = useState<string | null>(null)

  return (
    <Cartao semPadding>
      <CabecalhoDeCartao>
        <span className="text-marca">
          <Icone nome="ajustes" tamanho={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-semibold text-tinta">Papéis e permissões</h2>
          <p className="text-[12.5px] text-tinta-2">
            O que cada papel pode fazer. Mudar aqui vale na hora para todas as contas que o
            carregam.
          </p>
        </div>
      </CabecalhoDeCartao>

      <ul className="flex flex-col">
        {papeis.map((papel) => (
          <li key={papel.id} className="border-b border-linha last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] py-[14px]">
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-tinta">{papel.nomeNaTela}</div>
                <div className="text-[12.5px] text-tinta-2">
                  {papel.quantidadeDeUsuarios === 1
                    ? '1 conta'
                    : `${papel.quantidadeDeUsuarios} contas`}{' '}
                  · {papel.permissoes.length} permissão(ões)
                </div>
              </div>

              <Botao
                type="button"
                variante="secundaria"
                icone="ajustes"
                onClick={() => setAbertoId(abertoId === papel.id ? null : papel.id)}
              >
                {abertoId === papel.id ? 'Fechar' : 'Editar permissões'}
              </Botao>
            </div>

            {abertoId === papel.id && (
              // `key` no id do papel: sem ela, abrir outro papel
              // reaproveitaria o estado das caixas do anterior e a
              // coordenação salvaria as permissões do papel errado.
              <FormularioDoPapel
                key={papel.id}
                papel={papel}
                aoSalvar={() => setAbertoId(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </Cartao>
  )
}

function FormularioDoPapel({
  papel,
  aoSalvar,
}: {
  papel: PapelParaEditar
  aoSalvar: () => void
}): ReactElement {
  const router = useRouter()
  const [emCurso, comecar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [marcadas, setMarcadas] = useState<Set<Permissao>>(new Set(papel.permissoes))

  function alternar(permissao: Permissao) {
    setMarcadas((anterior) => {
      const proximo = new Set(anterior)
      if (proximo.has(permissao)) proximo.delete(permissao)
      else proximo.add(permissao)
      return proximo
    })
  }

  function salvar() {
    setErro(null)
    comecar(async () => {
      const resposta = await definirPermissoesAction(papel.id, [...marcadas])
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      // As contagens do cartão e as permissões de cada conta são lidas no
      // servidor: sem recarregar, a tela continuaria mostrando o papel
      // como ele era antes de salvar.
      router.refresh()
      aoSalvar()
    })
  }

  return (
    <div className="border-t border-linha bg-papel-2 px-[22px] py-5">
      {papel.descricao !== null && (
        <p className="mb-4 max-w-[720px] text-[13px] text-tinta-2">{papel.descricao}</p>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {GRUPOS_DE_PERMISSAO.map((grupo) => (
          <section key={grupo.titulo} className="flex flex-col gap-[9px]">
            <div>
              <Rotulo tom="discreto">{grupo.titulo}</Rotulo>
              <p className="mt-[2px] text-[12px] text-tinta-3">{grupo.explicacao}</p>
            </div>

            <div className="flex flex-col gap-[7px]">
              {grupo.permissoes.map((permissao) => (
                <label
                  key={permissao}
                  className="flex cursor-pointer items-start gap-[8px] text-[13px] text-tinta"
                >
                  <input
                    type="checkbox"
                    className="mt-[2px] h-[15px] w-[15px] shrink-0 accent-marca"
                    checked={marcadas.has(permissao)}
                    disabled={emCurso}
                    onChange={() => alternar(permissao)}
                  />
                  <span>{ROTULOS_DE_PERMISSAO[permissao]}</span>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <Faixa tom="atencao" icone="info" titulo="Duas permissões não têm volta pela tela.">
          Se nenhuma conta ativa ficar com{' '}
          <strong>criar, desativar e trocar o papel das contas</strong> e{' '}
          <strong>editar as permissões dos papéis</strong>, ninguém da escola consegue mais
          arrumar isso daqui. O sistema recusa a mudança que levaria a esse ponto.
        </Faixa>

        {erro !== null && <Faixa tom="erro">{erro}</Faixa>}

        <div className="flex items-center gap-[8px]">
          <Botao type="button" icone="check" onClick={salvar} disabled={emCurso}>
            {emCurso ? 'Salvando…' : `Salvar ${papel.nomeNaTela}`}
          </Botao>
          <Botao type="button" variante="fantasma" onClick={aoSalvar} disabled={emCurso}>
            Cancelar
          </Botao>
        </div>
      </div>
    </div>
  )
}
