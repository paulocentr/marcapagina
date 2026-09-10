'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buscarLeitorAction,
  emprestarAction,
  devolverAction,
  type LeitorDaTela,
} from './actions'
import type { Bloqueio } from '@/modules/circulacao/bloqueios'
import type { EstadoDeConservacao } from '@/modules/acervo/exemplares.service'

type Aba = 'emprestar' | 'devolver'

const ESTADOS: { valor: EstadoDeConservacao; rotulo: string }[] = [
  { valor: 'BOM', rotulo: 'Bom' },
  { valor: 'NOVO', rotulo: 'Novo' },
  { valor: 'DESGASTADO', rotulo: 'Desgastado' },
  { valor: 'DANIFICADO', rotulo: 'Danificado' },
]

export default function PaginaDoBalcao() {
  const [aba, setAba] = useState<Aba>('emprestar')

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Balcão</h1>
        <Link href="/painel" className="text-sm underline">
          Painel
        </Link>
      </header>

      <div className="mb-6 flex gap-2" role="tablist">
        {(['emprestar', 'devolver'] as const).map((valor) => (
          <button
            key={valor}
            role="tab"
            aria-selected={aba === valor}
            onClick={() => setAba(valor)}
            className={`rounded px-4 py-2 ${
              aba === valor ? 'bg-neutral-900 text-white' : 'border border-neutral-300'
            }`}
          >
            {valor === 'emprestar' ? 'Emprestar' : 'Devolver'}
          </button>
        ))}
      </div>

      {aba === 'emprestar' ? <Emprestar /> : <Devolver />}
    </main>
  )
}

