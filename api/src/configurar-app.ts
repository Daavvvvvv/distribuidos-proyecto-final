import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ErrorFilter } from './common/error.filter';

/** Configuración compartida por main.ts y las pruebas e2e, para probar exactamente la misma app. */
export function configurarApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  // CloudFront solo reenvía /api/* a la API; /health (balanceador) y /metrics (Prometheus) quedan fuera.
  app.setGlobalPrefix('api', { exclude: ['health', 'metrics'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // El frontend muestra un solo texto: el del primer campo inválido. class-validator ejecuta los
      // decoradores de abajo hacia arriba, así que el último mensaje es el del decorador escrito más
      // arriba, que es la regla más básica ("es obligatorio" antes que "entre 1 y 50 caracteres").
      exceptionFactory: (errores) => {
        const mensajes = Object.values(errores[0]?.constraints ?? {});
        return new BadRequestException(mensajes.at(-1) ?? 'Solicitud inválida');
      },
    }),
  );
  app.useGlobalFilters(new ErrorFilter());
  // SIGTERM (ECS al reemplazar una tarea): Nest deja de aceptar conexiones y termina las solicitudes en curso.
  app.enableShutdownHooks();
}
