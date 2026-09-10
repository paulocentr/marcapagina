'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  consultarIsbnAction,
  catalogarAction,
  type ObraJaNoAcervo,
} from './actions'
import type { MetadadosDeObra } from '@/infra/metadados/provedor'

interface Ficha {
  isbn: string
  titulo: string
  autores: string
  editora: string
  anoPublicacao: string
  numeroDePaginas: string
  sinopse: string
  capaUrl: string
  quantidadeDeExemplares: string
  obraExistenteId: string
}

const FICHA_VAZIA: Ficha = {
  isbn: '',
  titulo: '',
  autores: '',
  editora: '',
  anoPublicacao: '',
  numeroDePaginas: '',
  sinopse: '',
  capaUrl: '',
  quantidadeDeExemplares: '1',
  obraExistenteId: '',
}

function fichaDeMetadados(isbn: string, m: MetadadosDeObra | null): Ficha {
  return {
    ...FICHA_VAZIA,
    isbn,
    titulo: m?.titulo ?? '',
    autores: m?.autores.join('; ') ?? '',
    editora: m?.editora ?? '',
    anoPublicacao: m?.anoPublicacao ? String(m.anoPublicacao) : '',
    numeroDePaginas: m?.numeroDePaginas ? String(m.numeroDePaginas) : '',
    sinopse: m?.sinopse ?? '',
    capaUrl: m?.capaUrl ?? '',
  }
}

