-- CreateTable
CREATE TABLE "Escola" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escola_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Papel" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "permissoes" TEXT[],
    "deSistema" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Papel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsuarioPapel" (
    "usuarioId" TEXT NOT NULL,
    "papelId" TEXT NOT NULL,

    CONSTRAINT "UsuarioPapel_pkey" PRIMARY KEY ("usuarioId","papelId")
);

-- CreateTable
CREATE TABLE "AnoLetivo" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AnoLetivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turma" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "anoLetivoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "serie" TEXT NOT NULL,
    "turno" TEXT NOT NULL,

    CONSTRAINT "Turma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aluno" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dataNascimento" DATE NOT NULL,
    "turmaId" TEXT,
    "responsavelNome" TEXT,
    "responsavelEmail" TEXT,
    "responsavelTelefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Aluno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TentativaLogin" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT,
    "identificador" TEXT NOT NULL,
    "reino" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "ocorridaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaLogin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAuditoria" (
    "id" TEXT NOT NULL,
    "escolaId" TEXT NOT NULL,
    "autorTipo" TEXT NOT NULL,
    "autorId" TEXT,
    "autorNome" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "dadosAntes" JSONB,
    "dadosDepois" JSONB,
    "ip" TEXT,
    "ocorridaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Escola_slug_key" ON "Escola"("slug");

-- CreateIndex
CREATE INDEX "Usuario_escolaId_idx" ON "Usuario"("escolaId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_escolaId_email_key" ON "Usuario"("escolaId", "email");

-- CreateIndex
CREATE INDEX "Papel_escolaId_idx" ON "Papel"("escolaId");

-- CreateIndex
CREATE UNIQUE INDEX "Papel_escolaId_nome_key" ON "Papel"("escolaId", "nome");

-- CreateIndex
CREATE INDEX "AnoLetivo_escolaId_idx" ON "AnoLetivo"("escolaId");

-- CreateIndex
CREATE UNIQUE INDEX "AnoLetivo_escolaId_ano_key" ON "AnoLetivo"("escolaId", "ano");

-- CreateIndex
CREATE INDEX "Turma_escolaId_idx" ON "Turma"("escolaId");

-- CreateIndex
CREATE UNIQUE INDEX "Turma_escolaId_anoLetivoId_nome_key" ON "Turma"("escolaId", "anoLetivoId", "nome");

-- CreateIndex
CREATE INDEX "Aluno_escolaId_idx" ON "Aluno"("escolaId");

-- CreateIndex
CREATE UNIQUE INDEX "Aluno_escolaId_matricula_key" ON "Aluno"("escolaId", "matricula");

-- CreateIndex
CREATE INDEX "TentativaLogin_identificador_reino_ocorridaEm_idx" ON "TentativaLogin"("identificador", "reino", "ocorridaEm");

-- CreateIndex
CREATE INDEX "TentativaLogin_ip_ocorridaEm_idx" ON "TentativaLogin"("ip", "ocorridaEm");

-- CreateIndex
CREATE INDEX "LogAuditoria_escolaId_ocorridaEm_idx" ON "LogAuditoria"("escolaId", "ocorridaEm");

-- CreateIndex
CREATE INDEX "LogAuditoria_escolaId_entidade_entidadeId_idx" ON "LogAuditoria"("escolaId", "entidade", "entidadeId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Papel" ADD CONSTRAINT "Papel_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioPapel" ADD CONSTRAINT "UsuarioPapel_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsuarioPapel" ADD CONSTRAINT "UsuarioPapel_papelId_fkey" FOREIGN KEY ("papelId") REFERENCES "Papel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnoLetivo" ADD CONSTRAINT "AnoLetivo_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turma" ADD CONSTRAINT "Turma_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turma" ADD CONSTRAINT "Turma_anoLetivoId_fkey" FOREIGN KEY ("anoLetivoId") REFERENCES "AnoLetivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "Turma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAuditoria" ADD CONSTRAINT "LogAuditoria_escolaId_fkey" FOREIGN KEY ("escolaId") REFERENCES "Escola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
