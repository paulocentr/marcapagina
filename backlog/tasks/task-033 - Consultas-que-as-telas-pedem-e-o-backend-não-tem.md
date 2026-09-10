---
id: TASK-033
title: Consultas que as telas pedem e o backend não tem
status: To Do
assignee: []
created_date: '2026-09-10 19:18'
labels:
  - circulacao
  - backend
milestone: m-2
dependencies: []
priority: high
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A reescrita das telas contra o kit (TASK-029) parou em várias partes das pranchas por falta de consulta, não por falta de desenho. As três frentes recusaram desenhar com número inventado, e isso está certo: número falso no balcão ensina a operadora a não confiar em nenhum.

Falta, no balcão:
- a lista de livros EM MÃOS do leitor (hoje buscarLeitorParaBalcao devolve contagem, não títulos)
- "Últimos do balcão" — histórico do dia, empréstimos e devoluções
- "Prateleira de separados" — exemplares aguardando quem reservou, com o que vence hoje
- contadores "atendidos hoje" e "devolvidos hoje"
- prazo da série em DIAS na ficha do leitor (hoje só vem o limite simultâneo) e a data prevista ANTES de confirmar
- título/autor/estante do exemplar ao lado do tombo bipado
- nome e turma do próximo da fila, na faixa de separar exemplar

Falta, na ficha da obra:
- nome de categoria e de localização (o serviço devolve categoriaId/localizacaoId; imprimir cuid na ficha é pior que omitir)
- "catalogada em" / "entrou em"
- nome de quem está com o exemplar emprestado

Nenhuma dessas é regra nova — é consulta. Mas é repositório e serviço novos, com teste, não ajuste de tela.
<!-- SECTION:DESCRIPTION:END -->
