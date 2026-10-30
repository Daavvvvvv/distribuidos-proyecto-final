/**
 * Mensaje que la API publica en la cola al confirmar una inscripción. Los tres primeros campos son
 * los del contrato; `notificacion_id` es un extra compatible que hace al worker idempotente por id.
 */
export interface InscripcionConfirmada {
  tipo: 'InscripcionConfirmada';
  evento_id: number;
  usuario_id: number;
  notificacion_id?: number;
}

export function crearInscripcionConfirmada(fila: {
  id: number;
  evento_id: number;
  usuario_id: number;
}): InscripcionConfirmada {
  return {
    tipo: 'InscripcionConfirmada',
    evento_id: fila.evento_id,
    usuario_id: fila.usuario_id,
    notificacion_id: fila.id,
  };
}

const esIdValido = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

/** Parsea el cuerpo de un mensaje de la cola. Devuelve null si no es un InscripcionConfirmada válido. */
export function leerInscripcionConfirmada(cuerpo: string | undefined): InscripcionConfirmada | null {
  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(cuerpo ?? '');
  } catch {
    return null;
  }
  if (datos?.tipo !== 'InscripcionConfirmada' || !esIdValido(datos.evento_id) || !esIdValido(datos.usuario_id)) {
    return null;
  }
  if (datos.notificacion_id !== undefined && !esIdValido(datos.notificacion_id)) return null;
  return {
    tipo: 'InscripcionConfirmada',
    evento_id: datos.evento_id,
    usuario_id: datos.usuario_id,
    ...(datos.notificacion_id !== undefined && { notificacion_id: datos.notificacion_id as number }),
  };
}
