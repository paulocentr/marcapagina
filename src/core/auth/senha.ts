import { hash, verify, type Algorithm } from '@node-rs/argon2'

export const FORCA_MINIMA_SENHA = 10

// @node-rs/argon2 exporta `Algorithm` como const enum ambiente, e
// `verbatimModuleSyntax` proíbe ler o VALOR de um — só o tipo. O número
// é o do próprio pacote (Argon2d=0, Argon2i=1, Argon2id=2) e não é
// escolha nossa. O teste "produz um hash Argon2id" existe justamente
// para pegar se esse número deixar de significar Argon2id.
const ARGON2ID = 2 as Algorithm

// Parâmetros do OWASP para Argon2id (memória 19 MiB, 2 iterações,
// paralelismo 1). Rodam confortavelmente dentro do limite de execução
// de uma função serverless.
const OPCOES = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export async function gerarHash(senha: string): Promise<string> {
  return hash(senha, OPCOES)
}

export async function verificarSenha(senha: string, hashArmazenado: string): Promise<boolean> {
  try {
    return await verify(hashArmazenado, senha, OPCOES)
  } catch {
    // Hash malformado no banco tem que se comportar como senha errada.
    // Deixar a exceção subir transformaria um registro corrompido em
    // erro 500 no login, o que é pior e ainda entrega informação.
    return false
  }
}
