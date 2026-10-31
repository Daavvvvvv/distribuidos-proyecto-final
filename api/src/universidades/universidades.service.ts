import { Injectable } from '@nestjs/common';
import { Db } from '../db/db';

/** Lo que se muestra de una universidad en el usuario y en el evento. */
export interface Universidad {
  id: number;
  nombre: string;
  sigla: string;
}

export interface UniversidadDelCatalogo extends Universidad {
  dominio: string;
}

// El orden de Postgres depende de la configuración regional del servidor (Alpine y RDS difieren).
const orden = new Intl.Collator('es');

/** Catálogo de universidades registradas: el backend decide qué correos pueden crear cuenta. */
@Injectable()
export class UniversidadesService {
  constructor(private readonly db: Db) {}

  async listar(): Promise<UniversidadDelCatalogo[]> {
    const { rows } = await this.db.query<UniversidadDelCatalogo>('SELECT id, nombre, sigla, dominio FROM universidades');
    return rows.sort((a, b) => orden.compare(a.nombre, b.nombre));
  }

  /** La universidad dueña del dominio del correo, o null si no está en el catálogo. */
  async porCorreo(email: string): Promise<Universidad | null> {
    const dominio = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
    const { rows } = await this.db.query<Universidad>(
      'SELECT id, nombre, sigla FROM universidades WHERE dominio = $1',
      [dominio],
    );
    return rows[0] ?? null;
  }
}
