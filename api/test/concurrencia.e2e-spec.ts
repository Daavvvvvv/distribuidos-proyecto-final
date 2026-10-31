import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Db } from '../src/db/db';
import { crearApp, enDias, estudiantesDeCarga, limpiarDb, registrar } from './app';

/**
 * La prueba que más vale del proyecto: el cupo se respeta con inscripciones simultáneas
 * repartidas entre 2 réplicas. Cada réplica es una app Nest con su propio pool de conexiones,
 * igual que 2 tareas de ECS contra la misma RDS: el único punto en común es Postgres.
 */
describe('Concurrencia: 200 inscripciones simultáneas, cupo 40, 2 réplicas', () => {
  let replicas: INestApplication[];

  beforeAll(async () => {
    replicas = [await crearApp(), await crearApp()];
    await Promise.all(replicas.map((app) => app.listen(0)));
  });
  afterAll(() => Promise.all(replicas.map((app) => app.close())));

  it('exactamente 40 aceptadas (200) y 160 rechazadas (409), sin sobrecupo ni duplicados', async () => {
    const [replica1] = replicas;
    await limpiarDb(replica1);
    const organizador = await registrar(replica1, 'organizador');
    const evento = await request(replica1.getHttpServer())
      .post('/api/eventos')
      .set('Authorization', `Bearer ${organizador.token}`)
      .send({ titulo: 'Cupo 40', descripcion: 'd', fecha: enDias(7), lugar: 'l', cupo: 40, categoria: 'Otro' })
      .expect(201);
    const tokens = await estudiantesDeCarga(replica1, 200);

    // Todas a la vez, alternando réplica como lo haría el balanceador.
    const respuestas = await Promise.all(
      tokens.map((token, i) =>
        request(replicas[i % 2].getHttpServer())
          .post(`/api/eventos/${evento.body.id}/inscripcion`)
          .set('Authorization', `Bearer ${token}`),
      ),
    );

    const porEstado = respuestas.reduce<Record<number, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    expect(porEstado).toEqual({ 200: 40, 409: 160 });
    for (const r of respuestas.filter((r) => r.status === 409)) {
      expect(r.body).toEqual({ error: 'No quedan cupos para este evento' });
    }

    const { rows } = await replica1.get(Db).query(
      `SELECT e.inscritos,
              (SELECT count(*)::int FROM inscripciones i WHERE i.evento_id = e.id) AS filas,
              (SELECT count(DISTINCT usuario_id)::int FROM inscripciones i WHERE i.evento_id = e.id) AS usuarios,
              (SELECT count(*)::int FROM notificaciones n WHERE n.evento_id = e.id AND n.estado = 'PENDIENTE') AS avisos
       FROM eventos e WHERE e.id = $1`,
      [evento.body.id],
    );
    expect(rows[0]).toEqual({ inscritos: 40, filas: 40, usuarios: 40, avisos: 40 });
  }, 60_000);
});
