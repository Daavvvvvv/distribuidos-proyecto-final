import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { crearPool, enTransaccion } from '@eventos/shared';
import type { Pool, PoolClient } from 'pg';
import { CONFIG, type Config } from './config';

const ESPERA_TABLAS_MS = 60_000;
const PAUSA_MS = 2_000;

@Injectable()
export class Db implements OnApplicationShutdown {
  private readonly logger = new Logger(Db.name);
  readonly pool: Pool;

  constructor(@Inject(CONFIG) config: Config) {
    this.pool = crearPool({ ...config.db, max: 5 });
  }

  /**
   * Solo la API migra. El worker espera a que existan las tablas (por ejemplo, si arranca antes
   * que la API sobre una RDS vacía). Si en 60 s no aparecen, falla y ECS lo reinicia.
   */
  async esperarTablas(): Promise<void> {
    const limite = Date.now() + ESPERA_TABLAS_MS;
    for (;;) {
      try {
        await this.pool.query('SELECT 1 FROM notificaciones LIMIT 0');
        return;
      } catch (error) {
        if (Date.now() > limite) throw new Error(`Las tablas no aparecieron en 60 s: ${(error as Error).message}`);
        this.logger.warn('Esperando a que la API cree las tablas...');
        await new Promise((r) => setTimeout(r, PAUSA_MS));
      }
    }
  }

  /** Después de que el consumidor terminó su lote (onModuleDestroy). */
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }

  transaccion<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
    return enTransaccion(this.pool, fn);
  }
}