function Emprestar() {
  const [matricula, setMatricula] = useState('')
  const [leitor, setLeitor] = useState<LeitorDaTela | null>(null)
  const [tombo, setTombo] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [bloqueiosDaRecusa, setBloqueiosDaRecusa] = useState<Bloqueio[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const campoDeMatricula = useRef<HTMLInputElement>(null)
  const campoDeTombo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    campoDeMatricula.current?.focus()
  }, [])

  // Depois de emprestar, volta para a matrícula: o próximo aluno da fila
  // é sempre outro. Voltar para o tombo obrigaria a operadora a tirar a
  // mão do teclado para recomeçar (spec §5.1).
  const recomecar = useCallback(() => {
    setLeitor(null)
    setMatricula('')
    setTombo('')
    setJustificativa('')
    setBloqueiosDaRecusa(null)
    campoDeMatricula.current?.focus()
  }, [])

  async function buscar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setAviso(null)
    setOcupado(true)
    try {
      const resposta = await buscarLeitorAction(matricula)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }
      setLeitor(resposta.leitor)
      // O cursor pula direto para o tombo: a operadora já pode passar o
      // leitor de código de barras no livro sem tocar no mouse.
      setTimeout(() => campoDeTombo.current?.focus(), 0)
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!leitor) return
    setErro(null)
    setAviso(null)
    setOcupado(true)
    try {
      const resposta = await emprestarAction({
        alunoId: leitor.id,
        tombo,
        justificativa: justificativa.trim() || undefined,
      })

      if (!resposta.ok) {
        setErro(resposta.erro)
        setBloqueiosDaRecusa(resposta.bloqueios ?? null)
        return
      }

      setAviso(
        `Tombo ${resposta.tombo} emprestado a ${leitor.nome}. ` +
          `Devolver até ${resposta.previstaPara}.` +
          (resposta.forcado ? ' Liberação registrada na auditoria.' : ''),
      )
      recomecar()
    } finally {
      setOcupado(false)
    }
  }

  const precisaJustificar =
    (leitor?.bloqueios.length ?? 0) > 0 || (bloqueiosDaRecusa?.length ?? 0) > 0

  return (
    <>
      <form onSubmit={buscar} className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Matrícula do aluno</span>
          <input
            ref={campoDeMatricula}
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            autoComplete="off"
            inputMode="numeric"
            className="rounded border border-neutral-300 px-3 py-2 text-lg"
          />
        </label>
        <button
          type="submit"
          disabled={ocupado || matricula.trim().length === 0}
          className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-60"
        >
          Buscar
        </button>
      </form>

      <Mensagens erro={erro} aviso={aviso} />

      {leitor && (
        <section className="mt-6">
          <h2 className="text-lg font-medium">
            {leitor.nome}
            {leitor.turma && <span className="text-neutral-600"> · {leitor.turma}</span>}
          </h2>
          <p className="text-sm text-neutral-600">
            {leitor.emprestimosAtivos} de {leitor.limiteDaSerie} livro(s) em mãos
          </p>

          {/* Os bloqueios aparecem ANTES do campo do livro. Achar o livro e
              só então descobrir a suspensão é trabalho desfeito na frente
              do aluno (spec §5.1). */}
          {leitor.bloqueios.length > 0 && (
            <ul role="alert" className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {leitor.bloqueios.map((bloqueio) => (
                <li key={bloqueio.tipo}>{bloqueio.mensagem}</li>
              ))}
            </ul>
          )}

          <form onSubmit={confirmar} className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Tombo do livro</span>
              <input
                ref={campoDeTombo}
                value={tombo}
                onChange={(e) => setTombo(e.target.value)}
                autoComplete="off"
                className="rounded border border-neutral-300 px-3 py-2 text-lg"
              />
            </label>

            {precisaJustificar && (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Justificativa para liberar</span>
                <input
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  className="rounded border border-neutral-300 px-3 py-2"
                />
                <span className="text-xs text-neutral-500">
                  Obrigatória para emprestar sobre um bloqueio. Fica registrada na auditoria.
                </span>
              </label>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={ocupado || tombo.trim().length === 0}
                className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-60"
              >
                Confirmar empréstimo
              </button>
              <button
                type="button"
                onClick={recomecar}
                className="rounded border border-neutral-300 px-4 py-2"
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  )
}

function Devolver() {
  const [tombo, setTombo] = useState('')
  const [estado, setEstado] = useState<EstadoDeConservacao>('BOM')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const campoDeTombo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    campoDeTombo.current?.focus()
  }, [])

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setAviso(null)
    setOcupado(true)
    try {
      const resposta = await devolverAction({
        tombo,
        estado,
        observacao: observacao.trim() || undefined,
      })

      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      const partes = [`"${resposta.titulo}" devolvido por ${resposta.leitor}.`]
      if (resposta.diasDeAtraso > 0) partes.push(`${resposta.diasDeAtraso} dia(s) de atraso.`)
      if (resposta.suspensaoAte) partes.push(`Leitor suspenso até ${resposta.suspensaoAte}.`)
      // Sem este aviso a operadora devolve o livro à estante e a fila de
      // reserva nunca anda.
      if (resposta.separadoAte) {
        partes.push(
          `SEPARE ESTE EXEMPLAR: reservado para o próximo da fila, que tem até ${resposta.separadoAte} para retirar.`,
        )
      }

      setAviso(partes.join(' '))
      setTombo('')
      setEstado('BOM')
      setObservacao('')
      campoDeTombo.current?.focus()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <form onSubmit={confirmar} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Tombo do livro</span>
          <input
            ref={campoDeTombo}
            value={tombo}
            onChange={(e) => setTombo(e.target.value)}
            autoComplete="off"
            className="rounded border border-neutral-300 px-3 py-2 text-lg"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Como o livro voltou</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoDeConservacao)}
            className="rounded border border-neutral-300 px-3 py-2"
          >
            {ESTADOS.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
        </label>

        {estado === 'DANIFICADO' && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">O que houve</span>
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="rounded border border-neutral-300 px-3 py-2"
            />
            <span className="text-xs text-neutral-500">
              Dano não gera penalidade automática — a decisão é da coordenação.
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={ocupado || tombo.trim().length === 0}
          className="w-fit rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-60"
        >
          Registrar devolução
        </button>
      </form>

      <Mensagens erro={erro} aviso={aviso} />
    </>
  )
}

function Mensagens({ erro, aviso }: { erro: string | null; aviso: string | null }) {
  return (
    <>
      {erro && (
        <p role="alert" className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="mt-4 rounded bg-green-50 px-3 py-2 text-sm text-green-800">
          {aviso}
        </p>
      )}
    </>
  )
}
