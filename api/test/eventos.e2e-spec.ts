import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Db } from '../src/db/db';
import { crearApp, enDias, limpiarDb, registrar } from './app';

describe('Eventos (/api/eventos)', () => {
  let app: INestApplication;
  let organizador: { token: string; id: number };
  let estudiante: { token: string; id: number };
  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({ Authorization: `Bearer ${token}` });

  const nuevo = (cambios: Record<string, unknown> = {}) => ({
    titulo: 'Taller de NestJS',
    descripcion: 'API REST desde cero',
    fecha: enDias(7),
    lugar: 'Bloque 19',
    cupo: 40,
    categoria: 'Tecnología',
    ...cambios,
  });

  async function crearEvento(cambios: Record<string, unknown> = {}) {
    const res = await http().post('/api/eventos').set(como(organizador.token)).send(nuevo(cambios)).expect(201);
    return res.body;
  }

  beforeAll(async () => {
    app = await crearApp();
  });
  beforeEach(async () => {
    await limpiarDb(app);
    organizador = await registrar(app, 'organizador', 'Club de Software');
    estudiante = await registrar(app, 'estudiante');
  });
  afterAll(() => app.close());

  describe('POST /api/eventos', () => {
    it('el organizador crea un evento y recibe la forma exacta del contrato', async () => {
      const evento = await crearEvento();
      expect(evento).toEqual({
        id: expect.any(Number),
        titulo: 'Taller de NestJS',
        descripcion: 'API REST desde cero',
        fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        lugar: 'Bloque 19',
        cupo: 40,
        inscritos: 0,
        categoria: 'Tecnología',
        organizador: 'Club de Software',
        universidad: { id: expect.any(Number), nombre: 'Universidad Demo (cuentas de prueba)', sigla: 'Demo' },
        inscrito: false,
      });
    });

    it('guarda la hora correcta cuando la fecha viene con zona de Colombia', async () => {
      const evento = await crearEvento({ fecha: '2099-11-03T08:00:00-05:00' });
      expect(evento.fecha).toBe('2099-11-03T13:00:00.000Z');
    });

    it('un estudiante no puede crear eventos (403)', async () => {
      const res = await http().post('/api/eventos').set(como(estudiante.token)).send(nuevo()).expect(403);
      expect(res.body).toEqual({ error: 'Solo los organizadores pueden hacer esto' });
    });

    it.each([
      [{ fecha: '2099-11-03T08:00' }, 'La fecha debe incluir zona horaria (por ejemplo 2026-11-03T08:00:00-05:00)'],
      [{ fecha: 'mañana' }, 'La fecha no es válida'],
      [{ fecha: enDias(-1) }, 'La fecha del evento debe ser futura'],
      [{ cupo: 0 }, 'El cupo debe ser al menos 1'],
      [{ cupo: 2.5 }, 'El cupo debe ser un número entero'],
      [{ cupo: '40' }, 'El cupo debe ser un número entero'],
      [{ titulo: 'ab' }, 'El título debe tener entre 3 y 120 caracteres'],
      [{ categoria: undefined }, 'La categoría es obligatoria'],
    ])('datos inválidos responden 400: %j', async (cambios, mensaje) => {
      const res = await http().post('/api/eventos').set(como(organizador.token)).send(nuevo(cambios)).expect(400);
      expect(res.body).toEqual({ error: mensaje });
    });
  });

  describe('GET /api/eventos', () => {
    it('filtra por texto (título o descripción, sin distinguir mayúsculas) y por categoría', async () => {
      await crearEvento({ titulo: 'Taller de NestJS', categoria: 'Tecnología' });
      await crearEvento({ titulo: 'Torneo de ajedrez', descripcion: 'Partidas rápidas', categoria: 'Deportes' });
      await crearEvento({ titulo: 'Cine foro', descripcion: 'Ajedrez en el cine', categoria: 'Cultura' });

      const porTexto = await http().get('/api/eventos').query({ q: 'AJEDREZ' }).set(como(estudiante.token)).expect(200);
      expect(porTexto.body.map((e: { titulo: string }) => e.titulo).sort()).toEqual(['Cine foro', 'Torneo de ajedrez']);

      const porCategoria = await http()
        .get('/api/eventos')
        .query({ q: 'ajedrez', categoria: 'Deportes' })
        .set(como(estudiante.token))
        .expect(200);
      expect(porCategoria.body.map((e: { titulo: string }) => e.titulo)).toEqual(['Torneo de ajedrez']);
    });

    it('un % en la búsqueda se trata como texto, no como comodín', async () => {
      await crearEvento({ titulo: 'Descuento 100% gratis' });
      await crearEvento({ titulo: 'Charla normal' });
      const res = await http().get('/api/eventos').query({ q: '%' }).set(como(estudiante.token)).expect(200);
      expect(res.body.map((e: { titulo: string }) => e.titulo)).toEqual(['Descuento 100% gratis']);
    });

    it('ordena: primero los próximos (más cercano primero) y después los pasados (más reciente primero)', async () => {
      const proximo = await crearEvento({ titulo: 'Próximo' });
      const lejano = await crearEvento({ titulo: 'Lejano', fecha: enDias(30) });
      const pasadoReciente = await crearEvento({ titulo: 'Pasado reciente' });
      const pasadoViejo = await crearEvento({ titulo: 'Pasado viejo' });
      // No se pueden crear eventos pasados por la API: se mueven en la DB.
      const db = app.get(Db);
      await db.query(`UPDATE eventos SET fecha = now() - interval '1 day' WHERE id = $1`, [pasadoReciente.id]);
      await db.query(`UPDATE eventos SET fecha = now() - interval '10 days' WHERE id = $1`, [pasadoViejo.id]);

      const res = await http().get('/api/eventos').set(como(estudiante.token)).expect(200);
      expect(res.body.map((e: { id: number }) => e.id)).toEqual([
        proximo.id,
        lejano.id,
        pasadoReciente.id,
        pasadoViejo.id,
      ]);
    });

    it('marca inscrito=true solo para el usuario que está inscrito', async () => {
      const evento = await crearEvento();
      await app.get(Db).query('INSERT INTO inscripciones (usuario_id, evento_id) VALUES ($1, $2)', [
        estudiante.id,
        evento.id,
      ]);
      const delInscrito = await http().get('/api/eventos').set(como(estudiante.token)).expect(200);
      const deOtro = await http().get('/api/eventos').set(como(organizador.token)).expect(200);
      expect(delInscrito.body[0].inscrito).toBe(true);
      expect(deOtro.body[0].inscrito).toBe(false);
    });

    it('devuelve como máximo 200 eventos', async () => {
      await app.get(Db).query(
        `INSERT INTO eventos (titulo, descripcion, fecha, lugar, cupo, categoria, organizador_id)
         SELECT 'Evento ' || n, 'd', now() + n * interval '1 hour', 'l', 10, 'c', $1
         FROM generate_series(1, 205) AS n`,
        [organizador.id],
      );
      const res = await http().get('/api/eventos').set(como(estudiante.token)).expect(200);
      expect(res.body).toHaveLength(200);
    });
  });

  describe('GET /api/eventos/:id', () => {
    it('devuelve el evento', async () => {
      const evento = await crearEvento();
      const res = await http().get(`/api/eventos/${evento.id}`).set(como(estudiante.token)).expect(200);
      expect(res.body).toEqual(evento);
    });

    it('evento inexistente responde 404', async () => {
      const res = await http().get('/api/eventos/999999').set(como(estudiante.token)).expect(404);
      expect(res.body).toEqual({ error: 'El evento no existe' });
    });

    it.each(['abc', '0', '-1', '1.5', '99999999999'])('id inválido "%s" responde 400 (nunca 500)', async (id) => {
      const res = await http().get(`/api/eventos/${id}`).set(como(estudiante.token)).expect(400);
      expect(res.body).toEqual({ error: 'Evento inválido' });
    });
  });

  describe('GET /api/eventos/:id/inscritos', () => {
    it('el organizador dueño ve los inscritos en orden de inscripción', async () => {
      const evento = await crearEvento();
      const otro = await registrar(app, 'estudiante', 'Beto');
      const db = app.get(Db);
      await db.query('INSERT INTO inscripciones (usuario_id, evento_id) VALUES ($1, $2)', [otro.id, evento.id]);
      await db.query('INSERT INTO inscripciones (usuario_id, evento_id) VALUES ($1, $2)', [estudiante.id, evento.id]);

      const res = await http().get(`/api/eventos/${evento.id}/inscritos`).set(como(organizador.token)).expect(200);
      expect(res.body).toEqual([
        { id: otro.id, nombre: 'Beto', email: expect.any(String) },
        { id: estudiante.id, nombre: expect.any(String), email: expect.any(String) },
      ]);
    });

    it('otro organizador no puede verlos (403)', async () => {
      const evento = await crearEvento();
      const ajeno = await registrar(app, 'organizador');
      const res = await http().get(`/api/eventos/${evento.id}/inscritos`).set(como(ajeno.token)).expect(403);
      expect(res.body).toEqual({ error: 'Solo el organizador del evento puede ver los inscritos' });
    });

    it('un estudiante no puede verlos (403)', async () => {
      const evento = await crearEvento();
      await http().get(`/api/eventos/${evento.id}/inscritos`).set(como(estudiante.token)).expect(403);
    });

    it('evento inexistente responde 404', async () => {
      await http().get('/api/eventos/999999/inscritos').set(como(organizador.token)).expect(404);
    });
  });
});
