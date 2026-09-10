import { PrismaClient } from '@prisma/client'
import { hash } from '@node-rs/argon2'
import { PAPEIS_DE_FABRICA } from '../src/core/rbac/papeis'

const prisma = new PrismaClient()

// Mesmos parâmetros de src/core/auth/senha.ts. A seed não importa aquele
// módulo porque ele é código de aplicação com alias @/, e a seed roda por
// tsx fora do bundler.
const ARGON2ID = 2

async function main() {
  const slug = process.env.ESCOLA_PADRAO_SLUG ?? 'escola-piloto'

  const escola = await prisma.escola.upsert({
    where: { slug },
    update: {},
    create: { slug, nome: 'Escola Piloto' },
  })

  for (const [nome, definicao] of Object.entries(PAPEIS_DE_FABRICA)) {
    await prisma.papel.upsert({
      where: { escolaId_nome: { escolaId: escola.id, nome } },
      update: { permissoes: [...definicao.permissoes], descricao: definicao.descricao },
      create: {
        escolaId: escola.id,
        nome,
        descricao: definicao.descricao,
        permissoes: [...definicao.permissoes],
        deSistema: true,
      },
    })
  }

  const coordenacao = await prisma.papel.findUniqueOrThrow({
    where: { escolaId_nome: { escolaId: escola.id, nome: 'COORDENACAO' } },
  })

  const senhaHash = await hash('SenhaForte#2026', {
    algorithm: ARGON2ID,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  })

  const usuario = await prisma.usuario.upsert({
    where: { escolaId_email: { escolaId: escola.id, email: 'coord@escola.br' } },
    update: {},
    create: { escolaId: escola.id, nome: 'Coordenação', email: 'coord@escola.br', senhaHash },
  })

  await prisma.usuarioPapel.upsert({
    where: { usuarioId_papelId: { usuarioId: usuario.id, papelId: coordenacao.id } },
    update: {},
    create: { usuarioId: usuario.id, papelId: coordenacao.id },
  })

  const anoLetivo = await prisma.anoLetivo.upsert({
    where: { escolaId_ano: { escolaId: escola.id, ano: 2026 } },
    update: {},
    create: {
      escolaId: escola.id,
      ano: 2026,
      dataInicio: new Date('2026-02-01'),
      dataFim: new Date('2026-12-15'),
      ativo: true,
    },
  })

  const turma = await prisma.turma.upsert({
    where: {
      escolaId_anoLetivoId_nome: { escolaId: escola.id, anoLetivoId: anoLetivo.id, nome: '5º A' },
    },
    update: {},
    create: {
      escolaId: escola.id,
      anoLetivoId: anoLetivo.id,
      nome: '5º A',
      serie: '5',
      turno: 'MANHA',
    },
  })

  await prisma.aluno.upsert({
    where: { escolaId_matricula: { escolaId: escola.id, matricula: '2024001' } },
    update: {},
    create: {
      escolaId: escola.id,
      matricula: '2024001',
      nome: 'Ana Souza',
      dataNascimento: new Date('2012-03-15'),
      turmaId: turma.id,
    },
  })

  console.log(`Seed pronta. Escola "${escola.nome}" (${slug}).`)
  console.log('Staff: coord@escola.br / SenhaForte#2026')
  console.log('Aluno: matrícula 2024001 / nascimento 2012-03-15')
}

main()
  .catch((erro) => {
    console.error(erro)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
