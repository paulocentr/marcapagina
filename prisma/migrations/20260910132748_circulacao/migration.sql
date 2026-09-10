-- CreateEnum
CREATE TYPE "StatusDoEmprestimo" AS ENUM ('ATIVO', 'DEVOLVIDO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "StatusDaReserva" AS ENUM ('AGUARDANDO', 'DISPONIVEL', 'ATENDIDA', 'EXPIRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoDePenalidade" AS ENUM ('SUSPENSAO');

-- CreateTable
CREATE TABLE "ConfiguracaoDeCirculacao" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "prazoEmDias" INTEGER NOT NULL,
    "limiteSimultaneo" INTEGER NOT NULL,
    "maximoDeRenovacoes" INTEGER NOT NULL,
    "diasDeSuspensaoPorDiaDeAtraso" INTEGER NOT NULL DEFAULT 1,
    "prazoDeRetiradaEmDias" INTEGER NOT NULL DEFAULT 2,
    "alunoPodeReservar" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConfiguracaoDeCirculacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoPorSerie" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "prazoEmDias" INTEGER,
    "limiteSimultaneo" INTEGER,
    "maximoDeRenovacoes" INTEGER,
    "diasDeSuspensaoPorDiaDeAtraso" INTEGER,
    "prazoDeRetiradaEmDias" INTEGER,
    "alunoPodeReservar" BOOLEAN,

    CONSTRAINT "ConfiguracaoPorSerie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaNaoLetivo" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "motivo" TEXT NOT NULL,

    CONSTRAINT "DiaNaoLetivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Emprestimo" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "exemplarId" TEXT NOT NULL,
    "alunoId" TEXT,
    "usuarioId" TEXT,
    "retiradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previstaPara" DATE NOT NULL,
    "devolvidaEm" TIMESTAMP(3),
    "renovacoes" INTEGER NOT NULL DEFAULT 0,
    "operadorRetiradaId" TEXT NOT NULL,
    "operadorDevolucaoId" TEXT,
    "estadoNaDevolucao" "EstadoDeConservacao",
    "observacao" TEXT,
    "liberacaoForcada" BOOLEAN NOT NULL DEFAULT false,
    "justificativaDaLiberacao" TEXT,

    CONSTRAINT "Emprestimo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StatusDaReserva" NOT NULL DEFAULT 'AGUARDANDO',
    "posicao" INTEGER NOT NULL,
    "exemplarSeparadoId" TEXT,
    "retirarAte" TIMESTAMP(3),

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Penalidade" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "tipo" "TipoDePenalidade" NOT NULL DEFAULT 'SUSPENSAO',
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "motivo" TEXT NOT NULL,
    "emprestimoOrigemId" TEXT,

    CONSTRAINT "Penalidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoDeCirculacao_escolaId_key" ON "ConfiguracaoDeCirculacao"("escolaId");

-- CreateIndex
CREATE INDEX "ConfiguracaoPorSerie_escolaId_idx" ON "ConfiguracaoPorSerie"("escolaId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoPorSerie_escolaId_serie_key" ON "ConfiguracaoPorSerie"("escolaId", "serie");

-- CreateIndex
CREATE INDEX "DiaNaoLetivo_escolaId_data_idx" ON "DiaNaoLetivo"("escolaId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "DiaNaoLetivo_escolaId_data_key" ON "DiaNaoLetivo"("escolaId", "data");

-- CreateIndex
CREATE INDEX "Emprestimo_escolaId_devolvidaEm_previstaPara_idx" ON "Emprestimo"("escolaId", "devolvidaEm", "previstaPara");

-- CreateIndex
CREATE INDEX "Emprestimo_escolaId_alunoId_devolvidaEm_idx" ON "Emprestimo"("escolaId", "alunoId", "devolvidaEm");

-- CreateIndex
CREATE INDEX "Emprestimo_escolaId_exemplarId_idx" ON "Emprestimo"("escolaId", "exemplarId");

-- CreateIndex
CREATE INDEX "Reserva_escolaId_idx" ON "Reserva"("escolaId");

-- CreateIndex
CREATE INDEX "Reserva_escolaId_obraId_status_posicao_idx" ON "Reserva"("escolaId", "obraId", "status", "posicao");

-- CreateIndex
CREATE INDEX "Reserva_escolaId_status_retirarAte_idx" ON "Reserva"("escolaId", "status", "retirarAte");

-- CreateIndex
CREATE INDEX "Penalidade_escolaId_idx" ON "Penalidade"("escolaId");

-- CreateIndex
CREATE INDEX "Penalidade_escolaId_alunoId_fim_idx" ON "Penalidade"("escolaId", "alunoId", "fim");

-- AddForeignKey
ALTER TABLE "ConfiguracaoDeCirculacao" ADD CONSTRAINT "ConfiguracaoDeCirculacao_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracaoPorSerie" ADD CONSTRAINT "ConfiguracaoPorSerie_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaNaoLetivo" ADD CONSTRAINT "DiaNaoLetivo_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Emprestimo" ADD CONSTRAINT "Emprestimo_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Emprestimo" ADD CONSTRAINT "Emprestimo_exemplarId_fkey" FOREIGN KEY ("exemplarId") REFERENCES "Exemplar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Emprestimo" ADD CONSTRAINT "Emprestimo_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_exemplarSeparadoId_fkey" FOREIGN KEY ("exemplarSeparadoId") REFERENCES "Exemplar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalidade" ADD CONSTRAINT "Penalidade_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalidade" ADD CONSTRAINT "Penalidade_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalidade" ADD CONSTRAINT "Penalidade_emprestimoOrigemId_fkey" FOREIGN KEY ("emprestimoOrigemId") REFERENCES "Emprestimo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Um exemplar só pode ter UM empréstimo ativo.
--
-- Índice único PARCIAL: a trava vale só enquanto devolvidaEm é nulo. Se
-- pegasse também os devolvidos, o livro só poderia circular uma vez na
-- vida.
--
-- Não sai do Prisma declarativo, e não pode ficar só na regra de
-- aplicação: dois cliques simultâneos no balcão passam pelos dois `if`
-- antes de qualquer um gravar. O banco é o único que sabe dizer não de
-- verdade — e a consequência de não dizer é uma cópia fantasma
-- emprestada para sempre.
CREATE UNIQUE INDEX "emprestimo_ativo_por_exemplar"
  ON "Emprestimo" ("exemplarId")
  WHERE "devolvidaEm" IS NULL;

-- O mesmo aluno não entra duas vezes na fila da MESMA obra enquanto a
-- reserva está viva. Reserva já atendida ou expirada não conta: ele pode
-- querer o mesmo livro outra vez meses depois.
CREATE UNIQUE INDEX "reserva_viva_por_aluno_e_obra"
  ON "Reserva" ("obraId", "alunoId")
  WHERE "status" IN ('AGUARDANDO', 'DISPONIVEL');
