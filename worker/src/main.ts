import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { leerConfig, VARIABLES_LEIDAS } from './config';
import { WorkerModule } from './worker.module';

/** Proceso sin puerto ni health check HTTP: un ciclo continuo de long polling sobre la cola. */
async function bootstrap(): Promise<void> {
  const config = leerConfig(process.env);

  const app = await NestFactory.createApplicationContext(WorkerModule.registrar(config), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.get(Logger).log({
    msg: 'Configuración cargada',
    presentes: VARIABLES_LEIDAS.filter((nombre) => process.env[nombre]),
    ausentes: VARIABLES_LEIDAS.filter((nombre) => !process.env[nombre]),
  });
  // SIGTERM (ECS al reemplazar la tarea): corta el long polling, termina el lote y cierra el pool.
  app.enableShutdownHooks();
}

bootstrap().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: 'fatal',
      time: new Date().toISOString(),
      msg: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
