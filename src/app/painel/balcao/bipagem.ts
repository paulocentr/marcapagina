/**
 * A linha de bipagem tem 52px — o campo de matrícula, o de tombo e o
 * botão que fecha a ação ficam alinhados por baixo.
 *
 * O kit só tem botão de 40 e de 44px, de propósito: 52 é medida desta
 * tela, não do sistema. O `!` é o que faz a altura local vencer o `h-10`
 * do primitivo — sem ele, quem ganha depende da ordem em que o Tailwind
 * emitiu as duas classes no CSS, e isso não é coisa para se descobrir no
 * balcão.
 *
 * Mora em módulo próprio porque as duas abas — emprestar e devolver —
 * alinham a mesma linha, e a medida repetida à mão nas duas sai do lugar
 * na primeira vez que alguém ajustar só uma.
 */
export const ALTURA_DA_BIPAGEM = 'h-[52px]!'
