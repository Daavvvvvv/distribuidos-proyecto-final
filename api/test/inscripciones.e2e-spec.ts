import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import { Db } from '../src/db/db';
import { crearApp, enDias, limpiarDb, registrar } from './app';

describe('Inscripciones', () => {
  let app: INestApplication;
  let db: Db;
  let organizador: { token: string; id: number };
  let estudiante: { token: string; id: number };
  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function crearEvento(cupo = 40): Promise<number> {
    const res = await http()
      .post('/api/eventos')
      .set(como(organizador.token))
      .send({ titulo: 'Taller', descripcion: 'd', fecha: enDias(7), lugar: 'l', cupo, categoria: 'c' })
      .expect(201);
    return res.body.id;
  }

  const inscribir = (eventoId: number, token = estudiante.token) =>
    http().post(`/api/eventos/${eventoId}/inscripcion`).set(como(token));
  const cancelar = (eventoId: number, token = estudiante.token) =>
    http().delete(`/api/eventos/${eventoId}/inscripcion`).set(como(token));

  async function notificaciones(eventoId: number) {
    const { rows } = await db.query<{ usuario_id: number; estado: string }>(
      'SELECT usuario_id, estado FROM notificaciones WHERE evento_id = $1 ORDER BY id',
      [eventoId],
    );
    return rows;
  }
  async function enDb(eventoId: number) {
    const { rows } = await db.query<{ inscritos: number; filas: number }>(
      `SELECT e.inscritos, (SELECT count(*)::int FROM inscripciones i WHERE i.evento_id = e.id) AS filas
       FROM eventos e WHERE e.id = $1`,
      [eventoId],
    );
    return rows[0];
  }
  const moverAlPasado = (eventoId: number) =>
    db.query(`UPDATE eventos SET fecha = now() - interval '1 day' WHERE id = $1`, [eventoId]);

  beforeAll(async () => {
    app = await crearApp();
    db = app.get(Db);
  });
  beforeEach(async () => {
    await limpiarDb(app);
    organizador = await registrar(app, 'organizador');
    estudiante = await registrar(app, 'estudiante');
  });
  afterAll(() => app.close());

  describe('POST /api/eventos/:id/inscripcion', () => {
    it('inscribe: 200 con el evento actualizado y deja la notificación PENDIENTE en la misma transacción', async () => {
      const eventoId = await crearEvento();
      const res = await inscribir(eventoId).expect(200);
      expect(res.body).toMatchObject({ id: eventoId, inscritos: 1, inscrito: true });
      expect(await enDb(eventoId)).toEqual({ inscritos: 1, filas: 1 });
      expect(await notificaciones(eventoId)).toEqual([{ usuario_id: estudiante.id, estado: 'PENDIENTE' }]);
    });

    it('reintentar la misma inscripción responde 200 sin duplicar inscripción ni notificación', async () => {
      const eventoId = await crearEvento();
      await inscribir(eventoId).expect(200);
      const res = await inscribir(eventoId).expect(200);
      expect(res.body).toMatchObject({ inscritos: 1, inscrito: true });
      expect(await enDb(eventoId)).toEqual({ inscritos: 1, filas: 1 });
      expect(await notificaciones(eventoId)).toHaveLength(1);
    });

    it('doble clic: 10 POST simultáneos del mismo usuario dejan 1 inscripción y todos responden 200', async () => {
      const eventoId = await crearEvento();
      const respuestas = await Promise.all(Array.from({ length: 10 }, () => inscribir(eventoId)));
      expect(respuestas.map((r) => r.status)).toEqual(Array(10).fill(200));
      expect(await enDb(eventoId)).toEqual({ inscritos: 1, filas: 1 });
      expect(await notificaciones(eventoId)).toHaveLength(1);
    });

    it('cupo lleno responde 409 con el mensaje que muestra el frontend', async () => {
      const eventoId = await crearEvento(1);
      const otro = await registrar(app, 'estudiante');
      await inscribir(eventoId, otro.token).expect(200);
      const res = await inscribir(eventoId).expect(409);
      expect(res.body).toEqual({ error: 'No quedan cupos para este evento' });
      expect(await enDb(eventoId)).toEqual({ inscritos: 1, filas: 1 });
    });

    it('con el cupo lleno, quien ya estaba inscrito recibe 200 (idempotencia antes que cupo)', async () => {
      const eventoId = await crearEvento(1);
      await inscribir(eventoId).expect(200);
      await inscribir(eventoId).expect(200);
    });

    it('evento inexistente responde 404 y evento pasado responde 400', async () => {
      await inscribir(999999).expect(404, { error: 'El evento no existe' });
      const eventoId = await crearEvento();
      await moverAlPasado(eventoId);
      await inscribir(eventoId).expect(400, { error: 'El evento ya ocurrió' });
    });

    it('una inscripción insertada por fuera (sin el lock) mientras llega la solicitud no se duplica: 200', async () => {
      const eventoId = await crearEvento();
      // Otra conexión inserta la inscripción sin pasar por la API y no confirma aún. Su llave foránea
      // toma KEY SHARE sobre el evento, así que el FOR UPDATE de la API espera ese COMMIT y luego la ve.
      const externo = new Client({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });
      await externo.connect();
      try {
        await externo.query('BEGIN');
        await externo.query('INSERT INTO inscripciones (usuario_id, evento_id) VALUES ($1, $2)', [estudiante.id, eventoId]);
        const pendiente = inscribir(eventoId).then((r) => r);
        await new Promise((r) => setTimeout(r, 300));
        await externo.query('COMMIT');

        const res = await pendiente;
        expect(res.status).toBe(200);
        expect(res.body.inscrito).toBe(true);
        // La API la tomó como "ya inscrito": no insertó otra fila ni dejó notificación.
        expect(await enDb(eventoId)).toEqual({ inscritos: 0, filas: 1 });
        expect(await notificaciones(eventoId)).toHaveLength(0);
      } finally {
        await externo.end();
      }
    });
  });

  describe('DELETE /api/eventos/:id/inscripcion', () => {
    it('cancela: libera el cupo y descarta el aviso que no había salido', async () => {
      const eventoId = await crearEvento();
      await inscribir(eventoId).expect(200);
      const res = await cancelar(eventoId).expect(200);
      expect(res.body).toMatchObject({ inscritos: 0, inscrito: false });
      expect(await enDb(eventoId)).toEqual({ inscritos: 0, filas: 0 });
      expect(await notificaciones(eventoId)).toEqual([{ usuario_id: estudiante.id, estado: 'DESCARTADA' }]);
    });

    it('cancelar sin estar inscrito responde 200 sin cambiar nada (idempotente)', async () => {
      const eventoId = await crearEvento();
      const otro = await registrar(app, 'estudiante');
      await inscribir(eventoId, otro.token).expect(200);
      const res = await cancelar(eventoId).expect(200);
      expect(res.body).toMatchObject({ inscritos: 1, inscrito: false });
    });

    it('no se puede cancelar un evento que ya ocurrió (400) ni uno inexistente (404)', async () => {
      const eventoId = await crearEvento();
      await inscribir(eventoId).expect(200);
      await moverAlPasado(eventoId);
      await cancelar(eventoId).expect(400, { error: 'El evento ya ocurrió' });
      expect(await enDb(eventoId)).toEqual({ inscritos: 1, filas: 1 });
      await cancelar(999999).expect(404);
    });

    it('cancelar y volver a inscribirse genera un aviso nuevo', async () => {
      const eventoId = await crearEvento();
      await inscribir(eventoId).expect(200);
      await cancelar(eventoId).expect(200);
      await inscribir(eventoId).expect(200);
      expect((await notificaciones(eventoId)).map((n) => n.estado)).toEqual(['DESCARTADA', 'PENDIENTE']);
    });
  });

  describe('GET /api/mis-inscripciones', () => {
    it('devuelve solo los eventos del usuario, con inscrito=true y la forma del contrato', async () => {
      const mio = await crearEvento();
      await crearEvento(); // no inscrito
      await inscribir(mio).expect(200);

      const res = await http().get('/api/mis-inscripciones').set(como(estudiante.token)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id: mio, inscrito: true, inscritos: 1, organizador: expect.any(String) });

      const delOrganizador = await http().get('/api/mis-inscripciones').set(como(organizador.token)).expect(200);
      expect(delOrganizador.body).toEqual([]);
    });
  });
});
