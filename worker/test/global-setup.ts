import { crearPool, migrar } from '@eventos/shared';
import { Client, DatabaseError } from 'pg';
import './env';

/** Crea eventos_test y sus tablas (en producción las crea la API; el worker solo las espera). */
export default async function globalSetup(): Promise<void> {
  const base = {
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
  };
  const admin = new Client({ ...base, database: 'postgres' });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${process.env.DB_NAME}`);
  } catch (error) {
    if (!(error instanceof DatabaseError && error.code === '42P04')) throw error;
  } finally {
    await admin.end();
  }
  const pool = crearPool({ ...base, database: process.env.DB_NAME!, ssl: false, max: 1 });
  await migrar(pool);
  await pool.end();
}
