import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { CONFIG, type Config } from '../config/config';
import { Db } from '../db/db';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Solo local (SEED_DEMO=true): crea las mismas cuentas del modo mock del frontend y unos eventos,
 * para que `npm run dev` del frontend funcione igual que `npm run dev:mock`. Idempotente.
 */
@Injectable()
export class DemoSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoSeed.name);

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly db: Db,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.seedDemo) return;

    await this.db.transaccion(async (c) => {
      // Las 2 réplicas pueden arrancar a la vez: se serializa igual que la migración.
      await c.query('SELECT pg_advisory_xact_lock(731000002)');
      const cuentas = [
        ['Ana Gómez', 'ana@universidad.edu.co', 'ana123', 'estudiante'],
        ['Club de Software', 'club@universidad.edu.co', 'club123', 'organizador'],
      ];
      for (const [nombre, email, password, rol] of cuentas) {
        await c.query(
          `INSERT INTO usuarios (nombre, email, password_hash, rol, correo_validado)
           VALUES ($1, $2, $3, $4, 'VALIDO')
           ON CONFLICT (lower(email)) DO NOTHING`,
          [nombre, email, await bcrypt.hash(password, 10), rol],
        );
      }

      const { rows } = await c.query<{ id: number; tiene_eventos: boolean }>(
        `SELECT u.id, EXISTS (SELECT 1 FROM eventos e WHERE e.organizador_id = u.id) AS tiene_eventos
         FROM usuarios u WHERE lower(u.email) = 'club@universidad.edu.co'`,
      );
      if (rows[0].tiene_eventos) return;

      const ahora = Date.now();
      const eventos = [
        ['Taller de NestJS', 'Construye una API REST desde cero.', 7, 'Bloque 19, sala 302', 40, 'Tecnología'],
        ['Torneo de ajedrez', 'Partidas rápidas, inscripción individual.', 10, 'Biblioteca, piso 2', 16, 'Deportes'],
        ['Cine foro', 'Proyección y conversación sobre la película del mes.', 14, 'Auditorio fundadores', 120, 'Cultura'],
      ] as const;
      for (const [titulo, descripcion, dias, lugar, cupo, categoria] of eventos) {
        await c.query(
          `INSERT INTO eventos (titulo, descripcion, fecha, lugar, cupo, categoria, organizador_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [titulo, descripcion, new Date(ahora + dias * DIA_MS), lugar, cupo, categoria, rows[0].id],
        );
      }
      this.logger.log('Datos de demostración creados');
    });
  }
}
