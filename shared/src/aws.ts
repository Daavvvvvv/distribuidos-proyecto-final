import { SNSClient } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';
import { NodeHttpHandler } from '@smithy/node-http-handler';

export interface OpcionesAws {
  region: string;
  /** Solo local (ElasticMQ / un SNS simulado). En ECS no se define y el SDK usa el endpoint real de AWS. */
  endpoint?: string;
  /** Por defecto 2 s. El worker usa más porque su long polling espera hasta 10 s. */
  requestTimeoutMs?: number;
}

/**
 * Por defecto el SDK v3 no tiene timeout de socket: si AWS se cuelga, la solicitud del usuario
 * (o la transacción del barrido/worker) quedaría esperando. Con 2 s por intento y 2 intentos, el
 * peor caso es ~4 s, por debajo de los 10 s del frontend. Las credenciales salen del rol de la
 * tarea ECS (o de variables de entorno en local); nunca del código.
 */
function opcionesCliente(opciones: OpcionesAws) {
  return {
    region: opciones.region,
    endpoint: opciones.endpoint,
    maxAttempts: 2,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 2000,
      requestTimeout: opciones.requestTimeoutMs ?? 2000,
      // Sin esto, @smithy/node-http-handler 4.x solo escribe un WARN y la solicitud sigue colgada.
      throwOnRequestTimeout: true,
    }),
  };
}

export function crearClienteSqs(opciones: OpcionesAws): SQSClient {
  return new SQSClient(opcionesCliente(opciones));
}

export function crearClienteSns(opciones: OpcionesAws): SNSClient {
  return new SNSClient(opcionesCliente(opciones));
}
