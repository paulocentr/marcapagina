import { dbDoTenant } from '@/core/db/tenant-extension'
import type { RepositorioDoAcervoParaReserva } from '@/modules/circulacao/reservas.service'

/**
 * A única pergunta que a fila faz ao acervo: esta obra existe AQUI?
 *
 * Vive num repositório próprio, minúsculo, em vez de reaproveitar
 * `obrasRepository.obter`: aquele monta a ficha completa com autores e
 * contagem de exemplares para responder sim ou não.
 */
export const obrasDaFilaRepository: RepositorioDoAcervoParaReserva = {
  async obraExiste(obraId: string): Promise<boolean> {
    // A extensão de tenant carimba o escolaId no WHERE. É isso que faz a
    // obra da escola vizinha responder "não existe" — sem a checagem, a
    // reserva era gravada apontando para fora da escola e o aluno
    // esperava numa fila que ninguém nunca ia atender.
    const obra = await dbDoTenant().obra.findFirst({
      where: { id: obraId },
      select: { id: true },
    })

    return obra !== null
  },
}
