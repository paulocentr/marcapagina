'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactElement } from 'react'
import { Botao } from '@/components/ui/botao'
import { Cartao, CabecalhoDeCartao } from '@/components/ui/cartao'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { classesDeCampo } from '@/components/ui/campo'
import { Celula, CelulaDeTitulo, Tabela } from '@/components/ui/tabela'
import { definirSituacaoAction, trocarPapelAction } from './actions'
import { descreverConta } from './usuarios-na-tela'
import type { ContaNaTela } from './usuarios-na-tela'
import type { OpcaoDePapel } from './formulario-de-nova-conta'

/**
 * As contas da equipe, uma por linha.
 *
 * Três coisas acontecem aqui, e todas recarregam a tela: trocar o papel,
 * desativar e reativar. Recarregam porque a lista mostra o aviso de
 * "única conta que administra a escola", e esse aviso é sobre o CONJUNTO
 * — trocar o papel de uma linha muda o que a tela deve dizer em outra.
 *
 * O botão de desativar vem desligado, com o motivo escrito ao lado,
 * quando o serviço já sabe que vai recusar. Isso é cortesia, não
 * autorização: quem recusa é `definirSituacaoDoUsuario`, e a Server
 * Action é alcançável sem passar por este botão.
 */
export function ListaDeContas({
  contas,
  papeis,
}: {
  contas: ContaNaTela[]
  papeis: OpcaoDePapel[]
}): ReactElement {
  const [erro, setErro] = useState<string | null>(null)

  return (
    <Cartao semPadding>
      <CabecalhoDeCartao>
        <span className="text-marca">
          <Icone nome="pessoas" tamanho={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-semibold text-tinta">Contas da equipe</h2>
          <p className="text-[12.5px] text-tinta-2">
            {contas.length === 1 ? '1 conta' : `${contas.length} contas`} ·{' '}
            {contas.filter((c) => c.ativo).length} ativa(s)
          </p>
        </div>
      </CabecalhoDeCartao>

      <div className="px-[22px] py-5">
        {erro !== null && (
          <div className="mb-4">
            <Faixa tom="erro">{erro}</Faixa>
          </div>
        )}

        {/* A tabela pode ficar mais larga que a coluna em tela estreita; o
            scroll é DELA, não da página. */}
        <div className="overflow-x-auto">
          <Tabela>
            <thead>
              <tr>
                <CelulaDeTitulo>Pessoa</CelulaDeTitulo>
                <CelulaDeTitulo>Papel</CelulaDeTitulo>
                <CelulaDeTitulo>Situação</CelulaDeTitulo>
                <CelulaDeTitulo className="text-right">Ações</CelulaDeTitulo>
              </tr>
            </thead>
            <tbody>
              {contas.map((conta) => (
                <LinhaDaConta
                  key={conta.id}
                  conta={conta}
                  papeis={papeis}
                  aoFalhar={setErro}
                  aoComecar={() => setErro(null)}
                />
              ))}
            </tbody>
          </Tabela>
        </div>
      </div>
    </Cartao>
  )
}

function LinhaDaConta({
  conta,
  papeis,
  aoFalhar,
  aoComecar,
}: {
  conta: ContaNaTela
  papeis: OpcaoDePapel[]
  aoFalhar: (erro: string) => void
  aoComecar: () => void
}): ReactElement {
  const router = useRouter()
  const [emCurso, comecar] = useTransition()
  const situacao = descreverConta(conta.ativo)

  function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    aoComecar()
    comecar(async () => {
      const resposta = await acao()
      if (!resposta.ok) {
        aoFalhar(resposta.erro)
        return
      }
      // A lista inteira é lida no servidor: sem recarregar, o aviso de
      // "única conta que administra a escola" continuaria apontando para
      // a linha errada.
      router.refresh()
    })
  }

  return (
    <tr>
      <Celula>
        <div className="font-semibold text-tinta">
          {conta.nome}
          {conta.souEu && <span className="ml-[6px] text-[12px] text-tinta-3">(você)</span>}
        </div>
        <div className="text-[12.5px] text-tinta-2">{conta.email}</div>
        <div className="text-[12px] text-tinta-3">criada em {conta.criadaEm}</div>
      </Celula>

      <Celula>
        <label className="sr-only" htmlFor={`papel-${conta.id}`}>
          Papel de {conta.nome}
        </label>
        <select
          id={`papel-${conta.id}`}
          className={`${classesDeCampo()} min-w-[190px]`}
          value={conta.papelId ?? ''}
          disabled={emCurso}
          onChange={(evento) => {
            const papelId = evento.target.value
            if (papelId === '' || papelId === conta.papelId) return
            executar(() => trocarPapelAction(conta.id, papelId))
          }}
        >
          {conta.papelId === null && (
            <option value="" disabled>
              sem papel
            </option>
          )}
          {papeis.map((papel) => (
            <option key={papel.id} value={papel.id}>
              {papel.nomeNaTela}
            </option>
          ))}
        </select>
        <div className="mt-[3px] text-[12px] text-tinta-3">{conta.resumoDoPapel}</div>
      </Celula>

      <Celula>
        {/* Palavra E ícone. "Ativa/Desativada" não existe no catálogo de
            `estados.ts` — que fala de exemplar e de leitor, não de conta —,
            então a dupla é montada em `usuarios-na-tela.ts`, onde um teste
            de unidade confere que nenhum dos dois estados ficou só com cor. */}
        <span className={`inline-flex items-center gap-[5px] text-[13px] ${situacao.cor}`}>
          <Icone nome={situacao.icone} tamanho={14} traco={2.2} />
          {situacao.palavra}
        </span>

        {conta.unicoAdministrador && (
          <div className="mt-[3px] text-[12px] text-atencao-texto">
            única conta que administra a escola
          </div>
        )}
      </Celula>

      <Celula className="text-right">
        {conta.ativo ? (
          <div className="flex flex-col items-end gap-[5px]">
            <Botao
              type="button"
              variante="perigo"
              icone="xis"
              disabled={emCurso || conta.motivoParaNaoDesativar !== null}
              onClick={() => executar(() => definirSituacaoAction(conta.id, false))}
            >
              {emCurso ? 'Aguarde…' : 'Desativar'}
            </Botao>

            {conta.motivoParaNaoDesativar !== null && (
              <p className="max-w-[280px] text-right text-[12px] text-tinta-2">
                {conta.motivoParaNaoDesativar}
              </p>
            )}
          </div>
        ) : (
          <Botao
            type="button"
            variante="secundaria"
            icone="check"
            disabled={emCurso}
            onClick={() => executar(() => definirSituacaoAction(conta.id, true))}
          >
            {emCurso ? 'Aguarde…' : 'Reativar'}
          </Botao>
        )}
      </Celula>
    </tr>
  )
}