export default function PaginaDeCatalogacaoEmSerie() {
  const [isbnBipado, setIsbnBipado] = useState('')
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [jaCadastrada, setJaCadastrada] = useState<ObraJaNoAcervo | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [catalogadosNaSessao, setCatalogadosNaSessao] = useState(0)

  const campoDeIsbn = useRef<HTMLInputElement>(null)

  // O cursor volta ao campo de ISBN sempre que a ficha sai da tela. É o
  // requisito da spec §5.5, e é ele que torna plausível catalogar um
  // acervo inteiro: sem navegar menu entre um livro e o próximo.
  const voltarParaOIsbn = useCallback(() => {
    setFicha(null)
    setJaCadastrada(null)
    setIsbnBipado('')
    campoDeIsbn.current?.focus()
  }, [])

  useEffect(() => {
    campoDeIsbn.current?.focus()
  }, [])

  async function buscar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setAviso(null)
    setOcupado(true)

    try {
      const resposta = await consultarIsbnAction(isbnBipado)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      setJaCadastrada(resposta.jaCadastrada)
      setFicha(fichaDeMetadados(resposta.isbn, resposta.metadados))

      if (!resposta.metadados) {
        // Não é erro: didático e infantojuvenil nacional faltam nas duas
        // APIs com frequência. O formulário abre em branco, já com o ISBN.
        setAviso(
          'Este ISBN não foi encontrado nas bases consultadas. Preencha os dados à mão — o ISBN já está guardado.',
        )
      }
    } finally {
      setOcupado(false)
    }
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    if (!ficha) return
    setErro(null)
    setAviso(null)
    setOcupado(true)

    try {
      const resposta = await catalogarAction(ficha)
      if (!resposta.ok) {
        setErro(resposta.erro)
        return
      }

      setCatalogadosNaSessao((n) => n + 1)
      // Os tombos ficam na tela depois do reset: é com eles que a
      // operadora escreve a etiqueta do livro que acabou de passar.
      setAviso(
        `"${resposta.titulo}" salvo. ${
          resposta.tombos.length === 1
            ? `Tombo ${resposta.tombos[0]}`
            : `Tombos ${resposta.tombos[0]} a ${resposta.tombos[resposta.tombos.length - 1]}`
        }.`,
      )
      voltarParaOIsbn()
    } finally {
      setOcupado(false)
    }
  }

  function acrescentarAObraExistente() {
    if (!jaCadastrada) return
    setFicha((atual) =>
      atual ? { ...atual, obraExistenteId: jaCadastrada.id, titulo: jaCadastrada.titulo } : atual,
    )
    setJaCadastrada(null)
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Catalogar por ISBN</h1>
        <p data-testid="contador-da-sessao" className="text-sm text-neutral-600">
          {catalogadosNaSessao} nesta sessão
        </p>
      </header>

      <form onSubmit={buscar} className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">ISBN</span>
          <input
            ref={campoDeIsbn}
            name="isbn"
            value={isbnBipado}
            onChange={(e) => setIsbnBipado(e.target.value)}
            // Leitor USB se comporta como teclado e termina com Enter,
            // então o submit do formulário já é o "bipar" (spec §7).
            autoComplete="off"
            inputMode="numeric"
            className="rounded border border-neutral-300 px-3 py-2 text-lg"
          />
        </label>
        <button
          type="submit"
          disabled={ocupado || isbnBipado.trim().length === 0}
          className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-60"
        >
          Buscar
        </button>
      </form>

      {erro && (
        <p role="alert" className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      {aviso && (
        <p role="status" className="mt-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {aviso}
        </p>
      )}

      {jaCadastrada && (
        <div role="alert" className="mt-4 rounded bg-blue-50 px-3 py-3 text-sm text-blue-900">
          <p>
            <strong>{jaCadastrada.titulo}</strong> já está no acervo, com {jaCadastrada.exemplares}{' '}
            exemplar(es).
          </p>
          <p className="mt-1">
            Cadastrar de novo criaria uma segunda ficha do mesmo livro.
          </p>
          <button
            type="button"
            onClick={acrescentarAObraExistente}
            className="mt-2 rounded bg-blue-700 px-3 py-1.5 text-white"
          >
            Acrescentar exemplares a esta obra
          </button>
        </div>
      )}

      {ficha && (
        <form onSubmit={salvar} className="mt-6 flex flex-col gap-4">
          <h2 className="text-lg font-medium">
            {ficha.obraExistenteId ? 'Acrescentando exemplares' : 'Confira antes de salvar'}
          </h2>

          <Campo
            rotulo="ISBN da obra"
            valor={ficha.isbn}
            aoMudar={(v) => setFicha({ ...ficha, isbn: v })}
            somenteLeitura={Boolean(ficha.obraExistenteId)}
          />
          <Campo
            rotulo="Título"
            valor={ficha.titulo}
            aoMudar={(v) => setFicha({ ...ficha, titulo: v })}
            somenteLeitura={Boolean(ficha.obraExistenteId)}
          />

          {!ficha.obraExistenteId && (
            <>
              <Campo
                rotulo="Autores"
                dica="Separe por ponto e vírgula"
                valor={ficha.autores}
                aoMudar={(v) => setFicha({ ...ficha, autores: v })}
              />
              <div className="grid grid-cols-3 gap-3">
                <Campo
                  rotulo="Editora"
                  valor={ficha.editora}
                  aoMudar={(v) => setFicha({ ...ficha, editora: v })}
                />
                <Campo
                  rotulo="Ano"
                  valor={ficha.anoPublicacao}
                  aoMudar={(v) => setFicha({ ...ficha, anoPublicacao: v })}
                />
                <Campo
                  rotulo="Páginas"
                  valor={ficha.numeroDePaginas}
                  aoMudar={(v) => setFicha({ ...ficha, numeroDePaginas: v })}
                />
              </div>
            </>
          )}

          <Campo
            rotulo="Quantos exemplares"
            valor={ficha.quantidadeDeExemplares}
            aoMudar={(v) => setFicha({ ...ficha, quantidadeDeExemplares: v })}
          />

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={ocupado}
              className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-60"
            >
              Salvar e próximo
            </button>
            <button
              type="button"
              onClick={voltarParaOIsbn}
              className="rounded border border-neutral-300 px-4 py-2"
            >
              Descartar
            </button>
          </div>
        </form>
      )}
    </main>
  )
}

function Campo({
  rotulo,
  valor,
  aoMudar,
  dica,
  somenteLeitura,
}: {
  rotulo: string
  valor: string
  aoMudar: (valor: string) => void
  dica?: string
  somenteLeitura?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{rotulo}</span>
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        readOnly={somenteLeitura}
        className="rounded border border-neutral-300 px-3 py-2 read-only:bg-neutral-100"
      />
      {dica && <span className="text-xs text-neutral-500">{dica}</span>}
    </label>
  )
}
