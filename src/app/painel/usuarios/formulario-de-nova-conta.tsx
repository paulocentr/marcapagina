'use client'

import { useActionState, useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { Botao } from '@/components/ui/botao'
import { CampoComRotulo, classesDeCampo } from '@/components/ui/campo'
import { Cartao, CabecalhoDeCartao } from '@/components/ui/cartao'
import { Faixa } from '@/components/ui/faixa'
import { Icone } from '@/components/ui/icones'
import { Rotulo } from '@/components/ui/rotulo'
import { criarContaAction, ESTADO_INICIAL_DA_NOVA_CONTA } from './actions'

export interface OpcaoDePapel {
  id: string
  /** Já traduzido para a tela — a coordenação não lê CAIXA_ALTA. */
  nomeNaTela: string
  descricao: string | null
}

/**
 * Criar a conta de alguém da equipe.
 *
 * O papel é obrigatório e não tem padrão selecionado: um padrão silencioso
 * aqui daria à monitora as permissões de quem estiver no topo da lista.
 * A descrição do papel escolhido aparece embaixo do campo, porque
 * "MONITOR" não diz a ninguém o que a pessoa vai poder fazer.
 *
 * A senha é digitada pela coordenação e entregue à pessoa. Não há
 * recuperação de senha nesta tela: se ela for perdida, a coordenação
 * desativa a conta e cria outra — e a auditoria mostra as duas.
 */
export function FormularioDeNovaConta({ papeis }: { papeis: OpcaoDePapel[] }): ReactElement {
  const [estado, acao, pendente] = useActionState(criarContaAction, ESTADO_INICIAL_DA_NOVA_CONTA)
  const formulario = useRef<HTMLFormElement>(null)

  useEffect(() => {
    // Limpa o formulário só depois do SUCESSO. Limpar sempre apagaria o
    // nome e o e-mail que a coordenação acabou de digitar por causa de uma
    // senha curta, e ela teria de escrever tudo de novo.
    if (estado.criada !== null) formulario.current?.reset()
  }, [estado.criada])

  return (
    <Cartao semPadding>
      <CabecalhoDeCartao>
        <span className="text-marca">
          <Icone nome="mais" tamanho={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-base font-semibold text-tinta">Nova conta</h2>
          <p className="text-[12.5px] text-tinta-2">
            Cada pessoa com a sua — é o nome dela que fica no histórico
          </p>
        </div>
      </CabecalhoDeCartao>

      <form ref={formulario} action={acao} className="flex flex-col gap-4 px-[22px] py-5">
        <CampoComRotulo
          id="nova-conta-nome"
          rotulo="Nome"
          name="nome"
          required
          autoComplete="off"
          dica="Como deve aparecer na auditoria de cada empréstimo."
        />

        <CampoComRotulo
          id="nova-conta-email"
          rotulo="E-mail"
          name="email"
          type="email"
          required
          autoComplete="off"
        />

        <CampoComRotulo
          id="nova-conta-senha"
          rotulo="Senha"
          name="senha"
          type="password"
          required
          autoComplete="new-password"
          dica="Pelo menos 10 caracteres. Anote e entregue à pessoa — esta tela não a mostra de novo."
        />

        <div className="flex flex-col gap-[7px]">
          <label htmlFor="nova-conta-papel">
            <Rotulo>Papel</Rotulo>
          </label>

          {/*
            Sem opção pré-selecionada de propósito: um padrão silencioso
            aqui concede as permissões do primeiro papel da lista a quem a
            coordenação nem olhou.
          */}
          <select
            id="nova-conta-papel"
            name="papelId"
            required
            defaultValue=""
            className={classesDeCampo()}
          >
            <option value="" disabled>
              Escolha o papel…
            </option>
            {papeis.map((papel) => (
              <option key={papel.id} value={papel.id}>
                {papel.nomeNaTela}
              </option>
            ))}
          </select>

          <span className="text-xs text-tinta-2">
            O papel decide o que a pessoa vê e faz. Dá para trocar depois, na lista ao lado.
          </span>
        </div>

        {estado.erro !== null && <Faixa tom="erro">{estado.erro}</Faixa>}

        {estado.criada !== null && (
          <Faixa tom="sucesso" titulo={`Conta de ${estado.criada} criada.`}>
            Entregue a senha à pessoa e peça que ela entre pelo endereço da equipe.
          </Faixa>
        )}

        <Botao type="submit" disabled={pendente} icone="mais">
          {pendente ? 'Criando…' : 'Criar conta'}
        </Botao>
      </form>
    </Cartao>
  )
}
