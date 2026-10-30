import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { leerConfig } from '../src/config/config';
import { configurarApp } from '../src/configurar-app';
import { Db } from '../src/db/db';

/**
 * Levanta la misma app que main.ts (mismos pipes, filtro y prefijo) contra eventos_test.
 * `env` reemplaza variables para esta réplica (por ejemplo, una cola caída).
 */
export async function crearApp(env: Record<string, string> = {}): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({
    imports: [AppModule.registrar(leerConfig({ ...process.env, ...env }))],
  }).compile();
  const app = modulo.createNestApplication({ bufferLogs: true });
  configurarApp(app);
  await app.init();
  return app;
}

export async function limpiarDb(app: INestApplication): Promise<void> {
  await app.get(Db).query('TRUNCATE notificaciones, inscripciones, eventos, usuarios RESTART IDENTITY CASCADE');
}

let contador = 0;

/** Registra un usuario por la API y devuelve su token. */
export async function registrar(
  app: INestApplication,
  rol: 'estudiante' | 'organizador',
  nombre = `Usuario ${++contador}`,
): Promise<{ token: string; id: number }> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/registro')
    .send({ nombre, email: `u${contador}-${Date.now()}@universidad.edu.co`, password: 'secreto1', rol })
    .expect(201);
  return { token: res.body.token, id: res.body.usuario.id };
}

/**
 * Crea n estudiantes por SQL (registrarlos por la API con bcrypt tardaría segundos) y les firma
 * el token con el mismo JwtService de la app, como lo haría el login.
 */
export async function estudiantesDeCarga(app: INestApplication, n: number): Promise<string[]> {
  const { rows } = await app.get(Db).query<{ id: number; nombre: string }>(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     SELECT 'Carga ' || g, 'carga-' || g || '@universidad.edu.co', 'sin-login', 'estudiante'
     FROM generate_series(1, $1) AS g
     RETURNING id, nombre`,
    [n],
  );
  const jwt = app.get(JwtService);
  return Promise.all(rows.map((u) => jwt.signAsync({ sub: u.id, rol: 'estudiante', nombre: u.nombre })));
}

/** Fecha ISO con zona, `dias` días desde ahora (negativo = pasado). */
export function enDias(dias: number): string {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
}
