import type { Pool } from 'pg';
import { ESQUEMA_SQL } from './schema';

// Llave arbitraria y fija del advisory lock de migración.
const LLAVE_MIGRACION = 731_000_001;

/**
 * Crea las tablas si no existen. Seguro con varias réplicas arrancando a la vez:
 * dos CREATE TABLE IF NOT EXISTS simultáneos pueden chocar en pg_type, así que se serializan
 * con un advisory lock. El lock es de sesión: lock, script y unlock deben ir por el MISMO
 * cliente, por eso se toma uno del pool en vez de usar pool.query sueltos.
 */
export async function migrar(pool: Pool): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query('SELECT pg_advisory_lock($1)', [LLAVE_MIGRACION]);
    try {
      await cliente.query(ESQUEMA_SQL);
    } finally {
      await cliente.query('SELECT pg_advisory_unlock($1)', [LLAVE_MIGRACION]);
    }
  } finally {
    cliente.release();
  }
}
