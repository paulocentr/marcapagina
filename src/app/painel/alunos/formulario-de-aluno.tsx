'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Botao } from '@/components/ui/botao'
import { CampoComRotulo } from '@/components/ui/campo'
import { Cartao } from '@/components/ui/cartao'
import { Faixa } from '@/components/ui/faixa'
import { Rotulo } from '@/components/ui/rotulo'
import { rotuloDaSerie } from '@/modules/leitores/serie'
import { criarAlunoAction, editarAlunoAction, type EntradaDeAlunoNaTela } from './actions'

export interface TurmaParaEscolher {
  id: string
  nome: string
  serie: string
  ano: number
}

/** O que a tela de edição preenche. Sem a data — ver a nota abaixo. */
export interface AlunoParaEditar {
  id: string
  matricula: string
  nome: string
  turmaId: string
  responsavelNome: string
  responsavelEmail: string
  responsavelTelefone: string
}

const VAZIO: EntradaDeAlunoNaTela = {
  matricula: '',
  nome: '',
  dataNascimento: '',
  turmaId: '',
  responsavelNome: '',
  responsavelEmail: '',
  responsavelTelefone: '',
}

/**
 * O formulário de aluno, usado no cadastro E na edição.
 *
 * ─── Por que a data de nascimento é tratada como senha ──────────────
 *
 * O aluno entra no portal com matrícula + data de nascimento (decisão 3).
 * Então, na EDIÇÃO, o campo abre em branco e branco significa "não
 * mexa" — exatamente como um campo de senha em qualquer tela de perfil.
 * A alternativa (trazer a data do servidor para preencher o campo) mandaria
 * a credencial de um menor de idade para o navegador em toda abertura da
 * tela, para que na maioria das vezes ela nem fosse editada.
 *
 * No CADASTRO ela é obrigatória, porque sem ela o aluno não consegue
 * entrar no portal — e ninguém descobriria isso até ele tentar.
 *
 * ─── A série não aparece aqui ───────────────────────────────────────
 *
 * O aluno herda a série da TURMA. Um campo de série no aluno criaria uma
 * segunda fonte da verdade que sai de sincronia com a turma na primeira
 * mudança — e é a série que o Carrinho e a configuração de circulação
 * leem. Por isso a turma traz a série escrita ao lado do nome no
 * `select`: é assim que a operadora confere que escolheu a certa.
 */
