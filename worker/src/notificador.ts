import { PublishCommand, type SNSClient } from '@aws-sdk/client-sns';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { crearClienteSns } from '@eventos/shared';
import { CONFIG, type Config } from './config';

export interface Aviso {
  notificacionId: number;
  nombre: string;
  email: string;
  titulo: string;
  fecha: Date;
  lugar: string;
}

/**
 * Envía el aviso de inscripción confirmada. Con SNS_TOPIC_ARN publica en el tema (que entrega a sus
 * suscriptores fijos, no al estudiante: para eso haría falta SES). Siempre deja el envío en el log,
 * que es el "envío simulado en log" del diagrama.
 */
@Injectable()
export class Notificador implements OnModuleDestroy {
  private readonly logger = new Logger(Notificador.name);
  private readonly sns?: SNSClient;

  constructor(@Inject(CONFIG) private readonly config: Config) {
    if (config.snsTopicArn) {
      this.sns = crearClienteSns({ region: config.awsRegion, endpoint: config.awsEndpointUrlSns });
    }
  }

  onModuleDestroy(): void {
    this.sns?.destroy();
  }

  /** Lanza si SNS falla: el consumidor entonces no borra el mensaje y la cola lo reintenta. */
  async enviar(aviso: Aviso): Promise<void> {
    const texto =
      `Hola ${aviso.nombre}, tu inscripción a "${aviso.titulo}" quedó confirmada. ` +
      `Te esperamos el ${aviso.fecha.toISOString()} en ${aviso.lugar}.`;

    if (this.sns) {
      await this.sns.send(
        new PublishCommand({
          TopicArn: this.config.snsTopicArn,
          // SNS exige un asunto ASCII para correo: sin tildes.
          Subject: 'Inscripcion confirmada',
          Message: `Para: ${aviso.email}\n\n${texto}`,
        }),
      );
    }
    this.logger.log({
      msg: 'notificacion_enviada',
      notificacion_id: aviso.notificacionId,
      destinatario: aviso.email,
      canal: this.sns ? 'sns' : 'log',
      texto,
    });
  }
}
