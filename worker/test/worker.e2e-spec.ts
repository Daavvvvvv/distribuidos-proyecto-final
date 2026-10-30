import {
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  SendMessageCommand,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { crearClienteSqs, crearPool } from '@eventos/shared';
import http from 'node:http';
import type { Pool } from 'pg';
import { leerConfig } from '../src/config';
import { WorkerModule } from '../src/worker.module';

const COLA = process.env.QUEUE_URL!;
const DLQ = COLA.replace('notificaciones-worker-test', 'notificaciones-worker-test-dlq');
const TEMA = 'arn:aws:sns:us-east-1:000000000000:notificaciones';

/** SNS simulado (protocolo awsQuery): cuenta los Publish y puede fallar a pedido. */
function crearSnsFalso() {
  const publicados: URLSearchParams[] = [];
  let fallar = false;
  const servidor = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (p) => (cuerpo += p));
    req.on('end', () => {
      if (fallar) {
        res.writeHead(500, { 'Content-Type': 'text/xml' });
        res.end('<ErrorResponse><Error><Type>Receiver</Type><Code>InternalError</Code><Message>caído</Message></Error></ErrorResponse>');
        return;
      }
      publicados.push(new URLSearchParams(cuerpo));
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(
        '<PublishResponse xmlns="http://sns.amazonaws.com/doc/2010-03-31/"><PublishResult>' +
          `<MessageId>m-${publicados.length}</MessageId></PublishResult>` +
          '<ResponseMetadata><RequestId>r</RequestId></ResponseMetadata></PublishResponse>',
      );
    });
  });
  return {
    publicados,
    fallar: (valor: boolean) => (fallar = valor),
    url: async () => {
      await new Promise<void>((ok) => servidor.listen(0, ok));
      return `http://localhost:${(servidor.address() as { port: number }).port}`;
    },
    cerrar: () => new Promise((ok) => servidor.close(ok)),
  };
}

