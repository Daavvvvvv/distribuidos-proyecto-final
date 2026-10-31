import { DeleteMessageCommand, ReceiveMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import { INestApplication } from '@nestjs/common';
import { crearClienteSqs, leerInscripcionConfirmada, type InscripcionConfirmada } from '@eventos/shared';
import net from 'node:net';
import request from 'supertest';
import { Db } from '../src/db/db';
import { NotificacionesService } from '../src/notificaciones/notificaciones.service';
import { crearApp, enDias, limpiarDb, registrar } from './app';

/** Saca y borra todo lo que haya en la cola de pruebas. */
async function vaciarCola(sqs: SQSClient): Promise<InscripcionConfirmada[]> {
  const leidos: InscripcionConfirmada[] = [];
  for (;;) {
    const { Messages = [] } = await sqs.send(
      new ReceiveMessageCommand({ QueueUrl: process.env.QUEUE_URL, MaxNumberOfMessages: 10, WaitTimeSeconds: 1 }),
    );
    if (Messages.length === 0) return leidos;
    for (const m of Messages) {
      leidos.push(leerInscripcionConfirmada(m.Body)!);
      await sqs.send(new DeleteMessageCommand({ QueueUrl: process.env.QUEUE_URL, ReceiptHandle: m.ReceiptHandle }));
    }
  }
}

describe('Notificaciones: outbox hacia SQS', () => {
  let app: INestApplication;
  let db: Db;
  let sqs: SQSClient;
  let organizador: { token: string; id: number };
  let estudiante: { token: string; id: number };

  async function crearEvento(): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/api/eventos')
      .set('Authorization', `Bearer ${organizador.token}`)
      .send({ titulo: 'Taller', descripcion: 'd', fecha: enDias(7), lugar: 'l', cupo: 100, categoria: 'Otro' })
      .expect(201);
    return res.body.id;
  }
  const inscribir = (en: INestApplication, eventoId: number, token = estudiante.token) =>
    request(en.getHttpServer()).post(`/api/eventos/${eventoId}/inscripcion`).set('Authorization', `Bearer ${token}`);
  const filas = async () =>
    (
      await db.query<{ id: number; encolada: boolean }>(
        'SELECT id, encolada_en IS NOT NULL AS encolada FROM notificaciones ORDER BY id',
      )
    ).rows;
  /** Simula que el aviso tiene 1 minuto (el barrido solo toma los de más de 30 s). */
  const envejecer = () => db.query(`UPDATE notificaciones SET creado_en = now() - interval '1 minute'`);

  beforeAll(async () => {
    app = await crearApp();
    db = app.get(Db);
    sqs = crearClienteSqs({ region: 'us-east-1', endpoint: process.env.AWS_ENDPOINT_URL });
  });
  beforeEach(async () => {
    await limpiarDb(app);
    await vaciarCola(sqs);
    organizador = await registrar(app, 'organizador');
    estudiante = await registrar(app, 'estudiante');
  });
  afterAll(async () => {
    await app.close();
    sqs.destroy();
  });

  it('al inscribirse publica InscripcionConfirmada en la cola y marca encolada_en', async () => {
    const eventoId = await crearEvento();
    await inscribir(app, eventoId).expect(200);

    const [fila] = await filas();
    expect(fila.encolada).toBe(true);
    expect(await vaciarCola(sqs)).toEqual([
      { tipo: 'InscripcionConfirmada', evento_id: eventoId, usuario_id: estudiante.id, notificacion_id: fila.id },
    ]);
  });

  it('reintentar la inscripción no publica un segundo mensaje', async () => {
    const eventoId = await crearEvento();
    await inscribir(app, eventoId).expect(200);
    await inscribir(app, eventoId).expect(200);
    expect(await vaciarCola(sqs)).toHaveLength(1);
  });

  it('con SQS caído la inscripción igual responde 200, y el barrido de otra réplica la reencola', async () => {
    const sinCola = await crearApp({ AWS_ENDPOINT_URL: 'http://localhost:1', QUEUE_URL: 'http://localhost:1/000000000000/x' });
    try {
      const eventoId = await crearEvento();
      const res = await inscribir(sinCola, eventoId).expect(200);
      expect(res.body.inscrito).toBe(true);
      expect(await filas()).toEqual([{ id: expect.any(Number), encolada: false }]);
      expect(await vaciarCola(sqs)).toEqual([]);
    } finally {
      await sinCola.close();
    }

    await envejecer();
    expect(await app.get(NotificacionesService).barrer()).toEqual({ reencoladas: 1, atascadas: 0 });
    expect(await filas()).toEqual([{ id: expect.any(Number), encolada: true }]);
    expect(await vaciarCola(sqs)).toHaveLength(1);
  });

  it('con SQS colgado (acepta la conexión y no responde) la inscripción responde en menos de 6 s', async () => {
    const colgado = net.createServer(() => undefined); // nunca responde
    await new Promise<void>((ok) => colgado.listen(0, ok));
    const puerto = (colgado.address() as net.AddressInfo).port;
    const lenta = await crearApp({
      AWS_ENDPOINT_URL: `http://localhost:${puerto}`,
      QUEUE_URL: `http://localhost:${puerto}/000000000000/x`,
    });
    try {
      const eventoId = await crearEvento();
      const inicio = Date.now();
      await inscribir(lenta, eventoId).expect(200);
      expect(Date.now() - inicio).toBeLessThan(6000);
      expect(await filas()).toEqual([{ id: expect.any(Number), encolada: false }]);
    } finally {
      await lenta.close();
      colgado.close();
    }
  }, 15_000);

  it('el barrido no toca avisos recientes (< 30 s), descartados ni ya encolados', async () => {
    const eventoId = await crearEvento();
    await db.query(
      `INSERT INTO notificaciones (usuario_id, evento_id, estado, encolada_en, creado_en) VALUES
         ($1, $2, 'PENDIENTE', NULL, now()),                                     -- reciente
         ($1, $2, 'DESCARTADA', NULL, now() - interval '1 minute'),              -- cancelado
         ($1, $2, 'PENDIENTE', now() - interval '1 minute', now() - interval '1 minute')`, // ya en la cola
      [estudiante.id, eventoId],
    );
    expect(await app.get(NotificacionesService).barrer()).toEqual({ reencoladas: 0, atascadas: 0 });
    expect(await vaciarCola(sqs)).toEqual([]);
  });

  it('dos réplicas barriendo a la vez reencolan cada aviso una sola vez (SKIP LOCKED)', async () => {
    const otraReplica = await crearApp();
    try {
      const eventoId = await crearEvento();
      await db.query(
        `INSERT INTO notificaciones (usuario_id, evento_id, creado_en)
         SELECT $1, $2, now() - interval '1 minute' FROM generate_series(1, 30)`,
        [estudiante.id, eventoId],
      );
      const [a, b] = await Promise.all([
        app.get(NotificacionesService).barrer(),
        otraReplica.get(NotificacionesService).barrer(),
      ]);
      // Lote de 20 por pasada: entre las dos réplicas cubren las 30 sin repetir.
      expect(a.reencoladas + b.reencoladas).toBe(30);

      const mensajes = await vaciarCola(sqs);
      const ids = new Set(mensajes.map((m) => m.notificacion_id));
      expect(mensajes).toHaveLength(30);
      expect(ids.size).toBe(30);
      expect((await filas()).every((f) => f.encolada)).toBe(true);
    } finally {
      await otraReplica.close();
    }
  });

  it('cuenta como atascados los avisos encolados hace más de 5 min que siguen PENDIENTE (probable DLQ)', async () => {
    const eventoId = await crearEvento();
    await db.query(
      `INSERT INTO notificaciones (usuario_id, evento_id, encolada_en, creado_en)
       VALUES ($1, $2, now() - interval '10 minutes', now() - interval '10 minutes')`,
      [estudiante.id, eventoId],
    );
    expect(await app.get(NotificacionesService).barrer()).toEqual({ reencoladas: 0, atascadas: 1 });
  });
});
