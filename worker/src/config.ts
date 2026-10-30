import type { OpcionesDb } from '@eventos/shared';

export const CONFIG = Symbol('CONFIG');

export interface Config {
  awsRegion: string;
  /** Solo local (ElasticMQ). En ECS no existe. */
  awsEndpointUrl?: string;
  /** Solo local: un SNS simulado distinto de la cola. Por defecto, el mismo AWS_ENDPOINT_URL. */
  awsEndpointUrlSns?: string;
  db: Omit<OpcionesDb, 'max'>;
  queueUrl: string;
  /** Si falta, el worker solo escribe el log del envío (modo "simulado en log" del diagrama). */
  snsTopicArn?: string;
  logLevel: string;
}

/** Sin PORT ni EXTERNAL_URL: el worker no escucha HTTP ni valida correos. */
export const VARIABLES_REQUERIDAS = ['AWS_REGION', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'QUEUE_URL'] as const;

/** Todas las que el worker lee (incluidas las del contrato que no usa). Se registran al arrancar. */
export const VARIABLES_LEIDAS = [
  ...VARIABLES_REQUERIDAS,
  'SNS_TOPIC_ARN',
  'EXTERNAL_URL',
  'DB_SSL',
  'LOG_LEVEL',
  'AWS_ENDPOINT_URL',
  'AWS_ENDPOINT_URL_SNS',
] as const;

export function leerConfig(env: NodeJS.ProcessEnv): Config {
  const faltantes = VARIABLES_REQUERIDAS.filter((nombre) => !env[nombre]?.trim());
  if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${faltantes.join(', ')}`);
  }
  const v = (nombre: (typeof VARIABLES_REQUERIDAS)[number]) => env[nombre]!.trim();
  const puerto = Number(v('DB_PORT'));
  if (!Number.isInteger(puerto) || puerto <= 0) {
    throw new Error(`La variable de entorno DB_PORT debe ser un entero (recibido: "${v('DB_PORT')}")`);
  }
  const awsEndpointUrl = env.AWS_ENDPOINT_URL?.trim() || undefined;

  return {
    awsRegion: v('AWS_REGION'),
    awsEndpointUrl,
    awsEndpointUrlSns: env.AWS_ENDPOINT_URL_SNS?.trim() || awsEndpointUrl,
    db: {
      host: v('DB_HOST'),
      port: puerto,
      database: v('DB_NAME'),
      user: v('DB_USER'),
      password: v('DB_PASSWORD'),
      ssl: env.DB_SSL?.trim().toLowerCase() !== 'false',
    },
    queueUrl: v('QUEUE_URL'),
    snsTopicArn: env.SNS_TOPIC_ARN?.trim() || undefined,
    logLevel: env.LOG_LEVEL?.trim() || 'info',
  };
}
