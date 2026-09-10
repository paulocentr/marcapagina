import type { ReactElement } from 'react'
import { Cartao } from '@/components/ui/cartao'
import { Chip } from '@/components/ui/chip'
import { Tombo } from '@/components/ui/codigo'
import { Celula, CelulaDeTitulo, Tabela } from '@/components/ui/tabela'
import type { PainelDoLeitor } from '@/modules/relatorios/painel-do-leitor.service'
import { dataCurta } from './painel-na-tela'

/**
 * Atrasados agora.
 *
 * "Agora" é literal: a lista sai de `previstaPara < hoje AND devolvidaEm
 * IS NULL`, contada nesta requisição. Não existe campo "atrasado" para
 * ler — ele mentiria todo dia em que o cron falhasse, e mentiria dizendo
 * que está tudo em ordem.
 *
 * O atraso sai em `Chip`, que é a única forma de estado do kit e cobra
 * palavra E ícone: a coordenação imprime esta tela em preto e branco, e
 * um atraso identificado só pela cor desapareceria na fotocópia.
 */
export function AtrasadosAgora({ painel }: { painel: PainelDoLeitor }): ReactElement {
  return (
    <Cartao semPadding className="px-[22px] py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-tinta">Atrasados agora</h2>
          <p className="mt-[2px] text-[12.5px] text-tinta-2">
            calculado na hora: prazo menor que hoje e ainda sem devolução
          </p>
        </div>
      </div>

      {painel.atrasados.lista.length === 0 ? (
        <p className="mt-[14px] text-[13.5px] text-tinta-2">
          Nenhum livro em atraso. Quem vence hoje ainda tem o dia inteiro para devolver.
        </p>
      ) : (
        <>
          <div className="mt-[14px] overflow-x-auto">
            <Tabela>
              <caption className="sr-only">
                Empréstimos em atraso, do mais antigo para o mais recente
              </caption>
              <thead>
                <tr>
                  <CelulaDeTitulo className="w-[230px]">Aluno</CelulaDeTitulo>
                  <CelulaDeTitulo className="w-[78px]">Turma</CelulaDeTitulo>
                  <CelulaDeTitulo>Livro</CelulaDeTitulo>
                  <CelulaDeTitulo className="w-[92px]">Tombo</CelulaDeTitulo>
                  <CelulaDeTitulo className="w-[104px]">Venceu em</CelulaDeTitulo>
                  <CelulaDeTitulo className="w-[150px]">Atraso</CelulaDeTitulo>
                </tr>
              </thead>
              <tbody>
                {painel.atrasados.lista.map((item) => (
                  <tr key={item.emprestimoId}>
                    <Celula className="font-semibold">{item.nomeDoLeitor}</Celula>
                    <Celula>{item.turma ?? '—'}</Celula>
                    <Celula>{item.tituloDaObra}</Celula>
                    <Celula>
                      <Tombo valor={item.tombo} />
                    </Celula>
                    <Celula className="font-mono text-tinta-2">
                      {dataCurta(item.previstaPara)}
                    </Celula>
                    <Celula>
                      <Chip
                        estado="ATRASADO"
                        complemento={`há ${item.diasDeAtraso} ${
                          item.diasDeAtraso === 1 ? 'dia' : 'dias'
                        }`}
                      />
                    </Celula>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>

          {/*
            Sem link para "ver todos": não existe tela de atrasados
            ainda, e um atalho para 404 ensina a operadora a desconfiar
            do menu inteiro. O CSV leva as mesmas linhas e diz quantas
            de quantas são.
          */}
          <p className="mt-[14px] text-[12.5px] text-tinta-2">
            mostrando {painel.atrasados.lista.length} de {painel.atrasados.total} · os mais
            antigos primeiro, que é a ordem em que a coordenação cobra
          </p>
        </>
      )}
    </Cartao>
  )
}
