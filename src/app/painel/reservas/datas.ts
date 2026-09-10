/**
 * As datas da tela de reservas, escritas como a escola escreve.
 *
 * Módulo próprio para que a Server Action e os componentes usem a MESMA
 * função: o prazo de retirada aparece na prateleira e na fila da obra, e
 * duas formatações diferentes para a mesma data fariam a operadora achar
 * que são duas datas.
 *
 * `getUTC*` e não `toLocaleDateString`: `retirarAte` e `previstaPara`
 * guardam um DIA em meia-noite UTC. Formatar pelo fuso do processo
 * imprimiria o dia anterior a cada vez que o servidor rodar a oeste de
 * Greenwich — que é o caso da máquina da secretaria.
 */

/** dd/mm/aaaa. */
export function formatarData(data: Date): string {
  return `${diaEMes(data)}/${data.getUTCFullYear()}`
}

/** dd/mm — para o prazo de retirada, que é sempre desta semana. */
export function formatarDiaEMes(data: Date): string {
  return diaEMes(data)
}

function diaEMes(data: Date): string {
  const dia = String(data.getUTCDate()).padStart(2, '0')
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}`
}
