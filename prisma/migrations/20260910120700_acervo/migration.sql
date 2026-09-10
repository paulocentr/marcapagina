-- CreateEnum
CREATE TYPE "EstadoDeConservacao" AS ENUM ('NOVO', 'BOM', 'DESGASTADO', 'DANIFICADO');

-- CreateEnum
CREATE TYPE "SituacaoDoExemplar" AS ENUM ('DISPONIVEL', 'EMPRESTADO', 'RESERVADO', 'EM_CARRINHO', 'EM_MANUTENCAO', 'EXTRAVIADO', 'BAIXADO');

-- CreateEnum
CREATE TYPE "OrigemDoExemplar" AS ENUM ('COMPRA', 'DOACAO', 'GOVERNO');

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT,
    "parentId" TEXT,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Localizacao" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "corredor" TEXT,
    "estante" TEXT,
    "prateleira" TEXT,

    CONSTRAINT "Localizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Autor" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,

    CONSTRAINT "Autor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obra" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tituloNormalizado" TEXT NOT NULL,
    "subtitulo" TEXT,
    "editora" TEXT,
    "anoPublicacao" INTEGER,
    "isbn" TEXT,
    "edicao" TEXT,
    "idioma" TEXT,
    "numeroDePaginas" INTEGER,
    "sinopse" TEXT,
    "capaUrl" TEXT,
    "cdd" TEXT,
    "faixaEtaria" TEXT,
    "categoriaId" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObraAutor" (
    "obraId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ObraAutor_pkey" PRIMARY KEY ("obraId","autorId")
);

-- CreateTable
CREATE TABLE "Exemplar" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "tombo" TEXT NOT NULL,
    "estado" "EstadoDeConservacao" NOT NULL DEFAULT 'BOM',
    "situacao" "SituacaoDoExemplar" NOT NULL DEFAULT 'DISPONIVEL',
    "localizacaoId" TEXT,
    "dataDeAquisicao" TIMESTAMP(3),
    "origem" "OrigemDoExemplar" NOT NULL DEFAULT 'COMPRA',
    "valorDeAquisicao" DECIMAL(10,2),
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exemplar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Categoria_escolaId_idx" ON "Categoria"("escolaId");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_escolaId_nome_parentId_key" ON "Categoria"("escolaId", "nome", "parentId");

-- CreateIndex
CREATE INDEX "Localizacao_escolaId_idx" ON "Localizacao"("escolaId");

-- CreateIndex
CREATE UNIQUE INDEX "Localizacao_escolaId_nome_key" ON "Localizacao"("escolaId", "nome");

-- CreateIndex
CREATE INDEX "Autor_escolaId_idx" ON "Autor"("escolaId");

-- CreateIndex
CREATE UNIQUE INDEX "Autor_escolaId_nomeNormalizado_key" ON "Autor"("escolaId", "nomeNormalizado");

-- CreateIndex
CREATE INDEX "Obra_escolaId_idx" ON "Obra"("escolaId");

-- CreateIndex
CREATE INDEX "Obra_escolaId_isbn_idx" ON "Obra"("escolaId", "isbn");

-- CreateIndex
CREATE INDEX "Obra_escolaId_tituloNormalizado_idx" ON "Obra"("escolaId", "tituloNormalizado");

-- CreateIndex
CREATE INDEX "Exemplar_escolaId_idx" ON "Exemplar"("escolaId");

-- CreateIndex
CREATE INDEX "Exemplar_escolaId_obraId_idx" ON "Exemplar"("escolaId", "obraId");

-- CreateIndex
CREATE INDEX "Exemplar_escolaId_situacao_idx" ON "Exemplar"("escolaId", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "Exemplar_escolaId_tombo_key" ON "Exemplar"("escolaId", "tombo");

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Localizacao" ADD CONSTRAINT "Localizacao_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Autor" ADD CONSTRAINT "Autor_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObraAutor" ADD CONSTRAINT "ObraAutor_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObraAutor" ADD CONSTRAINT "ObraAutor_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Autor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exemplar" ADD CONSTRAINT "Exemplar_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exemplar" ADD CONSTRAINT "Exemplar_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exemplar" ADD CONSTRAINT "Exemplar_localizacaoId_fkey" FOREIGN KEY ("localizacaoId") REFERENCES "Localizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
