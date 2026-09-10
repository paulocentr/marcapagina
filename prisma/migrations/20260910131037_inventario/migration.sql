-- CreateEnum
CREATE TYPE "StatusDoInventario" AS ENUM ('ABERTO', 'FECHADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoDeDivergencia" AS ENUM ('NAO_ENCONTRADO', 'FORA_DO_LUGAR', 'CONSTA_EMPRESTADO');

-- CreateTable
CREATE TABLE "Inventario" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "localizacaoId" TEXT,
    "responsavelId" TEXT NOT NULL,
    "responsavelNome" TEXT NOT NULL,
    "status" "StatusDoInventario" NOT NULL DEFAULT 'ABERTO',
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadoEm" TIMESTAMP(3),

    CONSTRAINT "Inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioItem" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "exemplarId" TEXT NOT NULL,
    "situacaoNaAbertura" TEXT NOT NULL,
    "conferido" BOOLEAN NOT NULL DEFAULT false,
    "conferidoEm" TIMESTAMP(3),
    "localizacaoEncontradaId" TEXT,
    "divergencia" "TipoDeDivergencia",

    CONSTRAINT "InventarioItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inventario_escolaId_idx" ON "Inventario"("escolaId");

-- CreateIndex
CREATE INDEX "Inventario_escolaId_status_idx" ON "Inventario"("escolaId", "status");

-- CreateIndex
CREATE INDEX "InventarioItem_escolaId_idx" ON "InventarioItem"("escolaId");

-- CreateIndex
CREATE INDEX "InventarioItem_inventarioId_conferido_idx" ON "InventarioItem"("inventarioId", "conferido");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioItem_inventarioId_exemplarId_key" ON "InventarioItem"("inventarioId", "exemplarId");

-- AddForeignKey
ALTER TABLE "Inventario" ADD CONSTRAINT "Inventario_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventario" ADD CONSTRAINT "Inventario_localizacaoId_fkey" FOREIGN KEY ("localizacaoId") REFERENCES "Localizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "Inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_exemplarId_fkey" FOREIGN KEY ("exemplarId") REFERENCES "Exemplar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
