import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { CONFIG, type Config } from '../config/config';
import { Metricas } from '../metricas/metricas';

/** VALIDO / INVALIDO según el servicio; PENDIENTE si no respondió (timeout, error o circuito abierto). */
export type ResultadoValidacion = 'VALIDO' | 'INVALIDO' | 'PENDIENTE';

const TIMEOUT_INTENTO_MS = 2000;
const INTENTOS = 2;
const ESPERA_ENTRE_INTENTOS_MS = 300;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cliente del servicio externo de validación de correo institucional (contrato: timeout de 2 s,
 * reintentos con backoff y circuit breaker, y degradar a "validación pendiente" en vez de fallar).
 *
 * El breaker envuelve la secuencia COMPLETA (2 intentos): una "llamada" para el umbral es un
 * registro. Peor caso con el servicio colgado: 2 + 0.3 + 2 ≈ 4.3 s, por debajo de los 10 s del
 * frontend. Con el circuito abierto responde PENDIENTE al instante, sin llamar al servicio.
 * El estado del circuito vive en memoria de cada réplica (no es dato de negocio ni sesión).
 */
@Injectable()
export class ValidacionCorreoService implements OnModuleDestroy {
  private readonly logger = new Logger(ValidacionCorreoService.name);
  private readonly breaker: CircuitBreaker<[string], 'VALIDO' | 'INVALIDO'>;
  private readonly url: string;

  constructor(
    @Inject(CONFIG) config: Config,
    private readonly metricas: Metricas,
  ) {
    this.url = `${config.externalUrl}/validar-correo${config.externalQuery ? `?${config.externalQuery}` : ''}`;
    this.breaker = new CircuitBreaker((email: string) => this.consultarConReintento(email), {
      timeout: 5000, // por encima del peor caso de la secuencia (~4.3 s)
      errorThresholdPercentage: 50,
      rollingCountTimeout: 10_000,
      volumeThreshold: 5,
      resetTimeout: 15_000,
    });
    this.breaker.fallback(() => 'PENDIENTE' as const);
    this.breaker.on('open', () => {
      this.metricas.circuitoValidacion.set(2);
      this.logger.warn('Circuito de validación de correo ABIERTO: registros quedan PENDIENTE');
    });
    this.breaker.on('halfOpen', () => {
      this.metricas.circuitoValidacion.set(1);
      this.logger.log('Circuito de validación de correo a medio abrir: probando');
    });
    this.breaker.on('close', () => {
      this.metricas.circuitoValidacion.set(0);
      this.logger.log('Circuito de validación de correo CERRADO');
    });
  }

  onModuleDestroy(): void {
    this.breaker.shutdown();
  }

  /** Nunca lanza: si el servicio no da una respuesta, el resultado es PENDIENTE. */
  async validar(email: string): Promise<ResultadoValidacion> {
    return (await this.breaker.fire(email)) as ResultadoValidacion;
  }

  private async consultarConReintento(email: string): Promise<'VALIDO' | 'INVALIDO'> {
    for (let intento = 1; ; intento++) {
      try {
        return await this.consultar(email);
      } catch (error) {
        if (intento >= INTENTOS) throw error;
        await esperar(ESPERA_ENTRE_INTENTOS_MS);
      }
    }
  }

  private async consultar(email: string): Promise<'VALIDO' | 'INVALIDO'> {
    const respuesta = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(TIMEOUT_INTENTO_MS),
    });
    if (!respuesta.ok) throw new Error(`validar-correo respondió ${respuesta.status}`);
    const cuerpo = (await respuesta.json()) as { valid?: unknown };
    if (typeof cuerpo.valid !== 'boolean') throw new Error('validar-correo respondió sin "valid"');
    return cuerpo.valid ? 'VALIDO' : 'INVALIDO';
  }
}
