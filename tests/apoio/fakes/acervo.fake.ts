import type {
  RepositorioDeAutores,
  AutorRegistrado,
} from '@/modules/acervo/autores.service'

// Fake em memória do repositório de autores. Conta as chamadas porque
// "não faz N+1" é uma regra que o serviço promete e que só um contador
// consegue provar.
export function criarFakeDeAutores() {
  const porNormalizado = new Map<string, AutorRegistrado>()
  let proximoId = 1

  const fake = {
    chamadasDeBusca: 0,
    chamadasDeCriacao: 0,

    todos(): AutorRegistrado[] {
      return [...porNormalizado.values()]
    },
    zerarContadores() {
      fake.chamadasDeBusca = 0
      fake.chamadasDeCriacao = 0
    },

    async buscarPorNormalizados(normalizados: string[]): Promise<AutorRegistrado[]> {
      fake.chamadasDeBusca += 1
      return normalizados.map((n) => porNormalizado.get(n)).filter((a): a is AutorRegistrado => !!a)
    },

    async criarMuitos(
      novos: { nome: string; nomeNormalizado: string }[],
    ): Promise<AutorRegistrado[]> {
      fake.chamadasDeCriacao += 1
      return novos.map((novo) => {
        const registrado: AutorRegistrado = { id: `aut_${proximoId++}`, ...novo }
        porNormalizado.set(novo.nomeNormalizado, registrado)
        return registrado
      })
    },
  }

  return fake satisfies RepositorioDeAutores & Record<string, unknown>
}
