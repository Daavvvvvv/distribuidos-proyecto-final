import { Client } from 'pg';
import { crearPool, migrar } from '../src';

// Requiere el Postgres de docker-compose (npm run dev:deps).
const base = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5435),
  user: process.env.DB_USER ?? 'eventos_admin',
  password: process.env.DB_PASSWORD ?? 'eventos_local',
};
const DB_VACIA = 'eventos_migracion_test';

async function admin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const cliente = new Client({ ...base, database: 'postgres' });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

describe('migrar', () => {
  beforeEach(() => admin(async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${DB_VACIA} WITH (FORCE)`);
    await c.query(`CREATE DATABASE ${DB_VACIA}`);
  }));
  afterAll(() => admin((c) => c.query(`DROP DATABASE IF EXISTS ${DB_VACIA} WITH (FORCE)`)));

  it('dos réplicas migrando a la vez sobre una DB vacía terminan sin error y crean las 4 tablas', async () => {
    // Dos pools = dos procesos distintos, como las 2 réplicas de ECS.
    const replicas = [1, 2].map(() => crearPool({ ...base, database: DB_VACIA, ssl: false, max: 2 }));
    try {
      await Promise.all(replicas.map((pool) => migrar(pool)));

      const { rows } = await replicas[0].query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      );
      expect(rows.map((r) => r.table_name)).toEqual(['eventos', 'inscripciones', 'notificaciones', 'usuarios']);

      // Idempotente: correrla otra vez sobre tablas existentes no falla.
      await expect(migrar(replicas[1])).resolves.toBeUndefined();
    } finally {
      await Promise.all(replicas.map((pool) => pool.end()));
    }
  });
});
