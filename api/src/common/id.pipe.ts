import { BadRequestException, PipeTransform } from '@nestjs/common';

const MAX_INT4 = 2_147_483_647;

/** Valida el :id de la ruta antes de llegar a Postgres (un id fuera de rango daría un 500). */
export class IdPipe implements PipeTransform<string, number> {
  constructor(private readonly mensaje = 'Evento inválido') {}

  transform(valor: string): number {
    const id = /^\d{1,10}$/.test(valor) ? Number(valor) : NaN;
    if (!Number.isInteger(id) || id < 1 || id > MAX_INT4) {
      throw new BadRequestException(this.mensaje);
    }
    return id;
  }
}
