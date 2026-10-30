import pino, { type LoggerOptions } from 'pino';

/** Logs JSON a stdout con fecha y hora ISO; llegan solos a CloudWatch. */
export function opcionesLogger(nivel = 'info'): LoggerOptions {
  return {
    level: nivel,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: ['req.headers.authorization', 'password', '*.password'],
  };
}
