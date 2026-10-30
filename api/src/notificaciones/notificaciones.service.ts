import { SendMessageBatchCommand, SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { crearClienteSqs, crearInscripcionConfirmada } from '@eventos/shared';
import { CONFIG, type Config } from '../config/config';
import { Db } from '../db/db';
import { Metricas } from '../metricas/metricas';

interface FilaNotificacion {
  id: number;
  evento_id: number;
  usuario_id: number;
}

export interface ResultadoBarrido {
  /** Avisos reencolados en esta pasada. */
  reencoladas: number;
  /** PENDIENTE ya encolados hace más de 5 min: probablemente terminaron en la DLQ. */
  atascadas: number;
}

const INTERVALO_BARRIDO_MS = 30_000;
const LOTE_BARRIDO = 20;
const LOTE_SQS = 10; // máximo de SendMessageBatch

/**
 * Lado productor del outbox. La fila `notificaciones` (PENDIENTE) se guarda en la transacción de la
 * inscripción; aquí se manda a la cola después del COMMIT. Si SQS falla, la inscripción no se ve
 * afectada: el barrido de cualquier réplica reencola lo que no llegó.
 */
@Injectable()
export class NotificacionesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificacionesService.name);
  private readonly sqs: SQSClient;
  private temporizador?: NodeJS.Timeout;
  private barridoEnCurso?: Promise<unknown>;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly db: Db,
    private readonly metricas: Metricas,
  ) {
    this.sqs = crearClienteSqs({ region: config.awsRegion, endpoint: config.awsEndpointUrl });
  }

  onApplicationBootstrap(): void {
    this.temporizador = setInterval(() => {
      if (this.barridoEnCurso) return; // una pasada a la vez por réplica
      this.barridoEnCurso = this.barrer()
        .catch((error) => this.logger.error(`Barrido de notificaciones falló: ${error.message}`))
        .finally(() => (this.barridoEnCurso = undefined));
    }, INTERVALO_BARRIDO_MS);
  }

  /** Corre ANTES de cerrar el pool (onApplicationShutdown): deja de programar y espera la pasada en curso. */
  async onModuleDestroy(): Promise<void> {
    clearInterval(this.temporizador);
    await this.barridoEnCurso;
    this.sqs.destroy();
  }

  /** Envío inmediato tras el COMMIT. Nunca lanza: si falla, queda para el barrido. */
  async encolar(notificacion: FilaNotificacion): Promise<void> {
    try {
      await this.sqs.send(
        new SendMessageCommand({
          QueueUrl: this.config.queueUrl,
          MessageBody: JSON.stringify(crearInscripcionConfirmada(notificacion)),
        }),
      );
      await this.db.query('UPDATE notificaciones SET encolada_en = now() WHERE id = $1', [notificacion.id]);
    } catch (error) {
      this.logger.warn(
        `No se pudo encolar la notificación ${notificacion.id}; la reintenta el barrido: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Reencola los avisos PENDIENTE que nunca llegaron a la cola (API caída o SQS fallando justo
   * después del COMMIT). FOR UPDATE SKIP LOCKED: las 2 réplicas barren a la vez sin tomar las mismas filas.
   */
  async barrer(): Promise<ResultadoBarrido> {
    const reencoladas = await this.db.transaccion(async (c) => {
      const { rows } = await c.query<FilaNotificacion>(
        `SELECT id, evento_id, usuario_id FROM notificaciones
         WHERE estado = 'PENDIENTE' AND encolada_en IS NULL AND creado_en < now() - interval '30 seconds'
         ORDER BY creado_en
         LIMIT ${LOTE_BARRIDO}
         FOR UPDATE SKIP LOCKED`,
      );
      const enviadas: number[] = [];
      for (let i = 0; i < rows.length; i += LOTE_SQS) {
        const lote = rows.slice(i, i + LOTE_SQS);
        try {
          const respuesta = await this.sqs.send(
            new SendMessageBatchCommand({
              QueueUrl: this.config.queueUrl,
              Entries: lote.map((fila) => ({
                Id: `n${fila.id}`,
                MessageBody: JSON.stringify(crearInscripcionConfirmada(fila)),
              })),
            }),
          );
          enviadas.push(...(respuesta.Successful ?? []).map((ok) => Number(ok.Id!.slice(1))));
        } catch (error) {
          // Se confirma lo que ya salió (si no, se reenviaría); el resto queda para la próxima pasada.
          this.logger.warn(`Barrido: SQS no respondió, se reintenta en la próxima pasada: ${(error as Error).message}`);
          break;
        }
      }
      if (enviadas.length > 0) {
        await c.query('UPDATE notificaciones SET encolada_en = now() WHERE id = ANY($1)', [enviadas]);
      }
      return enviadas.length;
    });

    // Lo que ya se encoló y sigue PENDIENTE después de 5 min casi seguro está en la DLQ:
    // se recupera a mano con un redrive de la DLQ (ver DISENO-BACKEND.md).
    const { rows } = await this.db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM notificaciones
       WHERE estado = 'PENDIENTE' AND encolada_en < now() - interval '5 minutes'`,
    );
    const atascadas = rows[0].total;
    this.metricas.notificacionesAtascadas.set(atascadas);
    if (reencoladas > 0) this.logger.log(`Barrido: ${reencoladas} notificaciones reencoladas`);
    if (atascadas > 0) this.logger.warn(`Barrido: ${atascadas} notificaciones atascadas (revisar la DLQ)`);
    return { reencoladas, atascadas };
  }
}
