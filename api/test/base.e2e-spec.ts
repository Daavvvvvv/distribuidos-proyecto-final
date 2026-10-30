import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearApp } from './app';

describe('Base de la API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await crearApp();
  });
  afterAll(() => app.close());

  it('GET /health responde 200 fuera del prefijo /api y sin token', async () => {
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
  });

  it('las rutas de negocio viven bajo /api: sin prefijo no existen', async () => {
    const res = await request(app.getHttpServer()).get('/eventos').expect(404);
    expect(res.body).toEqual({ error: 'Recurso no encontrado' });
  });

  it('ruta inexistente bajo /api responde { error } en español, no el formato de Nest', async () => {
    const res = await request(app.getHttpServer()).get('/api/no-existe').expect(404);
    expect(res.body).toEqual({ error: 'Recurso no encontrado' });
  });

  it('JSON malformado responde 400 con { error }', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(typeof res.body.error).toBe('string');
    expect(Object.keys(res.body)).toEqual(['error']);
  });
});
