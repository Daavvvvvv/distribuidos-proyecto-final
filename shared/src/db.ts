import { Pool, type PoolClient } from 'pg';

export interface OpcionesDb {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /** RDS (PostgreSQL 15+) exige SSL; el Postgres local de docker-compose no. */
  ssl: boolean;
  /** Conexiones máximas de este proceso: 10 por réplica de API, 5 en el worker. */
  max: number;
}

export function crearPool(opciones: OpcionesDb): Pool {
  return new Pool({
    host: opciones.host,
    port: opciones.port,
    database: opciones.database,
    user: opciones.user,
    password: opciones.password,
    // El contrato indica rejectUnauthorized: false para el prototipo.
    ssl: opciones.ssl ? { rejectUnauthorized: false } : false,
    max: opciones.max,
    // Si el pool está agotado más de 5 s, falla rápido (la API lo traduce a 503) en vez de colgarse.
    connectionTimeoutMillis: 5000,
  });
}

/** BEGIN / COMMIT, o ROLLBACK si fn lanza. Todo por el mismo cliente del pool. */
export async function enTransaccion<T>(pool: Pool, fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}

/** Mensaje de pg cuando no hubo conexión libre dentro de connectionTimeoutMillis. */
export function esPoolAgotado(error: unknown): boolean {
  return error instanceof Error && error.message.includes('timeout exceeded when trying to connect');
}
