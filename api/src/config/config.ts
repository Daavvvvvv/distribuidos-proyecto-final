import type { OpcionesDb } from '@eventos/shared';

export const CONFIG = Symbol('CONFIG');

export interface Config {
  port: number;
  awsRegion: string;
  /** Solo local (ElasticMQ). En ECS no existe y el SDK usa los endpoints reales de AWS. */
  awsEndpointUrl?: string;
  db: Omit<OpcionesDb, 'max'>;
  queueUrl: string;
  /** El contrato lo inyecta a todos los procesos; la API no publica en SNS (lo hace el worker). */
  snsTopicArn?: string;
  externalUrl: string;
  /** Solo para demos: se agrega como query a /validar-correo (p. ej. "fail=1"). */
  externalQuery?: string;
  jwtSecret: string;
  seedDemo: boolean;
  logLevel: string;
}

/** Variables sin las cuales la API no arranca (ver DISENO-BACKEND.md, "Variables de entorno por proceso"). */
export const VARIABLES_REQUERIDAS = [
  'PORT',
  'AWS_REGION',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'QUEUE_URL',
  'EXTERNAL_URL',
  'JWT_SECRET',
] as const;

/** Todas las variables que la API lee, requeridas u opcionales. Se registran al arrancar. */
export const VARIABLES_LEIDAS = [
  ...VARIABLES_REQUERIDAS,
  'SNS_TOPIC_ARN',
  'DB_SSL',
  'SEED_DEMO',
  'EXTERNAL_QUERY',
  'LOG_LEVEL',
  'AWS_ENDPOINT_URL',
] as const;

function entero(nombre: string, valor: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`La variable de entorno ${nombre} debe ser un entero (recibido: "${valor}")`);
  }
  return n;
}

/** Lee y valida la configuración. Falla al arrancar, nombrando las variables que faltan. */
export function leerConfig(env: NodeJS.ProcessEnv): Config {
  const faltantes = VARIABLES_REQUERIDAS.filter((nombre) => !env[nombre]?.trim());
  if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${faltantes.join(', ')}`);
  }
  const v = (nombre: (typeof VARIABLES_REQUERIDAS)[number]) => env[nombre]!.trim();

  return {
    port: entero('PORT', v('PORT')),
    awsRegion: v('AWS_REGION'),
    awsEndpointUrl: env.AWS_ENDPOINT_URL?.trim() || undefined,
    db: {
      host: v('DB_HOST'),
      port: entero('DB_PORT', v('DB_PORT')),
      database: v('DB_NAME'),
      user: v('DB_USER'),
      password: v('DB_PASSWORD'),
      ssl: env.DB_SSL?.trim().toLowerCase() !== 'false',
    },
    queueUrl: v('QUEUE_URL'),
    snsTopicArn: env.SNS_TOPIC_ARN?.trim() || undefined,
    externalUrl: v('EXTERNAL_URL').replace(/\/+$/, ''),
    externalQuery: env.EXTERNAL_QUERY?.trim() || undefined,
    jwtSecret: v('JWT_SECRET'),
    seedDemo: env.SEED_DEMO?.trim().toLowerCase() === 'true',
    logLevel: env.LOG_LEVEL?.trim() || 'info',
  };
}
