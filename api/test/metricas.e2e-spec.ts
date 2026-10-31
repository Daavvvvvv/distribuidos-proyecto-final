import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearApp, enDias, limpiarDb, registrar } from './app';

describe('GET /metrics', () => {
  let app: INestApplication;
  const metricas = async () => (await request(app.getHttpServer()).get('/metrics').expect(200)).text;

  beforeAll(async () => {
    app = await crearApp();
    await limpiarDb(app);
  });
  afterAll(() => app.close());

  it('responde en formato Prometheus, fuera de /api y sin token', async () => {
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('circuito_validacion_estado 0');
    expect(res.text).toContain('notificaciones_atascadas 0');
    expect(res.text).toContain('process_cpu_user_seconds_total');
    await request(app.getHttpServer()).get('/api/metrics').expect(404);
  });

  it('cuenta inscripciones por resultado y mide las solicitudes por patrón de ruta (no por id)', async () => {
    const organizador = await registrar(app, 'organizador');
    const [a, b] = [await registrar(app, 'estudiante'), await registrar(app, 'estudiante')];
    const evento = await request(app.getHttpServer())
      .post('/api/eventos')
      .set('Authorization', `Bearer ${organizador.token}`)
      .send({ titulo: 'Cupo 1', descripcion: 'd', fecha: enDias(3), lugar: 'l', cupo: 1, categoria: 'Otro' })
      .expect(201);
    const inscribir = (token: string) =>
      request(app.getHttpServer())
        .post(`/api/eventos/${evento.body.id}/inscripcion`)
        .set('Authorization', `Bearer ${token}`);

    await inscribir(a.token).expect(200);
    await inscribir(a.token).expect(200);
    await inscribir(b.token).expect(409);

    const texto = await metricas();
    expect(texto).toContain('inscripciones_total{resultado="inscrito"} 1');
    expect(texto).toContain('inscripciones_total{resultado="ya_inscrito"} 1');
    expect(texto).toContain('inscripciones_total{resultado="cupo_lleno"} 1');
    expect(texto).toMatch(
      /http_solicitudes_duracion_segundos_count\{metodo="POST",ruta="\/api\/eventos\/:id\/inscripcion",estado="409"\} 1/,
    );
    expect(texto).not.toContain(`/api/eventos/${evento.body.id}/`);
  });
});
