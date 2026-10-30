import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

export type ResultadoInscripcion = 'inscrito' | 'ya_inscrito' | 'cupo_lleno' | 'rechazada';

/** Métricas Prometheus de esta réplica (bloque "Monitoreo" del diagrama), expuestas en GET /metrics. */
@Injectable()
export class Metricas {
  readonly registro = new Registry();

  readonly solicitudes = new Histogram({
    name: 'http_solicitudes_duracion_segundos',
    help: 'Duración de las solicitudes HTTP',
    labelNames: ['metodo', 'ruta', 'estado'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registro],
  });

  readonly inscripciones = new Counter({
    name: 'inscripciones_total',
    help: 'Intentos de inscripción por resultado',
    labelNames: ['resultado'],
    registers: [this.registro],
  });

  readonly circuitoValidacion = new Gauge({
    name: 'circuito_validacion_estado',
    help: 'Circuito del servicio de validación de correo: 0 cerrado, 1 medio abierto, 2 abierto',
    registers: [this.registro],
  });

  readonly notificacionesAtascadas = new Gauge({
    name: 'notificaciones_atascadas',
    help: 'Avisos encolados hace más de 5 min que siguen PENDIENTE (probablemente en la DLQ)',
    registers: [this.registro],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registro });
    // Que las series existan desde el arranque, aunque todavía no haya pasado nada.
    for (const resultado of ['inscrito', 'ya_inscrito', 'cupo_lleno', 'rechazada'] satisfies ResultadoInscripcion[]) {
      this.inscripciones.inc({ resultado }, 0);
    }
    this.circuitoValidacion.set(0);
    this.notificacionesAtascadas.set(0);
  }
}
