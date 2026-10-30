import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { crearPool, enTransaccion, migrar } from '@eventos/shared';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { CONFIG, type Config } from '../config/config';

@Injectable()
export class Db implements OnModuleInit, OnApplicationShutdown {
  readonly pool: Pool;

  constructor(@Inject(CONFIG) config: Config) {
    this.pool = crearPool({ ...config.db, max: 10 });
  }

  /** RDS arranca vacía: las tablas se crean al iniciar (idempotente y seguro con 2 réplicas). */
  async onModuleInit(): Promise<void> {
    await migrar(this.pool);
  }

  /**
   * Se cierra en onApplicationShutdown y no en onModuleDestroy: app.close() corre onModuleDestroy
   * ANTES de cerrar el servidor HTTP, y las solicitudes en curso fallarían con "pool ended".
   */
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }

  query<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
    return this.pool.query<T>(sql, params);
  }

  transaccion<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
    return enTransaccion(this.pool, fn);
  }
}
