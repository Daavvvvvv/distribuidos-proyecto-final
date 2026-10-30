import { Client, DatabaseError } from 'pg';
import './env';

/** Crea la base eventos_test si no existe (requiere `npm run dev:deps`). */
export default async function globalSetup(): Promise<void> {
  const cliente = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await cliente.connect();
  try {
    await cliente.query(`CREATE DATABASE ${process.env.DB_NAME}`);
  } catch (error) {
    if (!(error instanceof DatabaseError && error.code === '42P04')) throw error; // ya existe
  } finally {
    await cliente.end();
  }
}