export function FormularioDeAluno({
  turmas,
  aluno,
}: {
  turmas: TurmaParaEscolher[]
  /** Ausente = cadastro novo. Presente = edição. */
  aluno?: AlunoParaEditar
}) {
  const router = useRouter()
  const editando = aluno !== undefined

  const [dados, setDados] = useState<EntradaDeAlunoNaTela>(
    aluno
      ? {
          matricula: aluno.matricula,
          nome: aluno.nome,
          // Em branco de propósito. Ver a nota do topo.
          dataNascimento: '',
          turmaId: aluno.turmaId,
          responsavelNome: aluno.responsavelNome,
          responsavelEmail: aluno.responsavelEmail,
          responsavelTelefone: aluno.responsavelTelefone,
        }
      : VAZIO,
  )
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const campoDeMatricula = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // O cursor começa na matrícula: é o primeiro campo que a operadora
    // digita, e é o que ela tem na mão (a lista da secretaria).
    campoDeMatricula.current?.focus()
  }, [])

  function alterar(campo: keyof EntradaDeAlunoNaTela, valor: string) {
    setDados((atual) => ({ ...atual, [campo]: valor }))
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setSalvo(null)
    setOcupado(true)

    try {
      const resposta = editando
        ? await editarAlunoAction(aluno.id, dados)
        : await criarAlunoAction(dados)

      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      if (editando) {
        setSalvo(`${resposta.nome} salvo.`)
        // A ficha ao lado mostra turma e situação, e as duas podem ter
        // mudado. Recarregar o servidor é o que a mantém verdadeira —
        // remendar na tela faria a próxima edição decidir sobre número
        // que ninguém confirmou.
        router.refresh()
        return
      }

      // Cadastro em série: o formulário se esvazia e o cursor volta para
      // a matrícula, para a operadora digitar a lista da secretaria sem
      // navegar menu entre um aluno e o próximo. A turma escolhida FICA —
      // uma lista de alunos é quase sempre de uma turma só.
      setSalvo(`${resposta.nome} cadastrado. Pode digitar o próximo.`)
      setDados({ ...VAZIO, turmaId: dados.turmaId })
      campoDeMatricula.current?.focus()
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form onSubmit={salvar}>
      <Cartao>
        <div className="grid gap-[14px] sm:grid-cols-2">
          <CampoComRotulo
            ref={campoDeMatricula}
            id="aluno-matricula"
            rotulo="Matrícula"
            dica="o número da carteirinha, sem espaço"
            value={dados.matricula}
            onChange={(evento) => alterar('matricula', evento.target.value)}
            className="font-mono"
            autoComplete="off"
            required
          />

          <CampoComRotulo
            id="aluno-nascimento"
            rotulo={editando ? 'Data de nascimento' : 'Data de nascimento'}
            dica={
              editando
                ? 'em branco mantém a atual — é a senha do portal'
                : 'aaaa-mm-dd ou dd/mm/aaaa'
            }
            value={dados.dataNascimento}
            onChange={(evento) => alterar('dataNascimento', evento.target.value)}
            className="font-mono"
            autoComplete="off"
            placeholder={editando ? '••••••••••' : 'aaaa-mm-dd'}
            required={!editando}
          />

          <div className="sm:col-span-2">
            <CampoComRotulo
              id="aluno-nome"
              rotulo="Nome completo"
              value={dados.nome}
              onChange={(evento) => alterar('nome', evento.target.value)}
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="aluno-turma" className="mb-[7px] block">
              <Rotulo>Turma</Rotulo>
            </label>
            <select
              id="aluno-turma"
              value={dados.turmaId}
              onChange={(evento) => alterar('turmaId', evento.target.value)}
              className="h-10 w-full rounded-controle border border-linha-2 bg-superficie px-3 text-sm text-tinta focus:border-marca focus:ring-[3px] focus:ring-marca/15 focus:outline-none"
            >
              {/* Aluno sem turma é legítimo: ele chega antes de a turma
                  dele existir, e obrigar a escolha faria a operadora
                  inventar uma turma para conseguir cadastrar. */}
              <option value="">— sem turma —</option>
              {turmas.map((turma) => (
                <option key={turma.id} value={turma.id}>
                  {turma.nome} · {rotuloDaSerie(turma.serie)} · {turma.ano}
                </option>
              ))}
            </select>
            {turmas.length === 0 && (
              <span className="mt-[7px] block text-xs text-tinta-2">
                Nenhuma turma cadastrada ainda. O aluno pode ser cadastrado sem turma e
                receber a dele depois.
              </span>
            )}
          </div>
        </div>

        <div className="mt-6 border-t border-linha pt-5">
          <Rotulo tom="discreto">Responsável (opcional)</Rotulo>
          <div className="mt-[10px] grid gap-[14px] sm:grid-cols-3">
            <CampoComRotulo
              id="aluno-responsavel-nome"
              rotulo="Nome"
              value={dados.responsavelNome}
              onChange={(evento) => alterar('responsavelNome', evento.target.value)}
            />
            <CampoComRotulo
              id="aluno-responsavel-email"
              rotulo="E-mail"
              type="email"
              value={dados.responsavelEmail}
              onChange={(evento) => alterar('responsavelEmail', evento.target.value)}
            />
            <CampoComRotulo
              id="aluno-responsavel-telefone"
              rotulo="Telefone"
              value={dados.responsavelTelefone}
              onChange={(evento) => alterar('responsavelTelefone', evento.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-[10px] border-t border-linha pt-5">
          <Botao type="submit" tamanho="grande" disabled={ocupado}>
            {editando ? 'Salvar alterações' : 'Cadastrar e próximo'}
          </Botao>
          <p className="ml-auto max-w-[340px] text-right text-[12.5px] text-tinta-2">
            A data de nascimento é a senha do aluno no portal. Ela não aparece em
            nenhuma lista desta tela.
          </p>
        </div>
      </Cartao>

      {/* Um recado por vez: erro e sucesso nunca são verdade juntos, e
          duas regiões `alert` sobrepostas fazem o leitor de tela
          atropelar uma com a outra. */}
      {erro !== null ? (
        <Faixa tom="erro" titulo={erro} className="mt-4" />
      ) : (
        salvo !== null && <Faixa tom="sucesso" titulo={salvo} className="mt-4" />
      )}
    </form>
  )
}