async function esperarHasta(condicion: () => Promise<boolean>, ms = 15_000): Promise<void> {
  const limite = Date.now() + ms;
  while (!(await condicion())) {
    if (Date.now() > limite) throw new Error('La condición no se cumplió a tiempo');
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe('Worker de notificaciones', () => {
  let pool: Pool;
  let sqs: SQSClient;
  let sns: ReturnType<typeof crearSnsFalso>;
  let snsUrl: string;
  const workers: INestApplicationContext[] = [];

  async function iniciarWorker(env: Record<string, string> = {}): Promise<INestApplicationContext> {
    const config = leerConfig({ ...process.env, SNS_TOPIC_ARN: TEMA, AWS_ENDPOINT_URL_SNS: snsUrl, ...env });
    const app = await NestFactory.createApplicationContext(WorkerModule.registrar(config), { logger: false });
    workers.push(app);
    return app;
  }

  /** Inserta usuario + evento + notificación PENDIENTE y devuelve sus ids. */
  async function notificacionPendiente(estado = 'PENDIENTE') {
    const u = await pool.query<{ id: number }>(
      `INSERT INTO usuarios (nombre, email, password_hash, rol)
       VALUES ('Ana', 'ana-' || gen_random_uuid() || '@universidad.edu.co', 'x', 'estudiante') RETURNING id`,
    );
    const e = await pool.query<{ id: number }>(
      `INSERT INTO eventos (titulo, descripcion, fecha, lugar, cupo, categoria, organizador_id)
       VALUES ('Taller de NestJS', 'd', now() + interval '7 days', 'Bloque 19', 10, 'c', $1) RETURNING id`,
      [u.rows[0].id],
    );
    const n = await pool.query<{ id: number }>(
      'INSERT INTO notificaciones (usuario_id, evento_id, estado) VALUES ($1, $2, $3) RETURNING id',
      [u.rows[0].id, e.rows[0].id, estado],
    );
    return { usuario_id: u.rows[0].id, evento_id: e.rows[0].id, notificacion_id: n.rows[0].id };
  }

  const enviar = (cuerpo: object | string) =>
    sqs.send(new SendMessageCommand({ QueueUrl: COLA, MessageBody: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }));

  async function mensajesEn(cola: string): Promise<number> {
    const { Attributes = {} } = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: cola,
        AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
      }),
    );
    return Number(Attributes.ApproximateNumberOfMessages) + Number(Attributes.ApproximateNumberOfMessagesNotVisible);
  }

  async function estado(id: number) {
    const { rows } = await pool.query<{ estado: string; enviada: boolean }>(
      'SELECT estado, enviada_en IS NOT NULL AS enviada FROM notificaciones WHERE id = $1',
      [id],
    );
    return rows[0];
  }

  beforeAll(async () => {
    pool = crearPool({
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      ssl: false,
      max: 2,
    });
    sqs = crearClienteSqs({ region: 'us-east-1', endpoint: process.env.AWS_ENDPOINT_URL });
    sns = crearSnsFalso();
    snsUrl = await sns.url();
  });
  beforeEach(async () => {
    sns.publicados.length = 0;
    sns.fallar(false);
    await pool.query('TRUNCATE notificaciones, inscripciones, eventos, usuarios RESTART IDENTITY CASCADE');
    await sqs.send(new PurgeQueueCommand({ QueueUrl: COLA }));
    await sqs.send(new PurgeQueueCommand({ QueueUrl: DLQ }));
  });
  afterEach(async () => {
    await Promise.all(workers.splice(0).map((w) => w.close()));
  });
  afterAll(async () => {
    await pool.end();
    sqs.destroy();
    await sns.cerrar();
  });

  it('publica en SNS, marca ENVIADA con fecha y borra el mensaje', async () => {
    const ids = await notificacionPendiente();
    await iniciarWorker();
    await enviar({ tipo: 'InscripcionConfirmada', ...ids });

    await esperarHasta(async () => (await estado(ids.notificacion_id)).estado === 'ENVIADA');
    expect(await estado(ids.notificacion_id)).toEqual({ estado: 'ENVIADA', enviada: true });
    expect(sns.publicados).toHaveLength(1);
    expect(sns.publicados[0].get('TopicArn')).toBe(TEMA);
    expect(sns.publicados[0].get('Subject')).toBe('Inscripcion confirmada');
    expect(sns.publicados[0].get('Message')).toContain('Taller de NestJS');
    await esperarHasta(async () => (await mensajesEn(COLA)) === 0);
  });

  it('el mismo mensaje entregado varias veces a 2 workers produce una sola publicación', async () => {
    const ids = await notificacionPendiente();
    await Promise.all([iniciarWorker(), iniciarWorker()]);
    await Promise.all(Array.from({ length: 5 }, () => enviar({ tipo: 'InscripcionConfirmada', ...ids })));

    await esperarHasta(async () => (await mensajesEn(COLA)) === 0);
    expect(sns.publicados).toHaveLength(1);
    expect((await estado(ids.notificacion_id)).estado).toBe('ENVIADA');
  });

  it('si SNS falla no borra el mensaje: reaparece y al 3er intento queda en la DLQ, la notificación sigue PENDIENTE', async () => {
    const ids = await notificacionPendiente();
    sns.fallar(true);
    await iniciarWorker();
    await enviar({ tipo: 'InscripcionConfirmada', ...ids });

    await esperarHasta(async () => (await mensajesEn(DLQ)) === 1, 20_000);
    expect(await mensajesEn(COLA)).toBe(0);
    expect(await estado(ids.notificacion_id)).toEqual({ estado: 'PENDIENTE', enviada: false });
  }, 30_000);

  it('cuando SNS vuelve, el reintento de la cola completa el envío', async () => {
    const ids = await notificacionPendiente();
    sns.fallar(true);
    await iniciarWorker();
    await enviar({ tipo: 'InscripcionConfirmada', ...ids });
    await new Promise((r) => setTimeout(r, 300)); // primer intento falla
    sns.fallar(false);

    await esperarHasta(async () => (await estado(ids.notificacion_id)).estado === 'ENVIADA');
    expect(sns.publicados).toHaveLength(1);
    expect(await mensajesEn(DLQ)).toBe(0);
  });

  it('una notificación DESCARTADA (inscripción cancelada) no se envía y el mensaje se borra', async () => {
    const ids = await notificacionPendiente('DESCARTADA');
    await iniciarWorker();
    await enviar({ tipo: 'InscripcionConfirmada', ...ids });

    await esperarHasta(async () => (await mensajesEn(COLA)) === 0);
    expect(sns.publicados).toHaveLength(0);
    expect((await estado(ids.notificacion_id)).estado).toBe('DESCARTADA');
  });

  it.each([
    ['JSON inválido', '{"tipo":'],
    ['otro tipo', { tipo: 'Otro', evento_id: 1, usuario_id: 1 }],
    ['notificación inexistente', { tipo: 'InscripcionConfirmada', evento_id: 1, usuario_id: 1, notificacion_id: 999999 }],
  ])('%s: se borra sin publicar y sin ir a la DLQ', async (_caso, cuerpo) => {
    await iniciarWorker();
    await enviar(cuerpo);
    await esperarHasta(async () => (await mensajesEn(COLA)) === 0);
    expect(sns.publicados).toHaveLength(0);
    expect(await mensajesEn(DLQ)).toBe(0);
  });

  it('acepta el mensaje literal del contrato (sin notificacion_id) y ubica la PENDIENTE por usuario y evento', async () => {
    const { usuario_id, evento_id, notificacion_id } = await notificacionPendiente();
    await iniciarWorker();
    await enviar({ tipo: 'InscripcionConfirmada', evento_id, usuario_id });

    await esperarHasta(async () => (await estado(notificacion_id)).estado === 'ENVIADA');
    expect(sns.publicados).toHaveLength(1);
  });

  it('sin SNS_TOPIC_ARN solo registra el envío en el log y marca ENVIADA', async () => {
    const ids = await notificacionPendiente();
    await iniciarWorker({ SNS_TOPIC_ARN: '' });
    await enviar({ tipo: 'InscripcionConfirmada', ...ids });

    await esperarHasta(async () => (await estado(ids.notificacion_id)).estado === 'ENVIADA');
    expect(sns.publicados).toHaveLength(0);
  });

  it('SIGTERM: el cierre corta el long polling de 10 s y termina en menos de 2 s', async () => {
    const worker = await iniciarWorker();
    await new Promise((r) => setTimeout(r, 500)); // ya está esperando en ReceiveMessage
    const inicio = Date.now();
    await worker.close();
    workers.splice(workers.indexOf(worker), 1);
    expect(Date.now() - inicio).toBeLessThan(2000);
  });
});
