import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { esPoolAgotado } from '@eventos/shared';
import type { Response } from 'express';

// El frontend muestra { error } tal cual: los mensajes por defecto de Nest (en inglés) se traducen.
const MENSAJES_POR_ESTADO: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Solicitud inválida',
  [HttpStatus.UNAUTHORIZED]: 'Inicia sesión para continuar',
  [HttpStatus.FORBIDDEN]: 'No tienes permiso para hacer esto',
  [HttpStatus.NOT_FOUND]: 'Recurso no encontrado',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'La solicitud es demasiado grande',
};
const MENSAJES_EN_INGLES = new Set(['Bad Request', 'Unauthorized', 'Forbidden', 'Not Found', 'Payload Too Large']);

function mensajeDe(excepcion: HttpException): string {
  const cuerpo = excepcion.getResponse();
  const crudo = typeof cuerpo === 'string' ? cuerpo : (cuerpo as { message?: unknown }).message;
  const mensaje = Array.isArray(crudo) ? crudo[0] : crudo;
  const estado = excepcion.getStatus();

  if (typeof mensaje !== 'string' || MENSAJES_EN_INGLES.has(mensaje) || mensaje.startsWith('Cannot ')) {
    return MENSAJES_POR_ESTADO[estado] ?? 'No se pudo completar la solicitud';
  }
  return mensaje;
}

/** Convierte toda excepción a { "error": "mensaje" } con el código HTTP correcto (contrato del frontend). */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const respuesta = host.switchToHttp().getResponse<Response>();

    if (excepcion instanceof HttpException) {
      respuesta.status(excepcion.getStatus()).json({ error: mensajeDe(excepcion) });
      return;
    }
    if (esPoolAgotado(excepcion)) {
      this.logger.warn('Pool de Postgres agotado: no hubo conexión libre en 5 s');
      respuesta.status(HttpStatus.SERVICE_UNAVAILABLE).json({ error: 'Servicio ocupado, intenta de nuevo' });
      return;
    }
    this.logger.error(excepcion instanceof Error ? excepcion.stack : String(excepcion));
    respuesta.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Ocurrió un error inesperado, intenta de nuevo' });
  }
}
