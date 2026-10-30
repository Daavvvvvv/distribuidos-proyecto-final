import { DeleteMessageCommand, ReceiveMessageCommand, type Message, type SQSClient } from '@aws-sdk/client-sqs';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { crearClienteSqs, leerInscripcionConfirmada, type InscripcionConfirmada } from '@eventos/shared';
import type { PoolClient } from 'pg';
import { CONFIG, type Config } from './config';
import { Db } from './db';
import { Notificador } from './notificador';

type Resultado = 'borrar' | 'reintentar';

/**
 * Ubica la notificación y la bloquea hasta el COMMIT: si el mismo mensaje llega dos veces (a este u
 * otro worker) la segunda copia espera, y al entrar ya la ve ENVIADA. Mensajes de la API traen
 * notificacion_id; uno que siga el contrato al pie de la letra se busca por (usuario, evento).
 */
async function bloquearNotificacion(c: PoolClient, mensaje: InscripcionConfirmada) {
  const { rows } = mensaje.notificacion_id
    ? await c.query<{ id: number; estado: string }>(
        'SELECT id, estado FROM notificaciones WHERE id = $1 FOR UPDATE',
        [mensaje.notificacion_id],
      )
    : await c.query<{ id: number; estado: string }>(
        `SELECT id, estado FROM notificaciones
         WHERE usuario_id = $1 AND evento_id = $2 AND estado = 'PENDIENTE'
         ORDER BY id DESC LIMIT 1
         FOR UPDATE`,
        [mensaje.usuario_id, mensaje.evento_id],
      );
  return rows[0];
}

@Injectable()
export class Consumidor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(Consumidor.name);
  private readonly sqs: SQSClient;
  private readonly detener = new AbortController();
  private ciclo?: Promise<void>;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly db: Db,
    private readonly notificador: Notificador,
  ) {
    // El long polling espera hasta 10 s: el timeout por solicitud debe ser mayor.
    this.sqs = crearClienteSqs({ region: config.awsRegion, endpoint: config.awsEndpointUrl, requestTimeoutMs: 15_000 });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.db.esperarTablas();
    this.ciclo = this.consumir();
    this.logger.log(`Consumiendo ${this.config.queueUrl}`);
  }

  /** SIGTERM: corta el long polling al instante, termina el lote en curso y sale. */
  async onModuleDestroy(): Promise<void> {
    this.detener.abort();
    await this.ciclo;
    this.sqs.destroy();
  }

  private async consumir(): Promise<void> {
    while (!this.detener.signal.aborted) {
      try {
        const { Messages = [] } = await this.sqs.send(
          new ReceiveMessageCommand({ QueueUrl: this.config.queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 10 }),
          { abortSignal: this.detener.signal },
        );
        for (const mensaje of Messages) {
          await this.atender(mensaje);
        }
      } catch (error) {
        if (this.detener.signal.aborted) break;
        this.logger.error(`No se pudo leer la cola, se reintenta en 2 s: ${(error as Error).message}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  private async atender(mensaje: Message): Promise<void> {
    if ((await this.procesar(mensaje.Body)) === 'reintentar') return; // no se borra: reaparece en 30 s
    await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.config.queueUrl, ReceiptHandle: mensaje.ReceiptHandle }));
  }

  /**
   * Notifica y marca ENVIADA en una sola transacción. Devuelve 'reintentar' solo cuando volver a
   * intentarlo puede funcionar (SNS o la base fallaron); lo irrecuperable se borra de la cola.
   */
  async procesar(cuerpo: string | undefined): Promise<Resultado> {
    const mensaje = leerInscripcionConfirmada(cuerpo);
    if (!mensaje) {
      this.logger.warn({ msg: 'Mensaje inválido en la cola, se descarta', cuerpo });
      return 'borrar';
    }

    try {
      await this.db.transaccion(async (c) => {
        const notificacion = await bloquearNotificacion(c, mensaje);
        if (!notificacion) {
          this.logger.warn({ msg: 'Notificación desconocida, se descarta el mensaje', mensaje });
          return;
        }
        if (notificacion.estado !== 'PENDIENTE') return; // duplicado (ENVIADA) o cancelada (DESCARTADA)

        const { rows } = await c.query<{ nombre: string; email: string; titulo: string; fecha: Date; lugar: string }>(
          `SELECT u.nombre, u.email, e.titulo, e.fecha, e.lugar
           FROM notificaciones n
           JOIN usuarios u ON u.id = n.usuario_id
           JOIN eventos e ON e.id = n.evento_id
           WHERE n.id = $1`,
          [notificacion.id],
        );
        await this.notificador.enviar({ notificacionId: notificacion.id, ...rows[0] });
        // Si el proceso muere entre el envío y este COMMIT, el aviso se repite una vez:
        // entrega al-menos-una-vez (ver DISENO-BACKEND.md, sección Worker).
        await c.query(`UPDATE notificaciones SET estado = 'ENVIADA', enviada_en = now() WHERE id = $1`, [notificacion.id]);
      });
      return 'borrar';
    } catch (error) {
      this.logger.error(`No se pudo notificar; el mensaje vuelve a la cola: ${(error as Error).message}`);
      return 'reintentar';
    }
  }
}
