-- CreateEnum
CREATE TYPE "StatusDaRodada" AS ENUM ('PLANEJADA', 'REALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusDoPedido" AS ENUM ('PENDENTE', 'ATENDIDO', 'RECUSADO', 'SUGERIDO_COMPRA');

-- CreateTable
CREATE TABLE "RodadaCarrinho" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "turmaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "responsavelNome" TEXT NOT NULL,
    "observacao" TEXT,
    "status" "StatusDaRodada" NOT NULL DEFAULT 'PLANEJADA',

    CONSTRAINT "RodadaCarrinho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RodadaCarrinhoExemplar" (
    "rodadaId" TEXT NOT NULL,
    "exemplarId" TEXT NOT NULL,

    CONSTRAINT "RodadaCarrinhoExemplar_pkey" PRIMARY KEY ("rodadaId","exemplarId")
);

-- CreateTable
CREATE TABLE "PedidoCarrinho" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "obraId" TEXT,
    "tituloLivre" TEXT,
    "tituloLivreNormalizado" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StatusDoPedido" NOT NULL DEFAULT 'PENDENTE',

    CONSTRAINT "PedidoCarrinho_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RodadaCarrinho_escolaId_idx" ON "RodadaCarrinho"("escolaId");

-- CreateIndex
CREATE INDEX "RodadaCarrinho_escolaId_turmaId_data_idx" ON "RodadaCarrinho"("escolaId", "turmaId", "data");

-- CreateIndex
CREATE INDEX "PedidoCarrinho_escolaId_idx" ON "PedidoCarrinho"("escolaId");

-- CreateIndex
CREATE INDEX "PedidoCarrinho_escolaId_status_idx" ON "PedidoCarrinho"("escolaId", "status");

-- CreateIndex
CREATE INDEX "PedidoCarrinho_escolaId_tituloLivreNormalizado_idx" ON "PedidoCarrinho"("escolaId", "tituloLivreNormalizado");

-- AddForeignKey
ALTER TABLE "RodadaCarrinho" ADD CONSTRAINT "RodadaCarrinho_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RodadaCarrinho" ADD CONSTRAINT "RodadaCarrinho_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RodadaCarrinhoExemplar" ADD CONSTRAINT "RodadaCarrinhoExemplar_rodadaId_fkey" FOREIGN KEY ("rodadaId") REFERENCES "RodadaCarrinho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RodadaCarrinhoExemplar" ADD CONSTRAINT "RodadaCarrinhoExemplar_exemplarId_fkey" FOREIGN KEY ("exemplarId") REFERENCES "Exemplar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCarrinho" ADD CONSTRAINT "PedidoCarrinho_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCarrinho" ADD CONSTRAINT "PedidoCarrinho_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCarrinho" ADD CONSTRAINT "PedidoCarrinho_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
