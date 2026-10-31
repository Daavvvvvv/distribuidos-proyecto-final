/**
 * Quién puede inscribirse o cancelar, y por qué no. Es la única fuente de la regla: la usan el
 * servicio de inscripciones para rechazar y el de eventos para decirle al frontend qué mostrar,
 * así el botón y la respuesta de la API nunca se contradicen.
 */
export const MOTIVO = {
  organizador: 'Eres el organizador de este evento',
  pasado: 'El evento ya ocurrió',
  lleno: 'No quedan cupos para este evento',
} as const;

export interface EstadoInscripcion {
  esOrganizador: boolean;
  inscrito: boolean;
  pasado: boolean;
  lleno: boolean;
}

/** Por qué no puede inscribirse alguien que todavía no lo está, o null si puede. En orden de prioridad. */
export function motivoParaNoInscribirse(e: Omit<EstadoInscripcion, 'inscrito'>): string | null {
  if (e.esOrganizador) return MOTIVO.organizador;
  if (e.pasado) return MOTIVO.pasado;
  if (e.lleno) return MOTIVO.lleno;
  return null;
}

export function permisos(e: EstadoInscripcion) {
  const puedeInscribirse = !e.inscrito && motivoParaNoInscribirse(e) === null;
  const puedeCancelar = e.inscrito && !e.pasado;
  let motivo: string | null = null;
  if (!puedeInscribirse && !puedeCancelar) motivo = e.inscrito ? MOTIVO.pasado : motivoParaNoInscribirse(e);
  return { puedeInscribirse, puedeCancelar, motivo };
}
